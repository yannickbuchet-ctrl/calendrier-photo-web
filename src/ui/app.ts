/**
 * L'application (CalendarWindow de la version Windows) : réglages, vignettes des pages et aperçu ; annuler et
 * rétablir ; photos, remplissage automatique et recadrage ; projet, sauvegarde automatique, export PDF, impression.
 */
import { aspectsCadres, completer, decouperCadre, dimensionsUnites, NOMS_DISPOSITIONS, NOMS_EMPLACEMENTS, rapportPage, zonesPage, FORMATS, type Recadrage } from "../logique/disposition";
import type { Evenement } from "../logique/evenements";
import { MAX_EMPLACEMENTS, planifierMois } from "../logique/plan";
import { analyserProjet, donneesProjet, etatProjet, photosUtilisees, projetVide, seulLeTitreChange, type Projet } from "../logique/projet";
import { clePage, pagesDu, titrePage, type Reglages } from "../logique/reglages";
import { Bibliotheque, budgetMemoire, type PhotoMemoire } from "../photos/bibliotheque";
import { depuisFichier, importerPhotos, type FichierAImporter } from "../photos/importation";
import { effacerTout, idsDesPhotos, lirePhoto, lireSauvegarde, ecrireSauvegarde, placeOccupee, supprimerPhoto, type SauvegardeProjet } from "../photos/stockage";
import { ecrireProjet, lireProjet, nomDeFichier } from "../projet/fichier";
import { cadresPhotos, type DonneesRendu } from "../rendu/page";
import { chargerPolices, type JeuPolices } from "../rendu/polices-web";
import { APPLICATION, AUTEUR, CODE_SOURCE, DATE, DIRECTEUR, MODELE, VERSION } from "../version";
import { Apercu } from "./apercu";
import { Cartes } from "./cartes";
import type { ContexteVues } from "./contexte";
import {
  bouton, choisir, choisirFichiers, confirmer, el, enregistrerFichier, fenetre, informer, menuFlottant, paragraphes, pluriel, tailleLisible,
  telecharger, type EntreeMenu,
} from "./dom";
import { photosModeles } from "./exemples";
import { gererEvenements } from "./fenetreEvenements";
import { icone, iconeDisposition, LOGO } from "./icones";
import { lancerImpression, preparerImpression } from "./impression";
import { PanneauReglages } from "./panneauReglages";
import { recadrer } from "./recadrage";

