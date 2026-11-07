/**
 * Vignettes des pages (SlotCard de la version Windows) : disposition, choix des photos, clic pour l'aperçu,
 * double-clic pour recadrer, glisser-déposer de photos.
 */
import { decouperCadre, emplacementEntier, NOMS_DISPOSITIONS, NOMS_EMPLACEMENTS, placementPhoto, type Rect } from "../logique/disposition";
import { nombrePhotos, photosDeLaPage, recadragesDeLaPage } from "../rendu/page";
import type { ContexteVues } from "./contexte";
import { imagesDeposees } from "./contexte";
import { bouton, el, estTactile, menuFlottant } from "./dom";
import { icone, iconeDisposition } from "./icones";

const LARGEUR = 176;
const HAUTEUR = 112;
const ECART = 4;

interface Carte {
  racine: HTMLElement;
  titre: HTMLElement;
  disposition: HTMLButtonElement;
  vignette: HTMLButtonElement;
  canevas: HTMLCanvasElement;
  premier: HTMLButtonElement;
  second: HTMLButtonElement;
  vider: HTMLButtonElement;
  description: HTMLElement;
}

function trace(ctx: CanvasRenderingContext2D, r: Rect, rayon: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(rayon, r.w / 2, r.h / 2));
}

export class Cartes {
  readonly racine: HTMLElement;
  private readonly cartes: Carte[] = [];

  constructor(private readonly ctx: ContexteVues) {
    this.racine = el("div", { class: "cartes" });
  }

