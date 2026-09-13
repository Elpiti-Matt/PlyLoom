# PlyLoom project format — v3

The native `.plyloom` file is UTF-8 JSON (files saved as `.plyra` by versions up to 0.7.0-rc.4 have the same content and open unchanged). Opening replaces the complete project after validation and preview. Legacy v1/v2 JSON remains readable. Saving writes v3 and all dictionaries.


Obsidian Canvas exports mark appearances with `plyloomNodeId`, `plyloomSheetId` and `plyloomEdgeId` (`atlas*` up to 0.7.0-rc.6).
## Dictionaries

`types` contains `nodes`, `edges`, `sheets`, `tags`, `attributes` arrays. Definition IDs use letters, digits, `_`, `:`, `.`, `-`, at most 60 characters; prototype/internal IDs are rejected. `label` is required (80 characters), `labelEn` and `description` are optional (80 and 2,000).

| Dictionary | Additional fields |
| --- | --- |
| `nodes` | `base`: one of the nine PlyLoom kinds; `color`: #RRGGBB; optional `notation` and `shape` |
| `edges` | Text relation definitions; `color` is normalized to #475569 for compatibility |
| `sheets` | `color`: #RRGGBB |
| `tags` | `color`: #RRGGBB |
| `attributes` | `dataType`: text, number, boolean, date, url, select, multi; select and multi require `options` |

Node notation IDs: `plyloom`, `flowchart`, `canvas`, `bpmn`, `drawio`. Versions up to 0.7.0-rc.6 wrote `plyra` for the first one; it is still accepted on read and rewritten as `plyloom` on save. Basic shapes: rectangle, rounded, ellipse, diamond, parallelogram, cylinder, document, text, group. Standard node type IDs use prefixes such as `flowchart:decision`, `canvas:text`, `bpmn:task`. `base` retains the PlyLoom fallback category.

Legacy glyphs, relation dash/color/direction settings and sheet allowed-type lists are discarded when dictionaries are read. They no longer control rendering or availability. Missing tags/attribute dictionaries receive compatible defaults. Built-in node, relation and sheet definitions remain available.

## Sheets and entities

A sheet has `id`, `name`, `color`, one `typeId`, and a `tags` array. `notation` records source notation independently of classification. A legacy `limit` is still read, clamped to 3…60 and written back so older files round-trip unchanged, but since 0.7.1 nothing consults it: a sheet boundary is a unit of meaning, not a node count, and large sheets are read with the filter and the search. If `typeId` is missing, a recognized old `notation` value is migrated; otherwise the free sheet type is used. No sheet type restricts node or edge types.

Optional sheet `overviewPos: {x, y}` places the whole sheet on the Helicopter view canvas. Coordinates must be finite numbers within ±10,000,000. Sheets without a saved position receive a deterministic grid position; the first header move records all current sheet positions so other sheets do not reflow. This field is independent of every node’s `pos`. Native saving, opening, autosave and undo/redo retain it. Camera pan/zoom is session state.

A node has one `id`, `name`, `kind`, `body`, `sheets`, and `pos` keyed by sheet ID. Text, kind and attributes belong to the entity. Each sheet membership has independent coordinates. Native body supports a small safe Markdown subset; raw HTML is not executed and URLs are not fetched.

Optional `attributes` maps definition IDs to values. Numbers must be finite JSON numbers, booleans are true/false, dates use valid YYYY-MM-DD, URLs use http/https, and select values must match an option. A multi value is an array of options without repeats, at most 100 of them; an empty array means the attribute is attached with nothing chosen, which the filter treats the same as an empty value. `null` means attached but unset; a missing key means not attached. The multi data type appeared in 0.7.0: earlier versions do not know it and reject such a file as a whole rather than dropping the attribute. Text values allow 10,000 characters. Unknown definitions and invalid values reject the whole import.

Optional `appearance` maps sheet IDs to `{width,height,shape,fill,stroke,fontColor}` plus font size, stroke width, rotation, bold, alignment, a basic BPMN marker and `sourceType`. Dimensions are positive and bounded; paints are sanitized. A native save retains these appearances. Decorative icon strings are not used.

## Relations and lines

