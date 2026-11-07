/**
 * Archives ZIP (fichier de projet .calendrier) : écriture sans compression, lecture des fichiers stockés ou
 * compressés (deflate). Les photos ne sont jamais copiées en mémoire d'un bloc : l'archive est assemblée à partir des
 * fichiers eux-mêmes, et lue par tranches.
 */

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(o: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < o.length; i++) c = TABLE_CRC[(c ^ o[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** CRC-32 d'un fichier, lu par morceaux. */
async function crcDuFichier(b: Blob): Promise<number> {
  let crc = 0;
  const pas = 4 * 1024 * 1024;
  for (let debut = 0; debut < b.size; debut += pas) crc = crc32(new Uint8Array(await b.slice(debut, debut + pas).arrayBuffer()), crc);
  return crc;
}

export interface EntreeZip {
  nom: string;
  donnees: Blob;
  date?: Date;
}

function heureDos(d: Date): [number, number] {
  const annee = Math.max(1980, d.getFullYear());
  return [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((annee - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()];
}

/** Archive ZIP (fichiers stockés tels quels, noms en UTF-8). */
export async function creerZip(entrees: EntreeZip[]): Promise<Blob> {
  const morceaux: BlobPart[] = [];
  const centrale: Uint8Array[] = [];
  let position = 0;
  for (const e of entrees) {
    const nom = new TextEncoder().encode(e.nom);
    const crc = await crcDuFichier(e.donnees);
    const [heure, jour] = heureDos(e.date ?? new Date());
    const taille = e.donnees.size;
    if (taille >= 0xffffffff || position >= 0xffffffff) throw new Error("Projet trop volumineux (plus de 4 Go).");
    const locale = new Uint8Array(30 + nom.length);
    const v = new DataView(locale.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // noms en UTF-8
    v.setUint16(8, 0, true); // stocké
    v.setUint16(10, heure, true);
    v.setUint16(12, jour, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, taille, true);
    v.setUint32(22, taille, true);
    v.setUint16(26, nom.length, true);
    locale.set(nom, 30);
    const c = new Uint8Array(46 + nom.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint16(12, heure, true);
    w.setUint16(14, jour, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, taille, true);
    w.setUint32(24, taille, true);
    w.setUint16(28, nom.length, true);
    w.setUint32(42, position, true);
    c.set(nom, 46);
    centrale.push(c);
    morceaux.push(locale as Uint8Array<ArrayBuffer>, e.donnees);
    position += locale.length + taille;
  }
  const tailleCentrale = centrale.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, entrees.length, true);
  f.setUint16(10, entrees.length, true);
  f.setUint32(12, tailleCentrale, true);
  f.setUint32(16, position, true);
  return new Blob([...morceaux, ...(centrale as Uint8Array<ArrayBuffer>[]), fin], { type: "application/zip" });
}

/** Fichiers d'une archive ZIP : nom → lecture du contenu. Erreur si ce n'est pas une archive lisible. */
export async function lireZip(archive: Blob): Promise<Map<string, () => Promise<Blob>>> {
  const queue = Math.min(archive.size, 65536 + 22);
  const fin = new Uint8Array(await archive.slice(archive.size - queue).arrayBuffer());
  let p = -1;
  for (let i = fin.length - 22; i >= 0; i--) {
    if (fin[i] === 0x50 && fin[i + 1] === 0x4b && fin[i + 2] === 5 && fin[i + 3] === 6) {
      p = i;
      break;
    }
  }
  if (p < 0) throw new Error("Ce fichier n'est pas une archive de projet lisible.");
  const v = new DataView(fin.buffer, fin.byteOffset + p);
  const nombre = v.getUint16(10, true);
  const taille = v.getUint32(12, true);
  const debut = v.getUint32(16, true);
  if (debut === 0xffffffff || taille === 0xffffffff) throw new Error("Archive ZIP64 non prise en charge.");
  const c = new Uint8Array(await archive.slice(debut, debut + taille).arrayBuffer());
  const d = new DataView(c.buffer);
  const fichiers = new Map<string, () => Promise<Blob>>();
  let i = 0;
  for (let n = 0; n < nombre; n++) {
    if (d.getUint32(i, true) !== 0x02014b50) throw new Error("Répertoire de l'archive abîmé.");
    const drapeaux = d.getUint16(i + 8, true);
    const methode = d.getUint16(i + 10, true);
    const compresse = d.getUint32(i + 20, true);
    const longueurNom = d.getUint16(i + 28, true);
    const longueurExtra = d.getUint16(i + 30, true);
    const longueurCommentaire = d.getUint16(i + 32, true);
    const locale = d.getUint32(i + 42, true);
    const octetsNom = c.subarray(i + 46, i + 46 + longueurNom);
    // Sans le drapeau UTF-8, le codage dépend du logiciel qui a créé l'archive : Windows-1252 à défaut de mieux.
    const nom = new TextDecoder(drapeaux & 0x0800 ? "utf-8" : "windows-1252").decode(octetsNom).replace(/\\/g, "/");
    i += 46 + longueurNom + longueurExtra + longueurCommentaire;
    if (nom.endsWith("/")) continue;
    fichiers.set(nom, async () => {
      const entete = new DataView(await archive.slice(locale, locale + 30).arrayBuffer());
      if (entete.getUint32(0, true) !== 0x04034b50) throw new Error(`Fichier « ${nom} » abîmé dans l'archive.`);
      const donnees = locale + 30 + entete.getUint16(26, true) + entete.getUint16(28, true);
      const brut = archive.slice(donnees, donnees + compresse);
      if (methode === 0) return brut;
      if (methode !== 8) throw new Error(`Compression inconnue pour « ${nom} ».`);
      return new Response(brut.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    });
  }
  return fichiers;
}
