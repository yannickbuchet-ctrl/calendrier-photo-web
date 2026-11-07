// Logique du calendrier comparée aux résultats de l'application Windows (calendrier.py), calculés par
// scripts/references_python.py : jours fériés, vacances, semaines, événements, CSV, dates des photos, remplissage
// automatique, géométrie des pages, couleurs et réglages.
process.env.TZ = "Europe/Paris";

import { describe, expect, it } from "vitest";
import { iso, semaineIso, semainesDuMois } from "../src/logique/dates";
import { aspectsCadres, decouperCadre, dimensionsUnites, rapportPage, zoneSource, zonesPage, FORMATS } from "../src/logique/disposition";
import { evenementsDuJour, exporterCsv, importerCsv, nettoyerEvenement, type Evenement } from "../src/logique/evenements";
import { datePhoto, datesExif, lireDateExif } from "../src/logique/exif";
import { joursFeries, paques } from "../src/logique/feries";
import { nomCouleur } from "../src/logique/couleurs";
import { planifierMois, type PhotoAPlacer } from "../src/logique/plan";
import { arrondiPython } from "../src/logique/python";
import { reglagesDepuisDict, reglagesParDefaut, reglagesVersDict } from "../src/logique/reglages";
import { JOURS_VACANCES } from "../src/logique/vacances";
import { REFERENCES as R } from "./references/python";

const octets = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));
const rect = (r: { x: number; y: number; w: number; h: number }) => [r.x, r.y, r.w, r.h];

describe("jours fériés, Pâques et vacances scolaires", () => {
  it("Pâques de 1583 à 2499", () => {
    const calcule = Array.from({ length: 2500 - 1583 }, (_, k) => {
      const p = paques(1583 + k);
      return iso(p.a, p.m, p.j);
    });
    expect(calcule).toEqual(R.paques);
  });

  it("jours fériés de 1990 à 2060, noms et ordre compris", () => {
    for (const [annee, attendus] of Object.entries(R.feries as Record<string, [string, string][]>)) {
      expect([...joursFeries(Number(annee))]).toEqual(attendus);
    }
  });

  it("tous les jours de vacances des zones A, B et C", () => {
    expect([...JOURS_VACANCES]).toEqual(R.vacances);
  });

  it("semaines des mois et numéros de semaine ISO", () => {
    for (const [cle, [semaines, numeros]] of Object.entries(R.semaines as Record<string, [number[][], number[]]>)) {
      const [a, m] = cle.split("-").map(Number);
      const calculees = semainesDuMois(a, m);
      expect(calculees).toEqual(semaines);
      expect(calculees.map((s) => semaineIso(a, m, s.find((j) => j)!))).toEqual(numeros);
    }
  });
});

describe("anniversaires et événements", () => {
  it("lecture des événements (clean_event), y compris les données invalides", () => {
    for (const [entree, attendu] of R.nettoyer) expect(nettoyerEvenement(entree), JSON.stringify(entree)).toEqual(attendu);
  });

  it("textes affichés chaque jour : âge, 29 février, avant la naissance", () => {
    for (const [jour, attendus] of R.jour.cas) {
      const [a, m, j] = jour.split("-").map(Number);
      expect(evenementsDuJour(R.jour.evenements, { a, m, j }), jour).toEqual(attendus);
    }
  });

  it("export CSV identique octet pour octet à celui de la version Windows", () => {
    expect(Buffer.from(exporterCsv(R.csv.evenements)).toString("base64")).toBe(R.csv.export);
  });

  it("import d'un CSV produit par la version Windows (données fictives), et de CSV écrits à la main", () => {
    for (const [b64, evenements, ignorees] of R.importCsv) {
      expect(importerCsv(octets(b64)), Buffer.from(b64, "base64").toString()).toEqual({ evenements, ignorees });
    }
  });

  it("aller-retour : exporter puis réimporter redonne les mêmes événements", () => {
    const evenements: Evenement[] = R.csv.evenements;
    const relus = importerCsv(exporterCsv(evenements));
    expect(relus.ignorees).toBe(0);
    const tri = (l: Evenement[]) => [...l].sort((a, b) => a.month - b.month || a.day - b.day || (a.text < b.text ? -1 : 1));
    expect(tri(relus.evenements)).toEqual(tri(evenements));
  });

  it("un fichier qui n'est pas en UTF-8 est refusé", () => {
    expect(() => importerCsv(new Uint8Array([0x44, 0x61, 0x74, 0x65, 0x0a, 0xe9, 0x3b, 0x41]))).toThrow();
  });
});

