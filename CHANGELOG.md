# Changelog

## 0.8.0 — 2026-09-13

- IndexedDB autosave in idle time, serialized transactions, migration/recovery of old saves and visible write failures. Removed fixed object-count limits; large imports require confirmation, with a 128 MiB memory safeguard.
- Indexed missing edge IDs and per-sheet relations; spatial overlap and edge-hit checks replace avoidable all-pairs scans.
- Persistent recent searches, literal inline highlighting, contents counts, saved views and query-defined smart sheets. Additive v3 fields are documented, including old-reader loss on resave.
- Offscreen culling, low-detail cards, Canvas for dense sheets/All-to-1, adaptive gesture detail and cached overview scenes. Large native parsing and optimization use a cancellable inline worker; release CSP permits only blob workers.
- Optional Playwright CI job, real production-HTML checks at 1440/390 px, native IndexedDB/Canvas checks and renderer-aware perf scenarios. Demo is rebuilt from the same bytes as dist.
- Validation: 133 Node/model/DOM/storage/worker tests; TypeScript and Vite build; actual emitted worker and release checksum/CSP checks. No FPS claim is made for this release.


## 0.7.1 — 2026-09-12

The sheet limit is gone as an idea (S4). A sheet is a unit of meaning, not a bucket of a certain size:
large sheets are read with the filter and the search, and a sheet is divided when it answers two
different questions. Nothing about existing files changes.

- **The node limit no longer exists in the interface.** The "N / limit" counters in the sheet list, the
  sheet header and the spread show a plain node count, and the sheet panel lost both the *Node limit*
  field and the *Capacity* bar. The `limit` field stays in the format: it is still read, clamped and
  written back so files round-trip, but no view, check or export consults it.
- **Project checks no longer treat size as a defect.** `sheet-overflow` (error) and `sheet-near-limit`
  are removed. In their place one note, `sheet-crowded`, appears only when a sheet stands out against
  the rest of *this* project, and it points at the filter and the search rather than at scissors. The
  `hub` and `over-membership` findings became relative too — a hub in a sparse map is ordinary in a
  dense one, and a node on five sheets is ordinary in a project of fifty — and both are notes now.
- **Split oversized sheets is replaced by Lay the sheet out by a key** in the sheet panel: one new sheet
  per value of an attribute, a node tag or a node type, named after that value. Chunking by ID order is
  gone; a boundary now means something a reader can name. A multiple-choice value or several tags put the
  entity on several of the new sheets, which is what memberships are for; nodes with nothing set gather on
  a *No value* sheet. Coordinates, appearances, relations and memberships on other sheets are preserved,
  and waypoints survive wherever both ends of a relation stay together. Undo restores the previous map.
  A sheet made from a single-choice value holds one value, so the same key has nothing left to do there;
  with multiple choice or tags a second pass is possible on purpose, because a node really does carry
  several values.
- The CLI command `cut` became `spread INPUT OUTPUT SHEET_ID type|tag|attr:ID`.
- **The AI prompt** no longer carries `"limit":15` in the sheet schema or the "about 15 nodes" target. It
  now asks for one question per sheet and points at the filter and the search for long lists of facts.
- Tests: the two splitting tests are rewritten for the new operation, a check covers the relative findings
  and the legacy round-trip of `limit`, and a UI test lays a sheet out by an attribute from the panel.
  Twelve deliberate engine breakages were all caught. Not verified in the sandbox: real `tsc`, the Vite
  build, `npm test` under jsdom, devices.

## 0.7.0 — 2026-09-12

The 0.7 line finished: attributes in the built-in examples, a search that also navigates, and per-view
counters (S3c), on top of the multiple-choice attributes and the search line of the rc.8 pre-release (S3a).
The pre-releases 0.7.0-rc.1 … rc.8 are folded into this entry.

- Both built-in examples now carry attributes, so the filter and the multiple-choice type have something
  to work on without importing your own data. **A small roastery** (the map that opens first): *Basis*
  (single choice: assumption / needs checking / from a primary document) and *Touches* (multiple choice:
  quality, money, timing, safety, people). **Software: report export**: *Status* (single choice), *Areas*
  (multiple choice), *Estimate, days* (number) and *Checkpoint* (date). Roles in the software example and
  the feedback log in the roastery carry no attributes at all, two cards have a value left unset and one
  an empty list, so the panel shows **no attribute** and **empty** on real data. Both examples are
  therefore `version: 3` files now and ship their own dictionaries.
