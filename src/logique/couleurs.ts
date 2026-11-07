/** Couleurs : lecture comme QColor(texte).name() (formats « #rgb », « #rrggbb », « #aarrggbb »… et noms SVG). */

const NOMS_SVG: Record<string, string> = Object.fromEntries(
  ("aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 " +
    "blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 " +
    "chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b " +
    "darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b " +
    "darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a " +
    "darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 " +
    "darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff " +
    "firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 " +
    "goldenrod daa520 gray 808080 grey 808080 green 008000 greenyellow adff2f honeydew f0fff0 hotpink ff69b4 " +
    "indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 " +
    "lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 " +
    "lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa " +
    "lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 " +
    "linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 " +
    "mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc " +
    "mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead " +
    "navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 " +
    "palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 " +
    "peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 red ff0000 rosybrown bc8f8f royalblue 4169e1 " +
    "saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 " +
    "skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 " +
    "tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 transparent 000000 turquoise 40e0d0 violet ee82ee wheat f5deb3 " +
    "white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32")
    .split(" ")
    .reduce<[string, string][]>((paires, mot, i, mots) => (i % 2 ? paires : [...paires, [mot, `#${mots[i + 1]}`]]), []),
);

const huit = (v16: number) => Math.floor((v16 + 128 - ((v16 + 128) >> 8)) >> 8) & 0xff;
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** « #2563eb » pour une couleur lisible, « #000000 » sinon (couleur invalide de Qt). */
export function nomCouleur(valeur: unknown): string {
  if (typeof valeur !== "string") return "#000000";
  const t = valeur.trim();
  if (t.startsWith("#")) {
    const c = t.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(c)) return "#000000";
    const lire = (debut: number, n: number) => Number.parseInt(c.slice(debut, debut + n), 16);
    let r: number, g: number, b: number;
    if (c.length === 12) [r, g, b] = [lire(0, 4), lire(4, 4), lire(8, 4)];
    else if (c.length === 9) [r, g, b] = [lire(0, 3), lire(3, 3), lire(6, 3)].map((v) => (v << 4) | (v >> 8));
    else if (c.length === 8) [r, g, b] = [lire(2, 2), lire(4, 2), lire(6, 2)].map((v) => v * 0x101);
    else if (c.length === 6) [r, g, b] = [lire(0, 2), lire(2, 2), lire(4, 2)].map((v) => v * 0x101);
    else if (c.length === 3) [r, g, b] = [lire(0, 1), lire(1, 1), lire(2, 1)].map((v) => v * 0x1111);
    else return "#000000";
    return `#${hex2(huit(r))}${hex2(huit(g))}${hex2(huit(b))}`;
  }
  return NOMS_SVG[t.toLowerCase().replace(/\s/g, "")] ?? "#000000";
}

/** [r, g, b] (0 à 255) d'une couleur « #rrggbb ». */
export function rvb(couleur: string): [number, number, number] {
  const c = nomCouleur(couleur);
  return [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Couleur d'accent posée avec une transparence alpha (0 à 255) sur le fond blanc de la page : la couleur opaque
 * équivalente (cases des jours fériés et des week-ends).
 */
export function surBlanc(couleur: string, alpha: number): string {
  const a = alpha / 255;
  return `#${rvb(couleur).map((v) => hex2(Math.round(v * a + 255 * (1 - a)))).join("")}`;
}
