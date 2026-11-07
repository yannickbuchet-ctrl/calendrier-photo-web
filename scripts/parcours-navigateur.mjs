// Parcours dans un vrai navigateur (Chromium sans fenêtre, par Playwright) du site construit, sur ordinateur et sur
// téléphone, avec les photos modèles (paysages dessinés) et un anniversaire fictif : remplir automatiquement,
// recadrer, exporter le PDF et le relire, enregistrer et rouvrir le projet, reprendre après rechargement, imprimer.
// Puis mesure du temps et de la mémoire d'un export de 13 pages avec 36 grandes photos (12 Mpx, générées), sur
// ordinateur et sur un téléphone simulé (processeur ralenti 4 fois). Captures d'écran dans captures/.
//
// Lancer après « npm run build » : node scripts/parcours-navigateur.mjs [ordinateur] [telephone] [mesure]
import { chromium } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

const racine = path.resolve(import.meta.dirname, "..");
const captures = path.join(racine, "captures");
const travail = path.join(racine, "dist", "parcours");
fs.mkdirSync(captures, { recursive: true });
fs.mkdirSync(travail, { recursive: true });
const PORT = 4180;
const parties = process.argv.slice(2).length ? process.argv.slice(2) : ["ordinateur", "telephone", "mesure"];
const exemples = fs.readdirSync(path.join(racine, "public/exemples")).filter((n) => n.endsWith(".jpg")).sort().map((n) => path.join(racine, "public/exemples", n));

// Pages attendues avec les photos modèles, calculées par la version Windows (tests/references/python.ts).
const texteReferences = fs.readFileSync(path.join(racine, "tests/references/python.ts"), "utf8");
const REFERENCES = JSON.parse(JSON.parse(texteReferences.slice(texteReferences.indexOf("JSON.parse(") + 11, texteReferences.lastIndexOf(")"))));
const resultats = {};
const erreurs = [];

function verifier(condition, message) {
  if (!condition) throw new Error(message);
}

/** Fichiers d'une archive ZIP (entrées stockées) : nom → octets. */
function lireZip(octets) {
  const v = Buffer.from(octets);
  let fin = v.length - 22;
  while (fin >= 0 && v.readUInt32LE(fin) !== 0x06054b50) fin--;
  verifier(fin >= 0, "archive ZIP illisible");
  const nombre = v.readUInt16LE(fin + 10);
  let i = v.readUInt32LE(fin + 16);
  const fichiers = new Map();
  for (let n = 0; n < nombre; n++) {
    const taille = v.readUInt32LE(i + 20);
    const longueurNom = v.readUInt16LE(i + 28);
    const autres = v.readUInt16LE(i + 30) + v.readUInt16LE(i + 32);
    const locale = v.readUInt32LE(i + 42);
    const nom = v.subarray(i + 46, i + 46 + longueurNom).toString("utf8");
    const debut = locale + 30 + v.readUInt16LE(locale + 26) + v.readUInt16LE(locale + 28);
    fichiers.set(nom, v.subarray(debut, debut + taille));
    i += 46 + longueurNom + autres;
  }
  return fichiers;
}

