/**
 * Dimensions et orientation d'une photo lues dans son en-tête, sans la décoder (comme QImageReader.size() et
 * transformation() dans la version Windows) : JPEG, PNG, GIF, WebP, BMP, HEIC et AVIF.
 */
import { orientationExif } from "../logique/exif";

export interface EnTeteImage {
  /** Type MIME reconnu. */
  type: string;
  /** Dimensions des pixels enregistrés (avant de remettre la photo droite). */
  largeurBrute: number;
  hauteurBrute: number;
  /** Orientation EXIF (1 à 8) ; 5 à 8 échangent largeur et hauteur. */
  orientation: number;
}

const u16be = (o: Uint8Array, i: number) => (o[i] << 8) | o[i + 1];
const u16le = (o: Uint8Array, i: number) => o[i] | (o[i + 1] << 8);
const u32be = (o: Uint8Array, i: number) => ((o[i] << 24) | (o[i + 1] << 16) | (o[i + 2] << 8) | o[i + 3]) >>> 0;
const ascii = (o: Uint8Array, i: number, n: number) => String.fromCharCode(...o.subarray(i, i + n));

function jpeg(o: Uint8Array): EnTeteImage | null {
  let i = 2;
  while (i + 9 < o.length) {
    if (o[i] !== 0xff) return null;
    const marqueur = o[i + 1];
    if (marqueur === 0xff) {
      i++;
      continue;
    }
    if (marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) {
      i += 2;
      continue;
    }
    const longueur = u16be(o, i + 2);
    const sof = marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc;
    if (sof) return { type: "image/jpeg", hauteurBrute: u16be(o, i + 5), largeurBrute: u16be(o, i + 7), orientation: orientationExif(o) };
    if (marqueur === 0xda || marqueur === 0xd9) return null;
    i += 2 + longueur;
  }
  return null;
}

/** HEIC et AVIF : taille de l'image (boîte « ispe ») et rotation (boîte « irot »). */
function heif(o: Uint8Array, type: string): EnTeteImage | null {
  const zone = o.subarray(0, Math.min(o.length, 1 << 20));
  let largeur = 0;
  let hauteur = 0;
  let rotation = 0;
  for (let i = 4; i + 5 < zone.length; i++) {
    if (zone[i] !== 0x69) continue;
    const boite = ascii(zone, i, 4);
    if (boite === "ispe" && i + 16 <= zone.length) {
      // Une image HEIC d'iPhone est faite de tuiles qui ont chacune leur taille : la plus grande est celle de l'image.
      const w = u32be(zone, i + 8);
      const h = u32be(zone, i + 12);
      if (w * h > largeur * hauteur) [largeur, hauteur] = [w, h];
    } else if (boite === "irot") rotation = zone[i + 4] & 3;
  }
  if (!largeur || !hauteur) return null;
  // irot : quarts de tour dans le sens inverse des aiguilles d'une montre (6 = 90° à droite, 8 = 90° à gauche).
  return { type, largeurBrute: largeur, hauteurBrute: hauteur, orientation: [1, 8, 3, 6][rotation] };
}

/** En-tête d'une image, ou null si le format n'est pas reconnu. */
export function analyserImage(o: Uint8Array): EnTeteImage | null {
  if (o.length < 16) return null;
  if (o[0] === 0xff && o[1] === 0xd8) return jpeg(o);
  if (o[0] === 0x89 && ascii(o, 1, 3) === "PNG") return { type: "image/png", largeurBrute: u32be(o, 16), hauteurBrute: u32be(o, 20), orientation: 1 };
  if (ascii(o, 0, 4) === "GIF8") return { type: "image/gif", largeurBrute: u16le(o, 6), hauteurBrute: u16le(o, 8), orientation: 1 };
  if (ascii(o, 0, 4) === "RIFF" && ascii(o, 8, 4) === "WEBP") {
    const morceau = ascii(o, 12, 4);
    if (morceau === "VP8 ") return { type: "image/webp", largeurBrute: u16le(o, 26) & 0x3fff, hauteurBrute: u16le(o, 28) & 0x3fff, orientation: 1 };
    if (morceau === "VP8L") {
      const b = o.subarray(21, 25);
      return { type: "image/webp", largeurBrute: 1 + (((b[1] & 0x3f) << 8) | b[0]), hauteurBrute: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)), orientation: 1 };
    }
    if (morceau === "VP8X") return { type: "image/webp", largeurBrute: 1 + (o[24] | (o[25] << 8) | (o[26] << 16)), hauteurBrute: 1 + (o[27] | (o[28] << 8) | (o[29] << 16)), orientation: 1 };
    return null;
  }
  if (o[0] === 0x42 && o[1] === 0x4d) {
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
    return { type: "image/bmp", largeurBrute: Math.abs(v.getInt32(18, true)), hauteurBrute: Math.abs(v.getInt32(22, true)), orientation: 1 };
  }
  if (ascii(o, 4, 4) === "ftyp") {
    const marque = ascii(o, 8, 4);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(marque)) return heif(o, "image/heic");
    if (["avif", "avis"].includes(marque)) return heif(o, "image/avif");
  }
  return null;
}

/** Dimensions de la photo remise dans le bon sens. */
export function dimensionsOrientees(e: EnTeteImage): { w: number; h: number } {
  return e.orientation >= 5 ? { w: e.hauteurBrute, h: e.largeurBrute } : { w: e.largeurBrute, h: e.hauteurBrute };
}
