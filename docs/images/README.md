# Documentation illustrations

Original instructional diagrams under the project MIT license. These are not browser screenshots or evidence of visual application QA.

- `views-ru.svg` / `views-en.svg`: two sheet levels and the separate Spread, Stack and All-to-1 modes.
- `attributes-ru.svg` / `attributes-en.svg`: a typed definition and shared values on two appearances of one entity. Values are fictional.
- README and FEATURES also embed the local GIF/PNG pairs from `src/assets/help/`. These are the same illustrated walkthroughs used by Help; AI content uses PlyLoom v3.

Rebuild SVGs with `python3 scripts/build-doc-diagrams.py` (standard library). Rebuild help media with `python3 scripts/build_help_media.py` (Pillow and DejaVu Sans). Fonts/images are not downloaded. Help GIFs have four frames at 2.2 seconds each; the app starts playback on request. Markdown readers may autoplay them; still-image links are provided.
