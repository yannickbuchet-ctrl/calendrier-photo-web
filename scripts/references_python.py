"""Valeurs de référence calculées par l'application Windows (calendrier.py), pour les tests de la version web.

    python scripts/references_python.py [dossier de l'application Windows]

Écrit tests/references/python.ts. Le dossier par défaut est ../Calendrier (à côté de ce projet). Seules les photos
modèles du dossier exemples/ (paysages dessinés) sont lues ; tous les anniversaires et événements sont fictifs.
"""

import base64
import datetime
import json
import os
import random
import sys
import tempfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WINDOWS = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, "..", "Calendrier"))
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QT_QPA_FONTDIR", r"C:\Windows\Fonts")
sys.path.insert(0, WINDOWS)

import calendrier as c  # noqa: E402
from PySide6.QtCore import QMarginsF, QRectF  # noqa: E402
from PySide6.QtGui import QColor, QImage, QPageLayout, QPageSize, QPainter, QPdfWriter  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

app = QApplication(sys.argv)
R = {}


def dt(value):
    """Date-heure au format des tests web : « AAAA-MM-JJ HH:MM:SS.ffffff »."""
    if value is None:
        return None
    return value.strftime("%Y-%m-%d %H:%M:%S.%f")


def rect(r):
    return [r.x(), r.y(), r.width(), r.height()]


# --- Jours fériés, Pâques, vacances, semaines ----------------------------------------------------------------------

R["feries"] = {str(y): [[d.isoformat(), n] for d, n in c.french_holidays(y).items()] for y in range(1990, 2061)}
R["paques"] = [c.easter(y).isoformat() for y in range(1583, 2500)]
R["vacances"] = [[d.isoformat(), z] for d, z in c.SCHOOL_DAYS.items()]
semaines = {}
for y in range(2019, 2036):
    for m in range(1, 13):
        weeks = c.calendar.Calendar(firstweekday=0).monthdayscalendar(y, m)
        numbers = [datetime.date(y, m, next(d for d in w if d)).isocalendar()[1] for w in weeks]
        semaines[f"{y}-{m}"] = [weeks, numbers]
R["semaines"] = semaines

# --- Événements -------------------------------------------------------------------------------------------------

cas_evenements = [
    {"day": 14, "month": 3, "year": 2019, "text": "Léa", "kind": "birthday"},
    {"day": "14", "month": " 3 ", "year": "2019", "text": "  Léa  ", "kind": "birthday"},
    {"day": 29, "month": 2, "year": None, "text": "Hugo", "kind": "birthday"},
    {"day": 29, "month": 2, "year": 2017, "text": "Hugo", "kind": "birthday"},
    {"day": 29, "month": 2, "year": 2016, "text": "Hugo", "kind": "birthday"},
    {"day": 31, "month": 4, "year": None, "text": "Impossible", "kind": "yearly"},
    {"day": 1, "month": 13, "text": "Mois 13"},
    {"day": 5, "month": 6, "year": 2027, "text": "Fête du club"},
    {"day": 5, "month": 6, "text": "Chaque année sans type"},
    {"day": 5, "month": 6, "text": "Une fois sans année", "kind": "once"},
    {"day": 5, "month": 6, "year": "", "text": "Année vide", "kind": "once"},
    {"day": 5, "month": 6, "text": "   ", "kind": "yearly"},
    {"day": 5, "month": 6, "text": None, "kind": "yearly"},
    {"day": 5, "month": 6, "kind": "yearly"},
    {"day": 5.9, "month": 6, "text": "Flottant", "kind": "yearly"},
    {"day": True, "month": 6, "text": "Booléen", "kind": "yearly"},
    {"day": "1_0", "month": "+6", "text": "Souligné", "kind": "yearly"},
    {"day": "5.0", "month": 6, "text": "Texte flottant", "kind": "yearly"},
    {"day": 5, "month": 6, "year": 0, "text": "Année zéro", "kind": "birthday"},
    {"day": 5, "month": 6, "year": -3, "text": "Année négative", "kind": "birthday"},
    {"day": 5, "month": 6, "text": "Type inconnu", "kind": "fête"},
    {"day": 5, "month": 6, "text": 2027, "kind": "yearly"},
    {"month": 6, "text": "Sans jour"},
    {"day": None, "month": 6, "text": "Jour vide"},
    {"day": 5, "month": 6, "year": 2027, "text": "Liste", "kind": ["once"]},
    "pas un objet",
    [1, 2, 3],
]
R["nettoyer"] = [[e, c.clean_event(e) if isinstance(e, dict) else None] for e in cas_evenements]

