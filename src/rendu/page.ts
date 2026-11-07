/**
 * Dessin d'une page du calendrier (CalendarRenderer de calendrier.py) sous forme d'une liste d'opérations
 * (rectangles, lignes, textes déjà mis en page, photos). La même liste sert à l'aperçu (canevas), à l'impression et
 * au PDF : le rendu est le même partout.
 *
 * Les coordonnées sont des « unités » : des pixels à 300 ppp sur la page réelle, comme dans le PDF de la version
 * Windows. Une page A4 portrait mesure 2480,3 × 3507,9 unités.
 */
import { surBlanc } from "../logique/couleurs";
import { iso, semaineIso, semainesDuMois, type Jour } from "../logique/dates";
import {
  completer, decouperCadre, dimensionsUnites, emplacementEntier, FORMATS, placementPhoto, zonesPage, type Recadrage, type Rect,
} from "../logique/disposition";
import { COULEURS_EVENEMENTS, evenementsDuJour } from "../logique/evenements";
import { joursFeries } from "../logique/feries";
import { arrondiPython } from "../logique/python";
import { clePage, JOURS, MOIS, pagesDu, type Reglages } from "../logique/reglages";
import { COULEURS_ZONES, DEBUT_DONNEES_SCOLAIRES, FIN_DONNEES_SCOLAIRES, JOURS_VACANCES } from "../logique/vacances";
import type { Police } from "./police";
import { ALIGNEMENT, avanceEntiere, largeur, poserTexte, type Fonte, type LignePosee } from "./texte";

export const COULEUR_TEXTE = "#1e293b";
export const COULEUR_DISCRETE = "#64748b";
export const COULEUR_CASE = "#f3f5f8";
export const COULEUR_VIDE = "#eef1f5";

export type Operation =
  | { type: "rect"; r: Rect; couleur: string }
  | { type: "arrondi"; r: Rect; rayon: number; couleur: string; legende?: boolean }
  | { type: "ligne"; x1: number; y1: number; x2: number; y2: number; epaisseur: number; couleur: string }
  | {
      type: "texte";
      lignes: LignePosee[];
      px: number;
      gras: boolean;
      couleur: string;
      decoupe: Rect | null;
      /** La demande d'origine (comme QPainter.drawText) : sert aux tests. */
      demande: { r: Rect; drapeaux: number; texte: string };
    }
  | { type: "photo"; id: string; cible: Rect; source: Rect; rayon: number; cadre: Rect; emplacement: number }
  | { type: "decoupe"; r: Rect }
  | { type: "sauver" }
  | { type: "restaurer" };

/** Ce qu'il faut pour dessiner les pages d'un calendrier. */
export interface DonneesRendu {
  reglages: Reglages;
  photos: Record<string, (string | null)[]>;
  layouts: Record<string, number>;
  crops: Record<string, (Recadrage | null)[]>;
  /** Dimensions de la photo, une fois remise dans le bon sens (pixels de l'original), ou null si elle manque. */
  dimensions: (id: string) => { w: number; h: number } | null;
  polices: { normal: Police; gras: Police };
  /** Impression et PDF : les cadres sans photo ne sont pas dessinés (l'aperçu, lui, les montre). */
  masquerVides: boolean;
}

export interface PageDessinee {
  w: number;
  h: number;
  ops: Operation[];
}

export function nombrePhotos(d: DonneesRendu, cle: string): number {
  return d.layouts[cle] ?? 1;
}

/** Photos d'une page, selon sa disposition (page_photos). */
export function photosDeLaPage(d: DonneesRendu, cle: string): (string | null)[] {
  return completer(d.photos[cle]).slice(0, nombrePhotos(d, cle));
}

export function recadragesDeLaPage(d: DonneesRendu, cle: string): (Recadrage | null)[] {
  return completer(d.crops[cle]).slice(0, nombrePhotos(d, cle));
}

