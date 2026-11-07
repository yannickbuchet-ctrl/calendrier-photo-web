/**
 * Fichier de projet « .calendrier » : une archive ZIP qui contient le projet (projet.calendrier.json, au format des
 * projets de la version Windows) et les photos (dossier photos/). Une fois l'archive décompressée, le fichier JSON
 * s'ouvre aussi dans la version Windows (« Importer un projet »), qui retrouve les photos à côté de lui.
 */
import { donneesProjet, type Projet } from "../logique/projet";
import { creerZip, lireZip } from "./zip";

export const NOM_JSON = "projet.calendrier.json";
export const FORMAT = "Calendrier Photo Web";
export const VERSION_FORMAT = 1;

/** Une photo du projet, telle qu'elle est gardée sur l'appareil. */
export interface PhotoDuProjet {
  id: string;
  nom: string;
  type: string;
  modifie: number;
  original: Blob;
}

/** Fichier d'une photo dans l'archive : son nom d'origine, rendu unique (« IMG_0001 (2).jpg »). */
function nomsUniques(photos: PhotoDuProjet[]): Map<string, string> {
  const pris = new Set<string>();
  const noms = new Map<string, string>();
  for (const p of photos) {
    const propre = p.nom.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "photo.jpg";
    const point = propre.lastIndexOf(".");
    const [base, extension] = point > 0 ? [propre.slice(0, point), propre.slice(point)] : [propre, ""];
    let nom = propre;
    for (let n = 2; pris.has(nom.toLowerCase()); n++) nom = `${base} (${n})${extension}`;
    pris.add(nom.toLowerCase());
    noms.set(p.id, `photos/${nom}`);
  }
  return noms;
}

/** L'archive du projet. */
export async function ecrireProjet(projet: Projet, photo: (id: string) => PhotoDuProjet | undefined, application: string): Promise<Blob> {
  const utilisees = [...new Set(Object.values(projet.photos).flat().filter((id): id is string => !!id))]
    .map((id) => photo(id))
    .filter((p): p is PhotoDuProjet => !!p);
  const chemins = nomsUniques(utilisees);
  const donnees = donneesProjet(projet);
  const photos = Object.fromEntries(Object.entries(donnees.photos).map(([cle, ids]) => [cle, ids.map((id) => (id ? chemins.get(id) ?? null : null))]));
  const json = {
    format: FORMAT,
    version: VERSION_FORMAT,
    application,
    settings: donnees.settings,
    photos,
    // Chemins relatifs au fichier JSON : la version Windows s'en sert pour retrouver les photos.
    photos_relative: photos,
    layouts: donnees.layouts,
    crops: donnees.crops,
    fichiers: Object.fromEntries(utilisees.map((p) => [chemins.get(p.id)!, { nom: p.nom, type: p.type, modifie: p.modifie }])),
  };
  return creerZip([
    { nom: NOM_JSON, donnees: new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }) },
    ...utilisees.map((p) => ({ nom: chemins.get(p.id)!, donnees: p.original, date: new Date(p.modifie) })),
  ]);
}

export interface FichierPhotoLu {
  nom: string;
  type: string;
  modifie: number;
  lire: () => Promise<Blob>;
}

/** Contenu d'une archive de projet : les données JSON, et les photos qu'elle contient (chemin → photo). */
export async function lireProjet(archive: Blob): Promise<{ donnees: Record<string, unknown>; photos: Map<string, FichierPhotoLu> }> {
  const fichiers = await lireZip(archive);
  const json = [...fichiers.keys()].find((n) => n === NOM_JSON) ?? [...fichiers.keys()].find((n) => /\.json$/i.test(n) && !n.includes("/"));
  if (!json) throw new Error("Le projet ne contient pas de fichier « projet.calendrier.json ».");
  const donnees = JSON.parse(await (await fichiers.get(json)!()).text());
  if (typeof donnees !== "object" || donnees === null || Array.isArray(donnees)) throw new Error("Projet illisible.");
  const infos = (typeof donnees.fichiers === "object" && donnees.fichiers) || {};
  // Noms abîmés par un autre logiciel de compression (accents) : comparaison sans les caractères non ASCII.
  const squelette = (n: string) => n.toLowerCase().replace(/[^\x20-\x7e]/g, "_");
  const parSquelette = new Map([...fichiers.keys()].map((n) => [squelette(n), n]));
  const photos = new Map<string, FichierPhotoLu>();
  const references = new Set<string>();
  for (const liste of Object.values((donnees.photos as Record<string, unknown>) ?? {})) {
    for (const ref of Array.isArray(liste) ? liste : [liste]) if (typeof ref === "string") references.add(ref);
  }
  for (const ref of references) {
    const chemin = fichiers.has(ref) ? ref : parSquelette.get(squelette(ref));
    if (!chemin) continue;
    const info = (infos as Record<string, { nom?: unknown; type?: unknown; modifie?: unknown }>)[ref] ?? {};
    photos.set(ref, {
      nom: typeof info.nom === "string" ? info.nom : (ref.split("/").pop() ?? ref),
      type: typeof info.type === "string" ? info.type : "",
      modifie: typeof info.modifie === "number" ? info.modifie : Date.now(),
      lire: fichiers.get(chemin)!,
    });
  }
  return { donnees, photos };
}

/** Nom d'un fichier désigné par un chemin Windows ou Unix (projets de la version Windows). */
export function nomDeFichier(chemin: string): string {
  return chemin.split(/[\\/]/).pop() ?? chemin;
}
