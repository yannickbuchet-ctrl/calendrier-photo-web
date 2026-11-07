// Export PDF : nombre et dimensions exactes des pages, place exacte des photos (comparée à la géométrie de la version
// Windows), photos à 300 ppp au plus, cadres vides non imprimés, texte vectoriel lisible avec la police intégrée.
import { describe, expect, it } from "vitest";
import { dimensionsMm } from "../src/logique/disposition";
import { projetVide, type Projet } from "../src/logique/projet";
import { creerPdf, pixelsPhoto, type PreparerPhoto } from "../src/rendu/pdf";
import { Police } from "../src/rendu/police";
import { REFERENCES as R } from "./references/python";
import { lirePdf, texteDesPages } from "./lirePdf";
import { donneesRendu, jpegUni, police } from "./outils";

/** En-tête JPEG seul (début, dimensions, fin) : suffit à pdf-lib pour intégrer une image, sans en coder les pixels. */
function jpegFactice(w: number, h: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}

const preparerFactice: PreparerPhoto = async (_id, _source, largeur, hauteur) => ({ jpeg: jpegFactice(largeur, hauteur), largeur, hauteur });
const pt = (mm: number) => (mm / 25.4) * 72;

/** Un calendrier rempli : couverture, 1 à 4 photos par mois, un recadrage « rempli » partout sauf un. */
function calendrier(format: number): { projet: Projet; dimensions: Record<string, { w: number; h: number }> } {
  const projet = projetVide();
  projet.reglages.format = format;
  projet.reglages.year = 2027;
  projet.reglages.school_zone = "ABC";
  projet.reglages.events = [{ day: 14, month: 3, year: 2019, text: "Léa", kind: "birthday" }];
  const dimensions: Record<string, { w: number; h: number }> = {};
  const cles = ["cover", ...Array.from({ length: 12 }, (_, i) => String(i))];
  cles.forEach((cle) => {
    const n = cle === "cover" ? 1 : (Number(cle) % 4) + 1;
    projet.layouts[cle] = n;
    projet.photos[cle] = Array.from({ length: 4 }, (_, e) => (e < n ? `photo-${cle}-${e}` : null));
    projet.crops[cle] = Array.from({ length: 4 }, () => ({ zoom: 1, x: 0.5, y: 0.5 }));
    for (let e = 0; e < n; e++) dimensions[`photo-${cle}-${e}`] = e % 2 ? { w: 3000, h: 4000 } : { w: 6000, h: 4000 };
  });
  return { projet, dimensions };
}

