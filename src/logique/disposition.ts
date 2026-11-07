/**
 * Formats de page, dispositions des photos et recadrage : FORMATS, LAYOUT_NAMES, SLOT_NAMES, split_frame,
 * cover_source_rect, slot_whole, padded, _areas et page_ratio de calendrier.py.
 */
import { MAX_EMPLACEMENTS } from "./plan";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Formats de page : libellé, dimensions du papier en portrait (mm), orientation. */
export const FORMATS = [
  { libelle: "A4 portrait", largeurMm: 210, hauteurMm: 297, paysage: false },
  { libelle: "A4 paysage", largeurMm: 210, hauteurMm: 297, paysage: true },
  { libelle: "A3 portrait", largeurMm: 297, hauteurMm: 420, paysage: false },
  { libelle: "A3 paysage", largeurMm: 297, hauteurMm: 420, paysage: true },
] as const;

/** Résolution des pages exportées : le dessin de la page se fait dans une grille de 300 points par pouce. */
export const PPP_EXPORT = 300;

/** Dimensions de la page (mm), dans le bon sens. */
export function dimensionsMm(format: number): { largeur: number; hauteur: number } {
  const f = FORMATS[format];
  return f.paysage ? { largeur: f.hauteurMm, hauteur: f.largeurMm } : { largeur: f.largeurMm, hauteur: f.hauteurMm };
}

/** Dimensions de la page en unités de dessin (pixels à 300 ppp, non arrondis). */
export function dimensionsUnites(format: number): { w: number; h: number } {
  const { largeur, hauteur } = dimensionsMm(format);
  return { w: (largeur / 25.4) * PPP_EXPORT, h: (hauteur / 25.4) * PPP_EXPORT };
}

/** Hauteur / largeur de la page (page_ratio). */
export function rapportPage(format: number): number {
  const f = FORMATS[format];
  return f.paysage ? f.largeurMm / f.hauteurMm : f.hauteurMm / f.largeurMm;
}

/** Dispositions : nombre de photos → libellé, et nom de chaque emplacement. */
export const NOMS_DISPOSITIONS: Record<number, string> = {
  1: "1 photo (paysage)",
  2: "2 photos côte à côte (portrait)",
  3: "3 photos (une grande, deux petites)",
  4: "4 photos (mosaïque)",
};
export const NOMS_EMPLACEMENTS: Record<number, string[]> = {
  1: ["photo"],
  2: ["gauche", "droite"],
  3: ["grande, à gauche", "en haut à droite", "en bas à droite"],
  4: ["en haut à gauche", "en haut à droite", "en bas à gauche", "en bas à droite"],
};

/**
 * Cadres des photos d'une zone, séparés d'un petit écart, selon la disposition : 1 : un seul cadre ; 2 : deux cadres
 * côte à côte ; 3 : un grand cadre à gauche et deux petits superposés à droite ; 4 : mosaïque de 2 × 2.
 * Ordre : de gauche à droite, puis de haut en bas.
 */
export function decouperCadre(r: Rect, nombre: number, ecart?: number): Rect[] {
  const { x, y, w, h } = r;
  const e = ecart ?? Math.min(w, h) * 0.03;
  if (nombre === 1) return [{ x, y, w, h }];
  const demiL = (w - e) / 2;
  const demiH = (h - e) / 2;
  if (nombre === 2) return [{ x, y, w: demiL, h }, { x: x + demiL + e, y, w: demiL, h }];
  if (nombre === 3) {
    const grand = (w - e) * 0.6;
    const petit = w - e - grand;
    return [{ x, y, w: grand, h }, { x: x + grand + e, y, w: petit, h: demiH }, { x: x + grand + e, y: y + demiH + e, w: petit, h: demiH }];
  }
  return [
    { x, y, w: demiL, h: demiH }, { x: x + demiL + e, y, w: demiL, h: demiH },
    { x, y: y + demiH + e, w: demiL, h: demiH }, { x: x + demiL + e, y: y + demiH + e, w: demiL, h: demiH },
  ];
}

