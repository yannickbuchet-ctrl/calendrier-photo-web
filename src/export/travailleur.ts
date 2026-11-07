/**
 * Création du PDF dans un Web Worker : décodage des photos, réduction et encodage JPEG, assemblage du PDF. La page
 * reste fluide pendant l'export, même sur un téléphone.
 */
import { analyserProjet } from "../logique/projet";
import { chargerPolices } from "../rendu/polices-web";
import { creerPdf, ExportAnnule } from "../rendu/pdf";
import { preparateur, type PhotoAExporter } from "./preparation";

export interface DemandeExport {
  type: "exporter";
  projet: unknown;
  photos: PhotoAExporter[];
  titre: string;
  application: string;
}

export type MessageExport =
  | { type: "avancement"; fait: number; total: number }
  | { type: "illisible"; nom: string }
  | { type: "fini"; pdf: Uint8Array }
  | { type: "erreur"; message: string; annule: boolean };

const portee = self as unknown as { postMessage: (m: MessageExport, transfert?: Transferable[]) => void; onmessage: ((e: MessageEvent) => void) | null };
let annule = false;

portee.onmessage = async (e: MessageEvent<DemandeExport | { type: "annuler" }>) => {
  if (e.data.type === "annuler") {
    annule = true;
    return;
  }
  const demande = e.data;
  try {
    const projet = analyserProjet(demande.projet);
    const photos = new Map(demande.photos.map((p) => [p.id, p]));
    const polices = await chargerPolices(projet.reglages.font);
    const pdf = await creerPdf(
      {
        reglages: projet.reglages, photos: projet.photos, layouts: projet.layouts, crops: projet.crops, polices, masquerVides: true,
        dimensions: (id) => {
          const p = photos.get(id);
          return p ? { w: p.largeur, h: p.hauteur } : null;
        },
      },
      preparateur(photos, (nom) => portee.postMessage({ type: "illisible", nom })),
      { titre: demande.titre, application: demande.application, annule: () => annule, avancement: (fait, total) => portee.postMessage({ type: "avancement", fait, total }) },
    );
    portee.postMessage({ type: "fini", pdf }, [pdf.buffer]);
  } catch (err) {
    portee.postMessage({ type: "erreur", message: err instanceof Error ? err.message : String(err), annule: err instanceof ExportAnnule });
  }
};
