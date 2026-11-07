/**
 * Aperçu de la page choisie, à l'échelle de l'écran, ou vue d'ensemble de toutes les pages (PreviewWidget de la
 * version Windows). Double-clic (ou double appui) sur une photo : recadrage ; glisser le doigt : page suivante.
 */
import { dimensionsUnites, rapportPage } from "../logique/disposition";
import { dessinerSurCanevas, type ImagePrete } from "../rendu/canevas";
import { cadresPhotos, dessinerPage, type PageDessinee } from "../rendu/page";
import { el } from "./dom";
import type { ContexteVues } from "./contexte";
import { imagesDeposees } from "./contexte";

/** Images des photos d'une page, à la taille où elles sont dessinées (pixels de l'écran). */
export function imagesPourPage(ctx: ContexteVues, page: PageDessinee, echelle: number): Map<string, ImagePrete> {
  const besoins = new Map<string, number>();
  for (const op of page.ops) {
    if (op.type !== "photo" || op.source.w <= 0 || op.source.h <= 0) continue;
    const dims = ctx.bibliotheque.dimensions(op.id);
    if (!dims) continue;
    // Pixels de l'écran par pixel de la photo, appliqués à la photo entière (son plus grand côté).
    const k = Math.max(op.cible.w / op.source.w, op.cible.h / op.source.h) * echelle;
    besoins.set(op.id, Math.max(besoins.get(op.id) ?? 0, Math.max(dims.w, dims.h) * k));
  }
  const images = new Map<string, ImagePrete>();
  for (const [id, besoin] of besoins) {
    const image = ctx.bibliotheque.image(id, besoin);
    if (image) images.set(id, image);
  }
  return images;
}

export class Apercu {
  readonly racine: HTMLElement;
  private readonly page: HTMLCanvasElement;
  private readonly planche: HTMLElement;
  private ensemble = false;
  private demande = 0;
  private derniere: { w: number; largeurCss: number } | null = null;
  private appui: { x: number; y: number; t: number } | null = null;
  private dernierAppui: { x: number; y: number; t: number } | null = null;

