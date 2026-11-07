/**
 * Remplissage automatique : répartition des photos sur les mois (plan_months, _group_cost, _assign_slots et
 * single_portrait_layout de calendrier.py). Les calculs suivent exactement l'ordre de ceux de Python, pour que les
 * mêmes photos donnent les mêmes pages.
 */
import type { SourceDate } from "./exif";
import { arrondiPython } from "./python";

export const MAX_EMPLACEMENTS = 4;

/** Coûts de la répartition automatique (plus c'est bas, mieux c'est). */
export const COUT_ECART_FORMAT = 1.0; // photo dans un cadre de l'autre format (portrait dans un cadre en largeur…)
export const COUT_TAILLE = 0.2; // × (nombre de photos de la page)² : préfère des pages équilibrées
export const COUT_MOIS_VIDE = 3.0; // mois laissé sans photo

/** Une photo à placer : identifiant, date-heure (voir exif.ts) et provenance de la date, format. */
export interface PhotoAPlacer {
  id: string;
  date: string;
  source: SourceDate;
  portrait: boolean;
}

/** Forme voulue de chaque cadre : true (en hauteur), false (en largeur), null (sans contrainte). */
type Formes = Record<number, (boolean | null)[]>;

/** Coût d'une page : écarts de format (meilleure attribution des cadres) et taille de la page. */
function coutGroupe(portraits: boolean[], formes: (boolean | null)[]): number {
  const taille = portraits.length;
  const nbPortraits = portraits.filter(Boolean).length;
  const voulusPortraits = formes.filter((f) => f === true).length;
  const voulusPaysages = formes.filter((f) => f === false).length;
  const ecarts = Math.max(0, voulusPortraits - nbPortraits) + Math.max(0, voulusPaysages - (taille - nbPortraits));
  return COUT_ECART_FORMAT * ecarts + COUT_TAILLE * taille * taille;
}

/**
 * Ordre des photos d'une page : chaque cadre en hauteur reçoit un portrait, chaque cadre en largeur un paysage,
 * quand c'est possible ; les cadres sans contrainte prennent les photos restantes dans l'ordre chronologique.
 */
function attribuerCadres(groupe: PhotoAPlacer[], formes: (boolean | null)[]): string[] {
  const restantes = [...groupe];
  const ordre: string[] = Array(formes.length).fill("");
  formes.forEach((voulu, cadre) => {
    if (voulu === null) return;
    const choisie = restantes.find((p) => p.portrait === voulu) ?? restantes[0];
    restantes.splice(restantes.indexOf(choisie), 1);
    ordre[cadre] = choisie.id;
  });
  formes.forEach((voulu, cadre) => {
    if (voulu === null) ordre[cadre] = restantes.shift()!.id;
  });
  return ordre;
}

/**
 * Disposition d'une page à un seul portrait : la 1 si son cadre est en hauteur (page au format paysage), sinon la 2,
 * dont le cadre de gauche est en hauteur (celui de droite reste vide).
 */
export function dispositionPortraitSeul(formes: Formes): 1 | 2 {
  return formes[1][0] ? 1 : 2;
}

/**
 * Répartit des photos sur les mois en utilisant le plus de photos possible (jusqu'à 4 par page). Les photos restent
 * dans l'ordre chronologique d'un mois à l'autre. Le découpage (combien de photos sur chaque page) est celui qui, dans
 * l'ordre : remplit le plus de mois, met les portraits dans des cadres en hauteur et les paysages dans des cadres en
 * largeur, et équilibre les pages.
 *
 * aspects : {nombre de photos: [largeur / hauteur de chaque cadre]} pour le format de page choisi.
 * Renvoie les groupes retenus (1 à 4 photos, null pour un cadre laissé vide), les photos écartées (dans l'ordre
 * reçu) et les photos triées par date.
 */