- The search line looks in a fifth area, **attribute values**, next to name, body, node tags and sheet.
  It is a plain "contains" over the values of a node; exact bounds still belong to the conditions below.
- **Several words in the search are joined by AND**: every word must be found, each of them in any of the
  checked areas. A single word behaves exactly as before.
- **Enter in the search line goes to the next match** and reports "Match N of M"; it opens the sheet the
  node sits on and works from any view. Enter also remembers the query — the last six are offered back in
  the search line.
- **Matches only** button in the sheet strip leaves only sheets that hold matching nodes; paging follows
  the shortened list. This is a view of the strip, not a filter condition: sheets keep carrying the
  geometry of the overview, the contents and the layouts, and the button disappears with the filter.
- The status bar counts the **current view** in the stack ("in stack: N/M") and the overview ("sheets with
  nodes: N/M"), as it already did for a sheet and a spread.
- Tests: the search model test covers the attribute area and multi-word queries; a new UI test walks the
  matches with Enter, checks the remembered queries and the shortened sheet strip. Stable hooks:
  `data-filter-field="attrs"`, `data-sheet-only-hits`, `#filter-search-recent`.

Multiple-choice attributes and a search line in the filter (S3a, pre-release rc.8):

- New attribute data type **multiple choice** (`dataType: "multi"`): a value is an array of options from the dictionary, without repeats, at most 100 of them. The node editor shows a checkbox per option and keeps the dictionary order; an empty list means the attribute is attached with nothing chosen and counts as **empty** in the filter, exactly like an unset value. **This is a format change**: a file with a multi attribute is rejected as a whole by earlier versions, which do not know the data type. `docs/FORMAT.md` and the AI prompt describe it; the built-in AI example now shows all seven data types.
- A multiple-choice condition matches **any of** the checked options by default; a switch in the condition turns it into **all selected** (the node must carry every checked option). Single-value attributes are unchanged: several checks always mean any of them. Value counters count each option of a list separately.
- New **search** line at the top of the filter panel with four areas that can be turned off: node name, body, node tags and sheet. The sheet area matches a node that sits on a sheet whose name or tag name contains the text; the filter still never hides sheets themselves. Areas are OR between themselves and AND with the other conditions; an empty query or no area selected does not filter. The search is one condition in the toolbar counter and, like the rest of the filter, is session state.
- The sheet strip marks sheets that still hold matching nodes and fades the rest, so the search also helps navigation.
- Tests: 2 model tests (both matching modes, empty list as "not set", value counters, every search area, AND with conditions, the sheet area without a sheet list) and 2 UI tests (checkboxes on the card with undo, the any/all switch, the search areas and the sheet strip marks). The bulk-control test now finds checkbox groups through `data-filter-group` instead of their position, so new panel sections do not break it. Stable hooks: `data-filter-search`, `data-filter-field`, `data-filter-all`, `data-filter-group`, `data-attribute-option`, `data-sheet-hit`, `data-sheet-empty`.

## 0.7.0-rc.7 — 2026-09-11

Attribute filter (S3) and a Hide / Dim switch.

- New **Filter** panel above the map (toolbar button **Filter**, with the number of active conditions). It holds node types, relation types and attribute conditions. Node tags stay a data field (imports can carry them) and are deliberately not a filter condition. Different conditions apply together (AND); checks inside one condition mean any of them (OR). Number and date: inclusive range; text and URL: case-insensitive "contains"; yes/no and list: a set of values. Every attribute has two separate states: **empty** (the attribute is present with no value) and **no attribute**. Checkboxes show how many nodes each value has.
- Type checkboxes moved from **Display** into the panel: one filter, one mechanism. Only types that occur in the project are listed. **Display** keeps card shapes, bodies and outside references and links to the panel.
- **Hide / Dim** switch in the panel and in the status bar. Hide (default) is S2 behaviour: filtered objects are not rendered. Dim draws them faded in place in every view (sheet, spread, overview, stack, contents, All-to-1), still clickable. Both modes use the same visible set; views get one flag instead of their own checks.
- A node you create, open (sheet panel, relations, project check) or edit so that it no longer matches stays visible on top of the filter until the filter changes; a relation created or changed to a hidden type likewise. The filter itself is no longer changed by these actions (rc.6 removed the node's type from the filter). The status bar reports "kept outside the filter: N".
- Status bar: project count plus the count for the sheet or spread on screen; on phones it shows the main phrase and two buttons only.
- Engine `src/lib/nodeFilter.ts`: pure `(node, registry, filter) → boolean`, compiled once per filter change; 10 000 nodes take about 4 ms per pass in the sandbox. The filter is session state and never changes the project or its exports.
- `LICENSE` and `THIRD_PARTY_NOTICES.txt` now say `Copyright (c) 2026 PlyLoom contributors` instead of `Atlas contributors`: the same MIT terms with the holder line renamed. Data identifiers are untouched.
- Leftover old names outside the app: the Checks artifact is now `plyloom-offline-demo` (was `plyra-offline-demo`) and the bug report form asks for a PlyLoom version. Data identifiers (`plyra` notation ID, `plyra*` draw.io attributes, storage keys) are unchanged on purpose.
- Tests: 4 model tests (all data types, empty and missing, AND/OR, pins, facets, 10 000 nodes); UI tests for the panel, attribute conditions, pins and dim mode in every view; five rc.6 tests rewritten for the panel. `perf-bench` has a "filter dims 80%" case: all 1000 cards drawn, 800 faded, frame no more than 1.5 × the unfiltered sheet. Stable hooks: `data-action="filter"`, `data-filter-panel`, `data-filter-mode`, `data-filter-attribute`, `data-filter-add-attribute`, `data-filter-value`, `data-filter-min/max/text/unset/missing`, `data-filter-tag`, `data-filter-muted`.

## 0.7.0-rc.6 — 2026-09-11

Type filters hide instead of dimming (S2).

- One visible set: `Tool` computes the visible node and relation IDs once and every view uses them — sheet, spread, helicopter view, stack, contents and All-to-1. A relation is hidden when its type is hidden or either end is hidden. With no active filter the views take a fast path and do no extra work.
- Filtered objects are not rendered at all (previously drawn at low opacity). References outside the sheet follow the filter: a reference to a hidden node disappears, a reference whose relations are all hidden disappears, the others show only their visible relations. Contents counts only visible relations and shared nodes.
- Geometry of what stays visible does not change: sheet frames, overview content scale, spread and stack layouts are still computed from every node.
- A bar above the map appears while a filter is active: "Filter: showing N of M nodes · relations hidden: K" with Adjust and Show all.
- Creating a node or relation of a hidden type, changing a node or relation to a hidden type, or opening a hidden node (sheet panel, relations, project check) shows that type again and explains it in a toast.
- Optimize layout with an active filter still moves every node, so hidden nodes cannot end up under visible ones; the result message says so.
- Export and the saved project do not depend on the filter, as before. Filters remain session state.
- Tests: three UI tests rewritten from dimming to hiding; new tests for the status bar, every view and automatic reveal. `scripts/perf-bench.mjs` has a "filter keeps 20%" case: exactly 200 of 1000 cards rendered and a frame at most half the cost of the unfiltered sheet. Stable hooks `data-action="visibility"`, `data-filter-type`, `data-filter-edge-type`, `data-filter-status`.

## 0.7.0-rc.5 — 2026-09-11

Renamed to **PlyLoom** and rendering performance, step 1.

- Product, documentation, CLI (`scripts/plyloom.mjs`), npm package and repository links use the name PlyLoom. Projects are saved as `.plyloom`; `.plyra` files from earlier versions open unchanged. Data identifiers kept their former values in this release (notation ID `plyra`, draw.io attributes `plyra*`, browser storage keys, the `scripts/plyra.mjs` and `scripts/atlas.mjs` aliases); 0.7.0-rc.7 renames them and keeps reading the old ones.
- The repository no longer contains transfer and review material (handoff, update instructions, audit, validation record, file manifest, AI-assisted article drafts).
- Sheet and overview cameras: pan, pinch and wheel move the scene directly in the DOM; React state receives the camera after a 160 ms pause, on pointer leave or on unmount. Zoom buttons, keys and fit stay immediate; toolbar zoom continues from the live camera.
- Memoized cards now actually skip work: stable per-node handlers, refs and style objects. Cards are no longer re-subscribed in ResizeObserver on every frame (was: every card, every frame).
- Dragging a sheet card previews locally and writes the graph once on release: one history entry, one index rebuild, one autosave. Pointer cancel leaves the graph untouched (previously partial moves were already saved).
- Removed per-frame whole-project work: node lookups via Map instead of `find` per edge, one index instead of two, per-sheet cached local edges/stubs, All-to-1 key only in All-to-1, memoized sheet relations panel, overview edges grouped once per graph version.
- `npm run test:browser` runs the unchanged formats and UI test files in real Chromium (Playwright, optional, not in CI). Only node:test, node:assert/strict, jsdom and node:zlib are replaced by `tests/browser/*`; the UI harness skips redefining browser globals that are fixed in a real page.
- No visible behaviour change intended: type filters still dim in place. `scripts/perf-bench.mjs` (optional Playwright) measures pan cost and fails on card re-measurement; see docs/PERFORMANCE.ru.md.

## 0.7.0-rc.4 — 2026-09-09

- Independent Select all / Turn off all actions for node and relation type filters, including custom types; unchecked objects remain dimmed in place.
- Helicopter view can show connections of the selected sheet only. Gold identity links fan out directly to every other appearance; other sheets and local edges stay visible.
- The two-level mode is named Sheets / Листы consistently. Bilingual FAQ, AI prompts, examples and instructional GIFs use v3 with all six attribute types. Added `npm run ai:docs` and consistency checks.
- Illustrated feature guides, SVG diagrams, current handoff and beginner GitHub Desktop instructions. Compared the package with Elpiti-Matt/PlyLoom main at 581b3b1; configured repository links.
- 98 model/DOM tests, TypeScript and production build. Browser visual QA was blocked; no commit, push, PR, release or deployment performed.

## 0.7.0-rc.3 — 2026-09-09

Documentation bundle docs.1: refreshed publishing/manual QA/design guides and editorial feature descriptions, added an existing-repository update guide and file comparison report, corrected the Issues template folder, removed two empty placeholder files. Application source, dependencies and standalone HTML remain unchanged from rc.3.

- Canvas has two levels: single-sheet editing and a free Helicopter view of all sheets, linked by upper-right minus / plus controls. Spread remains a separate comparison workspace.
- Drag whole sheets by their headers; drag nodes within a sheet. Independent native sheet positions, scale-aware gestures, undo/redo, keyboard movement, pan and touch pinch; cancelled gestures do not commit partial moves.
- All nodes becomes All-to-1, with one editable appearance per entity, shared text/attributes and a separate saved layout. Original memberships and the line grammar remain intact.
- Updated bilingual help and current handoff. Validation and remaining manual checks are recorded in `docs/VALIDATION.json`.

## 0.7.0-rc.2 — 2026-09-09

Sheet tag/type dictionaries and one type plus multiple tags per sheet; unrestricted node/relation types; notation shapes without glyphs; typed shared node attributes; uniform intra/inter-sheet line grammar; filters dim in place; draw.io geometry, JSON Canvas and BPMN DI imports; all-node stack with Rows / Nodes & edges, grouping and independent layout optimization. See `HANDOFF.md` and `docs/VALIDATION.json` for current state and limitations.

## 0.7.0-rc.1 — 2026-09-08

- Reorganized Project, Types, Display and Help commands; separate view and creation controls.
- Added empty projects, sheet creation and a relation form spanning all sheets.
- Added portable node, relation and sheet-type dictionaries with custom definitions and native `.plyloom` v3 serialization. Legacy v1/v2 JSON remains readable.
- Added separate draw.io import/export: multi-page XML and raw-deflate pages, preview, atomic append, namespaced IDs and explicit conversion limits.
- Replaced the automatic mobile Contents list with a portrait sheet graph, shared-identity lines, focus control and a manual Diagram/List switch.
- Explained visibility filters, reference cards and identity lines. Preserved shared node editing and undo.
- Replaced the depot scenario with a synthetic software example in RU and EN.
- 71 model/DOM tests pass. TypeScript and production build pass.
- Added `START-HERE.ru.md` and a draw.io import example for GitHub updates and manual checks.

## Unreleased — 2026-09-06

- Added the Vite core MIT notice for the modulepreload polyfill included in the standalone HTML.
- Added a dependency license inventory and a Russian publication/licensing audit; documented Apache-2.0 as a proposed option while retaining the current MIT license.
- Updated publication instructions for the current release candidate and clarified download versus page-visit counters.

## 0.6.1-rc.1 — 2026-09-05

- Renamed the product from Atlas to **PlyLoom** in both interface languages, browser title, help, generation contracts, illustrations, downloads and article drafts.
- Updated the package name and proposed repository name to `plyra`.
- Existing browser storage keys, graph version and Canvas metadata stay compatible. The old CLI command forwards to `scripts/plyloom.mjs`.

## 0.6.0-rc.1 — 2026-09-05

- Added **Optimize layout** to Sheet, Spread and Flat view with deterministic adjacency-based seeds, card separation and geometric swap search.
- Scores curved links through cards, crossing pairs and shared line runs, including visible spread routes and shared identities. Dense scenes disclose a stable sample of up to 400 edges.
- Preserves optimized and manually arranged sheet positions across fitting and reopening. Flat view has independent saved positions; native JSON, autosave, undo and redo retain both.
- Added cooperative calculation with cancellation and a mobile button on its own row. Mobile spreads optimize only the visible sheet.
- Added bilingual FAQ guidance, algorithm notes, reproducible geometry metrics and 12 additional automated tests (55 total).

## 0.5.0-rc.1 — 2026-09-05

- Added a thin active-layer frame and a local Side references switch with automatic reflow.
- Unified navigation lines: thin solid within a sheet, dashed across sheets, amber-bronze without arrows for shared identity. Identity paths do not create graph edges.
- Added hover, keyboard and touch line legends, with independent identity visibility.
- Added three original PNG/GIF instructional walkthroughs in RU/ENG, embedded offline and played only on request. They are illustrated UI frames, not browser screenshots.
- Added a three-step cross-model payment scenario, two validated traceability datasets and a design proposal for notation adapters and typed mappings.
- 43 data/DOM checks pass. Browser screenshot capture and physical-device QA remain blocked by unavailable preview infrastructure.

## 0.4.0-rc.1 — 2026-09-05

- Added persistent RU/ENG controls and translated UI and built-in example names; graph content and IDs remain unchanged on language switches.
- Added separate AI-format and FAQ tabs, bilingual generation contracts and validated downloadable examples.
- Added expandable inline name/body editors sharing one canonical node across all appearances.
- Unified the spread scene, added explicit layer headings, removed external duplicates for visible destinations and retained their connecting routes.
- Added view reflow and automatic fit using actual pane proportions, including the wide middle layer.
- Restored tilted stacked layers, layer checkboxes, labels, spacing/tilt/scale controls, connection toggles and pinch/pan handling.
- Added a persistent map title and a prominent gradient title in Contents.

## 0.3.0-rc.1 — 2026-09-05

- Replaced the free-camera stack with a focused sheet, neighboring context layers, entity memberships and an explicit identity trail.
- Added quick sheet tabs, paging buttons, Alt+Arrow shortcuts and per-pane sheet pickers.
- Added 2–6 sheet compositions, tall and wide featured panels, adjustable proportions and occupied-slot swapping.
- Replaced ghost-node styling with labeled external references beyond a dashed boundary and fading surface.
- Added a node creation form with target sheet, type and optional note; retained canvas double-click creation.
- Added a one-pane mobile spread and a readable mobile stack; desktop spread/stack sidebars now open as drawers.
- All 28 data and DOM tests pass.

## 0.2.0-rc.1 — 2026-09-05

- Selected the v2 React/TypeScript source as the maintained implementation.
- Added a fictional coffee map, actual notation filters, CSV and Canvas, deterministic sheet splitting and structural-diff CLI.
- Fixed atomic imports, long-body retention, empty-map recovery, shared-sheet boundary edges, duplicate-neighbor lint and unsafe image sources.
- Added undo/redo, keyboard node activation, mobile reading panels, focus handling and stack scale controls.
- Added tests, build checks, license notices, manual QA and publication documentation.
- Browser visual QA, actual mobile gestures and Obsidian integration are pending. No 200-node threshold or 50× usability improvement is claimed.