  private creer(index: number): Carte {
    const titre = el("h3", { class: "titre-carte" });
    const disposition = el("button", { type: "button", class: "bouton icone disposition", "aria-haspopup": "menu", title: "Disposition de la page : nombre et arrangement des photos" });
    disposition.addEventListener("click", () => {
      const n = nombrePhotos(this.ctx.donnees()!, this.ctx.cle(index));
      menuFlottant(disposition, "Disposition de la page", Object.entries(NOMS_DISPOSITIONS).map(([k, texte]) => ({
        icone: "", html: iconeDisposition(Number(k)), texte, coche: Number(k) === n, action: () => this.ctx.definirDisposition(index, Number(k)),
      })));
    });
    const canevas = el("canvas", { "aria-hidden": "true" });
    const vignette = el("button", { type: "button", class: "vignette" }, canevas);
    vignette.addEventListener("click", () => this.ctx.selectionner(index));
    vignette.addEventListener("dblclick", (e) => this.ctx.recadrer(index, this.emplacementSous(index, e)));
    const description = el("span", { class: "visuellement-cache" });
    const premier = el("button", { type: "button", class: "bouton cadre choisir" });
    premier.addEventListener("click", () => {
      const n = nombrePhotos(this.ctx.donnees()!, this.ctx.cle(index));
      if (n <= 2) {
        this.ctx.choisirPhoto(index, 0);
        return;
      }
      // 3 ou 4 photos : le bouton « Photos… » propose chaque emplacement.
      menuFlottant(premier, "Choisir une photo", NOMS_EMPLACEMENTS[n].map((nom, i) => ({ icone: "photo", texte: `Photo ${nom}…`, action: () => this.ctx.choisirPhoto(index, i) })));
    });
    const second = el("button", { type: "button", class: "bouton cadre choisir", text: "Droite…", title: "Choisir la photo de droite" });
    second.addEventListener("click", () => this.ctx.choisirPhoto(index, 1));
    const vider = bouton("retirer", "Retirer les photos de cette page", () => this.ctx.retirerPhotos(index), { texte: false, classe: "cadre danger" });
    const racine = el("article", { class: "carte" },
      el("div", { class: "entete-carte" }, titre, disposition), vignette, description, el("div", { class: "boutons-carte" }, premier, second, vider));
    racine.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      racine.classList.add("survol");
    });
    racine.addEventListener("dragleave", () => racine.classList.remove("survol"));
    racine.addEventListener("drop", (e) => {
      racine.classList.remove("survol");
      const fichiers = imagesDeposees(e);
      if (!fichiers.length) return;
      e.preventDefault();
      this.ctx.deposer(index, this.emplacementSous(index, e), fichiers);
    });
    return { racine, titre, disposition, vignette, canevas, premier, second, vider, description };
  }

  /** Cadres des photos sur la vignette. */
  private cadres(n: number): Rect[] {
    return decouperCadre({ x: 0, y: 0, w: LARGEUR, h: HAUTEUR }, n, ECART);
  }

  /** Emplacement sous le pointeur : le cadre qui le contient, sinon le plus proche (_slot_at). */
  private emplacementSous(index: number, e: MouseEvent): number {
    const carte = this.cartes[index];
    const r = carte.canevas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * LARGEUR;
    const y = ((e.clientY - r.top) / r.height) * HAUTEUR;
    const cadres = this.cadres(nombrePhotos(this.ctx.donnees()!, this.ctx.cle(index)));
    const dedans = cadres.findIndex((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
    if (dedans >= 0) return dedans;
    const distances = cadres.map((c) => Math.abs(c.x + c.w / 2 - x) + Math.abs(c.y + c.h / 2 - y));
    return distances.indexOf(Math.min(...distances));
  }

  mettreAJour() {
    const d = this.ctx.donnees();
    if (!d) return;
    const nombre = this.ctx.nombrePages();
    while (this.cartes.length < nombre) {
      const c = this.creer(this.cartes.length);
      this.cartes.push(c);
      this.racine.append(c.racine);
    }
    this.cartes.forEach((c, i) => {
      c.racine.hidden = i >= nombre;
      if (i < nombre) this.remplir(c, i);
    });
  }

  private remplir(c: Carte, index: number) {
    const d = this.ctx.donnees()!;
    const cle = this.ctx.cle(index);
    const n = nombrePhotos(d, cle);
    const titre = this.ctx.titrePage(index);
    const courante = index === this.ctx.courant;
    c.titre.textContent = titre;
    c.racine.setAttribute("aria-label", titre);
    c.racine.classList.toggle("choisie", courante);
    c.vignette.setAttribute("aria-current", String(courante));
    c.vignette.setAttribute("aria-label", `Afficher ${titre} dans l'aperçu`);
    c.vignette.title = "Clic : afficher dans l'aperçu. Double-clic : recadrer la photo";
    c.disposition.innerHTML = iconeDisposition(n);
    c.disposition.setAttribute("aria-label", `Disposition de ${titre} : ${NOMS_DISPOSITIONS[n]}`);
    const photos = photosDeLaPage(d, cle);
    const noms = photos.map((id) => (id ? this.ctx.bibliotheque.photos.get(id)?.nom ?? "photo introuvable" : null));
    c.description.textContent = noms.some(Boolean)
      ? `Photos de ${titre} : ${noms.map((nom, i) => `${NOMS_EMPLACEMENTS[n][i]} : ${nom ?? "vide"}`).join(" ; ")}.`
      : `${titre} : aucune photo.`;
    if (n === 1) {
      c.premier.innerHTML = `${icone("photo")}<span>Choisir…</span>`;
      c.premier.title = "Choisir la photo de cette page (ou glissez-déposez une image ici)";
      c.second.hidden = true;
    } else if (n === 2) {
      c.premier.innerHTML = "<span>Gauche…</span>";
      c.premier.title = "Choisir la photo de gauche";
      c.second.hidden = false;
    } else {
      c.premier.innerHTML = `${icone("photo")}<span>Photos…</span>`;
      c.premier.title = "Choisir une des photos de cette page (ou glissez-déposez des images sur la vignette)";
      c.second.hidden = true;
    }
    c.premier.setAttribute("aria-label", `${c.premier.textContent} (${titre})`);
    c.second.setAttribute("aria-label", `Droite… (${titre})`);
    c.vider.disabled = !photos.some(Boolean);
    c.vider.setAttribute("aria-label", `Retirer les photos de ${titre}`);
    this.dessinerVignette(c, n, photos, recadragesDeLaPage(d, cle), d.reglages.whole_photos);
  }

  private dessinerVignette(c: Carte, n: number, photos: (string | null)[], recadrages: ReturnType<typeof recadragesDeLaPage>, entieres: boolean) {
    const dpr = window.devicePixelRatio || 1;
    const largeurCss = c.canevas.clientWidth || LARGEUR;
    const k = (largeurCss / LARGEUR) * dpr;
    if (c.canevas.width !== Math.round(LARGEUR * k)) {
      c.canevas.width = Math.round(LARGEUR * k);
      c.canevas.height = Math.round(HAUTEUR * k);
    }
    const ctx = c.canevas.getContext("2d")!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, LARGEUR, HAUTEUR);
    ctx.imageSmoothingQuality = "high";
    const tactile = estTactile();
    this.cadres(n).forEach((cadre, emplacement) => {
      const id = photos[emplacement];
      const dims = id ? this.ctx.bibliotheque.dimensions(id) : null;
      const image = id ? this.ctx.bibliotheque.image(id, 512) : null;
      if (id && dims && image) {
        const { cible, source } = placementPhoto(cadre, dims.w, dims.h, recadrages[emplacement], entieres && emplacementEntier(n, emplacement));
        ctx.save();
        trace(ctx, cible, 8);
        ctx.clip();
        const kx = image.largeur / dims.w;
        const ky = image.hauteur / dims.h;
        ctx.drawImage(image.image, source.x * kx, source.y * ky, source.w * kx, source.h * ky, cible.x, cible.y, cible.w, cible.h);
        ctx.restore();
        return;
      }
      ctx.fillStyle = id ? "#e2e8f0" : "#eef1f5";
      trace(ctx, cadre, 8);
      ctx.fill();
      if (id) return; // photo en cours de chargement
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const texte = n === 1 ? (tactile ? ["Touchez « Choisir… »"] : ["Cliquez sur « Choisir… »", "ou déposez une photo"]) : cadre.h > 60 && !tactile ? ["Déposez", "une photo"] : ["+"];
      texte.forEach((ligne, i) => ctx.fillText(ligne, cadre.x + cadre.w / 2, cadre.y + cadre.h / 2 + (i - (texte.length - 1) / 2) * 15));
    });
  }

  /** Fait défiler la liste jusqu'à la page choisie. */
  montrer(index: number) {
    this.cartes[index]?.racine.scrollIntoView({ block: "nearest" });
  }
}
