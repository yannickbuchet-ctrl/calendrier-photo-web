/** Panneau des réglages (_settings_panel de la version Windows) : titre, année, format, police, couleur, vacances… */
import { FORMATS } from "../logique/disposition";
import { STYLES_POLICE, type Reglages } from "../logique/reglages";
import { CHOIX_ZONES } from "../logique/vacances";
import { bouton, el } from "./dom";

export interface ActionsReglages {
  changer: (modif: Partial<Reglages>, saisie?: "titre" | "couleur") => void;
  /** Couleur en cours de choix (aperçu immédiat, sans étape d'annulation). */
  essayerCouleur: (couleur: string) => void;
  gererEvenements: () => void;
  remplirAutomatiquement: () => void;
  ajouterPhotos: () => void;
  photosModeles: () => void;
  imprimer: () => void;
  donneesAppareil: () => void;
}

export class PanneauReglages {
  readonly racine: HTMLElement;
  private readonly titre: HTMLInputElement;
  private readonly annee: HTMLSelectElement;
  private readonly format: HTMLSelectElement;
  private readonly police: HTMLSelectElement;
  private readonly couleur: HTMLInputElement;
  private readonly texteCouleur: HTMLElement;
  private readonly zone: HTMLSelectElement;
  private readonly cases: Record<"cover" | "holidays" | "weekends" | "week_numbers" | "show_events", HTMLInputElement>;
  private readonly resumeEvenements: HTMLElement;

