/**
 * Anniversaires et événements (EventsDialog de la version Windows) : ajout, modification, suppression, import et
 * export CSV (même format que la version Windows : Date;Type;Description).
 */
import { dateValide } from "../logique/dates";
import {
  exporterCsv, importerCsv, LIBELLES_TYPES, memeEvenement, nettoyerEvenement, texteDate, trierEvenements, TYPES_EVENEMENTS,
  COULEURS_EVENEMENTS, type Evenement, type TypeEvenement,
} from "../logique/evenements";
import { bouton, choisirFichiers, el, enregistrerFichier, fenetre, informer, pluriel } from "./dom";
import { icone } from "./icones";

const AIDES: Record<TypeEvenement, string> = {
  birthday: "Chaque année. Indiquez la date de naissance : l'âge est affiché, par exemple « Léa (9 ans) ».",
  yearly: "Chaque année à la même date (l'année saisie n'est pas utilisée).",
  once: "Une seule fois, à la date exacte.",
};

/** Ouvre la liste ; renvoie la nouvelle liste (Appliquer) ou null (Annuler). */
export async function gererEvenements(depart: Evenement[], annee: number): Promise<Evenement[] | null> {
  const evenements = depart.map((e) => ({ ...e }));
  const f = fenetre("Anniversaires et événements", { classe: "large evenements-fenetre" });
  let selection = -1;

  const liste = el("ul", { class: "liste-evenements", role: "listbox", "aria-label": "Anniversaires et événements", tabindex: "0" });
  const champType = el("select", { id: "evenement-type" }, ...TYPES_EVENEMENTS.map(([k, l]) => el("option", { value: k, text: l })));
  const champDate = el("input", { id: "evenement-date", type: "date", required: true, min: "0001-01-01", max: "9999-12-31" });
  const sansAnnee = el("input", { id: "evenement-sans-annee", type: "checkbox" });
  const ligneSansAnnee = el("label", { class: "case", for: "evenement-sans-annee" }, sansAnnee, "Année de naissance inconnue (pas d'âge affiché)");
  const champTexte = el("input", { id: "evenement-texte", type: "text", placeholder: "Ex. : Léa, Mariage de Paul et Zoé, Fête des voisins…", autocomplete: "off" });
  const aide = el("p", { class: "aide" });
  const erreur = el("p", { class: "erreur-texte", role: "alert" });
  const ajouter = el("button", { type: "button", class: "bouton principal", html: `${icone("coche")}<span>Ajouter</span>` });
  const supprimer = bouton("supprimer", "Supprimer", () => supprimerSelection(), { classe: "cadre danger" });

  const deux = (n: number) => String(n).padStart(2, "0");
  const type = () => champType.value as TypeEvenement;

  function majFormulaire() {
    const k = type();
    ligneSansAnnee.hidden = k !== "birthday";
    aide.textContent = AIDES[k];
  }

  function afficherListe() {
    trierEvenements(evenements);
    liste.replaceChildren(...evenements.map((ev, i) => {
      const item = el("li", {
        role: "option", "aria-selected": String(i === selection), tabindex: "-1", class: "evenement",
        "data-index": String(i),
      },
      el("span", { class: "pastille-evenement", style: { background: COULEURS_EVENEMENTS[ev.kind] }, "aria-hidden": "true" }),
      el("span", { class: "date-evenement", text: texteDate(ev) }),
      el("span", { class: "texte-evenement", text: ev.text }),
      el("span", { class: "type-evenement", text: LIBELLES_TYPES[ev.kind] }));
      item.addEventListener("click", () => choisir(i));
      return item;
    }));
    if (!evenements.length) liste.append(el("li", { class: "vide", text: "Aucun anniversaire ni événement pour l'instant." }));
    supprimer.disabled = selection < 0;
  }

  function choisir(i: number) {
    selection = i;
    const ev = evenements[i];
    champType.value = ev.kind;
    let a = ev.year || annee;
    if (!dateValide(a, ev.month, ev.day)) a = 2028; // 29 février sans année : une année bissextile pour l'afficher
    champDate.value = `${String(a).padStart(4, "0")}-${deux(ev.month)}-${deux(ev.day)}`;
    sansAnnee.checked = ev.kind === "birthday" && !ev.year;
    champTexte.value = ev.text;
    ajouter.querySelector("span")!.textContent = "Enregistrer la modification";
    erreur.textContent = "";
    majFormulaire();
    afficherListe();
    (liste.querySelector(`[data-index="${i}"]`) as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  }

  function nouveau() {
    selection = -1;
    champTexte.value = "";
    sansAnnee.checked = false;
    if (!champDate.value) champDate.value = `${annee}-01-01`;
    ajouter.querySelector("span")!.textContent = "Ajouter";
    erreur.textContent = "";
    majFormulaire();
    afficherListe();
    champTexte.focus();
  }

  function ajouterOuModifier() {
    const [a, m, j] = champDate.value.split("-").map(Number);
    if (!champDate.value || !a) {
      erreur.textContent = "Indiquez une date.";
      champDate.focus();
      return;
    }
    const k = type();
    const garderAnnee = k === "once" || (k === "birthday" && !sansAnnee.checked);
    const ev = nettoyerEvenement({ day: j, month: m, year: garderAnnee ? a : null, text: champTexte.value, kind: k });
    if (!ev) {
      erreur.textContent = "Indiquez un texte.";
      champTexte.focus();
      return;
    }
    if (selection >= 0) evenements[selection] = ev;
    else evenements.push(ev);
    const modifie = selection >= 0;
    afficherListe();
    if (modifie) choisir(evenements.indexOf(ev));
    else nouveau();
  }

  function supprimerSelection() {
    if (selection < 0) return;
    evenements.splice(selection, 1);
    nouveau();
  }

  async function importer() {
    const [fichier] = await choisirFichiers(".csv,text/csv,text/plain");
    if (!fichier) return;
    let lus: ReturnType<typeof importerCsv>;
    try {
      lus = importerCsv(new Uint8Array(await fichier.arrayBuffer()));
    } catch {
      await informer("Erreur", "Impossible de lire le fichier : il n'est pas enregistré en UTF-8. Dans Excel, choisissez « CSV UTF-8 » à l'enregistrement.");
      return;
    }
    const nouveaux = lus.evenements.filter((e) => !evenements.some((x) => memeEvenement(x, e)));
    evenements.push(...nouveaux);
    afficherListe();
    let message = `${pluriel(nouveaux.length, "événement ajouté", "événements ajoutés")}.`;
    if (lus.evenements.length > nouveaux.length) message += `\n${lus.evenements.length - nouveaux.length} déjà dans la liste (non dupliqué${lus.evenements.length - nouveaux.length > 1 ? "s" : ""}).`;
    if (lus.ignorees) message += `\n${pluriel(lus.ignorees, "ligne illisible ignorée", "lignes illisibles ignorées")} (date au format jj/mm ou jj/mm/aaaa attendue).`;
    await informer("Import terminé", message);
  }

  async function exporter() {
    if (!evenements.length) {
      await informer("Rien à exporter", "La liste est vide.");
      return;
    }
    const nom = "Anniversaires et événements.csv";
    const ecrit = await enregistrerFichier(new Blob([exporterCsv(evenements) as Uint8Array<ArrayBuffer>], { type: "text/csv" }), nom, "Fichier CSV", "text/csv", ".csv");
    if (ecrit === undefined) return;
    await informer("Export terminé", `${pluriel(evenements.length, "événement exporté", "événements exportés")} dans « ${ecrit?.name ?? nom} ».\n\nLe fichier s'ouvre avec Excel et peut être réimporté dans un autre calendrier, ici ou dans la version Windows.`);
  }

  champType.addEventListener("change", majFormulaire);
  champTexte.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ajouterOuModifier();
    }
  });
  liste.addEventListener("keydown", (e) => {
    if (!evenements.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      choisir(Math.max(0, Math.min(evenements.length - 1, selection + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Delete") supprimerSelection();
  });
  ajouter.addEventListener("click", ajouterOuModifier);

  const champ = (id: string, libelle: string, controle: HTMLElement) => el("div", { class: "champ-formulaire" }, el("label", { for: id, text: libelle }), controle);
  const formulaire = el("div", { class: "formulaire-evenement" },
    champ("evenement-type", "Type", champType), champ("evenement-date", "Date", champDate), ligneSansAnnee,
    champ("evenement-texte", "Texte", champTexte), aide, erreur,
    el("div", { class: "rangee" }, ajouter, bouton("nouveau", "Nouveau", () => nouveau(), { classe: "cadre", infobulle: "Vider le formulaire pour saisir un autre événement" }), supprimer),
    el("p", { class: "aide", text: "Les émojis ne sont pas imprimés." }),
    el("div", { class: "rangee fichiers-evenements" },
      bouton("importer", "Importer…", () => void importer(), { classe: "cadre", infobulle: "Ajouter les événements d'un fichier CSV (exporté depuis ce logiciel, la version Windows ou écrit dans Excel : Date;Type;Description)" }),
      bouton("exporter", "Exporter…", () => void exporter(), { classe: "cadre", infobulle: "Enregistrer la liste dans un fichier CSV (ouvrable avec Excel), pour la réutiliser dans un autre calendrier" })));
  f.corps.append(
    el("p", { class: "aide", text: "Les anniversaires et événements s'affichent dans les cases des jours du calendrier (en rose les anniversaires, en vert les autres événements)." }),
    el("div", { class: "grille-evenements" }, liste, formulaire),
  );
  let resultat: Evenement[] | null = null;
  f.pied.append(
    el("button", { type: "button", class: "bouton cadre", text: "Annuler", onclick: () => f.fermer() }),
    el("button", { type: "button", class: "bouton principal", text: "Appliquer", onclick: () => {
      resultat = evenements;
      f.fermer();
    } }),
  );
  champDate.value = `${annee}-01-01`;
  nouveau();
  await f.fermee;
  return resultat;
}
