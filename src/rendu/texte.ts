/**
 * Mise en page du texte comme QPainter.drawText(rectangle, alignement, texte) de Qt : alignement, retour à la ligne
 * entre les mots, interligne, découpe au rectangle. Les largeurs sont celles des glyphes de la police (sans crénage),
 * identiques dans l'aperçu et dans le PDF.
 */
import type { Rect } from "../logique/disposition";
import type { Police } from "./police";

/** Valeurs de Qt::AlignmentFlag et Qt::TextFlag. */
export const ALIGNEMENT = { GAUCHE: 0x1, DROITE: 0x2, CENTRE_H: 0x4, HAUT: 0x20, BAS: 0x40, CENTRE_V: 0x80, CENTRE: 0x84, RETOUR: 0x1000 } as const;

export interface Fonte {
  police: Police;
  /** Taille en unités de dessin (pixels entiers, comme QFont.setPixelSize). */
  px: number;
  gras: boolean;
}

export const echelle = (f: Fonte) => f.px / f.police.unitesParEm;
export const ascendant = (f: Fonte) => f.police.ascendant * echelle(f);
export const descendant = (f: Fonte) => f.police.descendant * echelle(f);
export const interligne = (f: Fonte) => f.police.interligne * echelle(f);
export const largeur = (f: Fonte, texte: string) => f.police.largeurUnites(texte) * echelle(f);
/** QFontMetrics.horizontalAdvance : largeur arrondie au pixel. */
export const avanceEntiere = (f: Fonte, texte: string) => Math.round(largeur(f, texte));

export interface LignePosee {
  texte: string;
  x: number;
  /** Ligne de base. */
  y: number;
  largeur: number;
}

export interface TextePose {
  lignes: LignePosee[];
  /** Rectangle occupé par le texte (boundingRect de Qt). */
  boite: Rect;
  /** Rectangle de découpe si le texte déborde du rectangle demandé. */
  decoupe: Rect | null;
}

/**
 * Texte que la police sait écrire : une lettre absente est remplacée par sa lettre de base (« ł » → « l »), ou par
 * « ? » ; les émojis et symboles absents sont retirés. L'aperçu et le PDF écrivent ainsi exactement le même texte.
 */
export function texteImprimable(police: Police, texte: string): string {
  let r = "";
  for (const c of texte) {
    const cp = c.codePointAt(0)!;
    if (police.aLeCaractere(cp) || c === "\n") r += c;
    else if (/\s/u.test(c)) r += " ";
    else {
      const base = c.normalize("NFD").replace(/\p{M}/gu, "");
      if (base && base !== c && [...base].every((b) => police.aLeCaractere(b.codePointAt(0)!))) r += base;
      else if (/[\p{L}\p{N}]/u.test(c)) r += "?";
    }
  }
  return r;
}

/** Points de coupure : après les espaces, et après un trait d'union suivi d'une lettre (règles Unicode simplifiées). */
function mots(texte: string): string[] {
  const r: string[] = [];
  let courant = "";
  const caracteres = [...texte];
  for (let i = 0; i < caracteres.length; i++) {
    const c = caracteres[i];
    courant += c;
    const suivant = caracteres[i + 1];
    if (suivant === undefined) break;
    const coupe = (/\s/.test(c) && !/\s/.test(suivant)) || (c === "-" && /\p{L}/u.test(suivant) && i > 0 && /\p{L}/u.test(caracteres[i - 1]));
    if (coupe) {
      r.push(courant);
      courant = "";
    }
  }
  if (courant) r.push(courant);
  return r;
}

/** Lignes d'un paragraphe : retour à la ligne entre les mots ; un mot trop long dépasse (QTextOption::WordWrap). */
function couper(f: Fonte, paragraphe: string, largeurMax: number | null): string[] {
  if (largeurMax === null) return [paragraphe];
  const lignes: string[] = [];
  let ligne = "";
  for (const mot of mots(paragraphe)) {
    const essai = ligne + mot;
    if (ligne && largeur(f, essai.trimEnd()) > largeurMax) {
      lignes.push(ligne);
      ligne = mot;
    } else ligne = essai;
  }
  lignes.push(ligne);
  return lignes;
}

/**
 * Place un texte dans un rectangle (qt_format_text) : lignes aux positions entières depuis le haut, séparées par
 * l'interligne de la police, puis le bloc aligné verticalement et chaque ligne horizontalement.
 * pourMesurer : comme QPainter.boundingRect (toutes les lignes, même au-delà du rectangle).
 */
export function poserTexte(r: Rect, drapeaux: number, texte: string, f: Fonte, pourMesurer = false): TextePose {
  const retour = (drapeaux & ALIGNEMENT.RETOUR) !== 0;
  const paragraphes = texteImprimable(f.police, texte).split(new RegExp("\\r\\n|\\n|\\r|" + String.fromCharCode(0x2028)));
  const lignesTexte = paragraphes.flatMap((p) => couper(f, p, retour ? Math.max(0, r.w) : null));
  const hauteurLigne = ascendant(f) + descendant(f);
  const ecart = interligne(f);
  let hauteur = -ecart;
  let largeurMax = 0;
  const placees: { texte: string; y: number; largeur: number }[] = [];
  for (const t of lignesTexte) {
    hauteur += ecart;
    hauteur = Math.ceil(hauteur - 1e-9);
    const visible = t.trimEnd();
    const l = largeur(f, visible);
    placees.push({ texte: visible, y: hauteur, largeur: l });
    hauteur += hauteurLigne;
    largeurMax = Math.max(largeurMax, l);
    if (!pourMesurer && hauteur >= r.h) break;
  }
  let dy = 0;
  if (drapeaux & ALIGNEMENT.BAS) dy = r.h - hauteur;
  else if (drapeaux & ALIGNEMENT.CENTRE_V) dy = (r.h - hauteur) / 2;
  let dxBloc = 0;
  if (drapeaux & ALIGNEMENT.DROITE) dxBloc = r.w - largeurMax;
  else if (drapeaux & ALIGNEMENT.CENTRE_H) dxBloc = (r.w - largeurMax) / 2;
  const lignes = placees.map((p) => {
    let dx = 0;
    if (drapeaux & ALIGNEMENT.DROITE) dx = r.w - p.largeur;
    else if (drapeaux & ALIGNEMENT.CENTRE_H) dx = (r.w - p.largeur) / 2;
    return { texte: p.texte, x: r.x + dx, y: r.y + dy + p.y + ascendant(f), largeur: p.largeur };
  });
  const boite = { x: r.x + dxBloc, y: r.y + dy, w: largeurMax, h: hauteur };
  const dedans = boite.x >= r.x - 1e-6 && boite.y >= r.y - 1e-6 && boite.x + boite.w <= r.x + r.w + 1e-6 && boite.y + boite.h <= r.y + r.h + 1e-6;
  return { lignes, boite, decoupe: dedans ? null : { ...r } };
}
