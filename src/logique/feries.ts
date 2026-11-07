/** Jours fériés de France métropolitaine (easter et french_holidays de calendrier.py). */
import { ajouterJours, iso, isoDe, type Jour } from "./dates";
import { divmod } from "./python";

/** Date de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher). */
export function paques(annee: number): Jour {
  const a = annee % 19;
  const [b, c] = divmod(annee, 100);
  const [d, e] = divmod(b, 4);
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = divmod(19 * a + b - d - g + 15, 30)[1];
  const [i, k] = divmod(c, 4);
  const l = divmod(32 + 2 * e + 2 * i - h - k, 7)[1];
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const [mois, jour] = divmod(h + l - 7 * m + 114, 31);
  return { a: annee, m: mois, j: jour + 1 };
}

/**
 * Jours fériés d'une année : date (« 2027-05-01 ») → nom, dans l'ordre de l'année. Si deux fêtes tombent le même
 * jour (Ascension un 1er mai), la seconde donne son nom, comme dans le dictionnaire de la version Windows.
 */
export function joursFeries(annee: number): Map<string, string> {
  const p = paques(annee);
  const feries = new Map<string, string>();
  const ajouter = (cle: string, nom: string) => feries.set(cle, nom);
  ajouter(iso(annee, 1, 1), "Jour de l'an");
  ajouter(isoDe(ajouterJours(p, 1)), "Lundi de Pâques");
  ajouter(iso(annee, 5, 1), "Fête du Travail");
  ajouter(iso(annee, 5, 8), "Victoire 1945");
  ajouter(isoDe(ajouterJours(p, 39)), "Ascension");
  ajouter(isoDe(ajouterJours(p, 50)), "Lundi de Pentecôte");
  ajouter(iso(annee, 7, 14), "Fête nationale");
  ajouter(iso(annee, 8, 15), "Assomption");
  ajouter(iso(annee, 11, 1), "Toussaint");
  ajouter(iso(annee, 11, 11), "Armistice");
  ajouter(iso(annee, 12, 25), "Noël");
  return feries;
}
