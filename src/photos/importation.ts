/**
 * Import des photos choisies : lecture du fichier (sur l'appareil, rien n'est envoyé), format et dimensions,
 * orientation, date de prise de vue, empreinte, puis copie dans le stockage du navigateur pour la sauvegarde
 * automatique.
 */
import { datePhoto } from "../logique/exif";
import { analyserImage, dimensionsOrientees } from "./analyse";
import type { Bibliotheque, PhotoMemoire } from "./bibliotheque";
import { comportementNavigateur, decoder, liberer } from "./decodage";
import { empreinte } from "./empreinte";
import { ecrirePhoto, lirePhoto } from "./stockage";

export interface ResultatImport {
  photos: PhotoMemoire[];
  /** Fichiers refusés : [nom, raison]. */
  refusees: [string, string][];
  /** Vrai si au moins une photo n'a pas pu être gardée sur l'appareil (stockage plein ou indisponible). */
  horsStockage: boolean;
}

export interface FichierAImporter {
  nom: string;
  modifie: number;
  donnees: Blob;
}

export const depuisFichier = (f: File): FichierAImporter => ({ nom: f.name, modifie: f.lastModified, donnees: f });

/** Importe des photos, une à la fois ; avancement(fait, total) est appelé après chacune. */
export async function importerPhotos(fichiers: FichierAImporter[], bibliotheque: Bibliotheque, avancement?: (fait: number, total: number) => void): Promise<ResultatImport> {
  const resultat: ResultatImport = { photos: [], refusees: [], horsStockage: false };
  for (const [k, f] of fichiers.entries()) {
    try {
      const p = await importerUne(f, bibliotheque);
      if ("raison" in p) resultat.refusees.push([f.nom, p.raison]);
      else {
        resultat.photos.push(p.photo);
        if (!p.stockee) resultat.horsStockage = true;
      }
    } catch (e) {
      resultat.refusees.push([f.nom, e instanceof Error ? e.message : String(e)]);
    }
    avancement?.(k + 1, fichiers.length);
  }
  return resultat;
}

async function importerUne(f: FichierAImporter, bibliotheque: Bibliotheque): Promise<{ photo: PhotoMemoire; stockee: boolean } | { raison: string }> {
  const octets = new Uint8Array(await f.donnees.arrayBuffer());
  const entete = analyserImage(octets);
  if (!entete) return { raison: "format d'image non reconnu" };
  const id = await empreinte(octets);
  const deja = bibliotheque.photos.get(id);
  if (deja) return { photo: deja, stockee: true };
  let { w, h } = dimensionsOrientees(entete);
  if (!w || !h || entete.type === "image/heic" || entete.type === "image/avif") {
    // Dimensions inconnues ou peu sûres : le navigateur décode la photo pour les connaître.
    try {
      const bitmap = await createImageBitmap(f.donnees, { imageOrientation: "from-image" });
      [w, h] = [bitmap.width, bitmap.height];
      bitmap.close();
    } catch {
      return { raison: entete.type === "image/heic" ? "photo HEIC : ce navigateur ne sait pas la lire (Safari le sait)" : "photo illisible par ce navigateur" };
    }
  }
  const { date, source } = datePhoto(f.nom, octets, f.modifie);
  const photo: PhotoMemoire = {
    id, nom: f.nom, type: entete.type, taille: f.donnees.size, modifie: f.modifie, original: f.donnees, vignette: null,
    largeur: w, hauteur: h, orientation: entete.orientation, date, source,
  };
  // Le navigateur sait-il décoder ce format ? (WebP ou BMP sur un vieux navigateur, par exemple.)
  if (entete.type !== "image/jpeg" && entete.type !== "image/png") {
    await comportementNavigateur();
    try {
      liberer(await decoder(f.donnees, photo, 8, 8));
    } catch {
      return { raison: "photo illisible par ce navigateur" };
    }
  }
  let stockee = false;
  try {
    await ecrirePhoto(photo);
    // L'original gardé par le navigateur remplace le fichier choisi, qui pourrait être déplacé ou supprimé.
    const relue = await lirePhoto(id);
    if (relue) photo.original = relue.original;
    stockee = true;
  } catch (e) {
    console.warn("Photo non gardée sur l'appareil", e);
  }
  bibliotheque.ajouter(photo);
  return { photo, stockee };
}
