/**
 * Photos modèles : 36 paysages dessinés (aucune photo réelle), trois par mois aux couleurs de la saison, en portrait
 * et en paysage — les mêmes que le dossier exemples/ de la version Windows (make_exemples.py). La date est dans le
 * nom du fichier : « Remplir automatiquement » les range mois par mois.
 */
import type { FichierAImporter } from "../photos/importation";

const SAISONS = ["hiver", "hiver", "printemps", "printemps", "ete", "ete", "canicule", "canicule", "automne", "automne", "automne", "hiver"];
const ORIENTATIONS = [["paysage", "portrait", "paysage"], ["portrait", "paysage", "paysage"]];

export const NOMS_EXEMPLES = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((mois) =>
  ORIENTATIONS[mois % 2].map((orientation, k) => `2027-${String(mois).padStart(2, "0")}-${String(5 + 10 * k).padStart(2, "0")}-${SAISONS[mois - 1]}-${orientation}.jpg`),
);

/** Télécharge les photos modèles depuis le site lui-même. */
export async function photosModeles(avancement: (fait: number, total: number) => void): Promise<FichierAImporter[]> {
  const fichiers: FichierAImporter[] = [];
  for (const [k, nom] of NOMS_EXEMPLES.entries()) {
    const r = await fetch(`./exemples/${nom}`);
    if (!r.ok) throw new Error(`Photo modèle introuvable : ${nom}`);
    fichiers.push({ nom, modifie: Date.now(), donnees: await r.blob() });
    avancement(k + 1, NOMS_EXEMPLES.length);
  }
  return fichiers;
}
