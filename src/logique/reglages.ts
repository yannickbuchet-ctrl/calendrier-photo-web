/** Réglages du calendrier (classe Settings de calendrier.py), au même format de fichier que la version Windows. */
import { nomCouleur } from "./couleurs";
import { FORMATS } from "./disposition";
import { nettoyerEvenement, type Evenement } from "./evenements";
import { boolPython, chainePython, entierPython, ErreurDonnee } from "./python";
import { CHOIX_ZONES } from "./vacances";

/** Styles de police : libellé, et police libre (OFL) qui remplace celle de Windows (Segoe UI, Georgia, Segoe Script). */
export const STYLES_POLICE = [
  { libelle: "Moderne", famille: "Open Sans", windows: "Segoe UI" },
  { libelle: "Élégant", famille: "Gelasio", windows: "Georgia" },
  { libelle: "Manuscrit", famille: "Kalam", windows: "Segoe Script" },
] as const;

export const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export interface Reglages {
  title: string;
  year: number;
  format: number;
  font: number;
  accent: string;
  cover: boolean;
  holidays: boolean;
  weekends: boolean;
  /** Photos toujours entières (rien n'est coupé), sauf celles recadrées une à une ; toujours vrai, comme sous Windows. */
  whole_photos: boolean;
  /** Vacances scolaires affichées : "", "A", "B", "C" ou "ABC". */
  school_zone: string;
  week_numbers: boolean;
  events: Evenement[];
  show_events: boolean;
}

/** Année proposée : l'année prochaine à partir de septembre. */
export function anneeParDefaut(aujourdhui = new Date()): number {
  return aujourdhui.getMonth() + 1 >= 9 ? aujourdhui.getFullYear() + 1 : aujourdhui.getFullYear();
}

export function reglagesParDefaut(aujourdhui = new Date()): Reglages {
  return {
    title: "Mon calendrier", year: anneeParDefaut(aujourdhui), format: 0, font: 0, accent: "#2563eb", cover: true, holidays: true,
    weekends: true, whole_photos: true, school_zone: "", week_numbers: false, events: [], show_events: true,
  };
}

/** Réglages au format du fichier de projet (to_dict). */
export function reglagesVersDict(r: Reglages) {
  return {
    title: r.title, year: r.year, format: r.format, font: r.font, accent: r.accent, cover: r.cover, holidays: r.holidays, weekends: r.weekends,
    whole_photos: r.whole_photos, school_zone: r.school_zone, week_numbers: r.week_numbers, events: r.events.map((e) => ({ ...e })), show_events: r.show_events,
  };
}

/** Réglages lus dans un fichier de projet (load_dict) ; erreur si une valeur est illisible. */
export function reglagesDepuisDict(data: unknown, base = reglagesParDefaut()): Reglages {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new ErreurDonnee("réglages illisibles");
  const d = data as Record<string, unknown>;
  const valeur = <T>(cle: string, defaut: T): unknown => (Object.hasOwn(d, cle) ? d[cle] : defaut);
  const r = { ...base, events: [...base.events] };
  r.title = chainePython(valeur("title", r.title));
  r.year = entierPython(valeur("year", r.year));
  r.format = entierPython(valeur("format", r.format));
  r.font = entierPython(valeur("font", r.font));
  if (r.year < 1 || r.year > 9998) throw new ErreurDonnee(`année invalide : ${r.year}`);
  if (r.format < 0 || r.format >= FORMATS.length) throw new ErreurDonnee(`format de page inconnu : ${r.format}`);
  if (r.font < 0 || r.font >= STYLES_POLICE.length) throw new ErreurDonnee(`police inconnue : ${r.font}`);
  r.accent = nomCouleur(valeur("accent", r.accent));
  r.cover = boolPython(valeur("cover", r.cover));
  r.holidays = boolPython(valeur("holidays", r.holidays));
  r.weekends = boolPython(valeur("weekends", r.weekends));
  const zone = valeur("school_zone", r.school_zone);
  r.school_zone = typeof zone === "string" && CHOIX_ZONES.some(([, z]) => z === zone) ? zone : "";
  r.week_numbers = boolPython(valeur("week_numbers", r.week_numbers));
  const evenements = valeur("events", []);
  r.events = (Array.isArray(evenements) ? evenements : []).map(nettoyerEvenement).filter((e): e is Evenement => e !== null);
  r.show_events = boolPython(valeur("show_events", r.show_events));
  return r;
}

/** Pages du calendrier : la couverture (si elle est choisie) puis les 12 mois. */
export type Page = { type: "cover" } | { type: "month"; annee: number; mois: number };

export function pagesDu(r: Reglages): Page[] {
  const pages: Page[] = r.cover ? [{ type: "cover" }] : [];
  for (let mois = 1; mois <= 12; mois++) pages.push({ type: "month", annee: r.year, mois });
  return pages;
}

/** Clé d'une page dans les tables de photos : « cover » ou numéro du mois dans le calendrier (« 0 » à « 11 »). */
export function clePage(r: Reglages, index: number): string {
  if (r.cover) return index === 0 ? "cover" : String(index - 1);
  return String(index);
}

export function titrePage(r: Reglages, index: number): string {
  const page = pagesDu(r)[index];
  return page.type === "cover" ? "Couverture" : `${MOIS[page.mois - 1]} ${page.annee}`;
}