/** Zone des photos et zone du texte (calendrier ou titre) d'une page de w × h (_areas). */
export function zonesPage(type: "cover" | "month", w: number, h: number, paysage: boolean): [Rect, Rect] {
  if (type === "cover") {
    const m = Math.min(w, h) * 0.06;
    const photo = { x: m, y: m, w: w - 2 * m, h: h * (paysage ? 0.62 : 0.68) };
    const bas = photo.y + photo.h;
    return [photo, { x: m, y: bas + m * 0.5, w: w - 2 * m, h: h - bas - m * 1.5 }];
  }
  const m = Math.min(w, h) * 0.05;
  if (paysage) {
    const photo = { x: m, y: m, w: w * 0.56 - m, h: h - 2 * m };
    const droite = photo.x + photo.w;
    return [photo, { x: droite + m, y: m, w: w - droite - 2 * m, h: h - 2 * m }];
  }
  const photo = { x: m, y: m, w: w - 2 * m, h: h * 0.5 };
  const bas = photo.y + photo.h;
  return [photo, { x: m, y: bas + m * 0.8, w: w - 2 * m, h: h - bas - m * 1.8 }];
}

/** Forme des cadres de chaque disposition pour un format de page : {nombre de photos: [largeur / hauteur]}. */
export function aspectsCadres(format: number): Record<number, number[]> {
  const zone = zonesPage("month", 1000, 1000 * rapportPage(format), FORMATS[format].paysage)[0];
  return Object.fromEntries([1, 2, 3, 4].map((k) => [k, decouperCadre(zone, k).map((c) => c.w / c.h)]));
}

/** Recadrage d'une photo : zoom (≥ 1) et centre de la partie visible (fractions de la photo), ou photo entière. */
export type Recadrage = { zoom?: number; x?: number; y?: number; whole?: boolean };
export const ZOOM_MAX = 5.0;
/** Recadrage « Photo entière » choisi explicitement avec l'outil de recadrage. */
export const RECADRAGE_ENTIER: Recadrage = { whole: true };

/**
 * Partie de l'image (w × h) qui remplit la cible sans déformation (cover_source_rect). Sans recadrage, c'est la partie
 * centrale. La zone reste toujours à l'intérieur de l'image.
 */
export function zoneSource(imgW: number, imgH: number, cibleW: number, cibleH: number, recadrage?: Recadrage | null): Rect {
  const r = recadrage ?? {};
  const zoom = Math.max(1.0, r.zoom ?? 1.0);
  const echelle = Math.max(cibleW / imgW, cibleH / imgH) * zoom;
  const w = cibleW / echelle;
  const h = cibleH / echelle;
  let x = (r.x ?? 0.5) * imgW - w / 2;
  let y = (r.y ?? 0.5) * imgH - h / 2;
  x = Math.min(Math.max(x, 0.0), imgW - w);
  y = Math.min(Math.max(y, 0.0), imgH - h);
  return { x, y, w, h };
}

/** Cadres remplis par défaut (photo recadrée au centre plutôt que réduite) : les deux petits cadres de la disposition 3. */
const REMPLIS_PAR_DEFAUT = new Set(["3,1", "3,2"]);

/** Vrai si l'emplacement affiche par défaut la photo entière (sans recadrage choisi) (slot_whole). */
export const emplacementEntier = (nombre: number, emplacement: number) => !REMPLIS_PAR_DEFAUT.has(`${nombre},${emplacement}`);

/** Liste des photos (ou des recadrages) d'une page, complétée à 4 emplacements (padded). */
export function completer<T>(valeurs: readonly (T | null)[] | null | undefined): (T | null)[] {
  return [...(valeurs ?? []), ...Array(MAX_EMPLACEMENTS).fill(null)].slice(0, MAX_EMPLACEMENTS);
}

/**
 * Où dessiner une photo dans son cadre (draw_in_frame) : photo entière réduite et centrée, ou cadre rempli (recadrage
 * choisi, ou partie centrale). Renvoie la cible sur la page et la partie de la photo (en pixels de la photo).
 */
export function placementPhoto(cadre: Rect, imgW: number, imgH: number, recadrage: Recadrage | null, entiere: boolean): { cible: Rect; source: Rect } {
  let r = recadrage;
  let entier = entiere;
  if (r !== null && r.whole) {
    entier = true;
    r = null;
  }
  if (entier && r === null) {
    const echelle = Math.min(cadre.w / imgW, cadre.h / imgH);
    const w = imgW * echelle;
    const h = imgH * echelle;
    return { cible: { x: cadre.x + cadre.w / 2 - w / 2, y: cadre.y + cadre.h / 2 - h / 2, w, h }, source: { x: 0, y: 0, w: imgW, h: imgH } };
  }
  return { cible: cadre, source: zoneSource(imgW, imgH, cadre.w, cadre.h, r) };
}
