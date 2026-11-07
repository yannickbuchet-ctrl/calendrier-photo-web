/**
 * Petites fonctions qui reproduisent le comportement de Python, pour que la logique reprise de calendrier.py
 * (application Windows) donne exactement les mêmes résultats : arrondi, int(), str(), bool(), strip(), splitlines()
 * et comparaison des chaînes.
 */

/** Erreur équivalente à ValueError ou TypeError de Python (donnée illisible). */
export class ErreurDonnee extends Error {}

/** round(x) de Python : au plus proche, les moitiés vers le nombre pair (round(2.5) = 2, round(3.5) = 4). */
export function arrondiPython(x: number): number {
  const bas = Math.floor(x);
  const reste = x - bas;
  if (reste > 0.5) return bas + 1;
  if (reste < 0.5) return bas;
  return bas % 2 === 0 ? bas : bas + 1;
}

/** divmod() de Python pour des entiers : quotient arrondi vers le bas, reste du signe du diviseur. */
export function divmod(a: number, b: number): [number, number] {
  const q = Math.floor(a / b);
  return [q, a - q * b];
}

/** Espaces reconnus par str.strip() et int() de Python (str.isspace()). */
const ESPACES = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const RE_BORDS = new RegExp(`^[${ESPACES}]+|[${ESPACES}]+$`, "g");

/** str.strip() de Python. */
export function stripPython(t: string): string {
  return t.replace(RE_BORDS, "");
}

/** int(valeur) de Python pour les valeurs lues dans un fichier : nombre, booléen ou texte (« 12 », « +3 », « 1_000 »). */
export function entierPython(v: unknown): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ErreurDonnee(`nombre invalide : ${v}`);
    return Math.trunc(v);
  }
  if (typeof v === "string") {
    const t = stripPython(v);
    if (!/^[+-]?[0-9]+(?:_[0-9]+)*$/.test(t)) throw new ErreurDonnee(`entier invalide : « ${v} »`);
    return Number.parseInt(t.replace(/_/g, ""), 10);
  }
  throw new ErreurDonnee(`entier attendu : ${String(v)}`);
}

/** str(valeur) de Python pour les valeurs d'un fichier JSON (None, True, False, nombres, textes). */
export function chainePython(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/** bool(valeur) de Python : faux pour None, False, 0, "", [] et {}. */
export function boolPython(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === "") return false;
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** str.splitlines() de Python (sans les fins de ligne). */
export function lignesPython(t: string): string[] {
  const lignes: string[] = [];
  let debut = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ("\n\r\v\f\x1c\x1d\x1e\x85  ".includes(c)) {
      lignes.push(t.slice(debut, i));
      if (c === "\r" && t[i + 1] === "\n") i++;
      debut = i + 1;
    }
  }
  if (debut < t.length) lignes.push(t.slice(debut));
  return lignes;
}

/** Comparaison de deux textes comme Python : par points de code (JavaScript compare des unités UTF-16). */
export function comparerTextes(a: string, b: string): number {
  if (a === b) return 0;
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done) return y.done ? 0 : -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

/** Compare deux clés de tri (listes de nombres et de textes), comme les tuples de Python. */
export function comparerCles(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    const c = typeof x === "number" && typeof y === "number" ? (x < y ? -1 : x > y ? 1 : 0) : comparerTextes(String(x), String(y));
    if (c) return c;
  }
  return a.length - b.length;
}
