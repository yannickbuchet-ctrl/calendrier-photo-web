/** Vacances scolaires de France métropolitaine, zones A, B et C (SCHOOL_HOLIDAYS de calendrier.py). */
import { ajouterJours, depuisIso, isoDe } from "./dates";

/**
 * Dates officielles du ministère de l'Éducation nationale (jeu de données « fr-en-calendrier-scolaire »,
 * data.education.gouv.fr, extrait le 21 octobre 2026 pour la version Windows), calendrier des élèves :
 * [premier jour de vacances, jour de la reprise des cours, zones, nom]. Les dates sont publiées jusqu'à l'été 2028 :
 * la rentrée 2028 n'étant pas connue, l'été 2028 est arrêté au 31 août.
 */
export const VACANCES_SCOLAIRES: [string, string, string, string][] = [
  ["2023-10-21", "2023-11-06", "ABC", "Toussaint"],
  ["2023-12-23", "2024-01-08", "ABC", "Noël"],
  ["2024-02-10", "2024-02-26", "C", "Hiver"],
  ["2024-02-17", "2024-03-04", "A", "Hiver"],
  ["2024-02-24", "2024-03-11", "B", "Hiver"],
  ["2024-04-06", "2024-04-22", "C", "Printemps"],
  ["2024-04-13", "2024-04-29", "A", "Printemps"],
  ["2024-04-20", "2024-05-06", "B", "Printemps"],
  ["2024-05-09", "2024-05-13", "ABC", "Pont de l'Ascension"],
  ["2024-07-06", "2024-09-02", "ABC", "Été"],
  ["2024-10-19", "2024-11-04", "ABC", "Toussaint"],
  ["2024-12-21", "2025-01-06", "ABC", "Noël"],
  ["2025-02-08", "2025-02-24", "B", "Hiver"],
  ["2025-02-15", "2025-03-03", "C", "Hiver"],
  ["2025-02-22", "2025-03-10", "A", "Hiver"],
  ["2025-04-05", "2025-04-22", "B", "Printemps"],
  ["2025-04-12", "2025-04-28", "C", "Printemps"],
  ["2025-04-19", "2025-05-05", "A", "Printemps"],
  ["2025-05-29", "2025-06-02", "ABC", "Pont de l'Ascension"],
  ["2025-07-05", "2025-09-01", "ABC", "Été"],
  ["2025-10-18", "2025-11-03", "ABC", "Toussaint"],
  ["2025-12-20", "2026-01-05", "ABC", "Noël"],
  ["2026-02-07", "2026-02-23", "A", "Hiver"],
  ["2026-02-14", "2026-03-02", "B", "Hiver"],
  ["2026-02-21", "2026-03-09", "C", "Hiver"],
  ["2026-04-04", "2026-04-20", "A", "Printemps"],
  ["2026-04-11", "2026-04-27", "B", "Printemps"],
  ["2026-04-18", "2026-05-04", "C", "Printemps"],
  ["2026-05-14", "2026-05-18", "ABC", "Pont de l'Ascension"],
  ["2026-07-04", "2026-09-01", "ABC", "Été"],
  ["2026-10-17", "2026-11-02", "ABC", "Toussaint"],
  ["2026-12-19", "2027-01-04", "ABC", "Noël"],
  ["2027-02-06", "2027-02-22", "C", "Hiver"],
  ["2027-02-13", "2027-03-01", "A", "Hiver"],
  ["2027-02-20", "2027-03-08", "B", "Hiver"],
  ["2027-04-03", "2027-04-19", "C", "Printemps"],
  ["2027-04-10", "2027-04-26", "A", "Printemps"],
  ["2027-04-17", "2027-05-03", "B", "Printemps"],
  ["2027-05-07", "2027-05-08", "ABC", "Pont de l'Ascension"],
  ["2027-07-03", "2027-09-02", "ABC", "Été"],
  ["2027-10-23", "2027-11-08", "ABC", "Toussaint"],
  ["2027-12-18", "2028-01-03", "ABC", "Noël"],
  ["2028-02-05", "2028-02-21", "B", "Hiver"],
  ["2028-02-12", "2028-02-28", "C", "Hiver"],
  ["2028-02-19", "2028-03-06", "A", "Hiver"],
  ["2028-04-08", "2028-04-24", "B", "Printemps"],
  ["2028-04-15", "2028-05-02", "C", "Printemps"],
  ["2028-04-22", "2028-05-09", "A", "Printemps"],
  ["2028-05-25", "2028-05-29", "ABC", "Pont de l'Ascension"],
  ["2028-07-04", "2028-09-01", "ABC", "Été"],
];
export const DEBUT_DONNEES_SCOLAIRES = "2023-09-01";
/** Dates inconnues à partir de ce jour. */
export const FIN_DONNEES_SCOLAIRES = "2028-09-01";

/** Choix proposés : [libellé, zones affichées]. */
export const CHOIX_ZONES: [string, string][] = [["Aucune", ""], ["Zone A", "A"], ["Zone B", "B"], ["Zone C", "C"], ["Zones A, B et C", "ABC"]];
export const COULEURS_ZONES: Record<string, string> = { A: "#f59e0b", B: "#10b981", C: "#8b5cf6" };

/** Tous les jours de vacances connus : date → {zone → nom des vacances} (_school_days). */
function joursDeVacances(): Map<string, Record<string, string>> {
  const jours = new Map<string, Record<string, string>>();
  for (const [debut, fin, zones, nom] of VACANCES_SCOLAIRES) {
    let jour = depuisIso(debut);
    while (isoDe(jour) < fin) {
      const cle = isoDe(jour);
      const parZone = jours.get(cle) ?? {};
      for (const zone of zones) parZone[zone] = nom;
      jours.set(cle, parZone);
      jour = ajouterJours(jour, 1);
    }
  }
  return jours;
}

export const JOURS_VACANCES = joursDeVacances();
