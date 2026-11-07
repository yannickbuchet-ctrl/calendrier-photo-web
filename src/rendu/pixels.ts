/** Taille des photos préparées pour le PDF ou l'impression (sans dépendre de pdf-lib). */
import type { Rect } from "../logique/disposition";

/** Qualité des JPEG des photos (très peu compressés, comme dans le PDF de la version Windows). */
export const QUALITE_JPEG = 0.92;

/**
 * Pixels de la photo à imprimer : ceux de sa cible (unités = pixels à 300 ppp, ou à la résolution d'impression),
 * sans agrandir une photo plus petite que son cadre (moins de pixels, donc moins de 300 ppp).
 */
export function pixelsPhoto(cible: Rect, source: Rect): { largeur: number; hauteur: number } {
  const k = Math.min(1, source.w / cible.w, source.h / cible.h);
  return { largeur: Math.max(1, Math.round(cible.w * k)), hauteur: Math.max(1, Math.round(cible.h * k)) };
}
