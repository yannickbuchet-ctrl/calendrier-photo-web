/**
 * Les photos du calendrier en mémoire (ImageCache de la version Windows) : l'original reste un fichier (Blob, lu à
 * la demande) ; seules des réductions sont décodées pour l'affichage, à la taille utile (512, 1024 ou 2048 pixels),
 * dans la limite d'un budget de mémoire. La pleine résolution ne sert qu'à l'export, une photo à la fois.
 */
import type { ImagePrete } from "../rendu/canevas";
import { decoder, liberer, tailleReduite, versJpeg, type Canevas } from "./decodage";
import { ecrireVignette, type PhotoStockee } from "./stockage";

export type PhotoMemoire = PhotoStockee;

/** Paliers de réduction : quelques tailles en cache au lieu d'une par redimensionnement. */
export const PALIERS = [512, 1024, 2048] as const;
const COTE_VIGNETTE = 512;

interface Decodee {
  image: ImageBitmap | Canevas;
  largeur: number;
  hauteur: number;
  octets: number;
  usage: number;
}

export class Bibliotheque {
  readonly photos = new Map<string, PhotoMemoire>();
  private readonly decodees = new Map<string, Decodee>();
  private readonly demandes: string[] = [];
  private readonly vignettesAFaire: string[] = [];
  private readonly enCours = new Set<string>();
  private occupe = false;
  private compteur = 0;
  /** Mémoire maximale des images décodées (octets). */
  budget: number;
  /** Appelé quand une image devient disponible (pour redessiner). */
  surImage: () => void = () => {};

  constructor(budget: number) {
    this.budget = budget;
  }

  ajouter(p: PhotoMemoire) {
    this.photos.set(p.id, p);
    if (!p.vignette) this.planifierVignette(p.id);
  }

  retirer(id: string) {
    this.photos.delete(id);
    for (const cle of [...this.decodees.keys()]) if (cle.startsWith(`${id}:`)) this.oublier(cle);
  }

  vider() {
    for (const cle of [...this.decodees.keys()]) this.oublier(cle);
    this.photos.clear();
  }

  dimensions(id: string): { w: number; h: number } | null {
    const p = this.photos.get(id);
    return p ? { w: p.largeur, h: p.hauteur } : null;
  }

  /** Palier qui suffit pour afficher la photo sur besoin pixels (son plus grand côté). */
  static palier(besoin: number): number {
    return PALIERS.find((p) => p >= besoin) ?? PALIERS[PALIERS.length - 1];
  }

  /**
   * Meilleure image disponible tout de suite pour afficher la photo sur besoin pixels ; la bonne taille est préparée
   * en arrière-plan si elle manque (surImage est appelé quand elle est prête).
   */
  image(id: string, besoin: number): ImagePrete | null {
    const p = this.photos.get(id);
    if (!p) return null;
    const voulu = Math.min(Bibliotheque.palier(besoin), PALIERS.find((x) => x >= Math.max(p.largeur, p.hauteur)) ?? 2048);
    const exacte = this.decodees.get(`${id}:${voulu}`);
    if (exacte) {
      exacte.usage = ++this.compteur;
      return { image: exacte.image, largeur: exacte.largeur, hauteur: exacte.hauteur };
    }
    this.demander(`${id}:${voulu}`);
    // En attendant : la plus grande des autres tailles déjà décodées.
    let meilleure: Decodee | null = null;
    for (const palier of PALIERS) {
      const d = this.decodees.get(`${id}:${palier}`);
      if (d && (!meilleure || d.largeur > meilleure.largeur)) meilleure = d;
    }
    return meilleure ? { image: meilleure.image, largeur: meilleure.largeur, hauteur: meilleure.hauteur } : null;
  }

  private demander(cle: string) {
    if (this.enCours.has(cle) || this.decodees.has(cle)) return;
    const i = this.demandes.indexOf(cle);
    if (i >= 0) this.demandes.splice(i, 1);
    this.demandes.push(cle); // la plus récente d'abord : la page affichée maintenant
    void this.travailler();
  }

