/**
 * Anniversaires et événements, et leur import et export au format CSV : clean_event, events_on, _csv_rows,
 * export_events_csv et import_events_csv de calendrier.py. Le format CSV est le même que celui de la version
 * Windows : un fichier passe d'une version à l'autre.
 */
import { dateValide, estBissextile, type Jour } from "./dates";
import { chainePython, comparerCles, entierPython, ErreurDonnee, lignesPython, stripPython } from "./python";

/**
 * birthday : chaque année, âge affiché si l'année de naissance est connue ; yearly : chaque année ;
 * once : une seule fois, à la date exacte. Les noms des champs sont ceux des projets de la version Windows.
 */
export type TypeEvenement = "birthday" | "yearly" | "once";

export interface Evenement {
  day: number;
  month: number;
  year: number | null;
  text: string;
  kind: TypeEvenement;
}

export const TYPES_EVENEMENTS: [TypeEvenement, string][] = [["birthday", "Anniversaire"], ["yearly", "Chaque année"], ["once", "Une seule fois"]];
export const LIBELLES_TYPES: Record<TypeEvenement, string> = { birthday: "Anniversaire", yearly: "Chaque année", once: "Une seule fois" };
/** Rose pour les anniversaires, vert pour les autres événements. */
export const COULEURS_EVENEMENTS: Record<TypeEvenement, string> = { birthday: "#db2777", yearly: "#0f766e", once: "#0f766e" };

const estType = (k: unknown): k is TypeEvenement => k === "birthday" || k === "yearly" || k === "once";

/** Événement valide (date existante, texte non vide) à partir de données lues, ou null. */
export function nettoyerEvenement(data: unknown): Evenement | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  try {
    if (!Object.hasOwn(d, "day") || !Object.hasOwn(d, "month")) return null;
    const day = entierPython(d.day);
    const month = entierPython(d.month);
    const brut = d.year;
    const year = brut === undefined || brut === null || brut === "" ? null : entierPython(brut);
    const text = stripPython(chainePython(Object.hasOwn(d, "text") ? d.text : ""));
    // Un type illisible (liste, objet) fait échouer la lecture, comme en Python (TypeError).
    if (typeof d.kind === "object" && d.kind !== null) return null;
    const kind: TypeEvenement = estType(d.kind) ? d.kind : year ? "once" : "yearly";
    if (kind === "once" && year === null) return null;
    // 2000 : année bissextile, le 29 février est accepté sans année.
    if (!dateValide(year || 2000, month, day)) return null;
    if (!text) return null;
    return { day, month, year, text, kind };
  } catch (e) {
    if (e instanceof ErreurDonnee) return null;
    throw e;
  }
}

