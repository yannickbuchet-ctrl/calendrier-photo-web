/** Icônes de l'interface, dessinées pour l'application (traits de 24 × 24, couleur du texte). */
import { decouperCadre } from "../logique/disposition";

const traits: Record<string, string> = {
  nouveau: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>',
  ouvrir: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L22 11H7.5a2 2 0 0 0-1.9 1.4L3 20"/>',
  enregistrer: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><rect x="7" y="13" width="10" height="8" rx="1"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10v7M9 14l3 3 3-3"/>',
  imprimer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  annuler: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  retablir: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  ajouter: '<rect x="3" y="4" width="14" height="14" rx="2"/><path d="m17 13-3-3-8 8"/><path d="M19 15v6M16 18h6"/>',
  auto: '<path d="M5 3v4M3 5h4M6 17v4M4 19h4"/><path d="m13 3 2.2 5.6L21 11l-5.8 2.4L13 19l-2.2-5.6L5 11l5.8-2.4z"/>',
  recadrer: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  ensemble: '<rect x="3" y="3" width="5" height="7" rx="1"/><rect x="10" y="3" width="5" height="7" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/><rect x="3" y="14" width="5" height="7" rx="1"/><rect x="10" y="14" width="5" height="7" rx="1"/><rect x="17" y="14" width="4" height="7" rx="1"/>',
  evenement: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  reglages: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  pages: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6"/><path d="m20 20-4-4"/>',
  moins: '<circle cx="11" cy="11" r="7"/><path d="M8 11h6"/><path d="m20 20-4-4"/>',
  reinitialiser: '<path d="M3 4v6h6"/><path d="M3.5 10a9 9 0 1 1 2.1 7.5"/>',
  entiere: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h8v6H8z"/>',
  retirer: '<path d="M6 6l12 12M18 6 6 18"/>',
  fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
  gauche: '<path d="m15 6-6 6 6 6"/>',
  droite: '<path d="m9 6 6 6-6 6"/>',
  bas: '<path d="m6 9 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  bouclier: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  appareil: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  supprimer: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  importer: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  exporter: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  modeles: '<path d="M3 20h18"/><path d="m3 20 6-9 4 5 3-4 5 8"/><circle cx="17" cy="6" r="2"/>',
  coche: '<path d="m5 12 5 5 9-10"/>',
};

export function icone(nom: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${traits[nom] ?? ""}</svg>`;
}

/** Pictogramme d'une disposition : les cadres des photos, comme sur la page (layout_icon). */
export function iconeDisposition(nombre: number): string {
  const zone = nombre === 1 ? { x: 2, y: 6, w: 20, h: 13 } : { x: 2, y: 3, w: 20, h: 18 };
  const cadres = decouperCadre(zone, nombre, 2)
    .map((c) => `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.w.toFixed(2)}" height="${c.h.toFixed(2)}" rx="1.5"/>`)
    .join("");
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${cadres}</svg>`;
}

/**
 * Le logo de l'application (draw_app_icon de la version Windows) : page de calendrier à anneaux, avec une photo
 * (soleil et montagnes) au-dessus de la grille des jours, sur fond dégradé.
 */
export const LOGO = `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><defs><linearGradient id="logo-fond" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#7c3aed"/></linearGradient><linearGradient id="logo-ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient><clipPath id="logo-photo"><rect x="58" y="66" width="140" height="82" rx="10"/></clipPath></defs><rect x="8" y="8" width="240" height="240" rx="52" fill="url(#logo-fond)"/><rect x="44" y="56" width="168" height="170" rx="18" fill="#0f172a" fill-opacity=".2"/><rect x="44" y="50" width="168" height="170" rx="18" fill="#fff"/><g clip-path="url(#logo-photo)"><rect x="58" y="66" width="140" height="82" fill="url(#logo-ciel)"/><circle cx="168" cy="90" r="13" fill="#fbbf24"/><path d="M104 148 148 100 200 148z" fill="#22c55e"/><path d="M54 148 96 96 140 148z" fill="#16a34a"/></g><g fill="#cbd5e1"><rect x="60" y="162" width="20" height="9" rx="3"/><rect x="88" y="162" width="20" height="9" rx="3"/><rect x="116" y="162" width="20" height="9" rx="3"/><rect x="144" y="162" width="20" height="9" rx="3"/><rect x="172" y="162" width="20" height="9" rx="3"/><rect x="60" y="178" width="20" height="9" rx="3"/><rect x="88" y="178" width="20" height="9" rx="3"/><rect x="116" y="178" width="20" height="9" rx="3"/><rect x="172" y="178" width="20" height="9" rx="3"/><rect x="60" y="194" width="20" height="9" rx="3"/><rect x="88" y="194" width="20" height="9" rx="3"/><rect x="116" y="194" width="20" height="9" rx="3"/><rect x="144" y="194" width="20" height="9" rx="3"/><rect x="172" y="194" width="20" height="9" rx="3"/></g><ellipse cx="154" cy="182.5" rx="11" ry="9.5" fill="#dc2626"/><g fill="#1e293b"><rect x="85" y="34" width="14" height="34" rx="7"/><rect x="157" y="34" width="14" height="34" rx="7"/></g><g fill="#94a3b8"><rect x="89" y="38" width="6" height="22" rx="3"/><rect x="161" y="38" width="6" height="22" rx="3"/></g></svg>`;
