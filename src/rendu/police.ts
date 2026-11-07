/**
 * Lecture d'une police TrueType : mesures, correspondance caractère → glyphe, avances, contours des glyphes, et
 * réduction de la police aux glyphes utilisés pour l'intégrer à un PDF.
 *
 * Le même fichier de police sert à l'aperçu (les contours des glyphes sont dessinés sur le canevas) et au PDF (la
 * police y est intégrée, avec les mêmes avances) : le texte est donc placé exactement au même endroit dans les deux.
 */

export type CommandeContour = ["M", number, number] | ["L", number, number] | ["Q", number, number, number, number] | ["Z"];

export class Police {
  readonly octets: Uint8Array;
  readonly unitesParEm: number;
  /** Mesures verticales en unités de la police : hauteur au-dessus et au-dessous de la ligne de base, interligne. */
  readonly ascendant: number;
  readonly descendant: number;
  readonly interligne: number;
  readonly hauteurCapitales: number;
  readonly cadre: [number, number, number, number];
  readonly anglePenche: number;
  readonly nomPostScript: string;
  readonly nombreGlyphes: number;
  private readonly tables = new Map<string, { debut: number; longueur: number }>();
  private readonly vue: DataView;
  private readonly cmap = new Map<number, number>();
  private readonly avances: Uint16Array;
  private readonly loca: Uint32Array;
  private readonly contoursEnCache = new Map<number, CommandeContour[]>();