  private planifierVignette(id: string) {
    if (!this.vignettesAFaire.includes(id)) this.vignettesAFaire.push(id);
    void this.travailler();
  }

  /** Une photo à la fois : la mémoire reste bornée même avec des dizaines de photos de plusieurs Mo. */
  private async travailler() {
    if (this.occupe) return;
    this.occupe = true;
    try {
      for (;;) {
        const cle = this.demandes.pop();
        if (cle) {
          this.enCours.add(cle);
          try {
            await this.preparer(cle);
          } catch (e) {
            console.warn(`Photo illisible (${cle})`, e);
          } finally {
            this.enCours.delete(cle);
          }
          this.surImage();
          continue;
        }
        const id = this.vignettesAFaire.shift();
        if (!id) break;
        const p = this.photos.get(id);
        if (p && !p.vignette) {
          try {
            // La réduction qui a servi à la vignette est gardée : les vignettes des pages l'affichent.
            this.garder(`${id}:${COTE_VIGNETTE}`, await this.creerVignette(p));
            this.surImage();
          } catch (e) {
            console.warn(`Vignette impossible (${p.nom})`, e);
          }
        }
      }
    } finally {
      this.occupe = false;
    }
  }

  private async creerVignette(p: PhotoMemoire): Promise<Canevas> {
    const { w, h } = tailleReduite(p.largeur, p.hauteur, COTE_VIGNETTE);
    const c = await decoder(p.original, p, w, h);
    p.vignette = await versJpeg(c, 0.85);
    ecrireVignette(p.id, p.vignette).catch(() => {
      /* stockage indisponible : la vignette reste en mémoire */
    });
    return c;
  }

  private async preparer(cle: string) {
    const [id, texte] = cle.split(":");
    const palier = Number(texte);
    const p = this.photos.get(id);
    if (!p) return;
    let image: ImageBitmap | Canevas;
    if (palier <= COTE_VIGNETTE) {
      image = p.vignette ? await createImageBitmap(p.vignette) : await this.creerVignette(p);
    } else {
      const { w, h } = tailleReduite(p.largeur, p.hauteur, palier);
      image = await decoder(p.original, p, w, h);
    }
    this.garder(cle, image);
  }

  private garder(cle: string, image: ImageBitmap | Canevas) {
    if (!this.photos.has(cle.split(":")[0])) {
      liberer(image);
      return;
    }
    const ancienne = this.decodees.get(cle);
    if (ancienne && ancienne.image !== image) liberer(ancienne.image);
    const largeur = image.width;
    const hauteur = image.height;
    this.decodees.set(cle, { image, largeur, hauteur, octets: largeur * hauteur * 4, usage: ++this.compteur });
    this.respecterBudget(cle);
  }

  private respecterBudget(garder: string) {
    let total = 0;
    for (const d of this.decodees.values()) total += d.octets;
    const parAnciennete = [...this.decodees.entries()].sort((a, b) => a[1].usage - b[1].usage);
    for (const [cle, d] of parAnciennete) {
      if (total <= this.budget) break;
      if (cle === garder) continue;
      total -= d.octets;
      this.oublier(cle);
    }
  }

  private oublier(cle: string) {
    const d = this.decodees.get(cle);
    if (d) liberer(d.image);
    this.decodees.delete(cle);
  }

  /** Mémoire occupée par les images décodées (octets). */
  memoire(): number {
    let total = 0;
    for (const d of this.decodees.values()) total += d.octets;
    return total;
  }

  /** Vrai tant que des réductions sont en préparation. */
  get travaille(): boolean {
    return this.occupe;
  }
}

/** Budget de mémoire des images selon l'appareil (téléphone ou ordinateur). */
export function budgetMemoire(): number {
  const memoire = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const telephone = typeof matchMedia !== "undefined" && matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  if ((memoire !== undefined && memoire <= 4) || telephone) return 96 * 1024 * 1024;
  return 256 * 1024 * 1024;
}
