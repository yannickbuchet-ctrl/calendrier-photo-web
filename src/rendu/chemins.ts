/** Rectangle aux coins arrondis, décrit par des segments et des courbes de Bézier (même tracé à l'écran et dans le PDF). */
import type { Rect } from "../logique/disposition";

export type Segment = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

const K = 0.5522847498;

/** Coins arrondis de rayon r (ramené à la moitié de la largeur ou de la hauteur, comme Qt). */
export function rectangleArrondi(c: Rect, rayon: number): Segment[] {
  const rx = Math.max(0, Math.min(rayon, c.w / 2));
  const ry = Math.max(0, Math.min(rayon, c.h / 2));
  const { x, y, w, h } = c;
  if (rx <= 0 || ry <= 0) return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
  const kx = rx * K;
  const ky = ry * K;
  return [
    ["M", x + rx, y],
    ["L", x + w - rx, y],
    ["C", x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry],
    ["L", x + w, y + h - ry],
    ["C", x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h],
    ["L", x + rx, y + h],
    ["C", x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
    ["L", x, y + ry],
    ["C", x, y + ry - ky, x + rx - kx, y, x + rx, y],
    ["Z"],
  ];
}
