/**
 * Dessin d'une page (liste d'opérations, voir page.ts) sur un canevas : aperçu, vignettes, vue d'ensemble et
 * impression. Le texte est dessiné avec les contours des glyphes de la police, aux positions calculées pour le PDF.
 */
import type { Rect } from "../logique/disposition";
import { rectangleArrondi } from "./chemins";
import type { Operation, PageDessinee } from "./page";
import type { Police } from "./police";

type Contexte = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Une image prête à dessiner, et ses dimensions en pixels. */
export interface ImagePrete {
  image: CanvasImageSource;
  largeur: number;
  hauteur: number;
}

export interface OptionsCanevas {
  /** Pixels du canevas par unité de la page. */
  echelle: number;
  /** Meilleure image disponible d'une photo (réduction ou original), ou null si elle n'est pas encore prête. */
  image: (id: string) => ImagePrete | null;
  /** Dimensions de l'original (le recadrage y est exprimé). */
  dimensions: (id: string) => { w: number; h: number } | null;
  polices: { normal: Police; gras: Police };
  /** Couleur d'une photo pas encore chargée. */
  attente?: string;
  /** Photo déjà découpée à sa partie visible (impression) : dessinée telle quelle dans sa cible. */
  decoupee?: (op: Extract<Operation, { type: "photo" }>) => CanvasImageSource | null;
}

const glyphesEnCache = new WeakMap<Police, Map<number, Path2D>>();

function cheminGlyphe(police: Police, glyphe: number): Path2D {
  let cache = glyphesEnCache.get(police);
  if (!cache) glyphesEnCache.set(police, (cache = new Map()));
  let chemin = cache.get(glyphe);
  if (!chemin) {
    chemin = new Path2D();
    for (const c of police.contours(glyphe)) {
      if (c[0] === "M") chemin.moveTo(c[1], c[2]);
      else if (c[0] === "L") chemin.lineTo(c[1], c[2]);
      else if (c[0] === "Q") chemin.quadraticCurveTo(c[1], c[2], c[3], c[4]);
      else chemin.closePath();
    }
    cache.set(glyphe, chemin);
  }
  return chemin;
}

function tracer(ctx: Contexte, r: Rect, rayon: number) {
  ctx.beginPath();
  for (const s of rectangleArrondi(r, rayon)) {
    if (s[0] === "M") ctx.moveTo(s[1], s[2]);
    else if (s[0] === "L") ctx.lineTo(s[1], s[2]);
    else if (s[0] === "C") ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
    else ctx.closePath();
  }
}

export function dessinerSurCanevas(ctx: Contexte, page: PageDessinee, o: OptionsCanevas) {
  ctx.save();
  ctx.scale(o.echelle, o.echelle);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const op of page.ops) {
    switch (op.type) {
      case "rect":
        ctx.fillStyle = op.couleur;
        ctx.fillRect(op.r.x, op.r.y, op.r.w, op.r.h);
        break;
      case "arrondi":
        ctx.fillStyle = op.couleur;
        tracer(ctx, op.r, op.rayon);
        ctx.fill();
        break;
      case "ligne":
        ctx.strokeStyle = op.couleur;
        ctx.lineWidth = op.epaisseur;
        ctx.lineCap = "square";
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        break;
      case "texte": {
        const police = op.gras ? o.polices.gras : o.polices.normal;
        const k = op.px / police.unitesParEm;
        if (op.decoupe) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(op.decoupe.x, op.decoupe.y, op.decoupe.w, op.decoupe.h);
          ctx.clip();
        }
        ctx.fillStyle = op.couleur;
        for (const ligne of op.lignes) {
          let x = ligne.x;
          for (const c of ligne.texte) {
            const g = police.glyphe(c.codePointAt(0)!);
            if (g) {
              ctx.save();
              ctx.translate(x, ligne.y);
              ctx.scale(k, -k);
              ctx.fill(cheminGlyphe(police, g));
              ctx.restore();
            }
            x += police.avance(g) * k;
          }
        }
        if (op.decoupe) ctx.restore();
        break;
      }
      case "photo": {
        const deja = o.decoupee?.(op);
        if (deja) {
          ctx.save();
          tracer(ctx, op.cible, op.rayon);
          ctx.clip();
          ctx.drawImage(deja, op.cible.x, op.cible.y, op.cible.w, op.cible.h);
          ctx.restore();
          break;
        }
        const image = o.image(op.id);
        const dimensions = o.dimensions(op.id);
        ctx.save();
        tracer(ctx, op.cible, op.rayon);
        if (!image || !dimensions) {
          ctx.fillStyle = o.attente ?? "#e2e8f0";
          ctx.fill();
          ctx.restore();
          break;
        }
        ctx.clip();
        const kx = image.largeur / dimensions.w;
        const ky = image.hauteur / dimensions.h;
        const sx = Math.max(0, op.source.x * kx);
        const sy = Math.max(0, op.source.y * ky);
        const sw = Math.min(image.largeur - sx, op.source.w * kx);
        const sh = Math.min(image.hauteur - sy, op.source.h * ky);
        if (sw > 0 && sh > 0) ctx.drawImage(image.image, sx, sy, sw, sh, op.cible.x, op.cible.y, op.cible.w, op.cible.h);
        ctx.restore();
        break;
      }
      case "decoupe":
        ctx.beginPath();
        ctx.rect(op.r.x, op.r.y, op.r.w, op.r.h);
        ctx.clip();
        break;
      case "sauver":
        ctx.save();
        break;
      case "restaurer":
        ctx.restore();
        break;
    }
  }
  ctx.restore();
}