evenements = [e for e in map(c.clean_event, [
    {"day": 14, "month": 3, "year": 2019, "text": "Léa", "kind": "birthday"},
    {"day": 29, "month": 2, "year": 2016, "text": "Hugo", "kind": "birthday"},
    {"day": 2, "month": 1, "year": None, "text": "Mamie Rose", "kind": "birthday"},
    {"day": 21, "month": 6, "year": None, "text": "Fête de la musique", "kind": "yearly"},
    {"day": 12, "month": 9, "year": 2027, "text": "Rentrée du club", "kind": "once"},
    {"day": 14, "month": 3, "year": 1990, "text": "Paul", "kind": "birthday"},
    {"day": 14, "month": 3, "year": 2027, "text": "Né cette année", "kind": "birthday"},
    {"day": 14, "month": 3, "year": 2028, "text": "Pas encore né", "kind": "birthday"},
]) if e]
jours = [datetime.date(y, m, d) for y, m, d in [
    (2027, 3, 14), (2028, 3, 14), (2026, 3, 14), (2027, 2, 28), (2028, 2, 28), (2028, 2, 29), (2027, 1, 2),
    (2027, 6, 21), (2027, 9, 12), (2028, 9, 12), (2019, 3, 14), (2020, 3, 14), (2016, 2, 29), (2017, 2, 28),
]]
R["jour"] = {"evenements": evenements,
             "cas": [[d.isoformat(), [list(x) for x in c.events_on(evenements, d)]] for d in jours]}

csv_evenements = evenements + [e for e in map(c.clean_event, [
    {"day": 1, "month": 4, "year": None, "text": 'Poisson "d\'avril" ; farces', "kind": "yearly"},
    {"day": 8, "month": 8, "year": 2027, "text": "Pique-nique, au parc", "kind": "once"},
]) if e]
dossier = tempfile.mkdtemp()
chemin_csv = os.path.join(dossier, "evenements.csv")
c.export_events_csv(csv_evenements, chemin_csv)
with open(chemin_csv, "rb") as f:
    csv_windows = f.read()
R["csv"] = {"evenements": csv_evenements, "export": base64.b64encode(csv_windows).decode()}

textes_csv = [
    csv_windows,
    "Date,Type,Description\n03/04/2015,Anniversaire,Zoé\n4.7,Chaque année,Fête\n".encode("utf-8"),
    "05-06;Lucas\n31/02/2027;Une seule fois;Impossible\n12/12/2027;unique;Spectacle\nbonjour\n".encode("utf-8"),
    "Date\tType\tDescription\r\n01/05\tannuel\tMuguet\r\n\r\n  \r\n09/10/2001\tAnniv\t« Noé »\r\n".encode("utf-8"),
    '"Date";"Type";"Description"\n"01/01";"Chaque année";"Texte ""cité"" ; avec point-virgule"\n'.encode("utf-8"),
    "14/03/2019;Anniversaire;Léa\r10/10;Autre;Sans type connu\n".encode("utf-8"),
    "\ufeffdate;type;description\n1/2/2030;une fois;Court\n".encode("utf-8"),
    b"",
]
cas_csv = []
for k, octets in enumerate(textes_csv):
    chemin = os.path.join(dossier, f"cas{k}.csv")
    with open(chemin, "wb") as f:
        f.write(octets)
    lus, ignores = c.import_events_csv(chemin)
    cas_csv.append([base64.b64encode(octets).decode(), lus, ignores])
R["importCsv"] = cas_csv

# --- Dates des photos -------------------------------------------------------------------------------------------

