/**
 * Recadrage d'une photo (CropView et CropDialog de la version Windows) : la photo glisse sous un cadre fixe, à la
 * souris ou au doigt ; la molette ou deux doigts zooment sous le pointeur. Les parties de la photo hors du cadre
 * restent visibles, assombries. « Photo entière » annule le recadrage.
 */
import { RECADRAGE_ENTIER, ZOOM_MAX, zoneSource, type Recadrage, type Rect } from "../logique/disposition";
import type { ImagePrete } from "../rendu/canevas";
import { bouton, el, estTactile, fenetre } from "./dom";

export interface SourceRecadrage {
  /** Meilleure image disponible maintenant (elle peut s'améliorer : redessin à chaque appel de surImage). */
  image: () => ImagePrete | null;
  /** Dimensions de la photo remise droite (le recadrage est exprimé en fractions de celles-ci). */
  largeur: number;
  hauteur: number;
}

const arrondi4 = (v: number) => Math.round(v * 10000) / 10000;

/** Ouvre l'outil ; renvoie le recadrage choisi, RECADRAGE_ENTIER pour « Photo entière », ou null si annulé. */
export async function recadrer(source: SourceRecadrage, aspect: number, depart: Recadrage | null, titre: string, abonner: (f: () => void) => () => void): Promise<Recadrage | null> {
  const f = fenetre(`Recadrer — ${titre}`, { classe: "large recadrage-fenetre" });
  const iw = source.largeur;
  const ih = source.hauteur;
  let zoom = depart && !depart.whole ? Math.max(1, depart.zoom ?? 1) : 1;
  let cx = depart && !depart.whole ? (depart.x ?? 0.5) : 0.5;
  let cy = depart && !depart.whole ? (depart.y ?? 0.5) : 0.5;

  const canevas = el("canvas", { class: "recadrage-vue", tabindex: "0", role: "img", "aria-label": "Photo à recadrer : flèches pour déplacer, plus et moins pour zoomer" });
  const curseur = el("input", { type: "range", min: "100", max: String(ZOOM_MAX * 100), step: "1", "aria-label": "Zoom" });
  const valeur = el("output", { class: "valeur-zoom" });
  const tactile = estTactile();
  const aide = el("p", {
    class: "aide",
    text: tactile ? "Faites glisser la photo avec le doigt pour choisir la partie visible ; écartez deux doigts pour zoomer."
      : "Faites glisser la photo pour choisir la partie visible. Molette ou curseur pour zoomer et dézoomer.",
  });
  const cadre = (): Rect => {
    const marge = canevas.clientWidth < 500 ? 14 : 48;
    const dispoW = canevas.clientWidth - 2 * marge;
    const dispoH = canevas.clientHeight - 2 * marge;
    const w = Math.max(10, Math.min(dispoW, dispoH * aspect));
    const h = w / aspect;
    return { x: canevas.clientWidth / 2 - w / 2, y: canevas.clientHeight / 2 - h / 2, w, h };
  };
  const zone = (z = zoom, x = cx, y = cy) => zoneSource(iw, ih, cadre().w, cadre().h, { zoom: z, x, y });

  /** Applique un changement, puis ramène le centre dans les limites de la photo (_set). */
  function regler(z?: number, x?: number, y?: number) {
    if (z !== undefined) zoom = Math.min(ZOOM_MAX, Math.max(1, z));
    if (x !== undefined && y !== undefined) [cx, cy] = [x, y];
    const s = zone();
    cx = (s.x + s.w / 2) / iw;
    cy = (s.y + s.h / 2) / ih;
    dessiner();
  }

  /** Zoome en gardant fixe le point de la photo sous l'ancre (centre du cadre par défaut). */
  function zoomer(z: number, ancreX?: number, ancreY?: number) {
    const c = cadre();
    const ax = ancreX ?? c.x + c.w / 2;
    const ay = ancreY ?? c.y + c.h / 2;
    const avant = zone();
    const echelle = c.w / avant.w;
    const px = avant.x + (ax - c.x) / echelle;
    const py = avant.y + (ay - c.y) / echelle;
    const nz = Math.min(ZOOM_MAX, Math.max(1, z));
    const apres = zoneSource(iw, ih, c.w, c.h, { zoom: nz });
    const nouvelle = c.w / apres.w;
    const gauche = px - (ax - c.x) / nouvelle;
    const haut = py - (ay - c.y) / nouvelle;
    regler(nz, (gauche + apres.w / 2) / iw, (haut + apres.h / 2) / ih);
  }

  function dessiner() {
    const dpr = window.devicePixelRatio || 1;
    const lw = canevas.clientWidth;
    const lh = canevas.clientHeight;
    if (canevas.width !== Math.round(lw * dpr) || canevas.height !== Math.round(lh * dpr)) {
      canevas.width = Math.round(lw * dpr);
      canevas.height = Math.round(lh * dpr);
    }
    const ctx = canevas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, lw, lh);
    const c = cadre();
    const s = zone();
    const echelle = c.w / s.w;
    const image = source.image();
    if (image) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.image, 0, 0, image.largeur, image.hauteur, c.x - s.x * echelle, c.y - s.y * echelle, iw * echelle, ih * echelle);
    }
    // Assombrit ce qui sera coupé.
    ctx.fillStyle = "rgb(15 23 42 / 0.67)";
    ctx.beginPath();
    ctx.rect(0, 0, lw, lh);
    ctx.rect(c.x + c.w, c.y, -c.w, c.h);
    ctx.fill("evenodd");
    // Cadre et repères des tiers.
    ctx.strokeStyle = "rgb(255 255 255 / 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const k of [1, 2]) {
      ctx.moveTo(c.x + (c.w * k) / 3, c.y);
      ctx.lineTo(c.x + (c.w * k) / 3, c.y + c.h);
      ctx.moveTo(c.x, c.y + (c.h * k) / 3);
      ctx.lineTo(c.x + c.w, c.y + (c.h * k) / 3);
    }
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    curseur.value = String(Math.round(zoom * 100));
    valeur.textContent = `${Math.round(zoom * 100)} %`;
  }

  // Glisser (un doigt ou la souris), pincer (deux doigts).
  const pointeurs = new Map<number, { x: number; y: number }>();
  let glisser: { x: number; y: number; cx: number; cy: number } | null = null;
  let pincer: { distance: number; zoom: number; px: number; py: number } | null = null;
  const position = (e: PointerEvent) => {
    const r = canevas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const milieu = () => {
    const [a, b] = [...pointeurs.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const commencerPincement = () => {
    const m = milieu();
    const c = cadre();
    const s = zone();
    const echelle = c.w / s.w;
    pincer = { distance: Math.max(1, m.d), zoom, px: s.x + (m.x - c.x) / echelle, py: s.y + (m.y - c.y) / echelle };
    glisser = null;
  };
  canevas.addEventListener("pointerdown", (e) => {
    canevas.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, position(e));
    if (pointeurs.size === 2) commencerPincement();
    else if (pointeurs.size === 1) {
      const p = position(e);
      glisser = { x: p.x, y: p.y, cx, cy };
      canevas.classList.add("saisie");
    }
  });
  canevas.addEventListener("pointermove", (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.set(e.pointerId, position(e));
    if (pincer && pointeurs.size >= 2) {
      // Le point de la photo pris entre les doigts reste entre les doigts : zoom et déplacement à la fois.
      const m = milieu();
      const c = cadre();
      const nz = Math.min(ZOOM_MAX, Math.max(1, (pincer.zoom * m.d) / pincer.distance));
      const s = zoneSource(iw, ih, c.w, c.h, { zoom: nz });
      const echelle = c.w / s.w;
      const gauche = pincer.px - (m.x - c.x) / echelle;
      const haut = pincer.py - (m.y - c.y) / echelle;
      regler(nz, (gauche + s.w / 2) / iw, (haut + s.h / 2) / ih);
    } else if (glisser) {
      const p = position(e);
      const echelle = cadre().w / zone().w;
      // La photo suit le pointeur : le centre de la partie visible part dans l'autre sens.
      regler(undefined, glisser.cx - (p.x - glisser.x) / echelle / iw, glisser.cy - (p.y - glisser.y) / echelle / ih);
    }
  });
  const relacher = (e: PointerEvent) => {
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2) pincer = null;
    if (pointeurs.size === 1) {
      const [p] = [...pointeurs.values()];
      glisser = { x: p.x, y: p.y, cx, cy };
    } else if (!pointeurs.size) {
      glisser = null;
      canevas.classList.remove("saisie");
    }
  };
  canevas.addEventListener("pointerup", relacher);
  canevas.addEventListener("pointercancel", relacher);
  canevas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pas = -e.deltaY / (e.deltaMode === 1 ? 3 : 100);
    const p = { x: e.offsetX, y: e.offsetY };
    if (pas) zoomer(zoom * 1.12 ** pas, p.x, p.y);
  }, { passive: false });
  canevas.addEventListener("keydown", (e) => {
    const s = zone();
    const pasX = (s.w * 0.05) / iw;
    const pasY = (s.h * 0.05) / ih;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => regler(undefined, cx - pasX, cy), ArrowRight: () => regler(undefined, cx + pasX, cy),
      ArrowUp: () => regler(undefined, cx, cy - pasY), ArrowDown: () => regler(undefined, cx, cy + pasY),
      "+": () => zoomer(zoom * 1.2), "=": () => zoomer(zoom * 1.2), "-": () => zoomer(zoom / 1.2), "0": () => regler(1, 0.5, 0.5),
    };
    if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]();
    }
  });
  curseur.addEventListener("input", () => zoomer(Number(curseur.value) / 100));

  const controles = el("div", { class: "curseur" },
    bouton("moins", "Dézoomer", () => zoomer(zoom / 1.2), { texte: false }), curseur,
    bouton("plus", "Zoomer", () => zoomer(zoom * 1.2), { texte: false }), valeur,
    bouton("reinitialiser", "Réinitialiser", () => regler(1, 0.5, 0.5), { infobulle: "Revenir au cadrage centré, sans zoom" }));
  f.corps.append(el("div", { class: "recadrage-zone" }, canevas), aide, controles);
  let resultat: Recadrage | null = null;
  f.pied.append(
    bouton("entiere", "Photo entière", () => {
      resultat = { ...RECADRAGE_ENTIER };
      f.fermer();
    }, { classe: "cadre", infobulle: "Annuler le recadrage : la photo est affichée en entier, sans être coupée" }),
    el("span", { class: "espace" }),
    el("button", { type: "button", class: "bouton cadre", text: "Annuler", onclick: () => f.fermer() }),
    el("button", {
      type: "button", class: "bouton principal", text: "Appliquer", onclick: () => {
        resultat = { zoom: arrondi4(zoom), x: arrondi4(cx), y: arrondi4(cy) };
        f.fermer();
      },
    }),
  );
  const observateur = new ResizeObserver(() => dessiner());
  observateur.observe(canevas);
  const desabonner = abonner(() => dessiner());
  requestAnimationFrame(() => {
    regler();
    canevas.focus();
  });
  await f.fermee;
  observateur.disconnect();
  desabonner();
  return resultat;
}
