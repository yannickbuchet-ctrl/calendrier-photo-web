import "./style.css";
import { Application } from "./ui/app";

const app = new Application(document.getElementById("application")!);
void app.demarrer();

// Application installée (Chrome, Edge) : un projet .calendrier ou des photos ouverts avec « Ouvrir avec → Calendrier
// Photo » arrivent ici (file_handlers du manifeste).
interface FileLaunchQueue {
  setConsumer(consommateur: (parametres: { files: FileSystemFileHandle[] }) => void): void;
}
const fileDeLancement = (window as unknown as { launchQueue?: FileLaunchQueue }).launchQueue;
fileDeLancement?.setConsumer(async ({ files }) => {
  if (!files?.length) return;
  const fichiers = await Promise.all(files.map((p) => p.getFile()));
  await app.ouvrirFichiersLances(fichiers, files);
});

// Hors ligne : une fois le site chargé, ses fichiers sont gardés par le navigateur (service worker). Les photos et
// les projets ne passent jamais par le service worker : ils restent dans le stockage de la page.
if (import.meta.env.PROD && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* le site fonctionne aussi sans */
  });
}