/** Cadres des photos d'une page de w × h (photo_frames). */
export function cadresPhotos(d: DonneesRendu, index: number, w: number, h: number): Rect[] {
  const page = pagesDu(d.reglages)[index];
  const zone = zonesPage(page.type, w, h, FORMATS[d.reglages.format].paysage)[0];
  return decouperCadre(zone, nombrePhotos(d, clePage(d.reglages, index)));
}

/** QRectF.adjusted de Qt, avec le même ordre de calcul (résultats identiques au bit près). */
function ajuste(r: Rect, dx1: number, dy1: number, dx2: number, dy2: number): Rect {
  return { x: r.x + dx1, y: r.y + dy1, w: r.w + dx2 - dx1, h: r.h + dy2 - dy1 };
}

class Dessin {
  ops: Operation[] = [];
  constructor(readonly d: DonneesRendu) {}

  fonte(pixels: number, gras = false): Fonte {
    return { police: gras ? this.d.polices.gras : this.d.polices.normal, px: Math.max(1, arrondiPython(pixels)), gras };
  }

  texte(r: Rect, drapeaux: number, texte: string, f: Fonte, couleur: string) {
    const pose = poserTexte(r, drapeaux, texte, f);
    this.ops.push({ type: "texte", lignes: pose.lignes, px: f.px, gras: f.gras, couleur, decoupe: pose.decoupe, demande: { r: { ...r }, drapeaux, texte } });
  }
}

/** Dessine une page (render) : fond blanc, photos, puis titre de la couverture ou grille du mois. */
export function dessinerPage(d: DonneesRendu, index: number): PageDessinee {
  const { w, h } = dimensionsUnites(d.reglages.format);
  const s = d.reglages;
  const dessin = new Dessin(d);
  dessin.ops.push({ type: "rect", r: { x: 0, y: 0, w, h }, couleur: "#ffffff" });
  const page = pagesDu(s)[index];
  const cle = clePage(s, index);
  const zoneTexte = zonesPage(page.type, w, h, FORMATS[s.format].paysage)[1];
  const rayon = Math.min(w, h) * 0.015;
  const nombre = nombrePhotos(d, cle);
  const photos = photosDeLaPage(d, cle);
  const recadrages = recadragesDeLaPage(d, cle);
  cadresPhotos(d, index, w, h).forEach((cadre, emplacement) => {
    dessinerPhoto(dessin, cadre, photos[emplacement], rayon, recadrages[emplacement], s.whole_photos && emplacementEntier(nombre, emplacement), emplacement);
  });
  if (page.type === "cover") texteCouverture(dessin, zoneTexte, w);
  else grilleDuMois(dessin, zoneTexte, page.annee, page.mois);
  return { w, h, ops: dessin.ops };
}

function dessinerPhoto(dessin: Dessin, cadre: Rect, id: string | null, rayon: number, recadrage: Recadrage | null, entiere: boolean, emplacement: number) {
  const dimensions = id ? dessin.d.dimensions(id) : null;
  if (id && dimensions) {
    const { cible, source } = placementPhoto(cadre, dimensions.w, dimensions.h, recadrage, entiere);
    dessin.ops.push({ type: "photo", id, cible, source, rayon, cadre: { ...cadre }, emplacement });
    return;
  }
  if (dessin.d.masquerVides) return;
  dessin.ops.push({ type: "sauver" });
  dessin.ops.push({ type: "arrondi", r: { ...cadre }, rayon, couleur: COULEUR_VIDE });
  dessin.texte(cadre, ALIGNEMENT.CENTRE, id ? "Photo introuvable" : "Aucune photo", dessin.fonte(Math.min(cadre.w, cadre.h) * 0.07), COULEUR_DISCRETE);
  dessin.ops.push({ type: "restaurer" });
}