dates_exif = ["2027:03:15 10:20:30", "2027:3:5 1:2:3", "2027:02:30 10:00:00", "0000:00:00 00:00:00", "2027:03:15 10:20:61",
              "2027:03:15 23:59:59 extra", "2027:03:15  10:20:30", "2027-03-15 10:20:30", "2027:03:15 24:00:00", "",
              "2027:12:31 23:59:60", "1999:01:01 00:00:00\x00"]
R["dateExif"] = [[t, dt(c._parse_exif_date(t))] for t in dates_exif]


def ifd(order, entries, base):
    """Répertoire EXIF : entries = [(étiquette, type, nombre, valeur_ou_position)]."""
    o = len(entries).to_bytes(2, order)
    for tag, typ, count, value in entries:
        o += tag.to_bytes(2, order) + typ.to_bytes(2, order) + count.to_bytes(4, order)
        o += value.to_bytes(2, order) + b"\0\0" if typ == 3 else value.to_bytes(4, order)
    return o + (0).to_bytes(4, order)


def tiff(order, original=None, modifie=None, orientation=None, sous_ifd=True):
    head = (b"II" if order == "little" else b"MM") + (42).to_bytes(2, order) + (8).to_bytes(4, order)
    textes = []
    entries = []
    n0 = (1 if orientation else 0) + (1 if modifie else 0) + (1 if sous_ifd else 0)
    debut_donnees = 8 + 2 + 12 * n0 + 4
    sub_off = debut_donnees
    sub_size = 2 + 12 * (1 if original else 0) + 4
    pos = sub_off + (sub_size if sous_ifd else 0)
    if orientation:
        entries.append((0x0112, 3, 1, orientation))
    if modifie:
        entries.append((0x0132, 2, len(modifie) + 1, pos))
        textes.append(modifie.encode() + b"\0")
        pos += len(modifie) + 1
    if sous_ifd:
        entries.append((0x8769, 4, 1, sub_off))
    data = head + ifd(order, entries, 8)
    if sous_ifd:
        sub_entries = []
        if original:
            sub_entries.append((0x9003, 2, len(original) + 1, pos))
            textes.append(original.encode() + b"\0")
        data += ifd(order, sub_entries, sub_off)
    return data + b"".join(textes)


def jpeg(bloc_tiff=None, avant=b"", sof=(1200, 800)):
    o = b"\xff\xd8" + avant
    if bloc_tiff is not None:
        payload = b"Exif\0\0" + bloc_tiff
        o += b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
    h, w = sof
    o += b"\xff\xc0" + (17).to_bytes(2, "big") + b"\x08" + h.to_bytes(2, "big") + w.to_bytes(2, "big") + b"\x03" + b"\x01\x22\x00\x02\x11\x01\x03\x11\x01"
    return o + b"\xff\xda\x00\x02" + b"\x00" * 16 + b"\xff\xd9"


app0 = b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
cas_jpeg = {
    "petit-boutiste": jpeg(tiff("little", "2027:03:15 10:20:30", "2027:04:01 08:00:00", 6)),
    "grand-boutiste": jpeg(tiff("big", "2026:12:24 18:30:00", None, 8)),
    "modification seule": jpeg(tiff("little", None, "2025:07:14 12:00:00", 3, sous_ifd=False)),
    "date invalide": jpeg(tiff("big", "2027:02:30 10:00:00", "2027:02:01 10:00:00")),
    "après JFIF": jpeg(tiff("little", "2024:08:07 09:15:00"), avant=app0),
    "sans EXIF": jpeg(None, avant=app0),
    "pas un JPEG": b"\x89PNG\r\n\x1a\n" + b"\0" * 40,
    "tronqué": jpeg(tiff("little", "2027:03:15 10:20:30"))[:60],
    "vide": b"",
}
R["exif"] = []
for nom, octets in cas_jpeg.items():
    chemin = os.path.join(dossier, "exif.jpg")
    with open(chemin, "wb") as f:
        f.write(octets)
    prise, modif = c.exif_dates(chemin)
    R["exif"].append([nom, base64.b64encode(octets).decode(), dt(prise), dt(modif)])

