/** Relecture d'un PDF exporté (tests et parcours) : pages, dimensions, images et leur place, texte, polices. */
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from "pdf-lib";

export interface ImageLue {
  largeurPx: number;
  hauteurPx: number;
  /** Rectangle sur la page, en points, origine en haut à gauche. */
  rect: [number, number, number, number];
  /** Résolution à l'impression (pixels par pouce). */
  ppp: number;
}

export interface PageLue {
  largeur: number;
  hauteur: number;
  images: ImageLue[];
  texte: string;
}

export async function lirePdf(octets: Uint8Array): Promise<{ pages: PageLue[]; titre: string | undefined; polices: string[] }> {
  const doc = await PDFDocument.load(octets, { updateMetadata: false });
  const pages: PageLue[] = [];
  const polices = new Set<string>();
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const contenus = page.node.Contents();
    const flux = contenus instanceof PDFArray ? contenus.asArray().map((r) => doc.context.lookup(r)) : [contenus];
    let texte = "";
    for (const f of flux) if (f instanceof PDFRawStream) texte += new TextDecoder("latin1").decode(decodePDFRawStream(f).decode()) + "\n";
    const ressources = page.node.Resources()!;
    const xobjets = ressources.lookupMaybe(PDFName.of("XObject"), PDFDict);
    const fontes = ressources.lookupMaybe(PDFName.of("Font"), PDFDict);
    for (const cle of fontes?.keys() ?? []) {
      const police = doc.context.lookup(fontes!.get(cle) as PDFRef, PDFDict);
      polices.add(police.get(PDFName.of("BaseFont"))!.toString());
    }
    const images: ImageLue[] = [];
    const motif = /(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm\s+\/(\S+) Do/g;
    for (const m of texte.matchAll(motif)) {
      const [w, h, x, y] = m.slice(1, 5).map(Number);
      const flux = doc.context.lookup(xobjets!.get(PDFName.of(m[5])) as PDFRef) as PDFRawStream;
      const largeurPx = (flux.dict.get(PDFName.of("Width")) as PDFNumber).asNumber();
      const hauteurPx = (flux.dict.get(PDFName.of("Height")) as PDFNumber).asNumber();
      images.push({ largeurPx, hauteurPx, rect: [x, height - y - h, w, h], ppp: largeurPx / (w / 72) });
    }
    pages.push({ largeur: width, hauteur: height, images, texte });
  }
  return { pages, titre: doc.getTitle(), polices: [...polices] };
}

/** Texte des pages, extrait par PDF.js (police intégrée et table ToUnicode). */
export async function texteDesPages(octets: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tache = pdfjs.getDocument({ data: octets.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await tache.promise;
  const textes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const contenu = await page.getTextContent();
    textes.push(contenu.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await tache.destroy();
  return textes;
}
