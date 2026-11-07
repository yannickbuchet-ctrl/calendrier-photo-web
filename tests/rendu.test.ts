// Dessin des pages comparé à celui de l'application Windows : les appels de dessin de CalendarRenderer (cases, lignes,
// bandeaux de vacances, textes demandés) ont été enregistrés par scripts/references_python.py.
import { describe, expect, it } from "vitest";
import { surBlanc } from "../src/logique/couleurs";
import { projetVide } from "../src/logique/projet";
import { reglagesDepuisDict } from "../src/logique/reglages";
import { dessinerPage, type Operation } from "../src/rendu/page";
import { ALIGNEMENT, poserTexte } from "../src/rendu/texte";
import { REFERENCES as R } from "./references/python";
import { donneesRendu, police } from "./outils";

type OpPython = [string, ...unknown[]];

/** Couleur « #aarrggbb » de Qt posée sur la page blanche. */
function couleurQt(argb: string): string {
  const alpha = Number.parseInt(argb.slice(1, 3), 16);
  const rgb = `#${argb.slice(3)}`;
  return alpha === 255 ? rgb : surBlanc(rgb, alpha);
}

describe("pages dessinées comme dans la version Windows", () => {
  for (const cas of R.rendus) {
    it(cas.nom, () => {
      const projet = projetVide();
      projet.reglages = reglagesDepuisDict(cas.reglages);
      const { ops } = dessinerPage(donneesRendu(projet), cas.page);
      const python = cas.ops as OpPython[];

      const arrondis = ops.filter((o): o is Extract<Operation, { type: "arrondi" }> => o.type === "arrondi");
      const arrondisPython = python.filter((o) => o[0] === "arrondi");
      // Pastilles de la légende : leur position horizontale dépend de la largeur des mots, donc de la police.
      expect(arrondis.map((o) => [o.legende ? [o.r.y, o.r.w, o.r.h] : [o.r.x, o.r.y, o.r.w, o.r.h], o.rayon, o.couleur])).toEqual(
        arrondisPython.map(([, r, rayon, couleur], i) => [arrondis[i]?.legende ? (r as number[]).slice(1) : r, rayon, couleurQt(couleur as string)]),
      );

      const lignes = ops.filter((o): o is Extract<Operation, { type: "ligne" }> => o.type === "ligne");
      expect(lignes.map((o) => [[o.x1, o.y1, o.x2, o.y2], o.epaisseur, o.couleur])).toEqual(
        python.filter((o) => o[0] === "ligne").map(([, p, e, c]) => [p, e, c]),
      );

      const textes = ops.filter((o): o is Extract<Operation, { type: "texte" }> => o.type === "texte");
      const textesPython = python.filter((o) => o[0] === "texte") as [string, number[], number, string, number, boolean, string][];
      expect(textes.map((t) => t.demande.texte)).toEqual(textesPython.map((t) => t[3]));
      textes.forEach((t, i) => {
        const [, r, drapeaux, texte, px, gras, couleur] = textesPython[i];
        expect([t.demande.drapeaux, t.couleur], texte).toEqual([drapeaux, couleur]);
        if (drapeaux & ALIGNEMENT.RETOUR) return; // libellés des jours : taille et place dépendent de la police
        expect([t.px, t.gras], texte).toEqual([px, gras]);
        const position = texte.startsWith("zone ") ? r.slice(1) : r; // légende : x dépend de la largeur des mots
        const d = t.demande.r;
        expect(texte.startsWith("zone ") ? [d.y, d.w, d.h] : [d.x, d.y, d.w, d.h], texte).toEqual(position);
      });
    });
  }
});

describe("mise en page du texte", () => {
  const f = { police: police(0, false), px: 50, gras: false };

  it("retour à la ligne entre les mots, interligne arrondi vers le haut", () => {
    const r = { x: 10, y: 20, w: 300, h: 1000 };
    const pose = poserTexte(r, ALIGNEMENT.GAUCHE | ALIGNEMENT.HAUT | ALIGNEMENT.RETOUR, "Anniversaire de mariage de Paul et Zoé", f);
    expect(pose.lignes.length).toBeGreaterThan(2);
    for (const l of pose.lignes) {
      expect(l.largeur).toBeLessThanOrEqual(300);
      expect(l.x).toBe(10);
    }
    expect(pose.lignes.map((l) => l.texte).join(" ")).toBe("Anniversaire de mariage de Paul et Zoé");
    expect(pose.decoupe).toBeNull();
  });

  it("un mot trop long dépasse et le texte est découpé au rectangle", () => {
    const pose = poserTexte({ x: 0, y: 0, w: 60, h: 40 }, ALIGNEMENT.GAUCHE | ALIGNEMENT.HAUT | ALIGNEMENT.RETOUR, "Anticonstitutionnellement", f);
    expect(pose.lignes).toHaveLength(1);
    expect(pose.decoupe).toEqual({ x: 0, y: 0, w: 60, h: 40 });
  });

  it("centré dans le rectangle", () => {
    const r = { x: 0, y: 0, w: 400, h: 200 };
    const pose = poserTexte(r, ALIGNEMENT.CENTRE, "Mars", f);
    const l = pose.lignes[0];
    expect(l.x + l.largeur / 2).toBeCloseTo(200, 6);
    expect(pose.boite.y + pose.boite.h / 2).toBeCloseTo(100, 6);
  });
});
