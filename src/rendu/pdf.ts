/**
 * Export PDF (export_pdf de calendrier.py) avec pdf-lib (licence MIT) : pages au format exact du papier, texte en
 * vectoriel avec la police intégrée (réduite aux lettres utilisées), photos en JPEG à 300 ppp au plus, à leur taille
 * d'impression. Les cadres vides ne sont pas imprimés.
 */
import {
  appendBezierCurve, beginText, clip, closePath, concatTransformationMatrix, drawObject, endPath, endText, fill, LineCapStyle, lineTo, moveTo,
  PDFDocument, PDFHexString, PDFName, PDFOperator, PDFRef, PDFString, popGraphicsState, pushGraphicsState, setFillingRgbColor, setFontAndSize,
  setLineCap, setLineWidth, setStrokingRgbColor, setTextMatrix, showText, stroke,
} from "pdf-lib";
import { rvb } from "../logique/couleurs";
import { dimensionsMm, type Rect } from "../logique/disposition";
import { pagesDu } from "../logique/reglages";
import { rectangleArrondi } from "./chemins";
import { dessinerPage, type DonneesRendu } from "./page";
import { pixelsPhoto, QUALITE_JPEG } from "./pixels";
import type { Police } from "./police";

export const POINTS_PAR_UNITE = 72 / 300;
export { pixelsPhoto, QUALITE_JPEG };

/** Une photo prête pour le PDF : JPEG de la partie visible, à la taille d'impression. */
export interface PhotoPdf {
  jpeg: Uint8Array;
  largeur: number;
  hauteur: number;
}

/**
 * Prépare la partie source (pixels de l'original remis droit) d'une photo, réduite à largeur × hauteur pixels ;
 * null si la photo est illisible (son cadre reste alors vide).
 */
export type PreparerPhoto = (id: string, source: Rect, largeur: number, hauteur: number) => Promise<PhotoPdf | null>;

export interface OptionsPdf {
  titre: string;
  application: string;
  avancement?: (fait: number, total: number) => void;
  annule?: () => boolean;
}

export class ExportAnnule extends Error {
  constructor() {
    super("Export annulé.");
    this.name = "AbortError";
  }
}

/** Police intégrée au PDF (type 0, glyphes désignés par leur numéro), complétée à la fin avec les glyphes utilisés. */
class PolicePdf {
  readonly utilises = new Map<number, string>();
  constructor(readonly police: Police, readonly ref: PDFRef, readonly nom: string) {}

  /** Texte codé en numéros de glyphes (2 octets chacun). */
  coder(texte: string): PDFHexString {
    let hex = "";
    for (const c of texte) {
      const g = this.police.glyphe(c.codePointAt(0)!);
      if (!this.utilises.has(g)) this.utilises.set(g, c);
      hex += g.toString(16).padStart(4, "0");
    }
    return PDFHexString.of(hex);
  }

  incorporer(doc: PDFDocument, etiquette: string) {
    const p = this.police;
    const mille = (v: number) => Math.round((v * 1000) / p.unitesParEm);
    const octets = p.reduire(this.utilises.keys());
    const fichier = doc.context.register(doc.context.flateStream(octets, { Length1: octets.length }));
    const nom = `${etiquette}+${p.nomPostScript}`;
    const descripteur = doc.context.register(doc.context.obj({
      Type: "FontDescriptor", FontName: nom, Flags: 4, FontBBox: p.cadre.map(mille), ItalicAngle: p.anglePenche,
      Ascent: mille(p.ascendant), Descent: -mille(p.descendant), CapHeight: mille(p.hauteurCapitales), StemV: 80, FontFile2: fichier,
    }));
    const glyphes = [...this.utilises.keys()].sort((a, b) => a - b);
    const largeurs: (number | number[])[] = [];
    for (const g of glyphes) largeurs.push(g, [mille(p.avance(g))]);
    const cid = doc.context.register(doc.context.obj({
      Type: "Font", Subtype: "CIDFontType2", BaseFont: nom, FontDescriptor: descripteur, CIDToGIDMap: "Identity", DW: 1000, W: largeurs,
      CIDSystemInfo: { Registry: PDFString.of("Adobe"), Ordering: PDFString.of("Identity"), Supplement: 0 },
    }));
    const unicode = doc.context.register(doc.context.flateStream(carteUnicode(this.utilises)));
    doc.context.assign(this.ref, doc.context.obj({
      Type: "Font", Subtype: "Type0", BaseFont: nom, Encoding: "Identity-H", DescendantFonts: [cid], ToUnicode: unicode,
    }));
  }
}

