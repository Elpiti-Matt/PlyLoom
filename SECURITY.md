# Security and private data

The app stores graph data in browser local storage and exported files. Neither is encrypted by PlyLoom. Exporting to Canvas or uploading a graph to a public issue can expose its contents.

Please report security issues through GitHub private vulnerability reporting when the repository owner has enabled it. If private reporting is unavailable, open a minimal issue asking for a private contact, without exploit details or private data. Use only the contact methods actually configured by the repository owner; no private address is supplied in this source snapshot.

For ordinary bugs, use a synthetic reproducer. The supported version is the latest release candidate. There is no response-time guarantee. External images and analytics are intentionally absent from the standalone release; a deployed hosting service still handles page requests.

The GitHub Pages deployment is a separate derived file with Yandex Metrica (counter 112587397). Its bootstrap sends one page view with a fixed URL/title and the referring origin; it does not pass graph data or user-entered text. Session recording, click maps, link/hash tracking, ecommerce and Yandex Tag Manager are disabled. Metrica is an external service and processes visitor/browser information under its own terms; this is not a claim of anonymous or zero-data collection. The standalone `demo/index.html` and its checksum remain unchanged. See [publication settings](docs/PUBLISHING.ru.md#статистика-посещений-pages).