noms = ["IMG_20250807_101500.jpg", "IMG-20250230-WA0001.jpg", "2027-03-15-printemps-paysage.jpg", "photo.jpg",
        "vacances 2026_08_14.jpeg", "20270315.jpg", "120270315.jpg", "2027-13-01.jpg", "PXL_19991231_235959.jpg",
        "1890-05-05.jpg", "scan 2027.03.15 (2).png"]
mtime = datetime.datetime(2026, 11, 2, 9, 41, 7, 250000).timestamp()
R["photoDate"] = {"mtime_ms": round(mtime * 1000), "cas": []}
for nom in noms:
    for cle in ("sans EXIF", "petit-boutiste", "modification seule", "grand-boutiste"):
        chemin = os.path.join(dossier, nom)
        with open(chemin, "wb") as f:
            f.write(cas_jpeg[cle])
        os.utime(chemin, (mtime, mtime))
        date, source = c.photo_date(chemin)
        R["photoDate"]["cas"].append([nom, cle, dt(date), source])
        os.remove(chemin)

# --- Géométrie ----------------------------------------------------------------------------------------------------


class Cache:
    def get(self, path, longest):
        return None


def unites(index):
    _label, page_id, landscape = c.FORMATS[index]
    size = QPageSize(page_id).size(QPageSize.Unit.Millimeter)
    w, h = (size.height(), size.width()) if landscape else (size.width(), size.height())
    return w / 25.4 * c.EXPORT_DPI, h / 25.4 * c.EXPORT_DPI


geometrie = []
for f in range(4):
    s = c.Settings()
    s.format_index = f
    renderer = c.CalendarRenderer(s, {}, {}, {}, Cache())
    w, h = unites(f)
    area = renderer._areas("month", 1000, 1000 * renderer.page_ratio())[0]
    pdf_path = os.path.join(dossier, f"format{f}.pdf")
    writer = QPdfWriter(pdf_path)
    writer.setResolution(c.EXPORT_DPI)
    writer.setPageSize(QPageSize(c.FORMATS[f][1]))
    writer.setPageOrientation(QPageLayout.Orientation.Landscape if c.FORMATS[f][2] else QPageLayout.Orientation.Portrait)
    writer.setPageMargins(QMarginsF(0, 0, 0, 0), QPageLayout.Unit.Millimeter)
    painter = QPainter(writer)
    painter.fillRect(QRectF(0, 0, 10, 10), QColor("white"))
    writer_size = [writer.width(), writer.height()]
    painter.end()
    with open(pdf_path, "rb") as fichier:
        contenu = fichier.read()
    debut = contenu.find(b"/MediaBox")
    mediabox = contenu[debut:contenu.find(b"]", debut) + 1].decode()
    geometrie.append({
        "format": f, "ratio": renderer.page_ratio(), "unites": [w, h], "writer": writer_size, "mediabox": mediabox,
        "zones": {kind: [rect(r) for r in renderer._areas(kind, w, h)] for kind in ("cover", "month")},
        "cadres": {str(k): [rect(r) for r in c.split_frame(renderer._areas("month", w, h)[0], k)] for k in range(1, 5)},
        "aspects": {str(k): [fr.width() / fr.height() for fr in c.split_frame(area, k)] for k in range(1, 5)},
    })
R["geometrie"] = geometrie

class Image:
    """Image factice : cover_source_rect ne lit que ses dimensions."""

    def __init__(self, w, h):
        self.w, self.h = w, h

    def width(self):
        return self.w

    def height(self):
        return self.h


sources = []
for iw, ih in [(4000, 3000), (3000, 4000), (1200, 1200), (640, 480)]:
    for tw, th in [(1800.5, 1200.25), (500, 900), (1000, 1000)]:
        for crop in [None, {}, {"zoom": 1.0}, {"zoom": 2.5, "x": 0.1, "y": 0.9}, {"zoom": 0.5, "x": 0.7}, {"zoom": 5, "x": 0.5, "y": 0.5},
                     {"x": 1.0, "y": 0.0}]:
            r = c.cover_source_rect(Image(iw, ih), QRectF(0, 0, tw, th), crop)
            sources.append([iw, ih, tw, th, crop, rect(r)])