/** Table ToUnicode : le texte du PDF reste sélectionnable et lisible par les outils de recherche. */
function carteUnicode(glyphes: Map<number, string>): string {
  const hex4 = (n: number) => n.toString(16).padStart(4, "0");
  const utf16 = (t: string) => [...t].map((c) => {
    const cp = c.codePointAt(0)!;
    if (cp < 0x10000) return hex4(cp);
    const v = cp - 0x10000;
    return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
  }).join("");
  const entrees = [...glyphes].filter(([g]) => g !== 0).sort((a, b) => a[0] - b[0]);
  let blocs = "";
  for (let i = 0; i < entrees.length; i += 100) {
    const bloc = entrees.slice(i, i + 100);
    blocs += `${bloc.length} beginbfchar\n${bloc.map(([g, t]) => `<${hex4(g)}> <${utf16(t)}>`).join("\n")}\nendbfchar\n`;
  }
  return "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n" +
    "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" +
    `${blocs}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
}

const couleur = (c: string): [number, number, number] => rvb(c).map((v) => v / 255) as [number, number, number];

/** Crée le PDF de toutes les pages. */
export async function creerPdf(d: DonneesRendu, preparer: PreparerPhoto, o: OptionsPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(o.titre);
  doc.setCreator(o.application);
  doc.setProducer(`${o.application} (pdf-lib)`);
  doc.setLanguage("fr-FR");
  const { largeur, hauteur } = dimensionsMm(d.reglages.format);
  const largeurPt = (largeur / 25.4) * 72;
  const hauteurPt = (hauteur / 25.4) * 72;
  const X = (x: number) => x * POINTS_PAR_UNITE;
  const Y = (y: number) => hauteurPt - y * POINTS_PAR_UNITE;
  const polices = new Map<Police, PolicePdf>();
  const policePdf = (p: Police) => {
    let pp = polices.get(p);
    if (!pp) polices.set(p, (pp = new PolicePdf(p, doc.context.nextRef(), `F${polices.size}`)));
    return pp;
  };
  const chemin = (r: Rect, rayon: number): PDFOperator[] =>
    rectangleArrondi(r, rayon).map((s) =>
      s[0] === "M" ? moveTo(X(s[1]), Y(s[2])) : s[0] === "L" ? lineTo(X(s[1]), Y(s[2])) : s[0] === "C" ? appendBezierCurve(X(s[1]), Y(s[2]), X(s[3]), Y(s[4]), X(s[5]), Y(s[6])) : closePath(),
    );

  const total = pagesDu(d.reglages).length;
  for (let index = 0; index < total; index++) {
    if (o.annule?.()) throw new ExportAnnule();
    const pageDessinee = dessinerPage({ ...d, masquerVides: true }, index);
    const page = doc.addPage([largeurPt, hauteurPt]);
    const ops: PDFOperator[] = [];
    for (const op of pageDessinee.ops) {
      switch (op.type) {
        case "rect":
          ops.push(setFillingRgbColor(...couleur(op.couleur)), ...chemin(op.r, 0), fill());
          break;
        case "arrondi":
          ops.push(setFillingRgbColor(...couleur(op.couleur)), ...chemin(op.r, op.rayon), fill());
          break;
        case "ligne":
          ops.push(setStrokingRgbColor(...couleur(op.couleur)), setLineWidth(op.epaisseur * POINTS_PAR_UNITE), setLineCap(LineCapStyle.Projecting),
            moveTo(X(op.x1), Y(op.y1)), lineTo(X(op.x2), Y(op.y2)), stroke());
          break;
        case "texte": {
          const pp = policePdf(op.gras ? d.polices.gras : d.polices.normal);
          page.node.setFontDictionary(PDFName.of(pp.nom), pp.ref);
          if (op.decoupe) ops.push(pushGraphicsState(), ...chemin(op.decoupe, 0), clip(), endPath());
          ops.push(beginText(), setFillingRgbColor(...couleur(op.couleur)), setFontAndSize(pp.nom, op.px * POINTS_PAR_UNITE));
          for (const ligne of op.lignes) {
            if (!ligne.texte) continue;
            ops.push(setTextMatrix(1, 0, 0, 1, X(ligne.x), Y(ligne.y)), showText(pp.coder(ligne.texte)));
          }
          ops.push(endText());
          if (op.decoupe) ops.push(popGraphicsState());
          break;
        }
        case "photo": {
          if (o.annule?.()) throw new ExportAnnule();
          const { largeur: lpx, hauteur: hpx } = pixelsPhoto(op.cible, op.source);
          const photo = await preparer(op.id, op.source, lpx, hpx);
          if (!photo) break;
          const image = await doc.embedJpg(photo.jpeg);
          const nom = page.node.newXObject("Im", image.ref);
          ops.push(pushGraphicsState(), ...chemin(op.cible, op.rayon), clip(), endPath(),
            concatTransformationMatrix(op.cible.w * POINTS_PAR_UNITE, 0, 0, op.cible.h * POINTS_PAR_UNITE, X(op.cible.x), Y(op.cible.y + op.cible.h)),
            drawObject(nom), popGraphicsState());
          break;
        }
        case "decoupe":
          ops.push(...chemin(op.r, 0), clip(), endPath());
          break;
        case "sauver":
          ops.push(pushGraphicsState());
          break;
        case "restaurer":
          ops.push(popGraphicsState());
          break;
      }
    }
    page.pushOperators(...ops);
    o.avancement?.(index + 1, total);
  }
  let n = 0;
  for (const pp of polices.values()) pp.incorporer(doc, `CALP${String.fromCharCode(65 + Math.floor(n / 26), 65 + (n++ % 26))}`);
  return doc.save({ useObjectStreams: true });
}
