/**
 * Date d'une photo : métadonnées EXIF (prise de vue, dernière modification), date dans le nom du fichier, ou date du
 * fichier. Reprise de exif_dates, photo_date et FILENAME_DATE de calendrier.py, octet pour octet : les mêmes photos
 * sont classées dans le même ordre par les deux versions.
 *
 * Une date-heure est un texte « AAAA-MM-JJ HH:MM:SS.ffffff », qui se trie dans l'ordre chronologique.
 */
import { dateValide } from "./dates";

export type SourceDate = "exif" | "nom" | "fichier";

/** Nombre d'octets lus au début du fichier pour trouver les métadonnées, comme la version Windows. */
export const OCTETS_EXIF = 256 * 1024;

const deux = (n: number) => String(n).padStart(2, "0");
export const dateHeure = (a: number, mo: number, j: number, h = 0, mi = 0, s = 0, us = 0) =>
  `${String(a).padStart(4, "0")}-${deux(mo)}-${deux(j)} ${deux(h)}:${deux(mi)}:${deux(s)}.${String(us).padStart(6, "0")}`;

/** Lecture d'entiers comme int.from_bytes(données[début:fin]) de Python : au-delà de la fin, les octets manquent. */
function entier(o: Uint8Array, debut: number, taille: number, petitBout: boolean): number {
  const fin = Math.min(o.length, debut + taille);
  let v = 0;
  if (petitBout) for (let i = fin - 1; i >= debut; i--) v = v * 256 + o[i];
  else for (let i = debut; i < fin; i++) v = v * 256 + o[i];
  return v;
}

/** datetime.strptime(valeur[:19], "%Y:%m:%d %H:%M:%S"), ou null si la date est illisible. */
export function lireDateExif(valeur: string): string | null {
  const m = /^(\d{4}):(1[0-2]|0[1-9]|[1-9]):(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])\s+(2[0-3]|[0-1]\d|\d):([0-5]\d|\d):(6[0-1]|[0-5]\d|\d)$/.exec(valeur.slice(0, 19));
  if (!m) return null;
  const [a, mo, j, h, mi, s] = m.slice(1).map((x) => Number.parseInt(x.trim(), 10));
  if (!dateValide(a, mo, j) || s > 59) return null;
  return dateHeure(a, mo, j, h, mi, s);
}

/** Bloc EXIF (format TIFF) : [prise de vue, dernière modification, orientation]. */
function datesTiff(t: Uint8Array): [string | null, string | null, number] {
  const petit = t[0] === 0x49 && t[1] === 0x49; // « II » : petit-boutiste
  const u16 = (o: number) => entier(t, o, 2, petit);
  const u32 = (o: number) => entier(t, o, 4, petit);
  /** {étiquette: [nombre, valeur ou position, position de l'entrée]} d'un répertoire EXIF. */
  const etiquettes = (ifd: number) => {
    const r = new Map<number, [number, number, number]>();
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + 12 * k;
      r.set(u16(e), [u32(e + 4), u32(e + 8), e]);
    }
    return r;
  };
  const texte = ([nombre, position]: [number, number, number]) => {
    let fin = Math.min(t.length, position + nombre);
    if (position > t.length) return "";
    while (fin > position && t[fin - 1] === 0) fin--;
    let r = "";
    for (let i = position; i < fin; i++) if (t[i] < 0x80) r += String.fromCharCode(t[i]);
    return r;
  };
  const principales = etiquettes(u32(4));
  let prise: string | null = null;
  const sousRepertoire = principales.get(0x8769);
  if (sousRepertoire) {
    const exif = etiquettes(sousRepertoire[1]);
    const originale = exif.get(0x9003);
    if (originale) prise = lireDateExif(texte(originale));
  }
  const modification = principales.get(0x0132);
  const modif = modification ? lireDateExif(texte(modification)) : null;
  const entreeOrientation = principales.get(0x0112);
  const orientation = entreeOrientation ? u16(entreeOrientation[2] + 8) : 1;
  return [prise, modif, orientation >= 1 && orientation <= 8 ? orientation : 1];
}

/** Bloc EXIF d'une photo JPEG (segment APP1), ou null. */
function blocExif(o: Uint8Array): Uint8Array | null {
  if (o[0] !== 0xff || o[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= o.length && o[i] === 0xff) {
    const marqueur = o[i + 1];
    const longueur = (o[i + 2] << 8) | o[i + 3];
    if (marqueur === 0xe1 && o[i + 4] === 0x45 && o[i + 5] === 0x78 && o[i + 6] === 0x69 && o[i + 7] === 0x66 && o[i + 8] === 0 && o[i + 9] === 0) {
      return o.subarray(Math.min(i + 10, o.length), Math.max(Math.min(i + 2 + longueur, o.length), Math.min(i + 10, o.length)));
    }
    if (marqueur === 0xda || marqueur === 0xd9) break; // début de l'image : plus de métadonnées
    i += 2 + longueur;
  }
  return null;
}

/** Prise de vue et dernière modification d'une photo JPEG d'après ses métadonnées EXIF (exif_dates). */
export function datesExif(octets: Uint8Array): { prise: string | null; modif: string | null } {
  const bloc = blocExif(octets.subarray(0, OCTETS_EXIF));
  if (!bloc) return { prise: null, modif: null };
  const [prise, modif] = datesTiff(bloc);
  return { prise, modif };
}

/** Orientation EXIF (1 à 8 ; 1 : photo droite) d'une photo JPEG. */
export function orientationExif(octets: Uint8Array): number {
  const bloc = blocExif(octets.subarray(0, OCTETS_EXIF));
  return bloc ? datesTiff(bloc)[2] : 1;
}

/** Date dans le nom du fichier : IMG-20250807-…, 2025-08-07…, 2025_08_07… */
export const DATE_NOM_FICHIER = /(?<!\d)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?!\d)/;

export function dateDuNom(nom: string): string | null {
  const base = nom.split(/[\\/]/).pop() ?? nom;
  const m = DATE_NOM_FICHIER.exec(base);
  if (!m) return null;
  const [a, mo, j] = m.slice(1, 4).map(Number);
  return dateValide(a, mo, j) ? dateHeure(a, mo, j) : null;
}

/** Date-heure locale d'un instant (date du fichier, en millisecondes), comme datetime.fromtimestamp. */
export function dateLocale(ms: number): string {
  const d = new Date(ms);
  return dateHeure(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds() * 1000);
}

/**
 * Date d'une photo et sa provenance, de la plus fiable à la moins fiable (photo_date) :
 * 1. date de prise de vue (EXIF) et date dans le nom du fichier : la plus ancienne des deux, car un logiciel de
 *    retouche réécrit parfois la date de prise de vue ; 2. date de modification EXIF ; 3. date du fichier.
 */
export function datePhoto(nom: string, octets: Uint8Array, modifieMs: number): { date: string; source: SourceDate } {
  const { prise, modif } = datesExif(octets);
  const nommee = dateDuNom(nom);
  if (prise !== null && (nommee === null || prise.slice(0, 10) <= nommee.slice(0, 10))) return { date: prise, source: "exif" };
  if (nommee !== null) return { date: nommee, source: "nom" };
  if (modif !== null) return { date: modif, source: "exif" };
  return { date: dateLocale(modifieMs), source: "fichier" };
}