/** Pages d'un PDF : dimensions (points), images (pixels, rectangle, ppp), texte (PDF.js). */
async function lirePdf(octets) {
  const doc = await PDFDocument.load(octets, { updateMetadata: false });
  const pages = [];
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const c = page.node.Contents();
    const flux = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    let contenu = "";
    for (const f of flux) if (f instanceof PDFRawStream) contenu += Buffer.from(decodePDFRawStream(f).decode()).toString("latin1");
    const xobjets = page.node.Resources().lookupMaybe(PDFName.of("XObject"), PDFDict);
    const images = [];
    for (const m of contenu.matchAll(/(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm\s+\/(\S+) Do/g)) {
      const [w, h, x, y] = m.slice(1, 5).map(Number);
      const image = doc.context.lookup(xobjets.get(PDFName.of(m[5])));
      const px = image.dict.get(PDFName.of("Width")).asNumber();
      const py = image.dict.get(PDFName.of("Height")).asNumber();
      images.push({ px, py, rect: [x, height - y - h, w, h], ppp: px / (w / 72) });
    }
    pages.push({ largeur: width, hauteur: height, images });
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tache = pdfjs.getDocument({ data: new Uint8Array(octets), verbosity: 0 });
  const lu = await tache.promise;
  for (let i = 1; i <= lu.numPages; i++) {
    const t = await (await lu.getPage(i)).getTextContent();
    pages[i - 1].texte = t.items.map((it) => it.str).join(" ");
  }
  await tache.destroy();
  return pages;
}

/** Projet gardé par le navigateur (sauvegarde automatique, IndexedDB). */
function lireSauvegarde(page) {
  return page.evaluate(() => new Promise((ok, ko) => {
    const r = indexedDB.open("calendrier-photo-web");
    r.onsuccess = () => {
      const db = r.result;
      const g = db.transaction("projet").objectStore("projet").get("courant");
      g.onsuccess = () => {
        ok(g.result ?? null);
        db.close();
      };
      g.onerror = () => ko(g.error);
    };
    r.onerror = () => ko(r.error);
  }));
}

/** Noms des photos de chaque page, lus dans les vignettes (texte destiné aux lecteurs d'écran). */
async function photosDesPages(page) {
  const textes = await page.locator(".carte:not([hidden]) .visuellement-cache").allTextContents();
  return textes.map((t) => {
    if (t.endsWith("aucune photo.")) return [];
    const parties = t.slice(t.indexOf(" : ") + 3).replace(/\.$/, "").split(" ; ");
    return parties.map((p) => p.slice(p.lastIndexOf(" : ") + 3)).map((n) => (n === "vide" ? null : n));
  });
}

/** Plus long gel de l'interface (écart entre deux images) pendant une action. */
async function mesurerGel(page, action) {
  await page.evaluate(() => {
    window.__gel = 0;
    window.__fin = false;
    let t = performance.now();
    const tic = () => {
      const n = performance.now();
      window.__gel = Math.max(window.__gel, n - t);
      t = n;
      if (!window.__fin) requestAnimationFrame(tic);
    };
    requestAnimationFrame(tic);
  });
  const resultat = await action();
  const gel = await page.evaluate(() => ((window.__fin = true), window.__gel));
  return { resultat, gel: Math.round(gel) };
}

/** Mémoire privée totale du navigateur (processus principal et ses enfants), relevée toutes les 300 ms (Windows). */
function suivreMemoire(pid) {
  if (process.platform !== "win32" || !pid) return { arreter: async () => null };
  const script = `$r=${pid}; while($true){ $t=Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,PrivatePageCount; $ids=@($r); do { $a=$false; foreach($p in $t){ if(($ids -contains $p.ParentProcessId) -and -not($ids -contains $p.ProcessId)){ $ids+=$p.ProcessId; $a=$true } } } while($a); ($t | Where-Object { $ids -contains $_.ProcessId } | Measure-Object -Property PrivatePageCount -Sum).Sum; Start-Sleep -Milliseconds 300 }`;
  const ps = spawn("powershell.exe", ["-NoProfile", "-Command", script], { stdio: ["ignore", "pipe", "ignore"] });
  const valeurs = [];
  ps.stdout.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => valeurs.push(Number(l))));
  return {
    arreter: async () => {
      await new Promise((ok) => setTimeout(ok, 700));
      ps.kill();
      const v = valeurs.filter((x) => x > 0);
      return v.length ? { debutMo: Math.round(v[0] / 1048576), picMo: Math.round(Math.max(...v) / 1048576), mesures: v.length } : null;
    },
  };
}

async function nouvellePage(navigateur, options, nom) {
  const contexte = await navigateur.newContext({ locale: "fr-FR", acceptDownloads: true, ...options });
  // Les fenêtres natives du système (enregistrer un fichier) ne s'ouvrent pas sans écran : l'application se rabat sur
  // le téléchargement, comme dans Firefox ou Safari. L'impression est simulée (aucune imprimante).
  await contexte.addInitScript(() => {
    delete window.showSaveFilePicker;
    delete window.showOpenFilePicker;
    window.__impressions = 0;
    window.print = () => {
      window.__impressions++;
      window.__pagesImprimees = document.querySelectorAll("#impression img").length;
    };
  });
  const page = await contexte.newPage();
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  page.on("console", (m) => m.type() === "error" && erreurs.push(`${nom} console : ${m.text()}`));
  return { contexte, page };
}

/** Attend que les réductions des photos (vignettes, aperçu) soient prêtes, pour une capture complète. */
async function photosPretes(page) {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => document.body.dataset.photos !== "preparation", null, { timeout: 300000 });
  await page.waitForTimeout(300);
}

