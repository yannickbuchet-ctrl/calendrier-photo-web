/**
 * Décodage des photos par le navigateur (JPEG, PNG, WebP, GIF, BMP, AVIF, et HEIC avec Safari), remises dans le bon
 * sens (orientation EXIF) et réduites à la taille utile. Fonctionne aussi dans un Web Worker.
 *
 * Mémoire : une photo de 12 Mpx décodée occupe 48 Mo. Quand le navigateur sait réduire la photo pendant son
 * décodage, on ne décode jamais la pleine résolution pour une réduction ; sinon, la photo est décodée puis aussitôt
 * réduite et libérée, une à la fois.
 */
import type { Rect } from "../logique/disposition";

/** Ce qu'il faut savoir d'une photo pour la décoder : dimensions remises droites, orientation EXIF, type. */
export interface MetaDecodage {
  largeur: number;
  hauteur: number;
  orientation: number;
  type: string;
}

export type Canevas = OffscreenCanvas | HTMLCanvasElement;

/** JPEG de 2 × 1 pixels (noir, blanc) avec l'orientation EXIF 6 : sert à savoir ce que fait le navigateur. */
const TEMOIN =
  "/9j/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/4AAQSkZJRgABAQAAAQABAAD/2wCEAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRQBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIAAEAAgMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APv79k7/AJNY+Df/AGJmjf8ApDDQB//Z";

interface Comportement {
  /** Le navigateur remet les photos JPEG droites d'après leur orientation EXIF. */
  orientation: boolean;
  /** Il sait réduire une photo pendant son décodage, aux dimensions de la photo remise droite. */
  reduction: boolean;
}

let comportement: Promise<Comportement> | null = null;

async function bitmap(blob: Blob, options: ImageBitmapOptions = {}): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image", ...options });
  } catch (e) {
    // Navigateur plus ancien qui ne connaît pas « from-image » (il remet alors les photos droites de lui-même).
    if (e instanceof TypeError) return createImageBitmap(blob, options);
    throw e;
  }
}

export function comportementNavigateur(): Promise<Comportement> {
  comportement ??= (async () => {
    const blob = new Blob([Uint8Array.from(atob(TEMOIN), (c) => c.charCodeAt(0))], { type: "image/jpeg" });
    let orientation = false;
    let reduction = false;
    try {
      const b = await bitmap(blob);
      orientation = b.width === 1 && b.height === 2;
      b.close();
      const r = await bitmap(blob, { resizeWidth: 3, resizeHeight: 6, resizeQuality: "high" });
      reduction = orientation && r.width === 3 && r.height === 6;
      r.close();
    } catch {
      /* décodage par les moyens de secours */
    }
    return { orientation, reduction };
  })();
  return comportement;
}

export function creerCanevas(w: number, h: number): Canevas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function contexte(c: Canevas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = (c as OffscreenCanvas).getContext("2d", { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Dessin impossible : mémoire insuffisante ?");
  return ctx;
}

/** Libère la mémoire d'un canevas (les navigateurs la gardent tant qu'il a une taille). */
export function liberer(c: Canevas | ImageBitmap | null | undefined) {
  if (!c) return;
  if ("close" in c) c.close();
  else {
    c.width = 0;
    c.height = 0;
  }
}

export async function versJpeg(c: Canevas, qualite: number): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality: qualite });
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Encodage JPEG impossible."))), "image/jpeg", qualite));
}

/** Décodage complet, sans réduction (élément <img> en dernier recours, hors Worker). */
async function decoderComplet(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await bitmap(blob);
  } catch (e) {
    if (typeof document === "undefined") throw e;
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/** Transformation qui remet droite une photo brute (orientation EXIF 2 à 8), pour un dessin de w × h (sens final). */
function redresser(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, orientation: number, w: number, h: number) {
  const t: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, w, 0], 7: [0, -1, -1, 0, w, h], 8: [0, -1, 1, 0, 0, h],
  };
  if (t[orientation]) ctx.transform(...t[orientation]);
}

/**
 * Photo remise droite et réduite à w × h pixels (au plus ses dimensions), éventuellement limitée à une partie
 * source (en pixels de la photo remise droite). Renvoie un canevas que l'appelant libère.
 */