An edge has `id`, `from`, `to`, `kind`, optional `label`, optional `directed` and `sourceType`. Text type expresses the relationship. Imported arrow direction belongs to the edge; there is no visual-style dictionary UI.

`routes[sheetId]` optionally holds `points` and original endpoint rectangles `from`/`to` (x, y, width, height). Import preserves waypoints. Moving nodes reattaches the route ends; interior points remain. Optimizing a sheet replaces its original routes with automatic routing; undo restores the previous graph.

Every renderer supplies the same grammar: solid within a sheet, dashed between sheets, gold for repeated appearances of one ID. Gold identity links are generated from memberships, not stored as relations. The selected-sheet overview uses direct routes from that sheet to every other shared appearance; the general view uses a chain. Selected-sheet focus only filters cross-sheet routes, keeping all sheets and their local relations visible. Type filters hide unselected types in every view (a relation is also hidden when either end is hidden) without changing the stored project, the geometry of what remains, or exports. Active filters are session state unless the user explicitly stores a saved view or smart-sheet query (see below).

## Diagrams

| Input | Mapping and limits |
| --- | --- |
| draw.io | Plain/compressed mxfile pages or mxGraphModel; pages become sheets, basic shapes and nested coordinates, dimensions, colors, text and connector waypoints are retained |
| JSON Canvas 1.0 | One canvas becomes one sheet; text, file, link and group nodes retain coordinates/sizes; groups remain frames; edge sides are retained |
| BPMN 2.0 DI | Each BPMNDiagram becomes a sheet; source element IDs/type names, Bounds and waypoints are retained; shared IDs across diagrams remain shared entities |

These imports append namespaced sheets and entities after preview. Matching names never merge entities. Multiple files are staged atomically; conflicting custom definition IDs are remapped with their values/references. Native `.plyloom` opens a complete project instead.

Unsupported complex draw.io shapes become rectangles; images and attachments are not loaded. Plain draw.io connectors without PlyLoom metadata receive the reference type: their labels are retained, and the preview asks the user to review relation semantics. Canvas preset colors and text appearance may differ, and file/link contents and group backgrounds are not loaded. Canvas bidirectional arrows are reduced to the forward direction with a preview warning. BPMN special markers, pools/lanes, annotations and label placement are simplified; DI is mandatory. Normalized solid intra-sheet lines are not strict BPMN/UML visual semantics: retain source relation types and labels. No direct Miro backup importer exists.

Own draw.io exports carry `plyloomTypes` (`plyraTypes` up to 0.7.0-rc.6, still read), sheet classification, shared node/edge IDs, body, attributes, appearance and route metadata under `plyloom*` attribute names (`plyra*` files are read as well). Reimport recognizes shared entities inside that file; adding it does not merge it with existing project nodes. draw.io and Canvas are editable projections, not a substitute for native backups; whole-sheet overview positions and the All-to-1 arrangement are not retained by these exports. Canvas export creates one card per appearance and retains `atlasNodeId`, `atlasSheetId`, `atlasEdgeId` metadata; reverse Canvas import treats these as ordinary separate Canvas nodes.

## Layout and compatibility

`layout:"manual"` makes per-sheet positions authoritative in both Sheet and Spread. Imported sheets use it. Optional root `flatPositions` belongs to All-to-1, which shows each entity once without merging or removing its sheet memberships. Dragging or optimizing this projection only changes `flatPositions`; text and attributes remain shared. The line grammar reflects the original sheet memberships. Dragging a node in Helicopter view updates only that sheet appearance and marks its sheet layout as manual; it never transfers memberships. Stack presentation, grouping, positions and type filters last for the current session and do not alter source sheets.

Browser storage keys are `plyloom.graph.v2` and `plyloom.language`. A map left by an earlier version under `atlas.graph.v2`, `atlas.graph.v1` or `atlas.language` is read once at startup and then saved under the new keys; the old keys are not overwritten. Undo/redo includes project dictionaries, attributes, imports and native geometry. Tree export omits v3 data and is blocked in the UI for v3 projects.

CSV still accepts nodes.csv plus edges.csv, including quoted commas/newlines and BOM. Legacy generic JSON can infer missing sheets, edge IDs and coordinates. Invalid versions, IDs, dangling ends, memberships, definitions, values or geometry reject the entire project.