/** « 05/03 » ou « 05/03/2019 ». */
export function texteDate(ev: Evenement): string {
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${deux(ev.day)}/${deux(ev.month)}${ev.year ? `/${ev.year}` : ""}`;
}

/**
 * Textes à afficher un jour donné : [texte, type]. Un anniversaire du 29 février est fêté le 28 les années non
 * bissextiles ; l'âge n'est affiché que si l'année de naissance est connue (et rien n'est affiché avant la naissance).
 */
export function evenementsDuJour(evenements: Evenement[], date: Jour): [string, TypeEvenement][] {
  const affiches: [string, TypeEvenement][] = [];
  const bissextile = estBissextile(date.a);
  for (const ev of evenements) {
    let { day } = ev;
    const { month, year, kind } = ev;
    if (kind === "once") {
      if (year !== date.a || month !== date.m || day !== date.j) continue;
      affiches.push([ev.text, kind]);
      continue;
    }
    if (month === 2 && day === 29 && !bissextile) day = 28;
    if (month !== date.m || day !== date.j || (year && date.a < year)) continue;
    let texte = ev.text;
    if (kind === "birthday" && year && date.a > year) {
      const age = date.a - year;
      texte += ` (${age} an${age > 1 ? "s" : ""})`;
    }
    affiches.push([texte, kind]);
  }
  return affiches;
}

/** Deux événements identiques (même date, même texte, même type). */
export const memeEvenement = (a: Evenement, b: Evenement) =>
  a.day === b.day && a.month === b.month && a.year === b.year && a.text === b.text && a.kind === b.kind;

/* --- CSV ------------------------------------------------------------------------------------------------------ */

function champCsv(valeur: string): string {
  return /[;"\n]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;
}

/** Lignes d'un fichier CSV (séparateur « ; », « , » ou tabulation, guillemets gérés). */
export function lignesCsv(texte: string): string[][] {
  const lignes = lignesPython(texte).filter((l) => stripPython(l));
  if (!lignes.length) return [];
  const compte = (c: string) => lignes[0].split(c).length - 1;
  let separateur = ";";
  for (const c of [",", "\t"]) if (compte(c) > compte(separateur)) separateur = c;
  return lignes.map((ligne) => {
    const champs: string[] = [];
    let champ = "";
    let guillemets = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (guillemets) {
        if (c === '"' && ligne[i + 1] === '"') {
          champ += '"';
          i++;
        } else if (c === '"') guillemets = false;
        else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === separateur) {
        champs.push(champ);
        champ = "";
      } else champ += c;
    }
    champs.push(champ);
    return champs.map(stripPython);
  });
}

/**
 * Fichier CSV lisible par Excel : « Date;Type;Description », encodé en UTF-8 avec BOM (accents corrects dans Excel)
 * et fins de ligne Windows, octet pour octet comme la version Windows.
 */
export function exporterCsv(evenements: Evenement[]): Uint8Array {
  const tries = [...evenements].sort((a, b) => comparerCles([a.month, a.day, a.text], [b.month, b.day, b.text]));
  const lignes = ["Date;Type;Description", ...tries.map((ev) => [texteDate(ev), LIBELLES_TYPES[ev.kind], ev.text].map(champCsv).join(";"))];
  const texte = (lignes.join("\n") + "\n").replace(/\n/g, "\r\n");
  const corps = new TextEncoder().encode(texte);
  const octets = new Uint8Array(corps.length + 3);
  octets.set([0xef, 0xbb, 0xbf]);
  octets.set(corps, 3);
  return octets;
}

/** Lit un fichier CSV d'événements : événements valides et nombre de lignes ignorées. Erreur si le texte n'est pas en UTF-8. */
export function importerCsv(octets: Uint8Array): { evenements: Evenement[]; ignorees: number } {
  const texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  let lignes = lignesCsv(texte);
  if (lignes.length && lignes[0].length && lignes[0][0].toLowerCase().startsWith("date")) lignes = lignes.slice(1);
  const evenements: Evenement[] = [];
  let ignorees = 0;
  for (const ligne of lignes) {
    if (ligne.length < 2) {
      ignorees++;
      continue;
    }
    const texteDate = ligne[0];
    const texteType = ligne.length >= 3 ? ligne[1] : "";
    const texteEv = ligne.length >= 3 ? ligne[2] : ligne[1];
    const parties = texteDate.split(/[/.-]/);
    const t = texteType.toLowerCase();
    const kind = t.startsWith("anniv") ? "birthday" : t.startsWith("chaque") || t.startsWith("annuel") ? "yearly" : t.startsWith("une") || t.startsWith("unique") ? "once" : null;
    let ev: Evenement | null = null;
    if (parties.length === 2 || parties.length === 3) {
      ev = nettoyerEvenement({ day: parties[0], month: parties[1], year: parties.length === 3 ? parties[2] : null, text: texteEv, kind });
    }
    if (ev === null) ignorees++;
    else evenements.push(ev);
  }
  return { evenements, ignorees };
}

/** Tri de la liste de la fenêtre des événements : mois, jour, texte sans majuscules. */
export function trierEvenements(evenements: Evenement[]): Evenement[] {
  return evenements.sort((a, b) => comparerCles([a.month, a.day, a.text.toLowerCase()], [b.month, b.day, b.text.toLowerCase()]));
}
