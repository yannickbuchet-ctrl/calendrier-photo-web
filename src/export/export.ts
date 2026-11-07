/**
 * Export PDF depuis l'interface : dans un Web Worker quand le navigateur le permet (OffscreenCanvas), sinon dans la
 * page, une photo à la fois avec des pauses pour garder l'interface réactive.
 */
import { analyserProjet, donneesProjet, type Projet } from "../logique/projet";
import type { PhotoMemoire } from "../photos/bibliotheque";
import { chargerPolices } from "../rendu/polices-web";
import { preparateur, type PhotoAExporter } from "./preparation";
import type { MessageExport } from "./travailleur";

export interface SuiviExport {
  avancement: (fait: number, total: number) => void;
  annule: () => boolean;
  illisible: (nom: string) => void;
}

function photosAExporter(projet: Projet, photo: (id: string) => PhotoMemoire | undefined): PhotoAExporter[] {
  const ids = new Set(Object.values(projet.photos).flat().filter((id): id is string => !!id));
  return [...ids].map(photo).filter((p): p is PhotoMemoire => !!p).map((p) => ({
    id: p.id, nom: p.nom, original: p.original, largeur: p.largeur, hauteur: p.hauteur, orientation: p.orientation, type: p.type,
  }));
}

/** Le Worker peut-il dessiner les photos ? (OffscreenCanvas dans les Workers : Chrome, Edge, Firefox, Safari 16.4.) */
const workerPossible = () => typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && "convertToBlob" in OffscreenCanvas.prototype;

export async function exporterPdf(projet: Projet, photo: (id: string) => PhotoMemoire | undefined, titre: string, application: string, suivi: SuiviExport): Promise<Uint8Array> {
  const photos = photosAExporter(projet, photo);
  if (workerPossible()) {
    try {
      return await dansUnWorker(projet, photos, titre, application, suivi);
    } catch (e) {
      if (!(e instanceof ErreurWorker)) throw e;
      console.warn("Export dans la page (Worker indisponible)", e);
    }
  }
  // Sans Worker : pdf-lib est chargé ici, seulement dans ce cas.
  const { creerPdf } = await import("../rendu/pdf");
  const polices = await chargerPolices(projet.reglages.font);
  const parId = new Map(photos.map((p) => [p.id, p]));
  const preparer = preparateur(parId, suivi.illisible);
  return creerPdf(
    {
      reglages: projet.reglages, photos: projet.photos, layouts: projet.layouts, crops: projet.crops, polices, masquerVides: true,
      dimensions: (id) => {
        const p = parId.get(id);
        return p ? { w: p.largeur, h: p.hauteur } : null;
      },
    },
    async (...args) => {
      const r = await preparer(...args);
      await new Promise((ok) => setTimeout(ok, 0)); // laisse l'interface respirer entre deux photos
      return r;
    },
    { titre, application, annule: suivi.annule, avancement: suivi.avancement },
  );
}

class ErreurWorker extends Error {}

function dansUnWorker(projet: Projet, photos: PhotoAExporter[], titre: string, application: string, suivi: SuiviExport): Promise<Uint8Array> {
  return new Promise((ok, ko) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./travailleur.ts", import.meta.url), { type: "module", name: "export-pdf" });
    } catch (e) {
      ko(new ErreurWorker(String(e)));
      return;
    }
    let demarre = false;
    const surveillance = setInterval(() => {
      if (suivi.annule()) worker.postMessage({ type: "annuler" });
    }, 200);
    const finir = () => {
      clearInterval(surveillance);
      worker.terminate();
    };
    worker.onmessage = (e: MessageEvent<MessageExport>) => {
      const m = e.data;
      demarre = true;
      if (m.type === "avancement") suivi.avancement(m.fait, m.total);
      else if (m.type === "illisible") suivi.illisible(m.nom);
      else if (m.type === "fini") {
        finir();
        ok(m.pdf);
      } else {
        finir();
        const erreur = new Error(m.annule ? "Export annulé." : m.message);
        if (m.annule) erreur.name = "AbortError";
        ko(erreur);
      }
    };
    worker.onerror = (e) => {
      finir();
      ko(demarre ? new Error(e.message || "Erreur pendant l'export.") : new ErreurWorker(e.message));
    };
    // Vérifie que le projet passe bien d'un fil à l'autre (données simples).
    const donnees = donneesProjet(analyserProjet(donneesProjet(projet)));
    worker.postMessage({ type: "exporter", projet: donnees, photos, titre, application });
  });
}