There are no fixed object-count limits. Import confirmation: more than 20 MiB, 10,000 nodes, 50,000 edges, 1,000 sheets or 2,000 total definitions. A 128 MiB combined input/decompressed ceiling is a memory safeguard. Field limits remain: node name 200, sheet name 80, edge label 120, body 1,000,000 characters. Existing IDs and content are not rewritten by interface translation.

## Format references

JSON Canvas node types, geometry and edge sides follow [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/). BPMN source and diagram geometry use the [OMG BPMN 2.0.2 specification and DI schemas](https://www.omg.org/spec/BPMN/2.0.2). The supported draw.io XML source is described in [draw.io documentation](https://www.drawio.com/docs/manual/advanced/diagram-source-edit/). Consulted on 2026-09-09; import coverage and simplifications above describe this implementation.

## AI generation

The application and downloadable AI prompts use v3 with all five dictionaries and the seven attribute data types. `npm run ai:docs` regenerates `docs/AI-PROMPT.*.txt` and `data/ai-example-*.json` from `src/lib/generation.ts`. Tests validate both examples and require exact agreement with the downloadable files. Existing v1/v2 inputs remain readable.


## Saved views and smart sheets (0.8.0)

These are additive fields of version 3. Older versions can display the stored membership snapshot, but silently discard the queries and saved views on resave. Keep the original file when using an older reader. draw.io/Canvas projections do not carry these fields.

Optional root `savedViews` is an array of `{id, name, filter, filterMode, mode, sheetId?, sheetIds?}`. `id` is a unique nonempty string up to 200 characters; `name` is nonempty, up to 80. `filterMode` is `hide` or `dim`. `mode` is `sheet`, `board`, `spread`, `stack`, `contents` or `flat`. `sheetIds` records the chosen spread or stack sheets; camera transforms and stack geometry are not part of a saved view. Missing sheet references are ignored when applying a view, with an ordinary current-sheet fallback.

A filter contains `hiddenNodeTypes: string[]`, `hiddenEdgeTypes: string[]`, `attributes: Record<id, condition>`, and optional `search: {text, fields}`. Search fields are `name`, `body`, `tags`, `sheet`, `attrs`. Conditions may include string `min`, `max`, `text`, string-array `values`, boolean `all`, `unset`, `missing`. Conditions and search strings are at most 4096 characters. Unknown fields are dropped; invalid known fields and unsafe attribute keys are rejected. No executable expressions are accepted.

Optional sheet `smartFilter` uses this same filter shape. Only node conditions determine membership; edge visibility does not determine whether a node matches. At least one ordinary sheet must remain. Queries see ordinary sheet names/tags only, so a query cannot recursively match its own generated sheet. A node with no ordinary home on import is assigned to the first ordinary sheet. Memberships update after edits and on import; shared IDs and ordinary-sheet positions remain unchanged. Smart-sheet positions are retained while a node continues matching, and newly matched nodes receive deterministic grid positions. If a node stops matching, its smart-sheet appearance is removed; a later return gets a new grid position. Convert the sheet to ordinary to freeze the current result. The interface prevents direct membership edits and attribute-based splitting of a smart sheet.

Example (inside a version-3 project):

```json
{"smartFilter":{"hiddenNodeTypes":[],"hiddenEdgeTypes":[],"attributes":{},"search":{"text":"review","fields":["name","body"]}}}
```

## Browser persistence

IndexedDB database `plyloom`, version 1, store `projects`: `current` holds the structured-cloned graph; `recovery` holds an unreadable prior save as text. Writes are successful only when their transaction completes. Idle saves are serialized; edits arriving during a write schedule the next snapshot. Leaving with pending changes triggers a flush and a browser leave-page warning when supported.

Legacy keys `plyloom.graph.v2`, `atlas.graph.v2`, `atlas.graph.v1` are read when no IndexedDB record exists and retained after migration. If IndexedDB is unavailable entirely, localStorage is the explicit fallback; if an existing IndexedDB cannot be read, automatic replacement is blocked for that session. Export remains available. Recent queries use `plyloom.search.recent`; they are a local preference, outside the project file. Browser storage is not a substitute for exported backups.
