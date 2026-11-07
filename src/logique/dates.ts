/**
 * Dates sans heure ni fuseau horaire, calculées comme le module datetime de Python (calendrier grégorien
 * proleptique) : aucune dépendance à l'horloge ou au fuseau de l'appareil.
 */
import { divmod } from "./python";

/** Une date : année, mois (1 à 12), jour (1 à 31). */
export interface Jour {
  a: number;
  m: number;
  j: number;
}

const JOURS_AVANT_MOIS = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const JOURS_PAR_MOIS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const estBissextile = (a: number) => a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0);

export function joursDansMois(a: number, m: number): number {
  return m === 2 && estBissextile(a) ? 29 : JOURS_PAR_MOIS[m];
}

/** Vrai si la date existe (comme datetime.date(a, m, j) sans erreur). */
export function dateValide(a: number, m: number, j: number): boolean {
  return [a, m, j].every(Number.isInteger) && a >= 1 && a <= 9999 && m >= 1 && m <= 12 && j >= 1 && j <= joursDansMois(a, m);
}

const deux = (n: number) => String(n).padStart(2, "0");

/** « 2027-03-15 » : clé des tables de jours fériés et de vacances. */
export const iso = (a: number, m: number, j: number) => `${String(a).padStart(4, "0")}-${deux(m)}-${deux(j)}`;
export const isoDe = (d: Jour) => iso(d.a, d.m, d.j);

export function depuisIso(t: string): Jour {
  const [a, m, j] = t.split("-").map(Number);
  return { a, m, j };
}

/** Numéro du jour depuis le 1er janvier de l'an 1 (date.toordinal()). */
export function ordinal(a: number, m: number, j: number): number {
  const y = a - 1;
  return y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + JOURS_AVANT_MOIS[m] + (m > 2 && estBissextile(a) ? 1 : 0) + j;
}

/** Date d'un numéro de jour (date.fromordinal()). */
export function depuisOrdinal(n: number): Jour {
  let r: number;
  let n400: number, n100: number, n4: number, n1: number;
  [n400, r] = divmod(n - 1, 146097);
  let a = n400 * 400 + 1;
  [n100, r] = divmod(r, 36524);
  [n4, r] = divmod(r, 1461);
  [n1, r] = divmod(r, 365);
  a += n100 * 100 + n4 * 4 + n1;
  if (n1 === 4 || n100 === 4) return { a: a - 1, m: 12, j: 31 };
  const bissextile = n1 === 3 && (n4 !== 24 || n100 === 3);
  let m = (r + 50) >> 5;
  let avant = JOURS_AVANT_MOIS[m] + (m > 2 && bissextile ? 1 : 0);
  if (avant > r) {
    m -= 1;
    avant -= JOURS_PAR_MOIS[m] + (m === 2 && bissextile ? 1 : 0);
  }
  return { a, m, j: r - avant + 1 };
}

export function ajouterJours(d: Jour, n: number): Jour {
  return depuisOrdinal(ordinal(d.a, d.m, d.j) + n);
}

/** Jour de la semaine : 0 pour lundi, 6 pour dimanche (date.weekday()). */
export function jourSemaine(a: number, m: number, j: number): number {
  return (ordinal(a, m, j) + 6) % 7;
}

function lundiSemaine1(a: number): number {
  const premier = ordinal(a, 1, 1);
  const jour = (premier + 6) % 7;
  return premier - jour + (jour > 3 ? 7 : 0);
}

/** Numéro de semaine ISO 8601, la semaine commençant le lundi (date.isocalendar()[1]). */
export function semaineIso(a: number, m: number, j: number): number {
  const n = ordinal(a, m, j);
  let lundi = lundiSemaine1(a);
  let [semaine] = divmod(n - lundi, 7);
  if (semaine < 0) {
    lundi = lundiSemaine1(a - 1);
    [semaine] = divmod(n - lundi, 7);
  } else if (semaine >= 52 && n >= lundiSemaine1(a + 1)) {
    semaine = 0;
  }
  return semaine + 1;
}

/** Semaines d'un mois, du lundi au dimanche ; 0 pour les jours d'un autre mois (calendar.monthdayscalendar). */
export function semainesDuMois(a: number, m: number): number[][] {
  const jours: number[] = Array(jourSemaine(a, m, 1)).fill(0);
  for (let j = 1; j <= joursDansMois(a, m); j++) jours.push(j);
  while (jours.length % 7) jours.push(0);
  const semaines: number[][] = [];
  for (let i = 0; i < jours.length; i += 7) semaines.push(jours.slice(i, i + 7));
  return semaines;
}
