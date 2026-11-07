/** Ce que les vues (aperçu, vignettes des pages) demandent à l'application. */
import type { Bibliotheque } from "../photos/bibliotheque";
import type { DonneesRendu } from "../rendu/page";

export interface ContexteVues {
  bibliotheque: Bibliotheque;
  /** Page affichée dans l'aperçu. */
  readonly courant: number;
  /** Données de dessin (null tant que la police n'est pas chargée). */
  donnees(masquerVides?: boolean): DonneesRendu | null;
  nombrePages(): number;
  titrePage(index: number): string;
  titreEmplacement(index: number, emplacement: number): string;
  cle(index: number): string;
  selectionner(index: number): void;
  recadrer(index: number, emplacement: number): void;
  choisirPhoto(index: number, emplacement: number): void;
  deposer(index: number, emplacement: number, fichiers: File[]): void;
  definirDisposition(index: number, nombre: number): void;
  retirerPhotos(index: number): void;
  ouvrirDepuisEnsemble(index: number): void;
  message(texte: string, type?: "info" | "erreur" | "succes", duree?: number): void;
}

/** Fichiers d'image d'un glisser-déposer. */
export function imagesDeposees(e: DragEvent): File[] {
  return [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(f.name));
}
