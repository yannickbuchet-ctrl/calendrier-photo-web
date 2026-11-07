/**
 * Impression (print_pages de la version Windows) : chaque page est dessinée en image à 200 ppp (150 sur un appareil
 * qui a peu de mémoire), avec les photos découpées à leur taille, puis le navigateur l'imprime à 100 %, sans marges.
 * Les cadres vides ne sont pas imprimés. Pour la meilleure qualité (texte vectoriel, photos à 300 ppp), imprimez le
 * PDF exporté.
 */
import { dimensionsMm } from "../logique/disposition";
import { pagesDu } from "../logique/reglages";
import type { PhotoMemoire } from "../photos/bibliotheque";
import { contexte, creerCanevas, decoder, liberer, versJpeg, type Canevas } from "../photos/decodage";
import { dessinerSurCanevas } from "../rendu/canevas";
import { dessinerPage, type DonneesRendu } from "../rendu/page";
import { pixelsPhoto } from "../rendu/pixels";
import { el, estTelephone } from "./dom";

/** Résolution des images imprimées. */
export function pppImpression(): number {
  const memoire = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return estTelephone() || (memoire !== undefined && memoire <= 4) ? 150 : 200;
}

export async function preparerImpression(d: DonneesRendu, photos: (id: string) => PhotoMemoire | undefined, avancement: (fait: number, total: number) => void, annule: () => boolean): Promise<string[] | null> {
  const ppp = pppImpression();
  const k = ppp / 300;
  const total = pagesDu(d.reglages).length;
  const adresses: string[] = [];
  try {
    for (let i = 0; i < total; i++) {
      if (annule()) throw new Error("annulé");
      const page = dessinerPage({ ...d, masquerVides: true }, i);
      const decoupees = new Map<object, Canevas>();
      for (const op of page.ops) {
        if (op.type !== "photo") continue;
        const p = photos(op.id);
        if (!p) continue;
        const cible = { ...op.cible, w: op.cible.w * k, h: op.cible.h * k };
        const { largeur, hauteur } = pixelsPhoto(cible, op.source);
        try {
          decoupees.set(op, await decoder(p.original, p, largeur, hauteur, op.source));
        } catch (e) {
          console.warn(`Photo illisible : ${p.nom}`, e);
        }
      }
      const canevas = creerCanevas(Math.round(page.w * k), Math.round(page.h * k));
      dessinerSurCanevas(contexte(canevas), page, { echelle: k, image: () => null, dimensions: d.dimensions, polices: d.polices, decoupee: (op) => decoupees.get(op) ?? null });
      for (const c of decoupees.values()) liberer(c);
      const jpeg = await versJpeg(canevas, 0.92);
      liberer(canevas);
      adresses.push(URL.createObjectURL(jpeg));
      avancement(i + 1, total);
    }
    return adresses;
  } catch (e) {
    for (const a of adresses) URL.revokeObjectURL(a);
    if (annule()) return null;
    throw e;
  }
}

/** Ouvre la fenêtre d'impression du navigateur avec les pages préparées, puis libère la mémoire. */
export async function lancerImpression(adresses: string[], format: number) {
  const { largeur, hauteur } = dimensionsMm(format);
  const style = el("style", { text: `@page { size: ${largeur}mm ${hauteur}mm; margin: 0; } #impression img { width: ${largeur}mm; height: ${hauteur}mm; }` });
  const conteneur = el("div", { id: "impression", "aria-hidden": "true" }, ...adresses.map((src, i) => el("img", { src, alt: `Page ${i + 1}` })));
  document.head.append(style);
  document.body.append(conteneur);
  await Promise.all([...conteneur.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  const nettoyer = () => {
    style.remove();
    conteneur.remove();
    for (const a of adresses) URL.revokeObjectURL(a);
  };
  window.addEventListener("afterprint", nettoyer, { once: true });
  window.print();
  // Certains navigateurs n'envoient pas « afterprint » : nettoyage de secours.
  setTimeout(() => {
    if (conteneur.isConnected) nettoyer();
  }, 120000);
}
