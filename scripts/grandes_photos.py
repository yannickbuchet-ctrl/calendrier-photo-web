"""36 grandes photos de test pour mesurer l'export (12 Mpx, JPEG avec date de prise de vue EXIF ; une sur trois en
portrait « prise au téléphone » : pixels enregistrés couchés et orientation EXIF 6). Images entièrement dessinées,
aucune photo réelle. Nécessite PySide6 (comme la version Windows).

    python scripts/grandes_photos.py <dossier>
"""
import math
import os
import random
import sys

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
if sys.platform == "win32":
    os.environ.setdefault("QT_QPA_FONTDIR", r"C:\Windows\Fonts")
from PySide6.QtCore import QBuffer, QIODevice, QPointF, QRectF, Qt  # noqa: E402
from PySide6.QtGui import QBrush, QColor, QFont, QImage, QLinearGradient, QPainter, QPainterPath, QTransform  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

app = QApplication(sys.argv)
dossier = sys.argv[1]
os.makedirs(dossier, exist_ok=True)
hasard = random.Random(12)

# Grain de photo : rend la taille des fichiers réaliste (3 à 4 Mo).
grain = QImage(256, 256, QImage.Format.Format_ARGB32)
for y in range(256):
    for x in range(256):
        v = hasard.randint(0, 255)
        grain.setPixelColor(x, y, QColor(v, v, v, 28))


def dessin(w, h, mois, numero):
    image = QImage(w, h, QImage.Format.Format_RGB32)
    p = QPainter(image)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    ciel = QLinearGradient(0, 0, 0, h)
    teinte = (mois * 30) % 360
    ciel.setColorAt(0, QColor.fromHsv(teinte, 120, 235))
    ciel.setColorAt(1, QColor.fromHsv((teinte + 40) % 360, 40, 250))
    p.fillRect(QRectF(0, 0, w, h), ciel)
    p.setPen(Qt.PenStyle.NoPen)
    p.setBrush(QColor("#fbbf24"))
    p.drawEllipse(QPointF(w * 0.7, h * 0.18), min(w, h) * 0.08, min(w, h) * 0.08)  # le soleil, en haut
    for couche in range(3):
        chemin = QPainterPath()
        chemin.moveTo(0, h)
        for x in range(0, w + 40, 40):
            chemin.lineTo(x, h * (0.55 + 0.12 * couche) - h * 0.06 * math.sin(x / w * 6 + couche + numero))
        chemin.lineTo(w, h)
        chemin.closeSubpath()
        p.setBrush(QColor.fromHsv((teinte + 90 + 30 * couche) % 360, 140, 200 - 40 * couche))
        p.drawPath(chemin)
    p.setBrush(QBrush(grain))
    p.drawRect(QRectF(0, 0, w, h))
    p.setPen(QColor("#1e293b"))
    police = QFont("Segoe UI")
    police.setPixelSize(round(min(w, h) * 0.06))
    police.setBold(True)
    p.setFont(police)
    p.drawText(QRectF(0, h * 0.04, w, h * 0.1), Qt.AlignmentFlag.AlignHCenter, f"Photo de test {numero:02d} — HAUT")
    p.end()
    return image


def avec_exif(jpeg, date, orientation):
    """Ajoute un segment EXIF : orientation et date de prise de vue (DateTimeOriginal)."""
    order = "big"
    texte = date.encode() + b"\0"
    sous = 8 + 2 + 12 * 2 + 4
    donnees = sous + 2 + 12 + 4
    tiff = b"MM" + (42).to_bytes(2, order) + (8).to_bytes(4, order) + (2).to_bytes(2, order)
    tiff += (0x0112).to_bytes(2, order) + (3).to_bytes(2, order) + (1).to_bytes(4, order) + orientation.to_bytes(2, order) + b"\0\0"
    tiff += (0x8769).to_bytes(2, order) + (4).to_bytes(2, order) + (1).to_bytes(4, order) + sous.to_bytes(4, order)
    tiff += (0).to_bytes(4, order) + (1).to_bytes(2, order)
    tiff += (0x9003).to_bytes(2, order) + (2).to_bytes(2, order) + len(texte).to_bytes(4, order) + donnees.to_bytes(4, order)
    tiff += (0).to_bytes(4, order) + texte
    charge = b"Exif\0\0" + tiff
    return jpeg[:2] + b"\xff\xe1" + (len(charge) + 2).to_bytes(2, "big") + charge + jpeg[2:]


total = 0
for k in range(36):
    mois = k // 3 + 1
    date = f"2027:{mois:02d}:{3 + (k % 3) * 9:02d} {10 + k % 8:02d}:{(7 * k) % 60:02d}:00"
    if k % 3 == 1:
        # Portrait pris au téléphone : la photo est enregistrée couchée, l'EXIF dit de la tourner de 90°.
        image, orientation = dessin(3000, 4000, mois, k + 1).transformed(QTransform().rotate(-90)), 6
    else:
        image, orientation = dessin(4000, 3000, mois, k + 1), 1
    tampon = QBuffer()
    tampon.open(QIODevice.OpenModeFlag.WriteOnly)
    image.save(tampon, "JPEG", 90)
    octets = avec_exif(bytes(tampon.data()), date, orientation)
    with open(os.path.join(dossier, f"IMG_{k + 1:04d}.jpg"), "wb") as f:
        f.write(octets)
    total += len(octets)
print(f"36 photos, {total / 1024 / 1024:.0f} Mo, dans {dossier}")
