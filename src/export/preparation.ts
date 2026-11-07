/** Préparation des photos pour le PDF : la partie visible, à 300 ppp au plus, en JPEG (utilisée dans le Worker ou ici). */
import { decoder, liberer, versJpeg, type MetaDecodage } from "../photos/decodage";
import type { PreparerPhoto } from "../rendu/pdf";
import { QUALITE_JPEG } from "../rendu/pixels";

export interface PhotoAExporter extends MetaDecodage {
  id: string;
  nom: string;
  original: Blob;
}

/** Fonction de préparation des photos ; erreur(nom) est appelé pour une photo illisible (son cadre reste vide). */
export function preparateur(photos: Map<string, PhotoAExporter>, erreur: (nom: string) => void): PreparerPhoto {
  return async (id, source, largeur, hauteur) => {
    const p = photos.get(id);
    if (!p) return null;
    let canevas = null;
    try {
      canevas = await decoder(p.original, p, largeur, hauteur, source);
      const jpeg = await versJpeg(canevas, QUALITE_JPEG);
      return { jpeg: new Uint8Array(await jpeg.arrayBuffer()), largeur, hauteur };
    } catch (e) {
      console.warn(`Photo illisible : ${p.nom}`, e);
      erreur(p.nom);
      return null;
    } finally {
      liberer(canevas);
    }
  };
}