describe("export PDF", () => {
  for (let format = 0; format < 4; format++) {
    it(`format ${["A4 portrait", "A4 paysage", "A3 portrait", "A3 paysage"][format]} : pages, cadres et 300 ppp`, async () => {
      const { projet, dimensions } = calendrier(format);
      const octets = await creerPdf(donneesRendu(projet, dimensions), preparerFactice, { titre: "Mon calendrier", application: "Calendrier Photo Web" });
      const pdf = await lirePdf(octets);
      expect(pdf.titre).toBe("Mon calendrier");
      expect(pdf.pages).toHaveLength(13);
      const { largeur, hauteur } = dimensionsMm(format);
      const geometrie = R.geometrie[format];
      pdf.pages.forEach((page, i) => {
        expect(page.largeur).toBeCloseTo(pt(largeur), 6);
        expect(page.hauteur).toBeCloseTo(pt(hauteur), 6);
        const n = i === 0 ? 1 : ((i - 1) % 4) + 1;
        expect(page.images).toHaveLength(n);
        const cadres: number[][] = i === 0 ? [geometrie.zones.cover[0]] : geometrie.cadres[n];
        page.images.forEach((image, e) => {
          // Cadre de la version Windows (unités à 300 ppp) converti en points.
          cadres[e].forEach((v, k) => expect(image.rect[k]).toBeCloseTo(v * 0.24, 4));
          expect(image.ppp).toBeGreaterThan(299);
          expect(image.ppp).toBeLessThan(301);
        });
      });
      expect(pdf.polices.every((p) => /^\/CALP[A-Z]{2}\+OpenSans-(Regular|Bold)$/.test(p))).toBe(true);
    });
  }

  it("photo plus petite que son cadre : pas agrandie (moins de 300 ppp), photo entière centrée", async () => {
    const projet = projetVide();
    projet.reglages.year = 2027;
    projet.photos["0"] = ["petite", null, null, null];
    const octets = await creerPdf(donneesRendu(projet, { petite: { w: 400, h: 300 } }), async (_id, source, l, h) => {
      expect([l, h]).toEqual([400, 300]);
      expect(source).toEqual({ x: 0, y: 0, w: 400, h: 300 });
      return { jpeg: jpegUni(l, h), largeur: l, hauteur: h };
    }, { titre: "t", application: "a" });
    const page = (await lirePdf(octets)).pages[1];
    expect(page.images).toHaveLength(1);
    const image = page.images[0];
    expect(image.ppp).toBeLessThan(100);
    // Photo entière : réduite et centrée dans le cadre de la disposition 1.
    const cadre = R.geometrie[0].cadres[1][0].map((v: number) => v * 0.24);
    expect(image.rect[0] + image.rect[2] / 2).toBeCloseTo(cadre[0] + cadre[2] / 2, 4);
    expect(image.rect[1] + image.rect[3] / 2).toBeCloseTo(cadre[1] + cadre[3] / 2, 4);
    expect(image.rect[2]).toBeCloseTo(cadre[2], 4); // 4:3, plus large que le cadre : il en prend toute la largeur
    expect(image.rect[3]).toBeLessThan(cadre[3]);
  });

  it("cadres vides non imprimés ; texte lisible (police intégrée, accents, âge)", async () => {
    const projet = projetVide();
    projet.reglages.year = 2027;
    projet.reglages.events = [{ day: 14, month: 3, year: 2019, text: "Léa", kind: "birthday" }, { day: 21, month: 6, year: null, text: "Fête de la musique", kind: "yearly" }];
    projet.layouts["0"] = 2;
    projet.photos["0"] = ["gauche", null, null, null];
    const octets = await creerPdf(donneesRendu(projet, { gauche: { w: 300, h: 400 } }), async (_i, _s, l, h) => ({ jpeg: jpegUni(l, h), largeur: l, hauteur: h }),
      { titre: "Calendrier 2027", application: "Calendrier Photo Web" });
    const pdf = await lirePdf(octets);
    expect(pdf.pages[1].images).toHaveLength(1);
    expect(pdf.pages[0].images).toHaveLength(0);
    expect(pdf.pages.map((p) => p.texte).join("")).not.toContain("Aucune photo");
    const textes = await texteDesPages(octets);
    expect(textes[0]).toContain("Mon calendrier");
    expect(textes[0]).toContain("2027");
    expect(textes[1]).toContain("Janvier");
    expect(textes[1]).toContain("Jour de l'an");
    expect(textes[3]).toContain("Léa (8 ans)");
    expect(textes[6]).toContain("Fête de la musique");
    expect(textes[8]).toContain("Assomption");
    expect(textes[12]).toContain("Noël");
  });

  for (const [style, nom] of [[1, "Gelasio"], [2, "Kalam"]] as const) {
    it(`police ${nom} : intégrée et lisible, accents compris`, async () => {
      const projet = projetVide();
      projet.reglages.year = 2027;
      projet.reglages.font = style;
      projet.reglages.title = "Été à Nîmes — « Œuvres »";
      const octets = await creerPdf(donneesRendu(projet), preparerFactice, { titre: "t", application: "a" });
      expect((await lirePdf(octets)).polices.every((p) => p.includes(nom))).toBe(true);
      const textes = await texteDesPages(octets);
      expect(textes[0]).toContain("Été à Nîmes — « Œuvres »");
      expect(textes[2]).toContain("Février");
    });
  }

  it("police réduite aux glyphes utilisés : relisible et bien plus légère", () => {
    const p = police(2, false);
    const glyphes = [..."Janvier 2027 Léa"].map((c) => p.glyphe(c.codePointAt(0)!));
    const reduite = new Police(p.reduire(glyphes));
    expect(reduite.nombreGlyphes).toBe(p.nombreGlyphes);
    expect(reduite.octets.length).toBeLessThan(p.octets.length / 4);
    for (const g of glyphes) {
      expect(reduite.avance(g)).toBe(p.avance(g));
      expect(reduite.contours(g)).toEqual(p.contours(g));
    }
  });

  it("pixels d'une photo dans le PDF", () => {
    expect(pixelsPhoto({ x: 0, y: 0, w: 2000, h: 1500 }, { x: 0, y: 0, w: 4000, h: 3000 })).toEqual({ largeur: 2000, hauteur: 1500 });
    expect(pixelsPhoto({ x: 0, y: 0, w: 2000, h: 1500 }, { x: 0, y: 0, w: 1000, h: 750 })).toEqual({ largeur: 1000, hauteur: 750 });
  });
});