R["sources"] = sources
R["couleurs"] = [[t, QColor(t).name()] for t in ["#2563EB", "#abc", "#80ff0000", "#fff000fff", "#ffff0000ffff", "red", "Dark Olive Green",
                                                   "transparent", "rouge", "", "#12345", "#gg0000"]]


class Enregistreur:
    """QPainter dont on note les appels de dessin (rectangles arrondis, lignes, textes)."""

    def __init__(self, painter):
        self.p = painter
        self.ops = []

    def __getattr__(self, name):
        attr = getattr(self.p, name)
        if name == "drawRoundedRect":
            def note(r, rx, ry):
                self.ops.append(["arrondi", rect(r), rx, self.p.brush().color().name(QColor.NameFormat.HexArgb)])
                return attr(r, rx, ry)
            return note
        if name == "drawLine":
            def note(a, b):
                self.ops.append(["ligne", [a.x(), a.y(), b.x(), b.y()], self.p.pen().widthF(), self.p.pen().color().name()])
                return attr(a, b)
            return note
        if name == "drawText":
            def note(*args):
                if len(args) == 3 and isinstance(args[0], QRectF):
                    font = self.p.font()
                    self.ops.append(["texte", rect(args[0]), int(args[1]), args[2], font.pixelSize(), font.bold(),
                                     self.p.pen().color().name()])
                return attr(*args)
            return note
        return attr


def dessiner(settings, page):
    renderer = c.CalendarRenderer(settings, {}, {}, {}, Cache())
    renderer.hide_empty = True
    w, h = unites(settings.format_index)
    image = QImage(round(w / 4), round(h / 4), QImage.Format.Format_RGB32)
    painter = QPainter(image)
    painter.scale(0.25, 0.25)
    enregistreur = Enregistreur(painter)
    renderer.render(enregistreur, page, w, h)
    painter.end()
    return enregistreur.ops


rendus = []
for nom, reglages, page in [
    ("A4 portrait, mars, zone C", dict(school_zone="C"), 3),
    ("A4 paysage, février, ABC, semaines", dict(format_index=1, school_zone="ABC", week_numbers=True), 2),
    ("A3 portrait, mai, sans week-ends", dict(format_index=2, weekends=False), 5),
    ("A3 paysage, décembre, sans fériés", dict(format_index=3, holidays=False, accent=QColor("#db2777")), 12),
    ("A4 portrait, août 2029 hors données", dict(year=2029, school_zone="A"), 8),
    ("couverture A4 paysage", dict(format_index=1, title="Les vacances de la famille Exemple"), 0),
    ("sans couverture, janvier", dict(cover=False, week_numbers=True), 0),
]:
    s = c.Settings()
    s.year = 2027
    s.events = evenements
    for k, v in reglages.items():
        setattr(s, k, v)
    rendus.append({"nom": nom, "reglages": s.to_dict(), "page": page, "ops": dessiner(s, page)})
R["rendus"] = rendus

# --- Remplissage automatique ---------------------------------------------------------------------------------------

def aspects(f):
    """Forme des cadres de chaque disposition, calculée comme dans CalendarWindow.auto_fill."""
    s = c.Settings()
    s.format_index = f
    renderer = c.CalendarRenderer(s, {}, {}, {}, None)
    area = renderer._areas("month", 1000, 1000 * renderer.page_ratio())[0]
    return {k: [fr.width() / fr.height() for fr in c.split_frame(area, k)] for k in c.LAYOUT_NAMES}