  constructor(actions: ActionsReglages) {
    const champ = (id: string, libelle: string, controle: HTMLElement, aide?: string) =>
      el("div", { class: "champ-reglage" }, el("label", { for: id, text: libelle, title: aide ?? null }), controle);
    this.titre = el("input", { id: "reglage-titre", type: "text", autocomplete: "off", spellcheck: "true" });
    this.titre.addEventListener("input", () => actions.changer({ title: this.titre.value }, "titre"));
    this.annee = el("select", { id: "reglage-annee" });
    this.annee.addEventListener("change", () => actions.changer({ year: Number(this.annee.value) }));
    this.format = el("select", { id: "reglage-format" }, ...FORMATS.map((f, i) => el("option", { value: String(i), text: f.libelle })));
    this.format.addEventListener("change", () => actions.changer({ format: Number(this.format.value) }));
    this.police = el("select", { id: "reglage-police" }, ...STYLES_POLICE.map((p, i) => el("option", { value: String(i), text: `${p.libelle} (${p.famille})` })));
    this.police.addEventListener("change", () => actions.changer({ font: Number(this.police.value) }));
    this.couleur = el("input", { id: "reglage-couleur", type: "color", title: "Couleur des titres, des week-ends et des jours fériés" });
    this.texteCouleur = el("span", { class: "texte-couleur" });
    this.couleur.addEventListener("input", () => {
      this.texteCouleur.textContent = this.couleur.value.toUpperCase();
      actions.essayerCouleur(this.couleur.value);
    });
    this.couleur.addEventListener("change", () => actions.changer({ accent: this.couleur.value }, "couleur"));
    this.zone = el("select", { id: "reglage-vacances", title: "Vacances scolaires (France métropolitaine) : un bandeau de couleur en bas des jours de vacances. Dates officielles de l'Éducation nationale, publiées jusqu'à l'été 2028." },
      ...CHOIX_ZONES.map(([libelle, z]) => el("option", { value: z, text: libelle })));
    this.zone.addEventListener("change", () => actions.changer({ school_zone: this.zone.value }));

    const caseACocher = (cle: keyof PanneauReglages["cases"], libelle: string, aide: string) => {
      const c = el("input", { type: "checkbox", id: `reglage-${cle}` });
      c.addEventListener("change", () => actions.changer({ [cle]: c.checked }));
      return [c, el("label", { class: "case", for: `reglage-${cle}`, title: aide }, c, libelle)] as const;
    };
    const [couverture, lCouverture] = caseACocher("cover", "Couverture", "Page de couverture avec le titre et l'année");
    const [feries, lFeries] = caseACocher("holidays", "Jours fériés", "Jours fériés (France métropolitaine)");
    const [weekends, lWeekends] = caseACocher("weekends", "Week-ends colorés", "Samedis et dimanches en couleur");
    const [semaines, lSemaines] = caseACocher("week_numbers", "N° de semaine", "Numéros de semaine à gauche de la grille");
    const [evenements, lEvenements] = caseACocher("show_events", "Anniversaires", "Afficher les anniversaires et événements dans les cases des jours");
    this.cases = { cover: couverture, holidays: feries, weekends, week_numbers: semaines, show_events: evenements };
    this.resumeEvenements = el("span", { class: "aide resume-evenements" });

    this.racine = el("div", { class: "reglages" },
      champ("reglage-titre", "Titre", this.titre),
      champ("reglage-annee", "Année", this.annee),
      champ("reglage-format", "Format", this.format),
      champ("reglage-police", "Police", this.police),
      champ("reglage-couleur", "Couleur", el("span", { class: "choix-couleur" }, this.couleur, this.texteCouleur)),
      champ("reglage-vacances", "Vacances", this.zone),
      el("div", { class: "cases" }, lCouverture, lFeries, lWeekends, lSemaines),
      el("div", { class: "rangee-evenements" }, lEvenements,
        bouton("evenement", "Gérer…", () => actions.gererEvenements(), { classe: "cadre", infobulle: "Ajouter, modifier, importer ou exporter les anniversaires et événements" })),
      this.resumeEvenements,
      el("div", { class: "actions-photos" },
        bouton("auto", "Remplir automatiquement…", () => actions.remplirAutomatiquement(), {
          classe: "principal large",
          infobulle: "Sélectionnez toutes les photos des mois : elles sont classées de la plus ancienne à la plus récente, et la disposition de chaque page (1 à 4 photos) est choisie pour les utiliser toutes, en plaçant portraits et paysages dans les cadres de leur format. La couverture n'est pas modifiée.",
        }),
        bouton("ajouter", "Ajouter des photos…", () => actions.ajouterPhotos(), { classe: "cadre large", infobulle: "Sélectionnez plusieurs photos : elles remplissent les mois vides dans l'ordre (la couverture n'est pas modifiée)", raccourci: "Ctrl+I" }),
        bouton("modeles", "Essayer avec les photos modèles", () => actions.photosModeles(), { classe: "cadre large", infobulle: "36 paysages dessinés (aucune photo réelle) pour essayer l'application" }),
        bouton("imprimer", "Imprimer…", () => actions.imprimer(), { classe: "cadre large", raccourci: "Ctrl+P", infobulle: "Imprimer le calendrier ; export PDF : bouton « Exporter en PDF »" })),
      el("div", { class: "confidentialite" },
        el("p", { html: "<strong>Vos photos restent sur cet appareil.</strong> Rien n'est envoyé : le calendrier et ses photos sont gardés automatiquement dans ce navigateur, sur cet appareil seulement." }),
        bouton("appareil", "Données de cet appareil…", () => actions.donneesAppareil(), { classe: "lien" })),
    );
  }

  /** Recopie les réglages dans les champs (après ouverture d'un projet, annuler…). */
  synchroniser(r: Reglages) {
    if (document.activeElement !== this.titre) this.titre.value = r.title;
    const aujourdhui = new Date().getFullYear();
    const annees = new Set<number>();
    for (let a = aujourdhui - 2; a <= aujourdhui + 10; a++) annees.add(a);
    annees.add(r.year);
    const liste = [...annees].sort((a, b) => a - b);
    if (this.annee.options.length !== liste.length || [...this.annee.options].some((o, i) => Number(o.value) !== liste[i])) {
      this.annee.replaceChildren(...liste.map((a) => el("option", { value: String(a), text: String(a) })));
    }
    this.annee.value = String(r.year);
    this.format.value = String(r.format);
    this.police.value = String(r.font);
    this.couleur.value = r.accent;
    this.texteCouleur.textContent = r.accent.toUpperCase();
    this.zone.value = r.school_zone;
    for (const [cle, c] of Object.entries(this.cases)) c.checked = r[cle as keyof PanneauReglages["cases"]];
    const n = r.events.length;
    this.resumeEvenements.textContent = n ? `${n} anniversaire${n > 1 ? "s" : ""} ou événement${n > 1 ? "s" : ""} dans la liste.` : "Aucun anniversaire pour l'instant.";
  }
}