function texteCouverture(dessin: Dessin, zone: Rect, w: number) {
  const s = dessin.d.reglages;
  dessin.texte({ x: zone.x, y: zone.y, w: zone.w, h: zone.h * 0.55 }, ALIGNEMENT.CENTRE_H | ALIGNEMENT.BAS, s.title,
    dessin.fonte(Math.min(zone.h * 0.32, w * 0.07), true), COULEUR_TEXTE);
  const pages = pagesDu(s);
  const premier = pages[pages.length - 12];
  const dernier = pages[pages.length - 1];
  const a1 = premier.type === "month" ? premier.annee : s.year;
  const a2 = dernier.type === "month" ? dernier.annee : s.year;
  const annees = a1 === a2 ? String(a1) : `${a1} – ${a2}`;
  dessin.texte({ x: zone.x, y: zone.y + zone.h * 0.58, w: zone.w, h: zone.h * 0.42 }, ALIGNEMENT.CENTRE_H | ALIGNEMENT.HAUT, annees,
    dessin.fonte(Math.min(zone.h * 0.26, w * 0.06)), s.accent);
}

function grilleDuMois(dessin: Dessin, cal: Rect, annee: number, mois: number) {
  const s = dessin.d.reglages;
  const accent = s.accent;
  const feries = s.holidays ? joursFeries(annee) : new Map<string, string>();

  // En-tête : nom du mois et année.
  const hh = Math.min(cal.h * 0.15, cal.w * 0.13);
  const entete = { x: cal.x, y: cal.y, w: cal.w, h: hh };
  dessin.texte(entete, ALIGNEMENT.GAUCHE | ALIGNEMENT.CENTRE_V, MOIS[mois - 1], dessin.fonte(hh * 0.62, true), accent);
  dessin.texte(entete, ALIGNEMENT.DROITE | ALIGNEMENT.CENTRE_V, String(annee), dessin.fonte(hh * 0.42), COULEUR_DISCRETE);
  const basEntete = entete.y + entete.h;
  dessin.ops.push({ type: "ligne", x1: entete.x, y1: basEntete, x2: entete.x + entete.w, y2: basEntete, epaisseur: Math.max(1.0, hh * 0.03), couleur: accent });

  // Légende des vacances scolaires, sous la grille.
  let bas = cal.y + cal.h;
  if (s.school_zone) {
    const hauteurLegende = hh * 0.42;
    bas -= hauteurLegende;
    legendeVacances(dessin, { x: cal.x, y: bas, w: cal.w, h: hauteurLegende }, annee, mois);
  }

  // Colonne des numéros de semaine, à gauche de la grille.
  const semaines = semainesDuMois(annee, mois);
  const largeurSemaines = s.week_numbers ? cal.w * 0.065 : 0;
  const gauche = cal.x + largeurSemaines;
  const cw = (cal.w - largeurSemaines) / 7;

  // Noms des jours.
  const dh = hh * 0.45;
  const haut = basEntete + hh * 0.2;
  const fonteJours = dessin.fonte(dh * 0.6, true);
  JOURS.forEach((nom, col) => {
    dessin.texte({ x: gauche + col * cw, y: haut, w: cw, h: dh }, ALIGNEMENT.CENTRE, nom, fonteJours, s.weekends && col >= 5 ? accent : COULEUR_DISCRETE);
  });
  if (largeurSemaines) dessin.texte({ x: cal.x, y: haut, w: largeurSemaines, h: dh }, ALIGNEMENT.CENTRE, "Sem.", dessin.fonte(dh * 0.48), COULEUR_DISCRETE);

  // Grille des jours.
  const hautGrille = haut + dh + hh * 0.1;
  const ch = (bas - hautGrille) / semaines.length;
  const marge = Math.min(cw, ch) * 0.045;
  const pxNombre = Math.min(ch * 0.34, cw * 0.3);
  const pxLibelle = Math.min(ch * 0.19, cw * 0.14);
  semaines.forEach((semaine, ligne) => {
    if (largeurSemaines) {
      const premier = semaine.find((j) => j)!;
      dessin.texte({ x: cal.x, y: hautGrille + ligne * ch, w: largeurSemaines, h: ch }, ALIGNEMENT.CENTRE, String(semaineIso(annee, mois, premier)),
        dessin.fonte(Math.min(pxNombre * 0.62, largeurSemaines * 0.5)), COULEUR_DISCRETE);
    }
    semaine.forEach((jour, col) => {
      if (!jour) return;
      const date: Jour = { a: annee, m: mois, j: jour };
      const cleJour = iso(annee, mois, jour);
      const ferie = feries.get(cleJour);
      const weekend = s.weekends && col >= 5;
      const cellule = { x: gauche + col * cw + marge, y: hautGrille + ligne * ch + marge, w: cw - 2 * marge, h: ch - 2 * marge };
      const fond = ferie ? surBlanc(accent, 45) : weekend ? surBlanc(accent, 18) : COULEUR_CASE;
      dessin.ops.push({ type: "arrondi", r: cellule, rayon: marge * 2, couleur: fond });

      const interieur = ajuste(cellule, marge * 2.5, marge * 1.5, -marge * 2, -marge * 1.5);
      const fonteNombre = dessin.fonte(pxNombre, !!(ferie || weekend));
      dessin.texte(interieur, ALIGNEMENT.GAUCHE | ALIGNEMENT.HAUT, String(jour), fonteNombre, ferie || (weekend && col === 6) ? accent : COULEUR_TEXTE);
      const libelles: [string, string][] = ferie ? [[ferie, accent]] : [];
      if (s.show_events) {
        // Anniversaires d'abord, puis les autres événements.
        const evenements = evenementsDuJour(s.events, date);
        const tries = [...evenements.filter(([, k]) => k === "birthday"), ...evenements.filter(([, k]) => k !== "birthday")];
        for (const [texte, type] of tries) libelles.push([texte, COULEURS_EVENEMENTS[type]]);
      }
      if (libelles.length) {
        // Place du bandeau des vacances, seulement les jours où il est dessiné.
        const vacances = [...s.school_zone].some((zone) => zone in (JOURS_VACANCES.get(cleJour) ?? {}));
        const bandeau = vacances ? cellule.h * 0.12 + marge : 0;
        const largeurNombre = avanceEntiere(fonteNombre, String(jour));
        libellesDuJour(dessin, ajuste(interieur, 0, pxNombre * 1.25, 0, -bandeau), ajuste(interieur, largeurNombre + marge * 2.5, marge * 0.5, 0, -bandeau), libelles, pxLibelle);
      }
      if (s.school_zone) bandeauVacances(dessin, cellule, cleJour, marge);
    });
  });
}

