/**
 * État d'un projet : réglages, photos de chaque page, dispositions et recadrages (_project_data, _state et
 * _parse_project de calendrier.py). Dans le navigateur, une photo est désignée par son identifiant (empreinte de son
 * contenu) et non par un chemin.
 */
import { completer, type Recadrage } from "./disposition";
import { MAX_EMPLACEMENTS } from "./plan";
import { entierPython, ErreurDonnee } from "./python";
import { reglagesDepuisDict, reglagesParDefaut, reglagesVersDict, type Reglages } from "./reglages";

export interface Projet {
  reglages: Reglages;
  /** Clé de page (« cover », « 0 » à « 11 ») → 4 emplacements : identifiant de photo ou null. */
  photos: Record<string, (string | null)[]>;
  /** Clé de page → nombre de photos de la page (1 à 4). */
  layouts: Record<string, number>;
  /** Clé de page → 4 recadrages (ou null). */
  crops: Record<string, (Recadrage | null)[]>;
}

export function projetVide(aujourdhui = new Date()): Projet {
  return { reglages: reglagesParDefaut(aujourdhui), photos: {}, layouts: {}, crops: {} };
}

/** Copie indépendante d'un projet. */
export function copierProjet(p: Projet): Projet {
  return analyserProjet(donneesProjet(p));
}

/** Données du projet, au format du fichier de la version Windows (les photos y sont des identifiants). */
export function donneesProjet(p: Projet) {
  return {
    settings: reglagesVersDict(p.reglages),
    photos: Object.fromEntries(Object.entries(p.photos).map(([k, v]) => [k, [...v]])),
    layouts: { ...p.layouts },
    crops: Object.fromEntries(Object.entries(p.crops).map(([k, v]) => [k, v.map((c) => (c ? { ...c } : null))])),
  };
}

/** JSON aux clés triées (json.dumps(…, sort_keys=True)) : sert à comparer deux états (annuler, modifié ?). */
export function jsonTrie(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonTrie).join(", ")}]`;
  if (v && typeof v === "object") {
    const cles = Object.keys(v as object).sort();
    return `{${cles.map((k) => `${JSON.stringify(k)}: ${jsonTrie((v as Record<string, unknown>)[k])}`).join(", ")}}`;
  }
  return JSON.stringify(v ?? null);
}

export const etatProjet = (p: Projet) => jsonTrie(donneesProjet(p));

/** Vrai si seul le titre diffère entre deux états (frappe en cours dans le champ Titre). */
export function seulLeTitreChange(avant: string, apres: string): boolean {
  const a = JSON.parse(avant);
  const b = JSON.parse(apres);
  delete a.settings.title;
  delete b.settings.title;
  return jsonTrie(a) === jsonTrie(b);
}

/** Clé de page lue dans un fichier : « cover », ou un numéro de mois (« 3 », « 03 » → « 3 »). */
function cleLue(cle: string): string {
  if (cle === "cover") return cle;
  const n = entierPython(cle);
  if (n < 0 || n > 11) throw new ErreurDonnee(`page inconnue : ${cle}`);
  return String(n);
}

function recadrageLu(v: unknown): Recadrage | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const r: Recadrage = {};
  if (d.whole) r.whole = true;
  for (const cle of ["zoom", "x", "y"] as const) if (typeof d[cle] === "number" && Number.isFinite(d[cle])) r[cle] = d[cle] as number;
  return r;
}

/**
 * Réglages, photos, dispositions et recadrages d'un projet lu (fichier ou historique d'annulation). Les photos d'une
 * page peuvent être un seul texte (anciens projets Windows) ou une liste ; trouverPhoto convertit chaque référence
 * (identifiant, chemin d'une archive, chemin Windows) en identifiant, ou null si la photo manque.
 */
export function analyserProjet(data: unknown, trouverPhoto: (ref: string, cle: string, emplacement: number) => string | null = (r) => r): Projet {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new ErreurDonnee("projet illisible");
  const d = data as Record<string, unknown>;
  const objet = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const reglages = reglagesDepuisDict(objet(d.settings), reglagesParDefaut());
  const photos: Projet["photos"] = {};
  for (const [cle, valeur] of Object.entries(objet(d.photos))) {
    const liste = completer<unknown>(typeof valeur === "string" ? [valeur] : Array.isArray(valeur) ? valeur : []);
    const c = cleLue(cle);
    const ids = liste.map((ref, emplacement) => (typeof ref === "string" && ref ? trouverPhoto(ref, c, emplacement) : null));
    if (ids.some((id) => id)) photos[c] = ids;
  }
  const layouts: Projet["layouts"] = {};
  for (const [cle, valeur] of Object.entries(objet(d.layouts))) layouts[cleLue(cle)] = Math.min(MAX_EMPLACEMENTS, Math.max(1, entierPython(valeur)));
  const crops: Projet["crops"] = {};
  for (const [cle, valeur] of Object.entries(objet(d.crops))) {
    const liste = completer<unknown>(Array.isArray(valeur) ? valeur : []).map(recadrageLu);
    if (liste.some((r) => r)) crops[cleLue(cle)] = liste;
  }
  return { reglages, photos, layouts, crops };
}

/** Identifiants de toutes les photos utilisées par un projet. */
export function photosUtilisees(p: Projet): Set<string> {
  return new Set(Object.values(p.photos).flat().filter((id): id is string => !!id));
}