  constructor(octets: Uint8Array) {
    this.octets = octets;
    this.vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    const v = this.vue;
    const version = v.getUint32(0);
    if (version !== 0x00010000 && version !== 0x74727565) throw new Error("Police TrueType attendue.");
    const nombre = v.getUint16(4);
    for (let i = 0; i < nombre; i++) {
      const e = 12 + 16 * i;
      const etiquette = String.fromCharCode(octets[e], octets[e + 1], octets[e + 2], octets[e + 3]);
      this.tables.set(etiquette, { debut: v.getUint32(e + 8), longueur: v.getUint32(e + 12) });
    }
    for (const t of ["head", "hhea", "hmtx", "maxp", "cmap", "loca", "glyf"]) if (!this.tables.has(t)) throw new Error(`Table « ${t} » absente de la police.`);
    const head = this.table("head");
    this.unitesParEm = v.getUint16(head + 18);
    this.cadre = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)];
    const locaLongue = v.getInt16(head + 50) === 1;
    this.nombreGlyphes = v.getUint16(this.table("maxp") + 4);
    const hhea = this.table("hhea");
    const os2 = this.tables.has("OS/2") ? this.table("OS/2") : -1;
    // Comme Windows (GDI, DirectWrite) : hauteurs « win » de la table OS/2, à défaut celles de hhea.
    this.ascendant = os2 >= 0 ? v.getUint16(os2 + 74) : v.getInt16(hhea + 4);
    this.descendant = os2 >= 0 ? v.getUint16(os2 + 76) : -v.getInt16(hhea + 6);
    this.interligne = Math.max(0, v.getInt16(hhea + 8));
    this.hauteurCapitales = os2 >= 0 && v.getUint16(os2) >= 2 ? v.getInt16(os2 + 88) : Math.round(this.ascendant * 0.7);
    this.anglePenche = this.tables.has("post") ? v.getInt32(this.table("post") + 4) / 65536 : 0;
    const nbMetriques = v.getUint16(hhea + 34);
    const hmtx = this.table("hmtx");
    this.avances = new Uint16Array(this.nombreGlyphes);
    for (let g = 0; g < this.nombreGlyphes; g++) this.avances[g] = v.getUint16(hmtx + 4 * Math.min(g, nbMetriques - 1));
    const loca = this.table("loca");
    this.loca = new Uint32Array(this.nombreGlyphes + 1);
    for (let g = 0; g <= this.nombreGlyphes; g++) this.loca[g] = locaLongue ? v.getUint32(loca + 4 * g) : v.getUint16(loca + 2 * g) * 2;
    this.lireCmap();
    this.nomPostScript = this.lireNom(6) ?? "Police";
  }

  private table(etiquette: string): number {
    return this.tables.get(etiquette)!.debut;
  }

  private lireCmap() {
    const v = this.vue;
    const cmap = this.table("cmap");
    const n = v.getUint16(cmap + 2);
    let meilleure = -1;
    let rang = -1;
    for (let i = 0; i < n; i++) {
      const plateforme = v.getUint16(cmap + 4 + 8 * i);
      const codage = v.getUint16(cmap + 6 + 8 * i);
      const position = cmap + v.getUint32(cmap + 8 + 8 * i);
      const format = v.getUint16(position);
      const r = plateforme === 3 && codage === 10 && format === 12 ? 3 : plateforme === 0 && format === 12 ? 2 : plateforme === 3 && codage === 1 && format === 4 ? 1 : plateforme === 0 && format === 4 ? 0 : -1;
      if (r > rang) {
        rang = r;
        meilleure = position;
      }
    }
    if (meilleure < 0) throw new Error("Aucune table de caractères Unicode dans la police.");
    if (v.getUint16(meilleure) === 12) {
      const groupes = v.getUint32(meilleure + 12);
      for (let i = 0; i < groupes; i++) {
        const g = meilleure + 16 + 12 * i;
        const debut = v.getUint32(g);
        const fin = v.getUint32(g + 4);
        const glyphe = v.getUint32(g + 8);
        for (let c = debut; c <= fin && c - debut < 0x10000; c++) this.cmap.set(c, glyphe + c - debut);
      }
      return;
    }
    const segments = v.getUint16(meilleure + 6) / 2;
    const fins = meilleure + 14;
    const debuts = fins + 2 * segments + 2;
    const deltas = debuts + 2 * segments;
    const decalages = deltas + 2 * segments;
    for (let s = 0; s < segments; s++) {
      const fin = v.getUint16(fins + 2 * s);
      const debut = v.getUint16(debuts + 2 * s);
      const delta = v.getInt16(deltas + 2 * s);
      const decalage = v.getUint16(decalages + 2 * s);
      for (let c = debut; c <= fin && c !== 0xffff; c++) {
        let g: number;
        if (decalage === 0) g = (c + delta) & 0xffff;
        else {
          const p = decalages + 2 * s + decalage + 2 * (c - debut);
          g = v.getUint16(p);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) this.cmap.set(c, g);
      }
    }
  }

  private lireNom(id: number): string | null {
    if (!this.tables.has("name")) return null;
    const v = this.vue;
    const t = this.table("name");
    const n = v.getUint16(t + 2);
    const textes = t + v.getUint16(t + 4);
    for (let i = 0; i < n; i++) {
      const e = t + 6 + 12 * i;
      if (v.getUint16(e + 6) !== id) continue;
      const plateforme = v.getUint16(e);
      const longueur = v.getUint16(e + 8);
      const debut = textes + v.getUint16(e + 10);
      let s = "";
      if (plateforme === 3 || plateforme === 0) for (let k = 0; k + 1 < longueur; k += 2) s += String.fromCharCode(v.getUint16(debut + k));
      else for (let k = 0; k < longueur; k++) s += String.fromCharCode(this.octets[debut + k]);
      if (s) return s.replace(/[^\x21-\x7e]/g, "");
    }
    return null;
  }

  /** Glyphe d'un caractère (0 s'il manque à la police). */
  glyphe(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  aLeCaractere(codePoint: number): boolean {
    return this.cmap.has(codePoint);
  }

  /** Avance d'un glyphe, en unités de la police. */
  avance(glyphe: number): number {
    return this.avances[glyphe] ?? 0;
  }

  /** Largeur d'un texte en unités de la police (somme des avances, sans crénage, comme dans le PDF). */
  largeurUnites(texte: string): number {
    let l = 0;
    for (const c of texte) l += this.avances[this.glyphe(c.codePointAt(0)!)];
    return l;
  }

  /** Contours d'un glyphe (unités de la police, l'axe des y vers le haut). */
  contours(glyphe: number): CommandeContour[] {
    let r = this.contoursEnCache.get(glyphe);
    if (!r) {
      r = [];
      this.ajouterContours(glyphe, [1, 0, 0, 1, 0, 0], r, 0);
      this.contoursEnCache.set(glyphe, r);
    }
    return r;
  }

  private ajouterContours(glyphe: number, m: number[], sortie: CommandeContour[], profondeur: number) {
    if (glyphe >= this.nombreGlyphes || profondeur > 8) return;
    const debut = this.loca[glyphe];
    const fin = this.loca[glyphe + 1];
    if (fin <= debut) return;
    const v = this.vue;
    const p = this.table("glyf") + debut;
    const nbContours = v.getInt16(p);
    const transformer = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    if (nbContours < 0) {
      // Glyphe composé (lettre accentuée : lettre de base et accent).
      let q = p + 10;
      for (;;) {
        const drapeaux = v.getUint16(q);
        const composant = v.getUint16(q + 2);
        q += 4;
        let dx: number, dy: number;
        if (drapeaux & 1) {
          dx = v.getInt16(q);
          dy = v.getInt16(q + 2);
          q += 4;
        } else {
          dx = v.getInt8(q);
          dy = v.getInt8(q + 1);
          q += 2;
        }
        if (!(drapeaux & 2)) dx = dy = 0; // points à faire coïncider : rare, ignoré
        let a = 1, b = 0, c = 0, d = 1;
        const f2 = (o: number) => v.getInt16(o) / 16384;
        if (drapeaux & 8) {
          a = d = f2(q);
          q += 2;
        } else if (drapeaux & 0x40) {
          a = f2(q);
          d = f2(q + 2);
          q += 4;
        } else if (drapeaux & 0x80) {
          a = f2(q);
          b = f2(q + 2);
          c = f2(q + 4);
          d = f2(q + 6);
          q += 8;
        }
        const [ox, oy] = transformer(dx, dy);
        const mm = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, ox, oy];
        this.ajouterContours(composant, mm, sortie, profondeur + 1);
        if (!(drapeaux & 0x20)) break;
      }
      return;
    }
    const fins: number[] = [];
    for (let i = 0; i < nbContours; i++) fins.push(v.getUint16(p + 10 + 2 * i));
    const nbPoints = nbContours ? fins[nbContours - 1] + 1 : 0;
    let q = p + 10 + 2 * nbContours;
    q += 2 + v.getUint16(q); // instructions
    const drapeaux: number[] = [];
    while (drapeaux.length < nbPoints) {
      const f = this.octets[q++];
      drapeaux.push(f);
      if (f & 8) {
        let repetitions = this.octets[q++];
        while (repetitions-- > 0) drapeaux.push(f);
      }
    }
    const xs: number[] = [];
    let x = 0;
    for (const f of drapeaux) {
      if (f & 2) {
        const dx = this.octets[q++];
        x += f & 16 ? dx : -dx;
      } else if (!(f & 16)) {
        x += v.getInt16(q);
        q += 2;
      }
      xs.push(x);
    }
    const ys: number[] = [];
    let y = 0;
    for (const f of drapeaux) {
      if (f & 4) {
        const dy = this.octets[q++];
        y += f & 32 ? dy : -dy;
      } else if (!(f & 32)) {
        y += v.getInt16(q);
        q += 2;
      }
      ys.push(y);
    }
    let premier = 0;
    for (const dernier of fins) {
      const points: { x: number; y: number; surCourbe: boolean }[] = [];
      for (let i = premier; i <= dernier; i++) {
        const [tx, ty] = transformer(xs[i], ys[i]);
        points.push({ x: tx, y: ty, surCourbe: (drapeaux[i] & 1) === 1 });
      }
      premier = dernier + 1;
      if (!points.length) continue;
      // Point de départ : un point sur la courbe, ou le milieu de deux points de contrôle.
      let depart = points.findIndex((pt) => pt.surCourbe);
      let origine: { x: number; y: number };
      if (depart < 0) {
        origine = { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 };
        depart = 0;
        sortie.push(["M", origine.x, origine.y]);
      } else {
        origine = points[depart];
        sortie.push(["M", origine.x, origine.y]);
        depart = depart + 1;
      }
      let controle: { x: number; y: number } | null = null;
      for (let k = 0; k < points.length; k++) {
        const pt = points[(depart + k) % points.length];
        if (pt.surCourbe) {
          if (controle) sortie.push(["Q", controle.x, controle.y, pt.x, pt.y]);
          else sortie.push(["L", pt.x, pt.y]);
          controle = null;
        } else {
          if (controle) {
            const milieu = { x: (controle.x + pt.x) / 2, y: (controle.y + pt.y) / 2 };
            sortie.push(["Q", controle.x, controle.y, milieu.x, milieu.y]);
          }
          controle = pt;
        }
      }
      if (controle) sortie.push(["Q", controle.x, controle.y, origine.x, origine.y]);
      sortie.push(["Z"]);
    }
  }

  /** Composants d'un glyphe composé (pour garder ce qu'il faut dans une police réduite). */
  private composants(glyphe: number): number[] {
    const debut = this.loca[glyphe];
    if (this.loca[glyphe + 1] <= debut) return [];
    const v = this.vue;
    const p = this.table("glyf") + debut;
    if (v.getInt16(p) >= 0) return [];
    const r: number[] = [];
    let q = p + 10;
    for (;;) {
      const drapeaux = v.getUint16(q);
      r.push(v.getUint16(q + 2));
      q += 4 + (drapeaux & 1 ? 4 : 2) + (drapeaux & 8 ? 2 : drapeaux & 0x40 ? 4 : drapeaux & 0x80 ? 8 : 0);
      if (!(drapeaux & 0x20)) return r;
    }
  }

  /**
   * La police réduite aux glyphes utilisés : les autres glyphes sont vidés (leurs numéros ne changent pas), et les
   * tables inutiles dans un PDF (substitutions, positionnement, crénage) sont retirées.
   */
  reduire(glyphes: Iterable<number>): Uint8Array {
    const gardes = new Set<number>([0]);
    const pile = [...glyphes];
    while (pile.length) {
      const g = pile.pop()!;
      if (g >= this.nombreGlyphes || gardes.has(g)) continue;
      gardes.add(g);
      pile.push(...this.composants(g));
    }
    const glyf = this.table("glyf");
    const morceaux: Uint8Array[] = [];
    const loca = new Uint8Array(4 * (this.nombreGlyphes + 1));
    const vueLoca = new DataView(loca.buffer);
    let position = 0;
    for (let g = 0; g < this.nombreGlyphes; g++) {
      vueLoca.setUint32(4 * g, position);
      const debut = this.loca[g];
      const fin = this.loca[g + 1];
      if (!gardes.has(g) || fin <= debut) continue;
      const longueur = fin - debut;
      const bloc = new Uint8Array(longueur + ((4 - (longueur % 4)) % 4));
      bloc.set(this.octets.subarray(glyf + debut, glyf + fin));
      morceaux.push(bloc);
      position += bloc.length;
    }
    vueLoca.setUint32(4 * this.nombreGlyphes, position);
    const nouveauGlyf = new Uint8Array(position);
    let p = 0;
    for (const m of morceaux) {
      nouveauGlyf.set(m, p);
      p += m.length;
    }
    const head = this.octets.slice(this.table("head"), this.table("head") + this.tables.get("head")!.longueur);
    new DataView(head.buffer).setInt16(50, 1); // positions longues dans loca
    new DataView(head.buffer).setUint32(8, 0); // somme de contrôle recalculée plus bas
    const tables = new Map<string, Uint8Array>();
    for (const etiquette of ["OS/2", "cmap", "cvt ", "fpgm", "hhea", "hmtx", "maxp", "name", "post", "prep"]) {
      const t = this.tables.get(etiquette);
      if (t) tables.set(etiquette, this.octets.subarray(t.debut, t.debut + t.longueur));
    }
    tables.set("head", head);
    tables.set("loca", loca);
    tables.set("glyf", nouveauGlyf);
    return assemblerPolice(tables);
  }
}