export async function decoder(blob: Blob, meta: MetaDecodage, w: number, h: number, source?: Rect): Promise<Canevas> {
  const s = source ?? { x: 0, y: 0, w: meta.largeur, h: meta.hauteur };
  const echelle = Math.min(1, Math.max(w / s.w, h / s.h));
  const c = await comportementNavigateur();
  let image: ImageBitmap | HTMLImageElement | null = null;
  let reduite = false;
  try {
    if (c.reduction && echelle < 0.9) {
      // Décodage directement réduit (avec 3 % de marge), sans passer par la pleine résolution.
      const rw = Math.max(1, Math.min(meta.largeur, Math.ceil(meta.largeur * echelle * 1.03)));
      const rh = Math.max(1, Math.min(meta.hauteur, Math.ceil(meta.hauteur * echelle * 1.03)));
      const b = await bitmap(blob, { resizeWidth: rw, resizeHeight: rh, resizeQuality: "high" });
      if (b.width === rw && b.height === rh) {
        image = b;
        reduite = true;
      } else b.close();
    }
    image ??= await decoderComplet(blob);
    const largeurImage = "naturalWidth" in image ? image.naturalWidth : image.width;
    const hauteurImage = "naturalHeight" in image ? image.naturalHeight : image.height;
    // Photo restée couchée : le navigateur n'a pas appliqué l'orientation EXIF, on la redresse ici.
    const couchee = !reduite && meta.orientation >= 2 && meta.type === "image/jpeg" && !c.orientation &&
      (meta.orientation < 5 || (largeurImage === meta.hauteur && hauteurImage === meta.largeur));
    if (couchee) {
      const droit = creerCanevas(meta.largeur, meta.hauteur);
      const ctx = contexte(droit);
      redresser(ctx, meta.orientation, meta.largeur, meta.hauteur);
      ctx.drawImage(image, 0, 0);
      if ("close" in image) image.close();
      image = null;
      return await reduire(droit, { x: s.x, y: s.y, w: s.w, h: s.h }, w, h, true);
    }
    // Pixels de l'image décodée par pixel de la photo (réduite ou non).
    const kx = largeurImage / meta.largeur;
    const ky = hauteurImage / meta.hauteur;
    return await reduire(image, { x: s.x * kx, y: s.y * ky, w: s.w * kx, h: s.h * ky }, w, h, false);
  } finally {
    if (image && "close" in image) image.close();
  }
}

/** Réduit une partie d'une image à w × h, par moitiés successives pour une réduction de bonne qualité. */
async function reduire(image: CanvasImageSource, s: Rect, w: number, h: number, libererSource: boolean): Promise<Canevas> {
  let source: CanvasImageSource = image;
  let zone = s;
  let intermediaire: Canevas | null = null;
  while (zone.w / 2 >= w * 1.0 && zone.h / 2 >= h * 1.0 && zone.w > 2 && zone.h > 2) {
    const nw = Math.max(w, Math.round(zone.w / 2));
    const nh = Math.max(h, Math.round(zone.h / 2));
    const moitie = creerCanevas(nw, nh);
    const ctx = contexte(moitie);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, zone.x, zone.y, zone.w, zone.h, 0, 0, nw, nh);
    if (intermediaire) liberer(intermediaire);
    else if (libererSource) liberer(source as Canevas);
    intermediaire = moitie;
    source = moitie;
    zone = { x: 0, y: 0, w: nw, h: nh };
  }
  const sortie = creerCanevas(w, h);
  const ctx = contexte(sortie);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, zone.x, zone.y, zone.w, zone.h, 0, 0, w, h);
  if (intermediaire) liberer(intermediaire);
  else if (libererSource) liberer(source as Canevas);
  return sortie;
}

/** Dimensions d'une réduction dont le plus grand côté mesure au plus cote pixels. */
export function tailleReduite(largeur: number, hauteur: number, cote: number): { w: number; h: number } {
  const k = Math.min(1, cote / Math.max(largeur, hauteur));
  return { w: Math.max(1, Math.round(largeur * k)), h: Math.max(1, Math.round(hauteur * k)) };
}
