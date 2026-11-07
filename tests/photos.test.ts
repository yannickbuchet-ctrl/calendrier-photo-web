// Photos et projets : en-têtes des formats d'image, orientation EXIF, empreintes (photo déjà utilisée), archive ZIP
// et fichier de projet .calendrier (aller-retour, archive recompressée par un autre logiciel).
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { analyserProjet, etatProjet, projetVide } from "../src/logique/projet";
import { analyserImage, dimensionsOrientees } from "../src/photos/analyse";
import { empreinte } from "../src/photos/empreinte";
import { ecrireProjet, lireProjet, NOM_JSON, type PhotoDuProjet } from "../src/projet/fichier";
import { crc32, creerZip, lireZip } from "../src/projet/zip";
import { jpegUni } from "./outils";

/** Ajoute un segment EXIF avec une orientation à un JPEG. */
function avecOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const charge = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const segment = [0xff, 0xe1, (charge.length + 2) >> 8, (charge.length + 2) & 255, ...charge];
  return new Uint8Array([0xff, 0xd8, ...segment, ...jpeg.subarray(2)]);
}

describe("en-têtes des images", () => {
  it("JPEG : dimensions et orientation EXIF (portrait d'un téléphone)", () => {
    const brut = jpegUni(40, 30);
    expect(analyserImage(brut)).toEqual({ type: "image/jpeg", largeurBrute: 40, hauteurBrute: 30, orientation: 1 });
    const tourne = analyserImage(avecOrientation(brut, 6))!;
    expect(tourne.orientation).toBe(6);
    expect(dimensionsOrientees(tourne)).toEqual({ w: 30, h: 40 });
    expect(dimensionsOrientees(analyserImage(avecOrientation(brut, 3))!)).toEqual({ w: 40, h: 30 });
  });

  it("PNG, GIF, WebP, BMP, HEIC", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x0b, 0xb8, 0, 0, 0x0f, 0xa0]);
    expect(analyserImage(png)).toMatchObject({ type: "image/png", largeurBrute: 3000, hauteurBrute: 4000 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02, 0, 0, 0, 0, 0, 0]);
    expect(analyserImage(gif)).toMatchObject({ type: "image/gif", largeurBrute: 800, hauteurBrute: 600 });
    const webp = new Uint8Array(32);
    webp.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 0xff, 0x0f, 0, 0xb7, 0x0b, 0]);
    expect(analyserImage(webp)).toMatchObject({ type: "image/webp", largeurBrute: 4096, hauteurBrute: 3000 });
    const bmp = new Uint8Array(32);
    bmp.set([0x42, 0x4d]);
    new DataView(bmp.buffer).setInt32(18, 640, true);
    new DataView(bmp.buffer).setInt32(22, -480, true);
    expect(analyserImage(bmp)).toMatchObject({ type: "image/bmp", largeurBrute: 640, hauteurBrute: 480 });
    const boite = (type: string, contenu: number[]) => [0, 0, 0, 8 + contenu.length, ...Buffer.from(type), ...contenu];
    const u32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    const heic = new Uint8Array([
      ...boite("ftyp", [...Buffer.from("heic"), 0, 0, 0, 0]),
      ...boite("ispe", [0, 0, 0, 0, ...u32(512), ...u32(512)]),
      ...boite("ispe", [0, 0, 0, 0, ...u32(4032), ...u32(3024)]),
      ...boite("irot", [3]),
      0, 0, 0, 0,
    ]);
    const e = analyserImage(heic)!;
    expect(e).toMatchObject({ type: "image/heic", largeurBrute: 4032, hauteurBrute: 3024, orientation: 6 });
    expect(dimensionsOrientees(e)).toEqual({ w: 3024, h: 4032 });
    expect(analyserImage(new TextEncoder().encode("ceci n'est pas une image"))).toBeNull();
  });

  it("empreinte : même contenu, même empreinte (même sous un autre nom)", async () => {
    const a = jpegUni(20, 10);
    expect(await empreinte(a)).toBe(await empreinte(a.slice()));
    expect(await empreinte(a)).not.toBe(await empreinte(jpegUni(20, 10, [0, 0, 0])));
    expect(await empreinte(a)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("archive ZIP", () => {
  it("CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("aller-retour, noms accentués", async () => {
    const contenu = jpegUni(64, 48);
    const zip = await creerZip([
      { nom: "projet.calendrier.json", donnees: new Blob(['{"a": 1}']) },
      { nom: "photos/été à Nîmes.jpg", donnees: new Blob([contenu as Uint8Array<ArrayBuffer>]) },
    ]);
    const lu = await lireZip(zip);
    expect([...lu.keys()]).toEqual(["projet.calendrier.json", "photos/été à Nîmes.jpg"]);
    expect(new Uint8Array(await (await lu.get("photos/été à Nîmes.jpg")!()).arrayBuffer())).toEqual(contenu);
    expect(await (await lu.get("projet.calendrier.json")!()).text()).toBe('{"a": 1}');
  });

  it("archive recompressée (deflate) par un autre logiciel", async () => {
    const donnees = new TextEncoder().encode("Bonjour ".repeat(1000));
    const compresse = zlib.deflateRawSync(donnees);
    const nom = new TextEncoder().encode("texte.txt");
    const locale = Buffer.alloc(30);
    locale.writeUInt32LE(0x04034b50, 0);
    locale.writeUInt16LE(20, 4);
    locale.writeUInt16LE(8, 8);
    locale.writeUInt32LE(crc32(donnees), 14);
    locale.writeUInt32LE(compresse.length, 18);
    locale.writeUInt32LE(donnees.length, 22);
    locale.writeUInt16LE(nom.length, 26);
    const centrale = Buffer.alloc(46);
    centrale.writeUInt32LE(0x02014b50, 0);
    centrale.writeUInt16LE(8, 10);
    centrale.writeUInt32LE(crc32(donnees), 16);
    centrale.writeUInt32LE(compresse.length, 20);
    centrale.writeUInt32LE(donnees.length, 24);
    centrale.writeUInt16LE(nom.length, 28);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(1, 8);
    fin.writeUInt16LE(1, 10);
    fin.writeUInt32LE(46 + nom.length, 12);
    fin.writeUInt32LE(30 + nom.length + compresse.length, 16);
    const zip = new Blob([locale, nom, compresse, centrale, nom, fin]);
    const lu = await lireZip(zip);
    expect(await (await lu.get("texte.txt")!()).text()).toBe("Bonjour ".repeat(1000));
  });

  it("un fichier qui n'est pas une archive est refusé", async () => {
    await expect(lireZip(new Blob(["pas une archive"]))).rejects.toThrow(/archive/);
  });
});

describe("fichier de projet .calendrier", () => {
  it("aller-retour : réglages, photos (deux photos de même nom), dispositions, recadrages, événements", async () => {
    const projet = projetVide();
    projet.reglages.title = "Famille Exemple";
    projet.reglages.year = 2027;
    projet.reglages.events = [{ day: 2, month: 1, year: null, text: "Mamie Rose", kind: "birthday" }];
    projet.layouts["0"] = 2;
    projet.photos["0"] = ["a", "b", null, null];
    projet.photos.cover = ["c", null, null, null];
    projet.crops["0"] = [{ zoom: 2, x: 0.3, y: 0.6 }, { whole: true }, null, null];
    const photos: Record<string, PhotoDuProjet> = {
      a: { id: "a", nom: "IMG_0001.jpg", type: "image/jpeg", modifie: 1700000000000, original: new Blob([jpegUni(30, 20) as Uint8Array<ArrayBuffer>]) },
      b: { id: "b", nom: "IMG_0001.jpg", type: "image/jpeg", modifie: 1700000001000, original: new Blob([jpegUni(20, 30) as Uint8Array<ArrayBuffer>]) },
      c: { id: "c", nom: "couverture.png", type: "image/png", modifie: 1700000002000, original: new Blob(["png"]) },
    };
    const archive = await ecrireProjet(projet, (id) => photos[id], "Calendrier Photo Web 1.0");
    const zip = await lireZip(archive);
    expect([...zip.keys()].sort()).toEqual([NOM_JSON, "photos/IMG_0001 (2).jpg", "photos/IMG_0001.jpg", "photos/couverture.png"].sort());
    const { donnees, photos: lues } = await lireProjet(archive);
    // Format des projets de la version Windows : chemins des photos relatifs au fichier JSON.
    expect(donnees.photos_relative).toEqual({ cover: ["photos/couverture.png", null, null, null], "0": ["photos/IMG_0001.jpg", "photos/IMG_0001 (2).jpg", null, null] });
    const parChemin = new Map<string, string>();
    for (const [chemin, f] of lues) {
      const octets = new Uint8Array(await (await f.lire()).arrayBuffer());
      const id = Object.values(photos).find((p) => p.modifie === f.modifie)!.id;
      expect(octets).toEqual(new Uint8Array(await photos[id].original.arrayBuffer()));
      parChemin.set(chemin, id);
    }
    const relu = analyserProjet(donnees, (ref) => parChemin.get(ref) ?? null);
    expect(etatProjet(relu)).toBe(etatProjet(projet));
  });

  it("projet de la version Windows : photos désignées par leur chemin, anciens projets à une photo par page", () => {
    const windows = {
      settings: { title: "Calendrier", year: 2027, format: 1, font: 2, accent: "#16A34A", school_zone: "C", events: [{ day: 5, month: 6, text: "Fête", kind: "yearly" }] },
      photos: { "0": "C:\\Users\\Exemple\\Images\\janvier.jpg", "1": ["D:/Photos/fevrier.JPG", null, "C:\\absente.jpg", null] },
      layouts: { "1": 3, "2": 9 },
      crops: { "0": [{ zoom: 1.5, x: 0.2, y: 0.4 }] },
    };
    const choisies: Record<string, string> = { "janvier.jpg": "id-janvier", "fevrier.jpg": "id-fevrier" };
    const p = analyserProjet(windows, (ref) => choisies[ref.split(/[\\/]/).pop()!.toLowerCase()] ?? null);
    expect(p.photos).toEqual({ "0": ["id-janvier", null, null, null], "1": ["id-fevrier", null, null, null] });
    expect(p.layouts).toEqual({ "1": 3, "2": 4 });
    expect(p.crops["0"][0]).toEqual({ zoom: 1.5, x: 0.2, y: 0.4 });
    expect(p.reglages).toMatchObject({ format: 1, font: 2, accent: "#16a34a", school_zone: "C" });
  });
});