function sommeControle(o: Uint8Array): number {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let s = 0;
  for (let i = 0; i + 4 <= o.length; i += 4) s = (s + v.getUint32(i)) >>> 0;
  const reste = o.length % 4;
  if (reste) {
    let dernier = 0;
    for (let k = 0; k < 4; k++) dernier = (dernier << 8) | (k < reste ? o[o.length - reste + k] : 0);
    s = (s + (dernier >>> 0)) >>> 0;
  }
  return s;
}

/** Fichier TrueType à partir de ses tables (triées, alignées sur 4 octets, sommes de contrôle à jour). */
function assemblerPolice(tables: Map<string, Uint8Array>): Uint8Array {
  const etiquettes = [...tables.keys()].sort();
  const n = etiquettes.length;
  let puissance = 1;
  let log = 0;
  while (puissance * 2 <= n) {
    puissance *= 2;
    log++;
  }
  let taille = 12 + 16 * n;
  for (const e of etiquettes) taille += (tables.get(e)!.length + 3) & ~3;
  const sortie = new Uint8Array(taille);
  const v = new DataView(sortie.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, n);
  v.setUint16(6, puissance * 16);
  v.setUint16(8, log);
  v.setUint16(10, n * 16 - puissance * 16);
  let position = 12 + 16 * n;
  let positionHead = 0;
  etiquettes.forEach((e, i) => {
    const donnees = tables.get(e)!;
    const entree = 12 + 16 * i;
    for (let k = 0; k < 4; k++) sortie[entree + k] = e.charCodeAt(k);
    v.setUint32(entree + 4, sommeControle(donnees));
    v.setUint32(entree + 8, position);
    v.setUint32(entree + 12, donnees.length);
    sortie.set(donnees, position);
    if (e === "head") positionHead = position;
    position += (donnees.length + 3) & ~3;
  });
  v.setUint32(positionHead + 8, (0xb1b0afba - sommeControle(sortie)) >>> 0);
  return sortie;
}
