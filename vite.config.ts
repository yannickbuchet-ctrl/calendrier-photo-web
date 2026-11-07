import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Politique de sécurité du site construit : aucune ressource ne vient d'un autre site (ni police, ni script, ni
 * statistiques) et rien ne peut être envoyé ailleurs (connect-src 'self' : seuls les fichiers du site lui-même sont
 * lus). Elle n'est pas mise en développement, où Vite a besoin de sa connexion de rechargement.
 */
const SECURITE = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function politiqueDeSecurite(): Plugin {
  return {
    name: "politique-de-securite",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${SECURITE}" />`),
  };
}

/**
 * Hors ligne : le service worker (sw/sw.js) reçoit la liste des fichiers du site construit, qu'il garde dès la
 * première visite, et un nom de cache propre à cette version. Les photos modèles (exemples/) n'y sont pas : elles ne
 * sont téléchargées que si on les demande.
 */
function listeHorsLigne(): Plugin {
  return {
    name: "liste-hors-ligne",
    apply: "build",
    generateBundle(_options, bundle) {
      const fichiers = [...new Set(["./", "index.html", "manifest.webmanifest", "icone.svg", ...Object.keys(bundle).filter((f) => !f.endsWith(".map"))])];
      const version = createHash("sha256").update(fichiers.sort().join("\n")).digest("hex").slice(0, 12);
      const modele = fs.readFileSync(path.resolve(import.meta.dirname, "sw/sw.js"), "utf8");
      this.emitFile({
        type: "asset", fileName: "sw.js",
        source: modele.replace("const FICHIERS = [];", `const FICHIERS = ${JSON.stringify(fichiers)};`).replace("VERSION", version),
      });
    },
  };
}

// Le site est statique : tous les chemins sont relatifs, et « base » peut être fixée à la construction
// (BASE=/calendrier-photo-web/ npm run build) pour un hébergement dans un sous-dossier, comme GitHub Pages.
export default defineConfig({
  base: process.env.BASE ?? "./",
  plugins: [politiqueDeSecurite(), listeHorsLigne()],
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
  },
  worker: { format: "es" },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    pool: "forks",
  },
});