async function attendrePret(page) {
  await page.getByRole("heading", { name: "Réglages", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".indicateur")?.textContent?.includes("Gardé"), null, { timeout: 30000 });
}

async function telechargement(page, action, fichier) {
  const [t] = await Promise.all([page.waitForEvent("download", { timeout: 600000 }), action()]);
  const cible = path.join(travail, fichier);
  await t.saveAs(cible);
  return cible;
}

/* --- Ordinateur ------------------------------------------------------------------------------------------------- */

async function ordinateur(navigateur) {
  const { contexte, page } = await nouvellePage(navigateur, { viewport: { width: 1440, height: 900 }, colorScheme: "light" }, "ordinateur");
  await page.goto(`http://localhost:${PORT}/`);
  await attendrePret(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(captures, "accueil.png") });

  // Remplir automatiquement avec les 36 photos modèles.
  const [choix] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Remplir automatiquement…" }).first().click()]);
  await choix.setFiles(exemples);
  const bilan = page.getByRole("dialog", { name: "Remplissage automatique" });
  await bilan.waitFor({ timeout: 120000 });
  const texteBilan = await bilan.innerText();
  verifier(texteBilan.includes("36 photo(s) réparties sur 12 mois, de la plus ancienne (05/01/2027) à la plus récente (25/12/2027)"), `bilan : ${texteBilan}`);
  await bilan.getByRole("button", { name: "OK", exact: true }).click();
  const pages = await photosDesPages(page);
  verifier(JSON.stringify(pages.slice(1)) === JSON.stringify(REFERENCES.exemples.plans[0]), `pages différentes de la version Windows : ${JSON.stringify(pages)}`);
  resultats.remplissage = "36 photos modèles : mêmes pages que la version Windows (12 pages en disposition 3)";

  // Vacances de la zone C, et un anniversaire fictif.
  await page.getByLabel("Vacances").selectOption("C");
  await page.getByRole("button", { name: "Gérer…" }).click();
  const fen = page.getByRole("dialog", { name: "Anniversaires et événements" });
  await fen.getByLabel("Type").selectOption("birthday");
  await fen.getByLabel("Date").fill("2019-03-14");
  await fen.getByLabel("Texte").fill("Léa (fictive)");
  await fen.getByRole("button", { name: "Ajouter", exact: true }).click();
  await fen.getByLabel("Type").selectOption("yearly");
  await fen.getByLabel("Date").fill("2027-06-21");
  await fen.getByLabel("Texte").fill("Fête de la musique");
  await fen.getByRole("button", { name: "Ajouter", exact: true }).click();
  verifier((await fen.locator(".evenement").count()) === 2, "deux événements attendus");
  await fen.locator(".evenement").first().click();
  await page.screenshot({ path: path.join(captures, "evenements.png") });
  await fen.getByRole("button", { name: "Appliquer", exact: true }).click();

  // Mars : l'anniversaire et l'âge dans la case du 14.
  await page.getByRole("button", { name: "Afficher Mars 2027 dans l'aperçu" }).click();
  await photosPretes(page);
  await page.screenshot({ path: path.join(captures, "calendrier.png") });
  await page.locator("canvas.page-apercu").screenshot({ path: path.join(travail, "apercu-mars.png") });

  // Recadrer la grande photo : double-clic dessus, glisser, zoomer à la molette.
  const apercu = await page.locator("canvas.page-apercu").boundingBox();
  await page.mouse.dblclick(apercu.x + apercu.width * 0.25, apercu.y + apercu.height * 0.2);
  const recadrage = page.getByRole("dialog", { name: "Recadrer — Mars 2027 (grande, à gauche)" });
  await recadrage.waitFor();
  await page.waitForTimeout(800);
  const vue = await recadrage.locator("canvas").boundingBox();
  const cx = vue.x + vue.width / 2;
  const cy = vue.y + vue.height / 2;
  await page.mouse.move(cx, cy);
  for (let k = 0; k < 4; k++) await page.mouse.wheel(0, -120);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const zoom = await recadrage.locator("output").textContent();
  verifier(Number.parseInt(zoom, 10) > 100, `zoom attendu : ${zoom}`);
  await page.screenshot({ path: path.join(captures, "recadrage.png") });
  await recadrage.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.waitForTimeout(1500);
  const sauvegarde = await lireSauvegarde(page);
  const recadrageMars = sauvegarde.projet.crops["2"][0];
  verifier(recadrageMars && recadrageMars.zoom > 1 && recadrageMars.x !== 0.5, `recadrage non enregistré : ${JSON.stringify(sauvegarde.projet.crops)}`);
  verifier(sauvegarde.projet.settings.events.length === 2, "anniversaires non enregistrés");
  resultats.recadrage = `zoom ${recadrageMars.zoom}, centre (${recadrageMars.x} ; ${recadrageMars.y}), gardé sur l'appareil`;

  // Annuler puis rétablir le recadrage.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1200);
  verifier(!(await lireSauvegarde(page)).projet.crops["2"], "annuler devrait retirer le recadrage");
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(1200);
  verifier((await lireSauvegarde(page)).projet.crops["2"][0].zoom === recadrageMars.zoom, "rétablir devrait remettre le recadrage");

  // Vue d'ensemble.
  await page.getByRole("button", { name: "Vue d'ensemble" }).first().click();
  await photosPretes(page);
  await page.screenshot({ path: path.join(captures, "vue-ensemble.png") });
  await page.getByRole("button", { name: "Juin 2027 : cliquez pour l'afficher en grand" }).click();
  verifier((await page.locator(".etiquette-page").textContent()).startsWith("Juin 2027"), "la vue d'ensemble devrait ouvrir juin");

  // Export PDF : la couverture n'a pas de photo, l'application le signale.
  const { resultat: cheminPdf, gel } = await mesurerGel(page, async () => {
    const debut = Date.now();
    const chemin = await telechargement(page, async () => {
      await page.getByRole("button", { name: "Exporter en PDF", exact: true }).click();
      await page.getByRole("dialog", { name: "Pages sans photo" }).getByRole("button", { name: "Exporter", exact: true }).click();
    }, "parcours-ordinateur.pdf");
    resultats.exportModelesMs = Date.now() - debut;
    return chemin;
  });
  await page.getByRole("dialog", { name: "Export terminé" }).getByRole("button", { name: "OK", exact: true }).click();
  const pdf = await lirePdf(fs.readFileSync(cheminPdf));
  verifier(pdf.length === 13, `13 pages attendues : ${pdf.length}`);
  for (const p of pdf) verifier(Math.abs(p.largeur - 595.2756) < 0.01 && Math.abs(p.hauteur - 841.8898) < 0.01, `page A4 attendue : ${p.largeur} × ${p.hauteur}`);
  const images = pdf.flatMap((p) => p.images);
  verifier(images.length === 36, `36 images attendues : ${images.length}`);
  verifier(images.every((i) => i.ppp <= 300.5), "photos au plus à 300 ppp");
  verifier(pdf[3].texte.includes("Mars") && pdf[3].texte.includes("Léa (fictive) (8 ans)"), `texte de mars : ${pdf[3].texte.slice(0, 300)}`);
  verifier(pdf[6].texte.includes("Fête de la musique") && pdf[1].texte.includes("Jour de l'an") && pdf[1].texte.includes("zone C"), "texte des pages");
  const ppp = images.map((i) => i.ppp);
  resultats.pdfModeles = `13 pages A4 (595,28 × 841,89 pt), 36 photos de ${Math.round(Math.min(...ppp))} à ${Math.round(Math.max(...ppp))} ppp (photos modèles de 1800 × 1200 px, jamais agrandies), ${(fs.statSync(cheminPdf).size / 1048576).toFixed(1)} Mo, ${resultats.exportModelesMs} ms, gel maximal ${gel} ms`;

  // Enregistrer le projet, l'ouvrir dans un calendrier neuf.
  const cheminProjet = await telechargement(page, () => page.getByRole("button", { name: "Enregistrer", exact: true }).first().click(), "parcours.calendrier");
  const zip = lireZip(fs.readFileSync(cheminProjet));
  verifier(zip.has("projet.calendrier.json") && [...zip.keys()].filter((n) => n.startsWith("photos/")).length === 36, `contenu du projet : ${[...zip.keys()].join(", ")}`);
  const json = JSON.parse(zip.get("projet.calendrier.json").toString("utf8"));
  verifier(json.photos_relative["0"][0] === "photos/2027-01-05-hiver-portrait.jpg", "chemins relatifs des photos");
  resultats.projet = `${path.basename(cheminProjet)} : ${(fs.statSync(cheminProjet).size / 1048576).toFixed(1)} Mo, projet.calendrier.json et 36 photos`;
  await page.getByRole("button", { name: "Nouveau", exact: true }).click();
  await page.waitForTimeout(800);
  verifier((await photosDesPages(page)).every((p) => !p.length), "le nouveau calendrier devrait être vide");
  const [choixProjet] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Ouvrir", exact: true }).first().click()]);
  await choixProjet.setFiles(cheminProjet);
  await page.locator(".etat .message.succes").filter({ hasText: "Projet ouvert" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  verifier(JSON.stringify((await photosDesPages(page)).slice(1)) === JSON.stringify(REFERENCES.exemples.plans[0]), "photos du projet rouvert");
  const rouvert = await lireSauvegarde(page);
  verifier(rouvert.projet.crops["2"][0].zoom === recadrageMars.zoom && rouvert.projet.settings.events.length === 2 && rouvert.projet.settings.school_zone === "C", "recadrage, anniversaires et réglages du projet rouvert");

  // Reprise après rechargement de la page.
  await page.reload();
  const reprise = page.getByRole("dialog", { name: "Reprendre le calendrier ?" });
  await reprise.waitFor({ timeout: 30000 });
  const texteReprise = await reprise.innerText();
  verifier(texteReprise.includes("36 photos"), `texte de reprise : ${texteReprise}`);
  await reprise.getByRole("button", { name: "Reprendre", exact: true }).click();
  await page.locator(".etat .message.succes").filter({ hasText: "Calendrier repris" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  verifier(JSON.stringify((await photosDesPages(page)).slice(1)) === JSON.stringify(REFERENCES.exemples.plans[0]), "photos après reprise");
  await page.getByRole("button", { name: "Afficher Mars 2027 dans l'aperçu" }).click();
  await photosPretes(page);
  await page.locator("canvas.page-apercu").screenshot({ path: path.join(travail, "apercu-mars-reprise.png") });
  resultats.reprise = "calendrier repris après rechargement : photos, recadrage, anniversaires";

  // Impression : 13 pages préparées en images (200 ppp), la fenêtre d'impression est simulée.
  await page.getByRole("button", { name: "Imprimer", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Pages sans photo" }).getByRole("button", { name: "Imprimer", exact: true }).click();
  await page.waitForFunction(() => window.__impressions > 0, null, { timeout: 300000 });
  const imprimees = await page.evaluate(() => window.__pagesImprimees);
  verifier(imprimees === 13, `13 pages à imprimer : ${imprimees}`);
  resultats.impression = "13 pages préparées pour l'impression";
  await contexte.close();

  // Mode sombre.
  const sombre = await nouvellePage(navigateur, { viewport: { width: 1440, height: 900 }, colorScheme: "dark" }, "sombre");
  await sombre.page.goto(`http://localhost:${PORT}/`);
  await attendrePret(sombre.page);
  const [c2] = await Promise.all([sombre.page.waitForEvent("filechooser"), sombre.page.getByRole("button", { name: "Remplir automatiquement…" }).first().click()]);
  await c2.setFiles(exemples);
  await sombre.page.getByRole("dialog", { name: "Remplissage automatique" }).getByRole("button", { name: "OK", exact: true }).click({ timeout: 120000 });
  await photosPretes(sombre.page);
  await sombre.page.screenshot({ path: path.join(captures, "sombre.png") });
  await sombre.contexte.close();
}

/* --- Téléphone -------------------------------------------------------------------------------------------------- */

async function glisser(cdp, x1, y1, x2, y2) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1, id: 1 }] });
  for (let k = 1; k <= 6; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + ((x2 - x1) * k) / 6, y: y1 + ((y2 - y1) * k) / 6, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function pincer(cdp, x, y, debut, fin) {
  const points = (d) => [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(debut) });
  for (let k = 1; k <= 8; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(debut + ((fin - debut) * k) / 8) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function telephone(navigateur) {
  const { contexte, page } = await nouvellePage(navigateur, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "light" }, "téléphone");
  const cdp = await contexte.newCDPSession(page);
  await page.goto(`http://localhost:${PORT}/`);
  await page.getByRole("button", { name: "Pages", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".indicateur")?.textContent?.includes("Gardé"), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(captures, "telephone-accueil.png") });

  await page.getByRole("button", { name: "Photos", exact: true }).tap();
  await page.screenshot({ path: path.join(captures, "telephone-menu-photos.png") });
  const [choix] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Remplir automatiquement…" }).tap()]);
  await choix.setFiles(exemples);
  await page.getByRole("dialog", { name: "Remplissage automatique" }).getByRole("button", { name: "OK", exact: true }).tap({ timeout: 120000 });
  await photosPretes(page);
  await page.screenshot({ path: path.join(captures, "telephone-apercu.png") });

  // Glisser vers la gauche : page suivante.
  const zone = await page.locator("canvas.page-apercu").boundingBox();
  await glisser(cdp, zone.x + zone.width * 0.8, zone.y + zone.height * 0.75, zone.x + zone.width * 0.2, zone.y + zone.height * 0.76);
  await page.waitForTimeout(500);
  const etiquette = await page.locator(".etiquette-page").textContent();
  verifier(etiquette.startsWith("Février 2027"), `glisser devrait passer à février : ${etiquette}`);

  // Double appui sur la grande photo : recadrage ; deux doigts pour zoomer, un doigt pour déplacer.
  await page.touchscreen.tap(zone.x + zone.width * 0.25, zone.y + zone.height * 0.2);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(zone.x + zone.width * 0.25, zone.y + zone.height * 0.2);
  const recadrage = page.getByRole("dialog", { name: /^Recadrer — Février 2027/ });
  await recadrage.waitFor();
  await page.waitForTimeout(800);
  const vue = await recadrage.locator("canvas").boundingBox();
  await pincer(cdp, vue.x + vue.width / 2, vue.y + vue.height / 2, 80, 240);
  await glisser(cdp, vue.x + vue.width / 2, vue.y + vue.height / 2, vue.x + vue.width / 2 + 60, vue.y + vue.height / 2 + 30);
  await page.waitForTimeout(300);
  const zoom = Number.parseInt(await recadrage.locator("output").textContent(), 10);
  verifier(zoom >= 200, `zoom à deux doigts attendu : ${zoom} %`);
  await page.screenshot({ path: path.join(captures, "telephone-recadrage.png") });
  await recadrage.getByRole("button", { name: "Appliquer", exact: true }).tap();
  resultats.telephoneRecadrage = `zoom à deux doigts : ${zoom} %`;

  // Panneaux par-dessus l'aperçu.
  await page.getByRole("button", { name: "Réglages", exact: true }).tap();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(captures, "telephone-reglages.png") });
  await page.locator(".panneau-reglages .fermer-feuille").tap();
  await page.getByRole("button", { name: "Pages", exact: true }).tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(captures, "telephone-pages.png") });
  await page.locator(".panneau-pages .fermer-feuille").tap();
  await page.getByRole("button", { name: "Plus", exact: true }).tap();
  await page.screenshot({ path: path.join(captures, "telephone-menu.png") });
  await page.keyboard.press("Escape");

  // Export PDF depuis le téléphone.
  const { resultat: chemin, gel } = await mesurerGel(page, () => telechargement(page, async () => {
    await page.getByRole("button", { name: "Exporter en PDF", exact: true }).tap();
    await page.getByRole("dialog", { name: "Pages sans photo" }).getByRole("button", { name: "Exporter", exact: true }).tap();
  }, "parcours-telephone.pdf"));
  await page.getByRole("dialog", { name: "Export terminé" }).getByRole("button", { name: "OK", exact: true }).tap();
  const pdf = await lirePdf(fs.readFileSync(chemin));
  verifier(pdf.length === 13 && pdf.flatMap((p) => p.images).length === 36, "PDF du téléphone");
  resultats.telephonePdf = `13 pages, 36 photos, gel maximal ${gel} ms`;
  await contexte.close();
}