  constructor(private readonly ctx: ContexteVues) {
    this.page = el("canvas", { class: "page-apercu", role: "img", tabindex: "0" });
    this.planche = el("div", { class: "planche", role: "list", "aria-label": "Toutes les pages", hidden: true });
    this.racine = el("div", { class: "zone-apercu" }, this.page, this.planche);
    new ResizeObserver(() => this.dessiner()).observe(this.racine);
    this.installerPointeur();
    this.racine.addEventListener("dragover", (e) => {
      if (this.ensemble || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      this.racine.classList.add("survol");
    });
    this.racine.addEventListener("dragleave", () => this.racine.classList.remove("survol"));
    this.racine.addEventListener("drop", (e) => {
      this.racine.classList.remove("survol");
      const fichiers = imagesDeposees(e);
      if (!fichiers.length || this.ensemble) return;
      e.preventDefault();
      const emplacement = this.emplacementSous(e.offsetX, e.offsetY, e.target === this.page) ?? 0;
      this.ctx.deposer(this.ctx.courant, emplacement, fichiers);
    });
  }

  get vueEnsemble(): boolean {
    return this.ensemble;
  }

  set vueEnsemble(v: boolean) {
    this.ensemble = v;
    this.page.hidden = v;
    this.planche.hidden = !v;
    this.dessiner();
  }

  /** Redessine au prochain rafraîchissement de l'écran (les demandes rapprochées n'en font qu'un). */
  dessiner() {
    if (this.demande) return;
    this.demande = requestAnimationFrame(() => {
      this.demande = 0;
      if (this.ensemble) this.dessinerPlanche();
      else this.dessinerPage();
    });
  }

  private dessinerPage() {
    const d = this.ctx.donnees();
    const dispoW = this.racine.clientWidth - 24;
    const dispoH = this.racine.clientHeight - 24;
    if (!d || dispoW < 20 || dispoH < 20) return;
    const ratio = rapportPage(d.reglages.format);
    const largeur = Math.max(1, Math.min(dispoW, dispoH / ratio));
    const hauteur = largeur * ratio;
    const dpr = window.devicePixelRatio || 1;
    this.page.style.width = `${largeur}px`;
    this.page.style.height = `${hauteur}px`;
    const pw = Math.round(largeur * dpr);
    const ph = Math.round(hauteur * dpr);
    if (this.page.width !== pw || this.page.height !== ph) {
      this.page.width = pw;
      this.page.height = ph;
    }
    const index = Math.min(this.ctx.courant, this.ctx.nombrePages() - 1);
    const pageDessinee = dessinerPage(d, index);
    const echelle = pw / pageDessinee.w;
    const images = imagesPourPage(this.ctx, pageDessinee, echelle);
    const c = this.page.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    dessinerSurCanevas(c, pageDessinee, { echelle, image: (id) => images.get(id) ?? null, dimensions: d.dimensions, polices: d.polices });
    this.derniere = { w: pageDessinee.w, largeurCss: largeur };
    const n = pageDessinee.ops.filter((o) => o.type === "photo").length;
    this.page.setAttribute("aria-label", `Aperçu de la page ${this.ctx.titrePage(index)} : ${n ? `${n} photo${n > 1 ? "s" : ""}` : "aucune photo"}. Double-cliquez sur une photo pour la recadrer.`);
  }

  /** Emplacement de photo sous un point de l'aperçu (pixels CSS), ou null. */
  private emplacementSous(x: number, y: number, surPage = true): number | null {
    const d = this.ctx.donnees();
    if (!d || !this.derniere || !surPage) return null;
    const k = this.derniere.w / this.derniere.largeurCss;
    const { w, h } = dimensionsUnites(d.reglages.format);
    const cadres = cadresPhotos(d, this.ctx.courant, w, h);
    const i = cadres.findIndex((c) => x * k >= c.x && x * k <= c.x + c.w && y * k >= c.y && y * k <= c.y + c.h);
    return i >= 0 ? i : null;
  }

  private installerPointeur() {
    this.page.addEventListener("dblclick", (e) => {
      const emplacement = this.emplacementSous(e.offsetX, e.offsetY);
      if (emplacement !== null) this.ctx.recadrer(this.ctx.courant, emplacement);
    });
    this.page.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const sur = this.emplacementSous(e.offsetX, e.offsetY) !== null;
      this.page.style.cursor = sur ? "pointer" : "";
      this.page.title = sur ? "Double-cliquez pour recadrer la photo" : "";
    });
    // Au doigt : double appui sur une photo pour la recadrer ; glisser à gauche ou à droite pour changer de page.
    this.page.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      this.appui = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.page.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse" || !this.appui) return;
      const dx = e.clientX - this.appui.x;
      const dy = e.clientY - this.appui.y;
      const duree = performance.now() - this.appui.t;
      this.appui = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy) && duree < 800) {
        this.ctx.selectionner(this.ctx.courant + (dx < 0 ? 1 : -1));
        return;
      }
      if (Math.hypot(dx, dy) > 12 || duree > 500) return;
      const maintenant = { x: e.clientX, y: e.clientY, t: performance.now() };
      const avant = this.dernierAppui;
      this.dernierAppui = maintenant;
      if (avant && maintenant.t - avant.t < 350 && Math.hypot(maintenant.x - avant.x, maintenant.y - avant.y) < 30) {
        this.dernierAppui = null;
        const emplacement = this.emplacementSous(e.offsetX, e.offsetY);
        if (emplacement !== null) this.ctx.recadrer(this.ctx.courant, emplacement);
      }
    });
    this.page.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") this.ctx.selectionner(this.ctx.courant + 1);
      else if (e.key === "ArrowLeft") this.ctx.selectionner(this.ctx.courant - 1);
      else return;
      e.preventDefault();
    });
  }

  /** Vue d'ensemble : la disposition en grille qui donne les plus grandes pages (_sheet_rects). */
  private dessinerPlanche() {
    const d = this.ctx.donnees();
    if (!d) return;
    const nombre = this.ctx.nombrePages();
    const ratio = rapportPage(d.reglages.format);
    const dispoW = this.racine.clientWidth - 32;
    const dispoH = this.racine.clientHeight - 32;
    const ecart = 14;
    const libelle = 22;
    let meilleur = { w: 0, colonnes: 1 };
    for (let colonnes = 1; colonnes <= nombre; colonnes++) {
      const lignes = Math.ceil(nombre / colonnes);
      const w = Math.min((dispoW - ecart * (colonnes - 1)) / colonnes, ((dispoH - ecart * (lignes - 1)) / lignes - libelle) / ratio);
      if (w > meilleur.w) meilleur = { w, colonnes };
    }
    // Sur un écran étroit, des pages lisibles qui défilent plutôt que minuscules.
    const largeurMin = Math.min(dispoW, 150);
    if (meilleur.w < largeurMin) meilleur = { w: largeurMin, colonnes: Math.max(1, Math.floor((dispoW + ecart) / (largeurMin + ecart))) };
    const w = Math.floor(meilleur.w);
    const h = Math.round(w * ratio);
    this.planche.style.gridTemplateColumns = `repeat(${meilleur.colonnes}, ${w}px)`;
    while (this.planche.children.length > nombre) this.planche.lastElementChild!.remove();
    while (this.planche.children.length < nombre) {
      const i = this.planche.children.length;
      const b = el("button", { type: "button", class: "miniature-page", role: "listitem" }, el("canvas"), el("span"));
      b.addEventListener("click", () => this.ctx.ouvrirDepuisEnsemble(i));
      this.planche.append(b);
    }
    const dpr = window.devicePixelRatio || 1;
    [...this.planche.children].forEach((b, i) => {
      const bouton = b as HTMLButtonElement;
      const canevas = bouton.querySelector("canvas")!;
      const titre = this.ctx.titrePage(i);
      bouton.querySelector("span")!.textContent = titre;
      bouton.setAttribute("aria-label", `${titre} : cliquez pour l'afficher en grand`);
      bouton.title = `${titre} : cliquez pour l'afficher en grand`;
      bouton.setAttribute("aria-current", String(i === this.ctx.courant));
      canevas.style.width = `${w}px`;
      canevas.style.height = `${h}px`;
      canevas.width = Math.round(w * dpr);
      canevas.height = Math.round(h * dpr);
      const pageDessinee = dessinerPage(d, i);
      const echelle = canevas.width / pageDessinee.w;
      const images = imagesPourPage(this.ctx, pageDessinee, echelle);
      dessinerSurCanevas(canevas.getContext("2d")!, pageDessinee, { echelle, image: (id) => images.get(id) ?? null, dimensions: d.dimensions, polices: d.polices });
    });
  }

  /** Met le focus sur la page d'une vue d'ensemble, ou sur l'aperçu. */
  focus() {
    if (this.ensemble) (this.planche.children[this.ctx.courant] as HTMLElement | undefined)?.focus();
    else this.page.focus();
  }
}