const MAX_ANNULATIONS = 100;
const IMAGES = "image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.avif";
const PROJETS = ".calendrier,.zip,.json,application/zip,application/json";
const deux = (n: number) => String(n).padStart(2, "0");
/** « 15/03/2027 » d'une date-heure « 2027-03-15 … ». */
const dateCourte = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export class Application implements ContexteVues {
  projet: Projet = projetVide();
  courant = 0;
  readonly bibliotheque = new Bibliotheque(budgetMemoire());
  private polices: JeuPolices | null = null;
  private styleCharge = -1;
  // Annuler / rétablir : états successifs du projet (texte JSON, voir etatProjet).
  private pileAnnuler: string[] = [];
  private pileRetablir: string[] = [];
  private dernierEtat: string | null = null;
  /** État au dernier enregistrement (ou à l'ouverture) du fichier de projet. */
  private etatEnregistre: string;
  private nomFichier: string | null = null;
  private poignee: FileSystemFileHandle | null = null;
  private minuterieSauvegarde = 0;
  private sauvegardeActive = false;
  private derniereSauvegarde = "";
  private minuterieMessage = 0;
  private occupe = 0;

  private readonly racine: HTMLElement;
  private readonly panneau: PanneauReglages;
  private readonly cartes: Cartes;
  private readonly apercu: Apercu;
  private readonly corps: HTMLElement;
  private readonly boutons: Record<string, HTMLButtonElement> = {};
  private readonly etiquettePage: HTMLElement;
  private readonly messageEtat: HTMLElement;
  private readonly indicateur: HTMLElement;
  private readonly attente: HTMLElement;

  constructor(racine: HTMLElement) {
    this.racine = racine;
    this.etatEnregistre = etatProjet(this.projet);
    this.bibliotheque.surImage = () => {
      this.apercu.dessiner();
      this.cartes.mettreAJour();
    };
    this.panneau = new PanneauReglages({
      changer: (modif) => this.changerReglages(modif),
      essayerCouleur: (couleur) => {
        this.projet.reglages.accent = couleur;
        this.apercu.dessiner();
        this.cartes.mettreAJour();
      },
      gererEvenements: () => void this.modifierEvenements(),
      remplirAutomatiquement: () => void this.remplirAutomatiquement(),
      ajouterPhotos: () => void this.ajouterPhotos(),
      photosModeles: () => void this.essayerModeles(),
      imprimer: () => void this.imprimer(),
      donneesAppareil: () => void this.donneesAppareil(),
    });
    this.cartes = new Cartes(this);
    this.apercu = new Apercu(this);
    this.etiquettePage = el("span", { class: "etiquette-page", "aria-live": "polite" });
    this.messageEtat = el("span", { class: "message", role: "status", "aria-live": "polite" });
    this.indicateur = el("span", { class: "indicateur", title: "Le calendrier et ses photos sont gardés automatiquement dans ce navigateur, sur cet appareil seulement." });
    this.attente = el("span", { class: "attente", hidden: true, "aria-hidden": "true" });
    this.corps = el("div", { class: "corps", "data-onglet": "reglages" });
    this.construire();
    this.installerClavier();
    window.addEventListener("resize", () => this.apercu.dessiner());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.sauvegarderMaintenant();
    });
    window.addEventListener("pagehide", () => void this.sauvegarderMaintenant());
    this.rafraichir();
  }

  /* --- Construction de l'interface ----------------------------------------------------------------------------- */

  private construire() {
    const b = (cle: string, ic: string, libelle: string, action: (ev: MouseEvent) => void, opts: Parameters<typeof bouton>[3] = {}) => {
      this.boutons[cle] = bouton(ic, libelle, action, opts);
      return this.boutons[cle];
    };
    const bureau = <T extends HTMLElement>(e: T) => {
      e.classList.add("bureau");
      return e;
    };
    const barre = el("header", { class: "barre" },
      el("div", { class: "marque", html: `${LOGO}<span>${APPLICATION}</span>` }),
      el("nav", { class: "outils", "aria-label": "Barre d'outils" },
        bureau(b("nouveau", "nouveau", "Nouveau", () => void this.nouveau(), { texte: false, infobulle: "Nouveau calendrier" })),
        b("ouvrir", "ouvrir", "Ouvrir", () => void this.ouvrir(), { raccourci: "Ctrl+O", infobulle: "Ouvrir un projet de calendrier (.calendrier, ou .calendrier.json de la version Windows)" }),
        b("enregistrer", "enregistrer", "Enregistrer", () => void this.enregistrer(false), { raccourci: "Ctrl+S", infobulle: "Enregistrer le projet dans un fichier (réglages, photos, dispositions, recadrages, anniversaires)" }),
        el("span", { class: "separateur" }),
        b("annuler", "annuler", "Annuler", () => this.annuler(), { raccourci: "Ctrl+Z", texte: false }),
        b("retablir", "retablir", "Rétablir", () => this.retablir(), { raccourci: "Ctrl+Y", texte: false }),
        el("span", { class: "separateur bureau" }),
        bureau(b("remplir", "auto", "Remplir automatiquement…", () => void this.remplirAutomatiquement(), { texte: false, infobulle: "Remplir automatiquement les mois avec vos photos, par date de prise de vue" })),
        bureau(b("ajouter", "ajouter", "Ajouter des photos…", () => void this.ajouterPhotos(), { texte: false, raccourci: "Ctrl+I" })),
        bureau(b("ensemble", "ensemble", "Vue d'ensemble", () => this.basculerEnsemble(), { texte: false, bascule: true, raccourci: "V", infobulle: "Voir toutes les pages en miniature ; cliquez sur une page pour l'afficher en grand" })),
        el("span", { class: "espace" }),
        b("pdf", "pdf", "Exporter en PDF", () => void this.exporterPdf(), { classe: "principal", raccourci: "Ctrl+E", infobulle: "Créer le PDF à imprimer (300 ppp)" }),
        bureau(b("imprimer", "imprimer", "Imprimer", () => void this.imprimer(), { texte: false, raccourci: "Ctrl+P" })),
        b("menu", "menu", "Menu", (ev) => this.menuPlus(ev.currentTarget as HTMLElement), { texte: false, infobulle: "Plus d'actions" }),
      ),
    );
    this.boutons.menu.setAttribute("aria-haspopup", "menu");

    const entetePanneau = (titre: string, feuille: string) => el("div", { class: "entete-panneau" },
      el("h2", { text: titre }),
      bouton("fermer", "Fermer", () => this.ouvrirFeuille(null), { texte: false, classe: `fermer-feuille feuille-${feuille}` }));
    const panneauReglages = el("aside", { class: "panneau panneau-reglages", "aria-label": "Réglages" }, entetePanneau("Réglages", "reglages"), el("div", { class: "defilement" }, this.panneau.racine));
    const panneauPages = el("aside", { class: "panneau panneau-pages", "aria-label": "Photos des pages" }, entetePanneau("Photos", "pages"),
      el("div", { class: "defilement" }, this.cartes.racine));
    const onglets = el("div", { class: "onglets-panneaux", role: "tablist", "aria-label": "Panneaux" },
      el("button", { type: "button", role: "tab", class: "onglet", "data-onglet": "reglages", text: "Réglages", onclick: () => this.choisirOnglet("reglages") }),
      el("button", { type: "button", role: "tab", class: "onglet", "data-onglet": "pages", text: "Photos des pages", onclick: () => this.choisirOnglet("pages") }));
    const navigation = el("div", { class: "navigation-pages" },
      b("precedente", "gauche", "Page précédente", () => this.selectionner(this.courant - 1), { texte: false, raccourci: "Page préc." }),
      this.etiquettePage,
      b("suivante", "droite", "Page suivante", () => this.selectionner(this.courant + 1), { texte: false, raccourci: "Page suiv." }),
      el("span", { class: "separateur" }),
      b("recadrer", "recadrer", "Recadrer…", (ev) => this.recadrerDepuisBouton(ev.currentTarget as HTMLElement), { infobulle: "Recadrer la photo de cette page (ou double-cliquez sur la photo)" }),
      b("dispositionPage", "pages", "Disposition", (ev) => this.menuDisposition(ev.currentTarget as HTMLElement), { classe: "telephone", infobulle: "Disposition de la page : nombre et arrangement des photos" }),
      b("choisirPage", "photo", "Photo…", (ev) => this.menuPhotoPage(ev.currentTarget as HTMLElement), { classe: "telephone", infobulle: "Choisir une photo de cette page" }),
      b("ensembleBas", "ensemble", "Vue d'ensemble", () => this.basculerEnsemble(), { bascule: true, classe: "bureau" }),
    );
    const panneauApercu = el("main", { class: "panneau panneau-apercu", id: "apercu", "aria-label": "Aperçu" }, this.apercu.racine, navigation);
    this.corps.append(onglets, panneauReglages, panneauPages, panneauApercu, el("div", { class: "voile", onclick: () => this.ouvrirFeuille(null) }));

    const etat = el("footer", { class: "etat" }, this.attente, this.messageEtat, this.indicateur);
    const mobile = (cle: string, ic: string, libelle: string, action: (ev: MouseEvent) => void) => {
      const bt = el("button", { type: "button", class: "bouton", html: `${icone(ic)}<span>${libelle}</span>` });
      bt.addEventListener("click", action);
      this.boutons[cle] = bt;
      return bt;
    };
    const barreMobile = el("nav", { class: "barre-mobile", "aria-label": "Actions" },
      mobile("mPages", "pages", "Pages", () => this.ouvrirFeuille("pages")),
      mobile("mPhotos", "auto", "Photos", (ev) => this.menuPhotos(ev.currentTarget as HTMLElement)),
      mobile("mReglages", "reglages", "Réglages", () => this.ouvrirFeuille("reglages")),
      mobile("mEvenements", "evenement", "Anniversaires", () => void this.modifierEvenements()),
      mobile("mPlus", "menu", "Plus", (ev) => this.menuPlus(ev.currentTarget as HTMLElement)),
    );
    this.boutons.mPhotos.setAttribute("aria-haspopup", "menu");
    this.boutons.mPlus.setAttribute("aria-haspopup", "menu");
    this.racine.append(el("a", { class: "evitement", href: "#apercu", text: "Aller à l'aperçu" }), barre, this.corps, etat, barreMobile);
    this.choisirOnglet("reglages");
  }

  /** Tablette : un seul des deux panneaux (réglages ou photos) à côté de l'aperçu. */
  private choisirOnglet(onglet: "reglages" | "pages") {
    this.corps.dataset.onglet = onglet;
    for (const o of this.corps.querySelectorAll<HTMLElement>(".onglet")) o.setAttribute("aria-selected", String(o.dataset.onglet === onglet));
    this.apercu.dessiner();
  }

  /** Téléphone : panneau des réglages ou des pages par-dessus l'aperçu. */
  private ouvrirFeuille(feuille: "reglages" | "pages" | null) {
    if (feuille) this.corps.dataset.feuille = feuille;
    else delete this.corps.dataset.feuille;
    this.boutons.mPages.setAttribute("aria-pressed", String(feuille === "pages"));
    this.boutons.mReglages.setAttribute("aria-pressed", String(feuille === "reglages"));
    if (feuille === "pages") this.cartes.montrer(this.courant);
    if (feuille) (this.corps.querySelector(`.fermer-feuille.feuille-${feuille}`) as HTMLElement | null)?.focus();
    this.apercu.dessiner();
  }

  private menuPlus(ancre: HTMLElement) {
    const entrees: EntreeMenu[] = [
      { icone: "nouveau", texte: "Nouveau calendrier", action: () => void this.nouveau() },
      { icone: "ouvrir", texte: "Ouvrir un projet…", action: () => void this.ouvrir() },
      { icone: "enregistrer", texte: "Enregistrer le projet", action: () => void this.enregistrer(false) },
      { icone: "enregistrer", texte: "Enregistrer le projet sous…", action: () => void this.enregistrer(true) },
      null,
      { icone: "pdf", texte: "Exporter en PDF…", action: () => void this.exporterPdf() },
      { icone: "imprimer", texte: "Imprimer…", action: () => void this.imprimer() },
      { icone: "ensemble", texte: "Vue d'ensemble (toutes les pages)", coche: this.apercu.vueEnsemble, action: () => this.basculerEnsemble() },
      null,
      { icone: "appareil", texte: "Données de cet appareil…", action: () => void this.donneesAppareil() },
      { icone: "info", texte: `À propos de ${APPLICATION}`, action: () => void this.aPropos() },
    ];
    menuFlottant(ancre, "Menu", entrees);
  }

  private menuPhotos(ancre: HTMLElement) {
    menuFlottant(ancre, "Photos", [
      { icone: "auto", texte: "Remplir automatiquement…", action: () => void this.remplirAutomatiquement() },
      { icone: "ajouter", texte: "Ajouter des photos…", action: () => void this.ajouterPhotos() },
      { icone: "modeles", texte: "Essayer avec les photos modèles", action: () => void this.essayerModeles() },
    ]);
  }

  private menuDisposition(ancre: HTMLElement) {
    const n = this.projet.layouts[this.cle(this.courant)] ?? 1;
    menuFlottant(ancre, "Disposition de la page", Object.entries(NOMS_DISPOSITIONS).map(([k, texte]) => ({
      icone: "", html: iconeDisposition(Number(k)), texte, coche: Number(k) === n, action: () => this.definirDisposition(this.courant, Number(k)),
    })));
  }

  private menuPhotoPage(ancre: HTMLElement) {
    const n = this.projet.layouts[this.cle(this.courant)] ?? 1;
    const entrees: EntreeMenu[] = NOMS_EMPLACEMENTS[n].map((nom, i) => ({ icone: "photo", texte: n === 1 ? "Choisir la photo…" : `Photo ${nom}…`, action: () => this.choisirPhoto(this.courant, i) }));
    entrees.push(null, { icone: "retirer", texte: "Retirer les photos de cette page", actif: completer(this.projet.photos[this.cle(this.courant)]).some(Boolean), action: () => this.retirerPhotos(this.courant) });
    menuFlottant(ancre, "Photos de la page", entrees);
  }

  private installerClavier() {
    window.addEventListener("keydown", (e) => {
      if (document.querySelector("dialog[open]")) return;
      const saisie = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      const ctrl = e.ctrlKey || e.metaKey;
      const touche = e.key.toLowerCase();
      const actions: Record<string, () => void> = {
        o: () => void this.ouvrir(), s: () => void this.enregistrer(e.shiftKey), e: () => void this.exporterPdf(), p: () => void this.imprimer(),
        i: () => void this.ajouterPhotos(), y: () => this.retablir(), z: () => (e.shiftKey ? this.retablir() : this.annuler()),
      };
      if (ctrl && actions[touche] && !(saisie && (touche === "z" || touche === "y"))) {
        e.preventDefault();
        actions[touche]();
      } else if (!saisie && !ctrl && !e.altKey) {
        if (e.key === "PageDown") this.selectionner(this.courant + 1);
        else if (e.key === "PageUp") this.selectionner(this.courant - 1);
        else if (touche === "v") this.basculerEnsemble();
        else if (e.key === "Escape" && this.corps.dataset.feuille) this.ouvrirFeuille(null);
        else return;
        e.preventDefault();
      }
    });
  }

  /* --- Messages ------------------------------------------------------------------------------------------------ */

  message(texte: string, type: "info" | "erreur" | "succes" = "info", duree = 8000) {
    this.messageEtat.textContent = texte;
    this.messageEtat.className = `message ${type === "info" ? "" : type}`;
    clearTimeout(this.minuterieMessage);
    if (duree) this.minuterieMessage = window.setTimeout(() => (this.messageEtat.textContent = ""), duree);
  }

  private erreur(e: unknown, contexte: string) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(e);
    void informer("Erreur", `${contexte} :\n${m}`);
  }

  /** Indique un travail en cours (curseur d'attente, roue dans la barre d'état). */
  private async avecAttente<T>(f: () => Promise<T>): Promise<T> {
    this.occupe++;
    this.attente.hidden = false;
    document.body.classList.add("occupe");
    try {
      return await f();
    } finally {
      if (--this.occupe === 0) {
        this.attente.hidden = true;
        document.body.classList.remove("occupe");
      }
    }
  }

  /* --- État ---------------------------------------------------------------------------------------------------- */

  cle(index: number): string {
    return clePage(this.projet.reglages, index);
  }

  nombrePages(): number {
    return pagesDu(this.projet.reglages).length;
  }

  titrePage(index: number): string {
    return titrePage(this.projet.reglages, index);
  }

  /** « Mars 2027 », ou « Mars 2027 (en haut à droite) ». */
  titreEmplacement(index: number, emplacement: number): string {
    const n = this.projet.layouts[this.cle(index)] ?? 1;
    const titre = this.titrePage(index);
    return n > 1 ? `${titre} (${NOMS_EMPLACEMENTS[n][emplacement]})` : titre;
  }

  donnees(masquerVides = false): DonneesRendu | null {
    if (!this.polices || this.styleCharge !== this.projet.reglages.font) {
      void this.chargerPolices();
      if (!this.polices) return null;
    }
    const p = this.projet;
    return {
      reglages: p.reglages, photos: p.photos, layouts: p.layouts, crops: p.crops, masquerVides, polices: this.polices,
      dimensions: (id) => this.bibliotheque.dimensions(id),
    };
  }

  private chargementPolices: Promise<void> | null = null;

  private chargerPolices(): Promise<void> {
    const style = this.projet.reglages.font;
    if (this.styleCharge === style && this.polices) return Promise.resolve();
    this.chargementPolices ??= chargerPolices(style).then((p) => {
      this.chargementPolices = null;
      if (this.projet.reglages.font !== style) return void this.chargerPolices();
      this.polices = p;
      this.styleCharge = style;
      this.apercu.dessiner();
      this.cartes.mettreAJour();
    }, (e) => {
      this.chargementPolices = null;
      this.message(`Police introuvable : ${e instanceof Error ? e.message : e}`, "erreur", 0);
    });
    return this.chargementPolices;
  }

  /** Met à jour vignettes et aperçu après un changement, et note l'état (annuler, sauvegarde automatique). */
  rafraichir() {
    const nombre = this.nombrePages();
    this.courant = Math.max(0, Math.min(this.courant, nombre - 1));
    this.panneau.synchroniser(this.projet.reglages);
    this.cartes.mettreAJour();
    this.apercu.dessiner();
    this.etiquettePage.textContent = `${this.titrePage(this.courant)} · page ${this.courant + 1} sur ${nombre}`;
    const photos = completer(this.projet.photos[this.cle(this.courant)]).slice(0, this.projet.layouts[this.cle(this.courant)] ?? 1);
    this.boutons.recadrer.disabled = !photos.some(Boolean);
    this.boutons.precedente.disabled = this.courant === 0;
    this.boutons.suivante.disabled = this.courant === nombre - 1;
    this.noterEtat();
    this.mettreAJourTitre();
  }

  private mettreAJourTitre() {
    const nom = this.nomFichier ?? "Nouveau calendrier";
    const modifie = this.estModifie();
    document.title = `${modifie ? "• " : ""}${nom} — ${APPLICATION}`;
    this.boutons.annuler.disabled = !this.pileAnnuler.length;
    this.boutons.retablir.disabled = !this.pileRetablir.length;
  }

  private estModifie(): boolean {
    return etatProjet(this.projet) !== this.etatEnregistre;
  }

  selectionner(index: number) {
    const avant = this.courant;
    this.courant = Math.max(0, Math.min(this.nombrePages() - 1, index));
    if (avant !== this.courant) this.rafraichir();
  }

  /* --- Vue d'ensemble -------------------------------------------------------------------------------------------- */

  basculerEnsemble(valeur = !this.apercu.vueEnsemble) {
    this.apercu.vueEnsemble = valeur;
    for (const k of ["ensemble", "ensembleBas"]) this.boutons[k].setAttribute("aria-pressed", String(valeur));
    this.ouvrirFeuille(null);
  }

  ouvrirDepuisEnsemble(index: number) {
    this.basculerEnsemble(false);
    this.selectionner(index);
    this.rafraichir();
    this.apercu.focus();
  }

  /* --- Annuler / rétablir ---------------------------------------------------------------------------------------- */

  /** Empile l'état précédent si le projet a changé depuis le dernier affichage (_record_state). */
  private noterEtat() {
    const etat = etatProjet(this.projet);
    if (this.dernierEtat !== null && etat !== this.dernierEtat) {
      // Les lettres d'un même titre forment une seule étape d'annulation.
      const frappe = seulLeTitreChange(this.dernierEtat, etat);
      if (!(frappe && this.frappeEnCours)) {
        this.pileAnnuler.push(this.dernierEtat);
        this.pileAnnuler.splice(0, Math.max(0, this.pileAnnuler.length - MAX_ANNULATIONS));
      }
      this.frappeEnCours = frappe;
      this.pileRetablir = [];
      this.sauvegarderBientot();
    }
    this.dernierEtat = etat;
  }

  /** Frappe du titre en cours : une seule étape d'annulation pour tout le mot. */
  private frappeEnCours = false;

  private reinitialiserHistorique() {
    this.pileAnnuler = [];
    this.pileRetablir = [];
    this.dernierEtat = null;
    this.frappeEnCours = false;
  }

  private appliquerEtat(etat: string) {
    this.projet = analyserProjet(JSON.parse(etat));
    this.dernierEtat = etat;
    this.frappeEnCours = false;
    this.rafraichir();
    this.sauvegarderBientot();
  }

  annuler() {
    const etat = this.pileAnnuler.pop();
    if (etat === undefined) return;
    this.pileRetablir.push(this.dernierEtat!);
    this.appliquerEtat(etat);
    this.message("Modification annulée (Ctrl+Y pour la rétablir).", "info", 3000);
  }

  retablir() {
    const etat = this.pileRetablir.pop();
    if (etat === undefined) return;
    this.pileAnnuler.push(this.dernierEtat!);
    this.appliquerEtat(etat);
    this.message("Modification rétablie.", "info", 3000);
  }

  /* --- Réglages ------------------------------------------------------------------------------------------------ */

  private changerReglages(modif: Partial<Reglages>) {
    Object.assign(this.projet.reglages, modif);
    if (modif.font !== undefined) void this.chargerPolices();
    this.rafraichir();
  }

  private async modifierEvenements() {
    this.ouvrirFeuille(null);
    const evenements = await gererEvenements(this.projet.reglages.events, this.projet.reglages.year);
    if (!evenements) return;
    this.projet.reglages.events = evenements as Evenement[];
    if (evenements.length && !this.projet.reglages.show_events) this.projet.reglages.show_events = true;
    this.rafraichir();
    this.message(`${pluriel(evenements.length, "anniversaire ou événement", "anniversaires et événements")} dans le calendrier.`, "info", 5000);
  }

  /* --- Photos -------------------------------------------------------------------------------------------------- */

  private photoA(index: number, emplacement: number): string | null {
    return completer(this.projet.photos[this.cle(index)])[emplacement];
  }

  private placerPhoto(index: number, emplacement: number, id: string | null) {
    const cle = this.cle(index);
    const photos = completer(this.projet.photos[cle]);
    if (photos[emplacement] !== id) this.placerRecadrage(index, emplacement, null); // nouvelle photo : cadrage par défaut
    photos[emplacement] = id;
    if (photos.some(Boolean)) this.projet.photos[cle] = photos;
    else delete this.projet.photos[cle];
  }

  private placerRecadrage(index: number, emplacement: number, recadrage: Recadrage | null) {
    const cle = this.cle(index);
    const recadrages = completer(this.projet.crops[cle]);
    recadrages[emplacement] = recadrage;
    if (recadrages.some(Boolean)) this.projet.crops[cle] = recadrages;
    else delete this.projet.crops[cle];
  }

  /** Emplacements de photo de toutes les pages, dans l'ordre : [page, emplacement]. */
  private positions(): [number, number][] {
    const r: [number, number][] = [];
    for (let i = 0; i < this.nombrePages(); i++) for (let s = 0; s < (this.projet.layouts[this.cle(i)] ?? 1); s++) r.push([i, s]);
    return r;
  }

  /** Lit des photos choisies (empreinte, date, dimensions) avec l'avancement dans la barre d'état. */
  private async importer(fichiers: FichierAImporter[]): Promise<PhotoMemoire[]> {
    if (!fichiers.length) return [];
    return this.avecAttente(async () => {
      const r = await importerPhotos(fichiers, this.bibliotheque, (fait, total) => this.message(`Lecture des photos : ${fait} sur ${total}…`, "info", 0));
      this.message("");
      if (r.refusees.length) {
        await informer("Photos non importées", `${pluriel(r.refusees.length, "photo n'a", "photos n'ont")} pas pu être lue${r.refusees.length > 1 ? "s" : ""} :\n\n${r.refusees.slice(0, 12).map(([nom, raison]) => `• ${nom} — ${raison}`).join("\n")}${r.refusees.length > 12 ? `\n• … et ${r.refusees.length - 12} autre(s)` : ""}`);
      }
      if (r.horsStockage) this.message("Attention : des photos n'ont pas pu être gardées sur cet appareil (espace plein ?). Enregistrez le projet dans un fichier.", "erreur", 15000);
      return r.photos;
    });
  }

  /**
   * Prévient si des photos à placer sont déjà dans le calendrier (ou en double dans la sélection) (_check_duplicates).
   * remplacees : emplacements qui vont être remplacés, donc non comptés. Renvoie les photos à placer, ou null.
   */
  private async verifierDoublons(photos: PhotoMemoire[], remplacees: [number, number][] = []): Promise<PhotoMemoire[] | null> {
    const exclus = new Set(remplacees.map(([i, s]) => `${i},${s}`));
    const utilisees = this.positions().filter(([i, s]) => !exclus.has(`${i},${s}`)).map(([i, s]) => [i, s, this.photoA(i, s)] as const).filter(([, , id]) => id);
    const doublons: [PhotoMemoire, string][] = [];
    const acceptees: PhotoMemoire[] = [];
    for (const p of photos) {
      const deja = utilisees.find(([, , id]) => id === p.id);
      let ou = deja ? this.titreEmplacement(deja[0], deja[1]) : null;
      if (!ou && acceptees.some((a) => a.id === p.id)) ou = "déjà dans cette sélection";
      if (ou) doublons.push([p, ou]);
      else acceptees.push(p);
    }
    if (!doublons.length) return photos;
    let lignes = doublons.slice(0, 12).map(([p, ou]) => `• ${p.nom} — ${ou}`).join("\n");
    if (doublons.length > 12) lignes += `\n• … et ${doublons.length - 12} autre(s)`;
    const seule = photos.length === 1;
    const texte = `${seule ? "Cette photo est déjà dans le calendrier :" : `${doublons.length} photo(s) sur ${photos.length} sont déjà dans le calendrier :`}\n\n${lignes}\n\n(Une copie identique sous un autre nom compte aussi.)`;
    const boutons: { valeur: "ignorer" | "utiliser" | "annuler"; texte: string; principal?: boolean }[] = [
      { valeur: "annuler", texte: "Annuler", principal: seule },
      { valeur: "utiliser", texte: "Utiliser quand même" },
    ];
    if (!seule) boutons.push({ valeur: "ignorer", texte: "Ignorer ces photos", principal: true });
    const choix = await choisir("Photo déjà utilisée", texte, boutons);
    if (choix === "utiliser") return photos;
    if (choix === "ignorer") return acceptees;
    return null;
  }

  definirDisposition(index: number, nombre: number) {
    this.projet.layouts[this.cle(index)] = nombre;
    this.courant = index;
    this.rafraichir();
  }

  async choisirPhoto(index: number, emplacement: number) {
    this.ouvrirFeuille(null);
    const [fichier] = await choisirFichiers(IMAGES);
    if (!fichier) return;
    const [photo] = await this.importer([depuisFichier(fichier)]);
    if (!photo) return;
    if (!(await this.verifierDoublons([photo], [[index, emplacement]]))) return;
    this.placerPhoto(index, emplacement, photo.id);
    this.courant = index;
    this.rafraichir();
  }

  retirerPhotos(index: number) {
    delete this.projet.photos[this.cle(index)];
    delete this.projet.crops[this.cle(index)];
    this.courant = index;
    this.rafraichir();
  }

  /** Une photo déposée va à l'emplacement visé ; plusieurs remplissent les suivants (drop_photos). */
  async deposer(index: number, emplacement: number, fichiers: File[]) {
    const photos = await this.importer(fichiers.map(depuisFichier));
    if (!photos.length) return;
    const positions = this.positions();
    const debut = positions.findIndex(([i, s]) => i === index && s === emplacement);
    const cibles = positions.slice(Math.max(0, debut));
    const retenues = await this.verifierDoublons(photos, cibles.slice(0, photos.length));
    if (!retenues?.length) return;
    retenues.forEach((p, k) => {
      if (k < cibles.length) this.placerPhoto(cibles[k][0], cibles[k][1], p.id);
    });
    this.courant = index;
    this.rafraichir();
  }

  /** Remplit les mois vides dans l'ordre, puis remplace (add_photos) ; la couverture n'est pas modifiée. */
  async ajouterPhotos() {
    this.ouvrirFeuille(null);
    const fichiers = await choisirFichiers(IMAGES, true);
    const photos = await this.importer(fichiers.map(depuisFichier));
    if (!photos.length) return;
    const positions = this.positions().filter(([i]) => this.cle(i) !== "cover");
    const vides = positions.filter(([i, s]) => this.photoA(i, s) === null);
    const ordre = [...vides, ...positions.filter((p) => !vides.includes(p))];
    const retenues = await this.verifierDoublons(photos, ordre.slice(0, photos.length));
    if (!retenues?.length) return;
    retenues.forEach((p, k) => {
      if (k < ordre.length) this.placerPhoto(ordre[k][0], ordre[k][1], p.id);
    });
    let message = `${pluriel(Math.min(retenues.length, positions.length), "photo placée", "photos placées")}.`;
    if (retenues.length > positions.length) message += ` ${pluriel(retenues.length - positions.length, "photo en trop ignorée", "photos en trop ignorées")}.`;
    this.rafraichir();
    this.message(message, "succes", 6000);
  }

  async remplirAutomatiquement(fichiersDonnes?: FichierAImporter[]) {
    this.ouvrirFeuille(null);
    // La fenêtre de choix des fichiers s'ouvre tout de suite (Safari exige qu'elle suive directement le clic).
    const fichiers = fichiersDonnes ?? (await choisirFichiers(IMAGES, true)).map(depuisFichier);
    if (!fichiers.length) return;
    const cles = Array.from({ length: this.nombrePages() }, (_, i) => this.cle(i)).filter((c) => c !== "cover");
    if (cles.some((c) => this.projet.photos[c]) && !(await confirmer("Remplacer les photos des mois ?",
      "Des mois ont déjà des photos. Elles seront remplacées (la couverture est conservée).\n\nContinuer ?", "Remplacer"))) return;
    let photos = await this.importer(fichiers);
    if (!photos.length) return;
    // Les photos des mois sont remplacées : seule la couverture peut déjà contenir une photo importée.
    const retenues = await this.verifierDoublons(photos, this.positions().filter(([i]) => this.cle(i) !== "cover"));
    if (!retenues?.length) return;
    photos = retenues;
    const plan = planifierMois(photos.map((p) => ({ id: p.id, date: p.date, source: p.source, portrait: p.hauteur > p.largeur })), cles.length, aspectsCadres(this.projet.reglages.format));
    for (const c of cles) {
      delete this.projet.photos[c];
      delete this.projet.crops[c];
      delete this.projet.layouts[c];
    }
    plan.groupes.forEach((groupe, k) => {
      this.projet.photos[cles[k]] = completer(groupe);
      this.projet.layouts[cles[k]] = groupe.length;
    });
    this.courant = this.projet.reglages.cover ? 1 : 0;
    this.basculerEnsemble(false);
    this.rafraichir();

    const premier = plan.infos[0].date;
    const dernier = plan.infos[plan.infos.length - 1].date;
    const message = `${photos.length - plan.ecartees.length} photo(s) réparties sur ${plan.groupes.length} mois, de la plus ancienne (${dateCourte(premier)}) à la plus récente (${dateCourte(dernier)}).`;
    const details: string[] = [];
    const tailles = plan.groupes.map((g) => g.length);
    const dispositions = [1, 2, 3, 4].filter((k) => tailles.includes(k)).map((k) => `${tailles.filter((t) => t === k).length} page(s) en disposition ${k}`).join(", ");
    details.push(`Dispositions choisies pour utiliser le plus de photos possible : ${dispositions}. Chaque page reste modifiable depuis sa vignette.`);
    const seuls = plan.groupes.filter((g) => g.length === 2 && g[1] === null).length;
    if (seuls) details.push(`${seuls} portrait(s) seul(s) sur leur page : placé(s) à gauche de la disposition 2, le cadre de droite reste libre pour une autre photo.`);
    if (plan.ecartees.length) details.push(`${plan.ecartees.length} photo(s) non utilisée(s) : il y a plus de photos que de places (${cles.length} mois, ${MAX_EMPLACEMENTS} photos au plus par page). Les photos retenues couvrent toute la période.`);
    if (plan.groupes.length < cles.length) details.push(`${cles.length - plan.groupes.length} mois restent sans photo.`);
    const duFichier = plan.infos.filter((p) => p.source === "fichier").length;
    if (duFichier) details.push(`${duFichier} photo(s) sans date de prise de vue : c'est la date de modification du fichier qui a servi au classement.`);
    this.message(message, "succes", 10000);
    await informer("Remplissage automatique", [message, ...details].join("\n\n"));
  }

  async essayerModeles() {
    this.ouvrirFeuille(null);
    let fichiers: FichierAImporter[];
    try {
      fichiers = await this.avecAttente(() => photosModeles((fait, total) => this.message(`Photos modèles : ${fait} sur ${total}…`, "info", 0)));
    } catch (e) {
      this.erreur(e, "Photos modèles indisponibles");
      return;
    }
    await this.remplirAutomatiquement(fichiers);
  }

  /** Ouvre l'outil de recadrage (ou le choix d'une photo si l'emplacement est vide) (crop_photo). */
  async recadrer(index: number, emplacement: number) {
    if (document.querySelector("dialog[open]")) return;
    const id = this.photoA(index, emplacement);
    if (!id) {
      await this.choisirPhoto(index, emplacement);
      return;
    }
    const photo = this.bibliotheque.photos.get(id);
    const d = this.donnees();
    if (!photo || !d) {
      await informer("Photo introuvable", "Impossible de lire cette photo.");
      return;
    }
    const ratio = rapportPage(this.projet.reglages.format);
    const cadre = cadresPhotos(d, index, 1000, 1000 * ratio)[emplacement];
    const recadrage = await recadrer(
      { image: () => this.bibliotheque.image(id, 2048), largeur: photo.largeur, hauteur: photo.hauteur },
      cadre.w / cadre.h, completer(this.projet.crops[this.cle(index)])[emplacement], this.titreEmplacement(index, emplacement),
      (f) => {
        const avant = this.bibliotheque.surImage;
        this.bibliotheque.surImage = () => {
          avant();
          f();
        };
        return () => (this.bibliotheque.surImage = avant);
      },
    );
    if (!recadrage) return;
    this.placerRecadrage(index, emplacement, recadrage);
    this.courant = index;
    this.rafraichir();
  }

  private recadrerDepuisBouton(ancre: HTMLElement) {
    const index = this.courant;
    const n = this.projet.layouts[this.cle(index)] ?? 1;
    const remplis = completer(this.projet.photos[this.cle(index)]).slice(0, n).map((id, s) => (id ? s : -1)).filter((s) => s >= 0);
    if (remplis.length === 1) {
      void this.recadrer(index, remplis[0]);
      return;
    }
    menuFlottant(ancre, "Recadrer une photo", remplis.map((s) => ({ icone: "recadrer", texte: `Photo ${NOMS_EMPLACEMENTS[n][s]}`, action: () => void this.recadrer(index, s) })));
  }

  /* --- Projet -------------------------------------------------------------------------------------------------- */

  /** Propose d'enregistrer les changements ; false si l'utilisateur annule (maybe_save). */
  private async peutRemplacer(): Promise<boolean> {
    if (!this.estModifie()) return true;
    const choix = await choisir("Projet non enregistré",
      "Le calendrier a été modifié depuis son dernier enregistrement dans un fichier de projet. Il est gardé automatiquement sur cet appareil, mais l'ouverture d'un autre calendrier le remplacera.\n\nVoulez-vous d'abord l'enregistrer dans un fichier, pour pouvoir le reprendre plus tard ?",
      [{ valeur: "annuler", texte: "Annuler" }, { valeur: "non", texte: "Ne pas enregistrer" }, { valeur: "oui", texte: "Enregistrer", principal: true }]);
    if (choix === "oui") return this.enregistrer(false);
    return choix === "non";
  }

  private remplacerProjet(projet: Projet, nomFichier: string | null, poignee: FileSystemFileHandle | null) {
    this.projet = projet;
    this.nomFichier = nomFichier;
    this.poignee = poignee;
    this.courant = 0;
    this.reinitialiserHistorique();
    this.basculerEnsemble(false);
    this.etatEnregistre = etatProjet(projet);
    this.rafraichir();
    this.sauvegarderBientot();
    void this.nettoyerStockage();
  }

  async nouveau() {
    if (!(await this.peutRemplacer())) return;
    this.bibliotheque.vider();
    this.remplacerProjet(projetVide(), null, null);
    this.message("Nouveau calendrier.", "info", 4000);
  }

  async ouvrir() {
    if (!(await this.peutRemplacer())) return;
    const [fichier] = await choisirFichiers(PROJETS);
    if (fichier) await this.ouvrirFichier(fichier, null);
  }

  /** Ouvre un projet : archive .calendrier, ou projet .calendrier.json de la version Windows. */
  async ouvrirFichier(fichier: File, poignee: FileSystemFileHandle | null) {
    try {
      if (/\.json$/i.test(fichier.name)) {
        await this.ouvrirProjetWindows(fichier);
        return;
      }
      await this.avecAttente(async () => {
        const { donnees, photos } = await lireProjet(fichier);
        // Chaque photo de l'archive est lue et gardée sur l'appareil, puis désignée par son empreinte.
        const parChemin = new Map<string, string>();
        const refusees: string[] = [];
        let k = 0;
        for (const [chemin, f] of photos) {
          this.message(`Ouverture du projet : photo ${++k} sur ${photos.size}…`, "info", 0);
          const r = await importerPhotos([{ nom: f.nom, modifie: f.modifie, donnees: await f.lire() }], this.bibliotheque);
          if (r.photos[0]) parChemin.set(chemin, r.photos[0].id);
          else refusees.push(f.nom);
        }
        const projet = analyserProjet(donnees, (ref) => parChemin.get(ref) ?? null);
        this.remplacerProjet(projet, fichier.name, poignee);
        const manquantes = [...photosUtilisees(analyserProjet(donnees))].filter((ref) => !parChemin.has(ref)).map(nomDeFichier);
        this.message(`Projet ouvert : ${fichier.name}`, "succes", 5000);
        if (manquantes.length) {
          await informer("Photos introuvables", `${pluriel(manquantes.length, "photo du projet est introuvable", "photos du projet sont introuvables")} ou illisible${manquantes.length > 1 ? "s" : ""} :\n\n${manquantes.slice(0, 10).map((n) => `• ${n}`).join("\n")}`);
        }
      });
    } catch (e) {
      this.erreur(e, "Impossible d'ouvrir le projet");
    }
  }

  /** Projet de la version Windows : les photos sont désignées par leur chemin sur le PC ; on les fait choisir. */
  private async ouvrirProjetWindows(fichier: File) {
    const donnees = JSON.parse(await fichier.text());
    analyserProjet(donnees, () => null); // vérifie qu'il est lisible
    const references = [...new Set(Object.values((donnees.photos ?? {}) as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((r): r is string => typeof r === "string" && !!r))];
    const parNom = new Map<string, string>();
    if (references.length) {
      const choix = await choisir("Projet de la version Windows",
        `Ce projet a été créé avec Calendrier Photo pour Windows. Ses ${pluriel(references.length, "photo est désignée", "photos sont désignées")} par leur emplacement sur l'ordinateur (par exemple « ${references[0]} »), que le navigateur ne peut pas lire.\n\nChoisissez ces photos (vous pouvez toutes les sélectionner d'un coup) : elles seront remises à leur place d'après leur nom.`,
        [{ valeur: "annuler", texte: "Annuler" }, { valeur: "sans", texte: "Ouvrir sans les photos" }, { valeur: "choisir", texte: "Choisir les photos…", principal: true }]);
      if (!choix || choix === "annuler") return;
      if (choix === "choisir") {
        const photos = await this.importer((await choisirFichiers(IMAGES, true)).map(depuisFichier));
        for (const p of photos) parNom.set(p.nom.toLowerCase(), p.id);
      }
    }
    const projet = analyserProjet(donnees, (ref) => parNom.get(nomDeFichier(ref).toLowerCase()) ?? null);
    this.remplacerProjet(projet, fichier.name.replace(/\.json$/i, "").replace(/\.calendrier$/i, "") + ".calendrier", null);
    this.etatEnregistre = ""; // pas encore enregistré au format de la version web
    this.mettreAJourTitre();
    const retrouvees = references.filter((r) => parNom.has(nomDeFichier(r).toLowerCase()));
    if (references.length) {
      const manquantes = references.filter((r) => !retrouvees.includes(r)).map(nomDeFichier);
      await informer("Projet ouvert", `${retrouvees.length} photo(s) sur ${references.length} retrouvée(s).${manquantes.length ? `\n\nIntrouvables :\n${manquantes.slice(0, 10).map((n) => `• ${n}`).join("\n")}${manquantes.length > 10 ? `\n• … et ${manquantes.length - 10} autre(s)` : ""}` : ""}\n\nEnregistrez le projet (Ctrl+S) : le fichier .calendrier contiendra les photos.`);
    }
  }

  /** Enregistre le projet dans un fichier .calendrier ; sous : toujours demander où. Renvoie false si annulé. */
  async enregistrer(sous: boolean): Promise<boolean> {
    try {
      return await this.avecAttente(async () => {
        this.message("Préparation du fichier de projet…", "info", 0);
        const archive = await ecrireProjet(this.projet, (id) => this.bibliotheque.photos.get(id), `${APPLICATION} ${VERSION}`);
        const nom = this.nomFichier ?? `Calendrier ${this.projet.reglages.year}.calendrier`;
        const ecrit = await enregistrerFichier(archive, nom, "Projet de calendrier", "application/zip", ".calendrier", sous ? null : this.poignee);
        if (ecrit === undefined) {
          this.message("");
          return false;
        }
        this.poignee = ecrit;
        this.nomFichier = ecrit?.name ?? nom;
        this.etatEnregistre = etatProjet(this.projet);
        this.mettreAJourTitre();
        this.sauvegarderBientot();
        this.message(`Projet enregistré : ${this.nomFichier} (${tailleLisible(archive.size)})${ecrit ? "" : ", dans le dossier des téléchargements"}.`, "succes", 8000);
        return true;
      });
    } catch (e) {
      this.erreur(e, "Impossible d'enregistrer le projet");
      return false;
    }
  }

  /* --- Sauvegarde automatique ------------------------------------------------------------------------------------ */

  private sauvegarderBientot() {
    clearTimeout(this.minuterieSauvegarde);
    this.minuterieSauvegarde = window.setTimeout(() => void this.sauvegarderMaintenant(), 700);
  }

  /** Copie du projet dans le stockage du navigateur (les photos y sont écrites dès leur import). */
  async sauvegarderMaintenant() {
    clearTimeout(this.minuterieSauvegarde);
    if (!this.sauvegardeActive) return;
    const etat = etatProjet(this.projet);
    const cle = `${etat}|${this.nomFichier}|${this.etatEnregistre === etat}`;
    if (cle === this.derniereSauvegarde) return;
    const sauvegarde: SauvegardeProjet = {
      projet: donneesProjet(this.projet), nomFichier: this.nomFichier, etatEnregistre: this.etatEnregistre === etat ? etat : null, enregistreLe: new Date().toISOString(),
    };
    try {
      await ecrireSauvegarde(sauvegarde);
      this.derniereSauvegarde = cle;
      const t = new Date();
      this.indicateur.innerHTML = `${icone("coche")}<span>Gardé sur cet appareil à ${deux(t.getHours())} h ${deux(t.getMinutes())}</span>`;
      this.indicateur.classList.remove("erreur");
    } catch (e) {
      console.warn("Sauvegarde automatique impossible", e);
      this.indicateur.textContent = "Sauvegarde automatique impossible (stockage du navigateur indisponible ou plein)";
      this.indicateur.classList.add("erreur");
    }
  }

  /** Retire du stockage les photos qui ne servent plus (ni au projet, ni à annuler ou rétablir). */
  private async nettoyerStockage() {
    try {
      const utiles = photosUtilisees(this.projet);
      for (const etat of [...this.pileAnnuler, ...this.pileRetablir]) for (const id of photosUtilisees(analyserProjet(JSON.parse(etat)))) utiles.add(id);
      for (const id of await idsDesPhotos()) {
        if (utiles.has(id)) continue;
        await supprimerPhoto(id);
        this.bibliotheque.retirer(id);
      }
    } catch (e) {
      console.warn("Nettoyage du stockage impossible", e);
    }
  }

  /** Au lancement : propose de reprendre le calendrier gardé sur cet appareil (check_recovery). */
  async demarrer() {
    void this.chargerPolices();
    let sauvegarde: SauvegardeProjet | undefined;
    try {
      sauvegarde = await lireSauvegarde();
    } catch (e) {
      console.warn("Stockage du navigateur indisponible", e);
      this.indicateur.textContent = "Sauvegarde automatique indisponible dans ce navigateur (navigation privée ?) : enregistrez le projet dans un fichier.";
      this.indicateur.classList.add("erreur");
      return;
    }
    if (sauvegarde) {
      let projet: Projet | null = null;
      try {
        projet = analyserProjet(sauvegarde.projet);
      } catch (e) {
        console.warn("Sauvegarde illisible", e);
      }
      const vide = projet && etatProjet(projet) === etatProjet({ ...projetVide(), reglages: { ...projetVide().reglages, year: projet.reglages.year } });
      if (projet && !vide) {
        const date = new Date(sauvegarde.enregistreLe);
        const nombre = photosUtilisees(projet).size;
        const nom = sauvegarde.nomFichier ?? projet.reglages.title;
        const choix = await choisir("Reprendre le calendrier ?",
          `Un calendrier en cours a été retrouvé sur cet appareil : « ${nom} » (${pluriel(nombre, "photo")}, gardé automatiquement le ${deux(date.getDate())}/${deux(date.getMonth() + 1)}/${date.getFullYear()} à ${deux(date.getHours())} h ${deux(date.getMinutes())}).\n\nVoulez-vous le reprendre ? Commencer un nouveau calendrier l'effacera de cet appareil.`,
          [{ valeur: "effacer", texte: "Commencer un nouveau calendrier", danger: true }, { valeur: "reprendre", texte: "Reprendre", principal: true }]);
        if (choix !== "effacer") {
          await this.avecAttente(async () => {
            const ids = [...photosUtilisees(projet!)];
            for (const [k, id] of ids.entries()) {
              const p = await lirePhoto(id);
              if (p) this.bibliotheque.ajouter(p);
              this.message(`Reprise : photo ${k + 1} sur ${ids.length}…`, "info", 0);
            }
          });
          this.projet = projet;
          this.nomFichier = sauvegarde.nomFichier;
          this.etatEnregistre = sauvegarde.etatEnregistre ?? "";
          this.courant = 0;
          this.reinitialiserHistorique();
          this.rafraichir();
          this.message("Calendrier repris.", "succes", 5000);
        } else {
          await effacerTout().catch(() => undefined);
        }
      }
    }
    this.sauvegardeActive = true;
    void this.nettoyerStockage();
    void this.sauvegarderMaintenant();
  }

  async donneesAppareil() {
    const f = fenetre("Données de cet appareil");
    const place = await placeOccupee().catch(() => null);
    let nombre = 0;
    try {
      nombre = (await idsDesPhotos()).length;
    } catch {
      /* stockage indisponible */
    }
    f.corps.append(paragraphes(
      `Le calendrier en cours et ses photos sont gardés automatiquement dans ce navigateur, sur cet appareil seulement : rien n'est envoyé sur Internet. Ils y restent quand vous fermez l'onglet, pour reprendre plus tard.\n\n` +
      `${pluriel(nombre, "photo gardée", "photos gardées")}${place ? `, ${tailleLisible(place.utilise)} utilisés sur ${tailleLisible(place.quota)} disponibles pour ce site` : ""}.\n\n` +
      `Pour garder le calendrier durablement ou le reprendre sur un autre appareil, enregistrez-le dans un fichier de projet (.calendrier). Certains navigateurs (Safari) effacent les données d'un site après quelques semaines sans visite.`));
    f.pied.append(
      el("button", { type: "button", class: "bouton cadre danger", text: "Effacer les données de cet appareil", onclick: async () => {
        f.fermer();
        if (!(await confirmer("Effacer les données de cet appareil ?", "Le calendrier en cours et toutes ses photos seront effacés de ce navigateur. Les fichiers de projet que vous avez enregistrés ne sont pas touchés.\n\nCette opération est définitive.", "Effacer", { danger: true }))) return;
        this.sauvegardeActive = false;
        await effacerTout();
        this.bibliotheque.vider();
        this.remplacerProjet(projetVide(), null, null);
        this.derniereSauvegarde = "";
        this.sauvegardeActive = true;
        this.indicateur.textContent = "Données de cet appareil effacées";
        this.message("Les données de cet appareil ont été effacées.", "succes", 6000);
      } }),
      el("button", { type: "button", class: "bouton principal", text: "Fermer", onclick: () => f.fermer() }),
    );
  }

  /* --- Export et impression --------------------------------------------------------------------------------------- */

  /** Signale les pages sans aucune photo ; false si l'utilisateur renonce (_confirm_missing). */
  private async pagesSansPhoto(action: string): Promise<boolean> {
    const vides = Array.from({ length: this.nombrePages() }, (_, i) => i).filter((i) => {
      const n = this.projet.layouts[this.cle(i)] ?? 1;
      return !completer(this.projet.photos[this.cle(i)]).slice(0, n).some(Boolean);
    });
    if (!vides.length) return true;
    return confirmer("Pages sans photo", `Ces pages n'ont aucune photo :\n${vides.map((i) => `• ${this.titrePage(i)}`).join("\n")}\n\nLes cadres vides ne sont pas imprimés : ces pages n'auront que leur calendrier.\n\n${action} quand même ?`, action);
  }

  /** Fenêtre d'avancement avec un bouton Annuler. */
  private fenetreAvancement(titre: string) {
    const f = fenetre(titre, { fermable: false });
    const barre = el("div", { class: "barre-progression" }, el("div"));
    const texte = el("p", { class: "aide", "aria-live": "polite" });
    let annule = false;
    f.corps.append(barre, texte);
    const bouton = el("button", { type: "button", class: "bouton cadre", text: "Annuler", onclick: () => {
      annule = true;
      bouton.disabled = true;
      texte.textContent = "Annulation…";
    } });
    f.pied.append(bouton);
    return {
      avancer: (fait: number, total: number, libelle: string) => {
        (barre.firstElementChild as HTMLElement).style.width = `${(100 * fait) / total}%`;
        texte.textContent = libelle;
      },
      annule: () => annule,
      fermer: () => f.fermer(),
    };
  }

  async exporterPdf() {
    this.ouvrirFeuille(null);
    if (!(await this.pagesSansPhoto("Exporter"))) return;
    const nom = `${(this.nomFichier ?? `Calendrier ${this.projet.reglages.year}`).replace(/\.calendrier$/i, "")}.pdf`;
    // Avec Chrome et Edge, le fichier est choisi d'abord (la fenêtre du système exige un clic récent).
    const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> };
    let poignee: FileSystemFileHandle | null = null;
    if (w.showSaveFilePicker) {
      try {
        poignee = await w.showSaveFilePicker({ suggestedName: nom, types: [{ description: "Fichier PDF", accept: { "application/pdf": [".pdf"] } }] });
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    const suivi = this.fenetreAvancement("Création du PDF");
    const illisibles: string[] = [];
    const debut = performance.now();
    let pdf: Uint8Array;
    try {
      // pdf-lib n'est chargé qu'au premier export : le site s'ouvre plus vite.
      const { exporterPdf } = await import("../export/export");
      pdf = await this.avecAttente(() => exporterPdf(this.projet, (id) => this.bibliotheque.photos.get(id), this.projet.reglages.title, `${APPLICATION} ${VERSION}`, {
        avancement: (fait, total) => suivi.avancer(fait, total, `Page ${fait} sur ${total}…`),
        annule: suivi.annule,
        illisible: (n) => illisibles.push(n),
      }));
    } catch (e) {
      suivi.fermer();
      if ((e as Error).name === "AbortError") this.message("Export annulé.", "info", 4000);
      else this.erreur(e, "Impossible de créer le PDF");
      return;
    }
    suivi.fermer();
    const blob = new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
    let ou = "dans le dossier des téléchargements";
    if (poignee) {
      try {
        const flux = await poignee.createWritable();
        await flux.write(blob);
        await flux.close();
        ou = `dans « ${poignee.name} »`;
      } catch (e) {
        this.erreur(e, "Impossible d'écrire le PDF");
        return;
      }
    } else telecharger(blob, nom);
    const secondes = ((performance.now() - debut) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    this.message(`PDF créé ${ou} (${tailleLisible(blob.size)}, ${secondes} s).`, "succes", 10000);
    const f = fenetre("Export terminé");
    f.corps.append(paragraphes(`Le calendrier a été créé ${ou} : ${pluriel(this.nombrePages(), "page")}, ${tailleLisible(blob.size)}.${illisibles.length ? `\n\nPhotos illisibles (cadre laissé vide) :\n${illisibles.map((n) => `• ${n}`).join("\n")}` : ""}`));
    const url = URL.createObjectURL(blob);
    f.pied.append(
      el("button", { type: "button", class: "bouton cadre", text: "Ouvrir le PDF", onclick: () => window.open(url, "_blank", "noopener") }),
      el("button", { type: "button", class: "bouton principal", text: "OK", autofocus: true, onclick: () => f.fermer() }),
    );
    await f.fermee;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async imprimer() {
    this.ouvrirFeuille(null);
    if (!(await this.pagesSansPhoto("Imprimer"))) return;
    const d = this.donnees(true);
    if (!d) return;
    const suivi = this.fenetreAvancement("Préparation de l'impression");
    let adresses: string[] | null;
    try {
      adresses = await this.avecAttente(() => preparerImpression(d, (id) => this.bibliotheque.photos.get(id), (fait, total) => suivi.avancer(fait, total, `Page ${fait} sur ${total}…`), suivi.annule));
    } catch (e) {
      suivi.fermer();
      this.erreur(e, "Impossible de préparer l'impression");
      return;
    }
    suivi.fermer();
    if (!adresses) return;
    await lancerImpression(adresses, this.projet.reglages.format);
    this.message(`${pluriel(adresses.length, "page envoyée", "pages envoyées")} à l'impression. Pour la meilleure qualité, imprimez plutôt le PDF exporté.`, "info", 10000);
  }

  async aPropos() {
    const f = fenetre(`À propos de ${APPLICATION}`);
    f.corps.append(el("div", { class: "apropos" },
      el("div", { class: "logo-apropos", html: LOGO }),
      el("p", { html: `<strong>Version ${VERSION}</strong> — ${DATE}` }),
      el("p", { text: "Création de calendriers photo : une à quatre photos par mois, remplissage automatique par date et par format, recadrage, jours fériés, vacances scolaires, numéros de semaine, anniversaires, couverture, vue d'ensemble, annulation, sauvegarde automatique sur l'appareil, export PDF et impression. Version web de Calendrier Photo pour Windows." }),
      el("p", { text: "Tout se passe dans votre navigateur : vos photos ne sont envoyées nulle part, et le site ne contient ni statistiques ni publicité." }),
      el("p", { html: `Application écrite par <strong>${AUTEUR}</strong> (${MODELE}) sous la direction de <strong>${DIRECTEUR}</strong>.` }),
      el("p", { html: `Licence MIT. Composants : pdf-lib (MIT) ; polices Open Sans, Gelasio et Kalam (SIL Open Font License). Code source : <a href="${CODE_SOURCE}" rel="noopener" target="_blank">${CODE_SOURCE.replace("https://", "")}</a>.` }),
    ));
    f.pied.append(el("button", { type: "button", class: "bouton principal", text: "Fermer", autofocus: true, onclick: () => f.fermer() }));
    await f.fermee;
  }

  /** Fichiers ouverts avec l'application installée (« Ouvrir avec ») : projet, ou photos à ajouter. */
  async ouvrirFichiersLances(fichiers: File[], poignees: FileSystemFileHandle[]) {
    const projet = fichiers.findIndex((f) => /\.(calendrier|zip|json)$/i.test(f.name));
    if (projet >= 0) {
      if (await this.peutRemplacer()) await this.ouvrirFichier(fichiers[projet], poignees[projet] ?? null);
      return;
    }
    const photos = await this.importer(fichiers.map(depuisFichier));
    if (!photos.length) return;
    const positions = this.positions().filter(([i]) => this.cle(i) !== "cover");
    const vides = positions.filter(([i, s]) => this.photoA(i, s) === null);
    const retenues = await this.verifierDoublons(photos, vides.slice(0, photos.length));
    if (!retenues?.length) return;
    retenues.slice(0, vides.length).forEach((p, k) => this.placerPhoto(vides[k][0], vides[k][1], p.id));
    this.rafraichir();
    this.message(`${pluriel(Math.min(retenues.length, vides.length), "photo ajoutée", "photos ajoutées")} aux mois vides.`, "succes", 6000);
  }

  /** Pour les essais : dimensions de la page et des cadres en unités (300 ppp). */
  geometrie() {
    const { w, h } = dimensionsUnites(this.projet.reglages.format);
    const zone = zonesPage("month", w, h, FORMATS[this.projet.reglages.format].paysage)[0];
    return { w, h, cadres: [1, 2, 3, 4].map((k) => decouperCadre(zone, k)) };
  }
}
