/** Aides des tests : polices lues dans node_modules, données de rendu, JPEG fabriqués. */
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { Police } from "../src/rendu/police";
import type { DonneesRendu } from "../src/rendu/page";
import type { Projet } from "../src/logique/projet";

const racine = path.resolve(import.meta.dirname, "..");
const FICHIERS: Record<number, [string, string]> = {
  0: ["open-sans/400Regular/OpenSans_400Regular.ttf", "open-sans/700Bold/OpenSans_700Bold.ttf"],
  1: ["gelasio/400Regular/Gelasio_400Regular.ttf", "gelasio/700Bold/Gelasio_700Bold.ttf"],
  2: ["kalam/400Regular/Kalam_400Regular.ttf", "kalam/700Bold/Kalam_700Bold.ttf"],
};

export function octetsPolice(style: number, gras: boolean): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(racine, "node_modules/@expo-google-fonts", FICHIERS[style][gras ? 1 : 0])));
}

const cache = new Map<string, Police>();
export function police(style: number, gras: boolean): Police {
  const cle = `${style}-${gras}`;
  if (!cache.has(cle)) cache.set(cle, new Police(octetsPolice(style, gras)));
  return cache.get(cle)!;
}

export function donneesRendu(p: Projet, dimensions: Record<string, { w: number; h: number }> = {}, masquerVides = true): DonneesRendu {
  return {
    reglages: p.reglages, photos: p.photos, layouts: p.layouts, crops: p.crops, masquerVides,
    dimensions: (id) => dimensions[id] ?? null,
    polices: { normal: police(p.reglages.font, false), gras: police(p.reglages.font, true) },
  };
}

/** Un JPEG uni de w × h (vrai fichier JPEG, décodable). */
export function jpegUni(w: number, h: number, rvb: [number, number, number] = [200, 120, 60]): Uint8Array {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[4 * i] = rvb[0];
    data[4 * i + 1] = rvb[1];
    data[4 * i + 2] = rvb[2];
    data[4 * i + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 80).data);
}