describe("dates des photos", () => {
  it("lecture des dates EXIF (strptime)", () => {
    for (const [texte, attendu] of R.dateExif) expect(lireDateExif(texte), JSON.stringify(texte)).toBe(attendu);
  });

  it("dates EXIF de JPEG fabriqués : boutisme, sous-répertoire, données tronquées", () => {
    for (const [nom, b64, prise, modif] of R.exif) expect(datesExif(octets(b64)), nom).toEqual({ prise, modif });
  });

  it("date d'une photo : EXIF, nom du fichier ou date du fichier", () => {
    const exif = Object.fromEntries(R.exif.map(([nom, b64]: [string, string]) => [nom, octets(b64)]));
    for (const [nom, cle, date, source] of R.photoDate.cas) {
      expect(datePhoto(nom, exif[cle], R.photoDate.mtime_ms), `${nom} (${cle})`).toEqual({ date, source });
    }
  });
});

describe("remplissage automatique (plan_months)", () => {
  it("formes des cadres de chaque format de page", () => {
    for (let f = 0; f < 4; f++) {
      const attendu = Object.fromEntries(Object.entries(R.aspectsFormats[f] as Record<string, number[]>).map(([k, v]) => [Number(k), v]));
      expect(aspectsCadres(f)).toEqual(attendu);
    }
  });

  it("mêmes pages que la version Windows sur 160 jeux de photos", () => {
    let compares = 0;
    for (const cas of R.plans) {
      const r = planifierMois(cas.photos as PhotoAPlacer[], cas.mois, aspectsCadres(cas.format));
      if (cas.erreur) {
        // La version Windows échoue ; ici toutes les photos trouvent une place.
        expect(r.groupes.flat().filter(Boolean).length).toBe(Math.min(cas.photos.length, cas.mois * 4));
        continue;
      }
      expect(r.groupes, JSON.stringify(cas.photos.map((p: PhotoAPlacer) => [p.date, p.portrait]))).toEqual(cas.groupes);
      expect(r.ecartees).toEqual(cas.ecartees);
      compares++;
    }
    expect(compares).toBeGreaterThan(150);
  });

  it("photos modèles : mêmes dates, formats et pages que la version Windows", () => {
    const photos: PhotoAPlacer[] = R.exemples.photos.map((p: { nom: string; date: string; source: "nom"; portrait: boolean }) => ({ id: p.nom, ...p }));
    expect(photos).toHaveLength(36);
    for (const p of photos) expect(datePhoto(p.id, new Uint8Array(), 0)).toEqual({ date: p.date, source: p.source });
    for (let f = 0; f < 4; f++) expect(planifierMois(photos, 12, aspectsCadres(f)).groupes).toEqual(R.exemples.plans[f]);
  });

  it("arrondi de Python (moitiés vers le pair)", () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999, 2.5001].map(arrondiPython)).toEqual([0, 2, 2, 0, -2, 2, 3]);
  });
});

describe("géométrie des pages", () => {
  it("dimensions, zones et cadres de chaque format", () => {
    for (const g of R.geometrie) {
      const { w, h } = dimensionsUnites(g.format);
      expect([w, h]).toEqual(g.unites);
      expect(rapportPage(g.format)).toBe(g.ratio);
      const paysage = FORMATS[g.format].paysage;
      for (const type of ["cover", "month"] as const) expect(zonesPage(type, w, h, paysage).map(rect)).toEqual(g.zones[type]);
      for (let k = 1; k <= 4; k++) expect(decouperCadre(zonesPage("month", w, h, paysage)[0], k).map(rect)).toEqual(g.cadres[k]);
    }
  });

  it("partie visible d'une photo (cover_source_rect)", () => {
    for (const [iw, ih, tw, th, crop, attendu] of R.sources) expect(rect(zoneSource(iw, ih, tw, th, crop))).toEqual(attendu);
  });
});

describe("couleurs et réglages", () => {
  it("couleurs lues comme QColor", () => {
    for (const [texte, attendu] of R.couleurs) expect(nomCouleur(texte), texte).toBe(attendu);
  });

  it("réglages lus dans un projet (load_dict)", () => {
    for (const [donnees, attendu] of R.reglages) {
      const base = { ...reglagesParDefaut(), year: 2027 };
      expect(reglagesVersDict(reglagesDepuisDict(donnees, base))).toEqual(attendu);
    }
  });
});