aspects_par_format = [aspects(f) for f in range(4)]
original_date, original_portrait = c.photo_date, c.is_portrait
hasard = random.Random(2027)
plans = []
for numero in range(160):
    n = hasard.choice([0, 1, 2, 3, 5, 7, 11, 12, 13, 17, 24, 25, 30, 36, 37, 47, 48, 49, 55, 70, hasard.randint(0, 80)])
    part = hasard.choice([0.0, 0.2, 0.33, 0.5, 0.8, 1.0])
    if numero == 0:
        n, part = 47, 0.0  # le cas où la version Windows échoue
    jours_possibles = hasard.choice([3, 30, 400])
    photos = []
    for i in range(n):
        jour = datetime.datetime(2027, 1, 1) + datetime.timedelta(days=hasard.randrange(jours_possibles))
        if hasard.random() < 0.7:
            jour += datetime.timedelta(seconds=hasard.randrange(86400))
        photos.append({"id": f"p{i}", "date": dt(jour), "portrait": hasard.random() < part,
                       "source": hasard.choice(["exif", "nom", "fichier"])})
    format_index = numero % 4
    mois = hasard.randint(1, 12) if numero % 9 == 5 else 12
    infos = {p["id"]: (datetime.datetime.strptime(p["date"], "%Y-%m-%d %H:%M:%S.%f"), p["source"]) for p in photos}
    portraits = {p["id"]: p["portrait"] for p in photos}
    c.photo_date = infos.__getitem__
    c.is_portrait = portraits.__getitem__
    try:
        groupes, ecartees, _infos = c.plan_months([p["id"] for p in photos], mois, aspects_par_format[format_index])
        plans.append({"photos": photos, "format": format_index, "mois": mois, "groupes": groupes, "ecartees": ecartees})
    except IndexError:
        # Aucun découpage possible (par exemple 47 paysages sur 12 mois : il faudrait une page de 3 photos sans
        # portrait) : la version Windows échoue.
        plans.append({"photos": photos, "format": format_index, "mois": mois, "erreur": "IndexError"})
c.photo_date, c.is_portrait = original_date, original_portrait
R["plans"] = plans
R["aspectsFormats"] = [{str(k): v for k, v in a.items()} for a in aspects_par_format]

# Photos modèles du dossier exemples/ (paysages dessinés, aucune photo réelle).
exemples = os.path.join(WINDOWS, "exemples")
noms_exemples = sorted(n for n in os.listdir(exemples) if n.lower().endswith(".jpg")) if os.path.isdir(exemples) else []
chemins = [os.path.join(exemples, n) for n in noms_exemples]
R["exemples"] = {
    "photos": [{"nom": os.path.basename(p), "date": dt(c.photo_date(p)[0]), "source": c.photo_date(p)[1],
                "portrait": c.is_portrait(p)} for p in chemins],
    "plans": [[[os.path.basename(x) if x else None for x in g] for g in c.plan_months(chemins, 12, aspects_par_format[f])[0]]
              for f in range(4)],
}

# --- Réglages lus dans un projet ------------------------------------------------------------------------------------

cas_reglages = [
    {},
    {"title": "Famille Exemple", "year": "2028", "format": 3, "font": 1, "accent": "#DB2777", "cover": 0, "holidays": "non",
     "weekends": [], "school_zone": "B", "week_numbers": 1, "show_events": None},
    {"school_zone": "D", "accent": "violet", "events": "pas une liste", "cover": "", "year": 2026.7},
    {"events": [{"day": 1, "month": 1, "text": "Nouvel an fictif"}, {"day": 40, "month": 1, "text": "faux"}], "school_zone": "ABC"},
]
lus = []
for cas in cas_reglages:
    s = c.Settings()
    s.year = 2027
    s.load_dict(cas)
    d = s.to_dict()
    lus.append([cas, d])
R["reglages"] = lus

sortie = os.path.join(RACINE, "tests", "references", "python.ts")
os.makedirs(os.path.dirname(sortie), exist_ok=True)
texte = json.dumps(R, ensure_ascii=False, separators=(",", ":"))
with open(sortie, "w", encoding="utf-8", newline="\n") as f:
    f.write("// Fichier produit par scripts/references_python.py à partir de calendrier.py (application Windows,\n")
    f.write(f"// version {c.APP_VERSION}) : ne pas modifier à la main. Données fictives et photos modèles seulement.\n")
    f.write("// eslint-disable-next-line\n")
    f.write(f"export const REFERENCES = JSON.parse({json.dumps(texte, ensure_ascii=False)});\n")
print(f"Références écrites dans {sortie} ({len(texte) // 1024} Ko, {len(noms_exemples)} photos modèles).")