/**
 * Textes d'un jour (jour férié, anniversaires, événements), les uns sous les autres (_draw_cell_labels). Les textes
 * ne sont jamais raccourcis : ils passent à la ligne. Ils vont sous le numéro du jour si tout y tient en réduisant peu
 * la police (jusqu'à 70 %) ; sinon à droite du numéro, sur toute la hauteur de la case, en réduisant la police
 * jusqu'à la moitié de sa taille.
 */
function libellesDuJour(dessin: Dessin, dessous: Rect, aCote: Rect, libelles: [string, string][], px: number) {
  const drapeaux = ALIGNEMENT.GAUCHE | ALIGNEMENT.HAUT | ALIGNEMENT.RETOUR;
  const boites = (zone: Rect, taille: number) => {
    const f = dessin.fonte(taille);
    return libelles.map(([texte]) => poserTexte({ x: zone.x, y: 0, w: zone.w, h: 100000 }, drapeaux, texte, f, true).boite);
  };
  const essayer = (zone: Rect, plusPetite: number): [number, Rect[], number] | null => {
    let taille = px;
    while (zone.w > 0 && zone.h > 0) {
      const b = boites(zone, taille);
      const ecart = taille * 0.15;
      const hauteur = b.reduce((s, x) => s + x.h, 0) + ecart * (libelles.length - 1);
      if (hauteur <= zone.h && b.every((x) => x.w <= zone.w + 0.5)) return [taille, b, ecart];
      if (taille <= plusPetite) return null;
      taille = Math.max(plusPetite, taille * 0.9);
    }
    return null;
  };
  let zone = dessous;
  let resultat = essayer(dessous, px * 0.7);
  if (resultat === null) {
    zone = aCote;
    resultat = essayer(aCote, px * 0.5);
  }
  if (resultat === null) {
    // Case minuscule : plus petite taille, ce qui dépasse n'est pas dessiné.
    zone = aCote;
    resultat = [px * 0.5, boites(zone, px * 0.5), px * 0.5 * 0.15];
  }
  const [taille, b, ecart] = resultat;
  dessin.ops.push({ type: "sauver" }, { type: "decoupe", r: { ...zone } });
  const f = dessin.fonte(taille);
  let y = zone.y;
  libelles.forEach(([texte, couleur], i) => {
    dessin.texte({ x: zone.x, y, w: zone.w, h: b[i].h }, drapeaux, texte, f, couleur);
    y += b[i].h + ecart;
  });
  dessin.ops.push({ type: "restaurer" });
}

