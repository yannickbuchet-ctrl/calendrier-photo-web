# Licences des composants tiers

Calendrier Photo Web est distribué sous la licence **MIT** (voir [LICENSE](LICENSE)). Le site publié contient les
composants suivants. MuPDF (AGPL) n'est pas utilisé.

## Inclus dans le site

| Composant | Version | Rôle | Licence |
|---|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | écriture des PDF | MIT |
| dépendances de pdf-lib : pako, @pdf-lib/standard-fonts, @pdf-lib/upng, tslib | — | compression, mesures des polices standard, PNG | MIT et zlib (pako), MIT, MIT, 0BSD |
| [Open Sans](https://github.com/googlefonts/opensans) (normal, gras) | paquet @expo-google-fonts/open-sans 0.4 | police « Moderne » | SIL Open Font License 1.1 |
| [Gelasio](https://github.com/SorkinType/Gelasio) (normal, gras) | paquet @expo-google-fonts/gelasio 0.4 | police « Élégant » | SIL Open Font License 1.1 |
| [Kalam](https://github.com/itfoundry/kalam) (normal, gras) | paquet @expo-google-fonts/kalam 0.4 | police « Manuscrit » | SIL Open Font License 1.1 |

Les polices sont intégrées telles quelles au site et, réduites aux lettres utilisées, aux PDF exportés (ce que la
licence OFL permet). Leurs avis de droit d'auteur et de licence sont dans les fichiers de police eux-mêmes (table
« name ») et dans les fichiers `LICENSE_FONT` des paquets npm ; les paquets @expo-google-fonts sont sous licence MIT.

## Utilisés seulement pour construire et tester le site (non publiés)

| Outil | Rôle | Licence |
|---|---|---|
| [Vite](https://vite.dev/) | construction du site | MIT |
| [TypeScript](https://www.typescriptlang.org/) | vérification des types | Apache 2.0 |
| [Vitest](https://vitest.dev/) | tests automatisés | MIT |
| [Playwright](https://playwright.dev/) | parcours dans un navigateur sans fenêtre | Apache 2.0 |
| [PDF.js](https://mozilla.github.io/pdf.js/) (pdfjs-dist) | relecture des PDF dans les tests | Apache 2.0 |
| [jpeg-js](https://github.com/jpeg-js/jpeg-js) | JPEG fabriqués pour les tests | BSD 3 clauses |
| @types/node | types de Node.js | MIT |

## Données et images

- Vacances scolaires : jeu de données « Calendrier scolaire » du ministère de l'Éducation nationale
  (data.education.gouv.fr), Licence Ouverte, repris de la version Windows.
- Photos modèles (`public/exemples/`), logo et icônes : dessinés pour l'application (version Windows,
  `make_exemples.py`), sous la licence de l'application.
