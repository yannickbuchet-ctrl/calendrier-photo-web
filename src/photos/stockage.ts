/**
 * Sauvegarde automatique dans le navigateur (IndexedDB) : le projet en cours et ses photos restent sur cet appareil,
 * dans l'espace de stockage du site. Rien n'est envoyé ailleurs. Effacer les données de cet appareil supprime tout.
 */
import type { SourceDate } from "../logique/exif";

const BASE = "calendrier-photo-web";
const VERSION = 1;

/** Une photo gardée sur l'appareil : l'original tel qu'il a été choisi, une réduction et ses informations. */
export interface PhotoStockee {
  id: string;
  nom: string;
  type: string;
  taille: number;
  /** Date du fichier (millisecondes). */
  modifie: number;
  original: Blob;
  /** Réduction JPEG (512 pixels au plus) pour un affichage rapide au lancement. */
  vignette: Blob | null;
  /** Dimensions de la photo remise droite, orientation EXIF. */
  largeur: number;
  hauteur: number;
  orientation: number;
  date: string;
  source: SourceDate;
}

export interface SauvegardeProjet {
  /** Données du projet (format des projets Windows, photos désignées par leur identifiant). */
  projet: unknown;
  /** Nom du fichier de projet ouvert ou enregistré, s'il y en a un. */
  nomFichier: string | null;
  /** État au dernier enregistrement du fichier de projet (pour savoir s'il reste des changements). */
  etatEnregistre: string | null;
  enregistreLe: string;
}

let base: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  base ??= new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("projet")) db.createObjectStore("projet");
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => {
        r.result.close();
        base = null;
      };
      ok(r.result);
    };
    r.onerror = () => {
      base = null;
      ko(r.error ?? new Error("Stockage du navigateur indisponible."));
    };
    r.onblocked = () => ko(new Error("Stockage du navigateur bloqué par un autre onglet."));
  });
  return base;
}

function attendre<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function transaction<T>(magasin: string, mode: IDBTransactionMode, action: (m: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(magasin, mode);
    const r = action(t.objectStore(magasin));
    let resultat: T | undefined;
    if (r) r.onsuccess = () => (resultat = r.result);
    t.oncomplete = () => ok(resultat);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error ?? new Error("Écriture interrompue (espace de stockage plein ?)."));
  });
}

export const ecrirePhoto = (p: PhotoStockee) => transaction("photos", "readwrite", (m) => m.put(p));
export const lirePhoto = (id: string) => transaction<PhotoStockee>("photos", "readonly", (m) => m.get(id) as IDBRequest<PhotoStockee>);
export const supprimerPhoto = (id: string) => transaction("photos", "readwrite", (m) => m.delete(id));

export async function idsDesPhotos(): Promise<string[]> {
  return ((await transaction("photos", "readonly", (m) => m.getAllKeys())) ?? []).map(String);
}

/** Ajoute la vignette d'une photo déjà gardée. */
export async function ecrireVignette(id: string, vignette: Blob) {
  const db = await ouvrir();
  const t = db.transaction("photos", "readwrite");
  const m = t.objectStore("photos");
  const p = (await attendre(m.get(id))) as PhotoStockee | undefined;
  if (p) m.put({ ...p, vignette });
  await new Promise<void>((ok, ko) => {
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error);
  });
}

export const ecrireSauvegarde = (s: SauvegardeProjet) => transaction("projet", "readwrite", (m) => m.put(s, "courant"));
export const lireSauvegarde = () => transaction<SauvegardeProjet>("projet", "readonly", (m) => m.get("courant") as IDBRequest<SauvegardeProjet>);

/** Efface tout ce que le site a gardé sur cet appareil (projet et photos). */
export async function effacerTout(): Promise<void> {
  if (base) {
    (await base).close();
    base = null;
  }
  await new Promise<void>((ok, ko) => {
    const r = indexedDB.deleteDatabase(BASE);
    r.onsuccess = () => ok();
    r.onerror = () => ko(r.error);
    r.onblocked = () => ok();
  });
}

/** Place occupée et place disponible pour le site sur cet appareil (octets), si le navigateur le dit. */
export async function placeOccupee(): Promise<{ utilise: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { utilise: e.usage ?? 0, quota: e.quota ?? 0 };
}