export function planifierMois(photos: PhotoAPlacer[], mois = 12, aspects?: Record<number, number[]>) {
  aspects ??= Object.fromEntries([1, 2, 3, 4].map((k) => [k, Array(k).fill(1.5)]));
  const formes: Formes = {};
  for (const [k, liste] of Object.entries(aspects)) formes[Number(k)] = liste.map((a) => a < 1);
  // Disposition 3 : le grand cadre de gauche reçoit toujours un portrait, les deux de droite n'importe quoi.
  formes[3] = [true, null, null];
  const infos = [...photos].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let retenues = infos;
  const capacite = mois * MAX_EMPLACEMENTS;
  if (retenues.length > capacite) {
    // Trop de photos : on en garde autant que de places, réparties sur toute la période.
    const garder = new Set<number>();
    for (let i = 0; i < capacite; i++) garder.add(arrondiPython((i * (retenues.length - 1)) / (capacite - 1)));
    retenues = [...garder].sort((a, b) => a - b).map((i) => infos[i]);
  }
  const n = retenues.length;
  if (n === 0) return { groupes: [] as (string | null)[][], ecartees: photos.map((p) => p.id), infos };

  const portraitSeul2 = dispositionPortraitSeul(formes) === 2;
  /**
   * meilleur[i][g] : coût minimal pour placer les i premières photos sur g pages, et la taille de la dernière.
   * strict : pas de page à 3 photos sans portrait pour le grand cadre de gauche (règle de la version Windows).
   */
  const programmer = (strict: boolean) => {
    const meilleur: [number, number][][] = Array.from({ length: n + 1 }, () => Array.from({ length: mois + 1 }, () => [Infinity, 0] as [number, number]));
    meilleur[0][0] = [0, 0];
    for (let i = 1; i <= n; i++) {
      for (let g = 1; g <= Math.min(mois, i); g++) {
        for (let taille = 1; taille <= Math.min(MAX_EMPLACEMENTS, i); taille++) {
          const precedent = meilleur[i - taille][g - 1][0];
          if (precedent === Infinity) continue;
          const groupe = retenues.slice(i - taille, i).map((p) => p.portrait);
          if (strict && taille === 3 && !groupe.some(Boolean)) continue;
          let cadres = formes[taille];
          if (taille === 1 && groupe[0] && portraitSeul2) cadres = [true]; // portrait seul : cadre en hauteur de la disposition 2
          const cout = precedent + coutGroupe(groupe, cadres);
          if (cout < meilleur[i][g][0]) meilleur[i][g] = [cout, taille];
        }
      }
    }
    return meilleur;
  };
  let meilleur = programmer(true);
  const choisirPages = () => {
    let pages = 1;
    const coutTotal = (g: number) => meilleur[n][g][0] + COUT_MOIS_VIDE * (mois - g);
    for (let g = 2; g <= Math.min(mois, n); g++) if (coutTotal(g) < coutTotal(pages)) pages = g;
    return pages;
  };
  let pages = choisirPages();
  if (meilleur[n][pages][0] === Infinity) {
    // Aucun découpage ne respecte la règle (par exemple 47 paysages sur 12 mois : une page doit en recevoir 3) :
    // la version Windows échoue ; ici, une page de 3 paysages est acceptée, avec son écart de format.
    meilleur = programmer(false);
    pages = choisirPages();
  }
  const tailles: number[] = [];
  for (let i = n, g = pages; i; ) {
    const taille = meilleur[i][g][1];
    tailles.push(taille);
    i -= taille;
    g -= 1;
  }
  const groupes: (string | null)[][] = [];
  let debut = 0;
  for (const taille of tailles.reverse()) {
    let groupe: (string | null)[] = attribuerCadres(retenues.slice(debut, debut + taille), formes[taille]);
    if (taille === 1 && retenues[debut].portrait && portraitSeul2) groupe = [groupe[0], null]; // portrait à gauche, cadre de droite vide
    groupes.push(groupe);
    debut += taille;
  }
  const utilisees = new Set(groupes.flat().filter((p): p is string => !!p));
  return { groupes, ecartees: photos.map((p) => p.id).filter((id) => !utilisees.has(id)), infos };
}