/** Bandeau en bas de la case d'un jour de vacances scolaires : une couleur par zone (A, B, C de gauche à droite). */
function bandeauVacances(dessin: Dessin, cellule: Rect, cleJour: string, marge: number) {
  const enVacances = JOURS_VACANCES.get(cleJour) ?? {};
  const zones = dessin.d.reglages.school_zone;
  if (![...zones].some((z) => z in enVacances)) return;
  const hauteur = Math.max(1.0, cellule.h * 0.12);
  const bande = { x: cellule.x + marge * 2, y: cellule.y + cellule.h - hauteur - marge * 1.5, w: cellule.w - marge * 4, h: hauteur };
  const part = bande.w / zones.length;
  [...zones].forEach((zone, i) => {
    if (zone in enVacances) dessin.ops.push({ type: "arrondi", r: { x: bande.x + i * part, y: bande.y, w: part, h: hauteur }, rayon: hauteur / 2, couleur: COULEURS_ZONES[zone] });
  });
}

/** « Vacances scolaires : ▬ zone A », ou un avertissement si les dates du mois ne sont pas publiées. */
function legendeVacances(dessin: Dessin, zone: Rect, annee: number, mois: number) {
  const zones = dessin.d.reglages.school_zone;
  const px = zone.h * 0.5;
  const f = dessin.fonte(px);
  let x = zone.x;
  const milieu = zone.y + zone.h / 2;
  const debutMois = iso(annee, mois, 1);
  const finMois = iso(annee + Math.floor(mois / 12), (mois % 12) + 1, 1);
  if (debutMois >= FIN_DONNEES_SCOLAIRES || finMois <= DEBUT_DONNEES_SCOLAIRES) {
    dessin.texte(zone, ALIGNEMENT.GAUCHE | ALIGNEMENT.CENTRE_V, "Vacances scolaires : dates pas encore publiées pour ce mois", f, COULEUR_DISCRETE);
    return;
  }
  const texte = "Vacances scolaires :";
  dessin.texte({ x, y: zone.y, w: zone.w, h: zone.h }, ALIGNEMENT.GAUCHE | ALIGNEMENT.CENTRE_V, texte, f, COULEUR_DISCRETE);
  x += avanceEntiere(f, texte) + px * 0.6;
  for (const z of zones) {
    dessin.ops.push({ type: "arrondi", r: { x, y: milieu - px * 0.18, w: px * 1.4, h: px * 0.36 }, rayon: px * 0.18, couleur: COULEURS_ZONES[z], legende: true });
    x += px * 1.4 + px * 0.35;
    const libelle = `zone ${z}`;
    dessin.texte({ x, y: zone.y, w: zone.w, h: zone.h }, ALIGNEMENT.GAUCHE | ALIGNEMENT.CENTRE_V, libelle, f, COULEUR_DISCRETE);
    x += avanceEntiere(f, libelle) + px * 0.9;
  }
}

/** Largeur d'un texte (utile à l'interface). */
export { largeur as largeurTexte };