/* --- Mesure : 36 grandes photos ---------------------------------------------------------------------------------------- */

async function mesure(navigateur) {
  const dossier = path.join(racine, "dist", "photos-test");
  if (!fs.existsSync(path.join(dossier, "IMG_0036.jpg"))) {
    console.log("Création des 36 grandes photos de test (scripts/grandes_photos.py)…");
    execFileSync("python", [path.join(racine, "scripts/grandes_photos.py"), dossier], { stdio: "inherit" });
  }
  const grandes = fs.readdirSync(dossier).filter((n) => n.endsWith(".jpg")).sort().map((n) => path.join(dossier, n));
  const taille = grandes.reduce((s, f) => s + fs.statSync(f).size, 0);
  for (const [nom, options, ralenti] of [
    ["ordinateur", { viewport: { width: 1440, height: 900 } }, 1],
    ["téléphone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 4],
  ]) {
    const { contexte, page } = await nouvellePage(navigateur, options, `mesure ${nom}`);
    const cdp = await contexte.newCDPSession(page);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => document.querySelector(".indicateur")?.textContent?.includes("Gardé"), null, { timeout: 30000 });
    if (ralenti > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: ralenti });
    const memoire = suivreMemoire(navigateur.process()?.pid);
    const debutImport = Date.now();
    if (nom === "téléphone") await page.getByRole("button", { name: "Photos", exact: true }).click();
    const declencheur = nom === "téléphone" ? page.getByRole("menuitem", { name: "Remplir automatiquement…" }) : page.getByRole("button", { name: "Remplir automatiquement…" }).first();
    const [choix] = await Promise.all([page.waitForEvent("filechooser"), declencheur.click()]);
    await choix.setFiles(grandes);
    const bilan = page.getByRole("dialog", { name: "Remplissage automatique" });
    await bilan.waitFor({ timeout: 600000 });
    const dureeImport = Date.now() - debutImport;
    const texteBilan = await bilan.innerText();
    verifier(texteBilan.includes("36 photo(s) réparties sur 12 mois, de la plus ancienne (03/01/2027)"), `dates EXIF des grandes photos : ${texteBilan}`);
    await bilan.getByRole("button", { name: "OK", exact: true }).click();
    await photosPretes(page);
    if (nom === "ordinateur") await page.locator("canvas.page-apercu").screenshot({ path: path.join(travail, "grandes-janvier.png") });
    const debut = Date.now();
    const { resultat: chemin, gel } = await mesurerGel(page, () => telechargement(page, async () => {
      await page.getByRole("button", { name: "Exporter en PDF", exact: true }).click();
      await page.getByRole("dialog", { name: "Pages sans photo" }).getByRole("button", { name: "Exporter", exact: true }).click();
    }, `grandes-${nom === "téléphone" ? "telephone" : "ordinateur"}.pdf`));
    const duree = Date.now() - debut;
    const mem = await memoire.arreter();
    const tas = await cdp.send("Runtime.getHeapUsage");
    const pdf = await lirePdf(fs.readFileSync(chemin));
    const images = pdf.flatMap((p) => p.images);
    verifier(pdf.length === 13 && images.length === 36, `PDF des grandes photos (${nom})`);
    verifier(images.every((i) => i.ppp <= 300.5) && images.some((i) => i.ppp > 299), "photos à 300 ppp au plus");
    resultats[`mesure ${nom}`] = {
      photos: `36 photos de 12 Mpx (${(taille / 1048576).toFixed(0)} Mo)`,
      importEtRemplissageMs: dureeImport,
      exportMs: duree,
      gelMaxMs: gel,
      ralentissementProcesseur: ralenti,
      pdf: `${(fs.statSync(chemin).size / 1048576).toFixed(1)} Mo, ${images.filter((i) => i.ppp > 299).length} photos à 300 ppp, les autres moins (photo plus petite que son cadre)`,
      memoireNavigateur: mem,
      tasJavaScriptMo: Math.round(tas.usedSize / 1048576),
    };
    if (nom === "ordinateur") {
      const dernier = resultats[`mesure ${nom}`];
      console.log(`Mesure ordinateur : ${JSON.stringify(dernier)}`);
    }
    await contexte.close();
  }
}

/* --- Lancement ----------------------------------------------------------------------------------------------------- */

const serveur = spawn(process.execPath, [path.join(racine, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort"], { cwd: racine, stdio: "pipe" });
await new Promise((ok, ko) => {
  serveur.stdout.on("data", (d) => String(d).includes(String(PORT)) && ok());
  serveur.on("exit", ko);
  setTimeout(() => ko(new Error("serveur muet")), 20000);
});
const navigateur = await chromium.launch();
let echec = null;
try {
  for (const partie of parties) {
    const debut = Date.now();
    await { ordinateur, telephone, mesure }[partie](navigateur);
    console.log(`✓ ${partie} (${Math.round((Date.now() - debut) / 1000)} s)`);
  }
} catch (e) {
  echec = e;
} finally {
  await navigateur.close();
  serveur.kill();
}
console.log(JSON.stringify(resultats, null, 2));
if (erreurs.length) console.log(`Erreurs dans la page :\n${erreurs.join("\n")}`);
if (echec) {
  console.error(echec);
  process.exit(1);
}
if (erreurs.length) process.exit(1);
