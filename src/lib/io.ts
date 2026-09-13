import { CARD_W, KIND_BY_ID, KINDS, PALETTE, type GNode, type Graph, type Sheet, type TypeRegistry } from "../model/types";
import { attributeText } from "./attributes";

/** RFC-style quoted CSV, including newlines and doubled quotes. UTF-8/BOM supported. */
export function parseCSV(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"' && value === "" && !closed) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(value); value = ""; closed = false;
      if (c !== ",") {
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed || c === '"') throw new Error("Некорректные кавычки в CSV");
      value += c;
    }
  }
  if (quoted) throw new Error("Незакрытая кавычка в CSV");
  row.push(value); if (row.some((v) => v !== "")) rows.push(row);
  const header = rows.shift()?.map((h) => h.trim());
  if (!header?.length || header.some((h) => !h) || new Set(header).size !== header.length)
    throw new Error("В CSV нужны непустые уникальные заголовки");
  return rows.map((r, i) => {
    if (r.length !== header.length) throw new Error(`CSV, строка ${i + 2}: число столбцов не совпадает с заголовком`);
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}

export function csvGraph(files: { name: string; text: string }[]) {
  if (files.length !== 2) throw new Error("Выберите вместе nodes.csv и edges.csv");
  const n = files.find((f) => f.name.toLowerCase() === "nodes.csv");
  const e = files.find((f) => f.name.toLowerCase() === "edges.csv");
  if (!n || !e) throw new Error("Файлы должны называться nodes.csv и edges.csv");
  const nodes = parseCSV(n.text).map((r) => ({ ...r, sheets: r.sheets?.split("|").filter(Boolean) ?? ["main"] }));
  return { title: "Импорт CSV", nodes, edges: parseCSV(e.text) };
}

/** Canvas has appearances, PlyLoom has canonical entities. Native JSON remains lossless. */
export function toCanvas(g: Graph) {
  const nodes: Record<string, unknown>[] = [], edges: Record<string, unknown>[] = [];
  const appearances = new Map<string, Map<string, string>>();
  let offsetX = 0, serial = 0;
  for (const sheet of g.sheets) {
    const local = g.nodes.filter((n) => n.sheets.includes(sheet.id));
    const minX = Math.min(0, ...local.map((n) => n.pos[sheet.id].x));
    const minY = Math.min(0, ...local.map((n) => n.pos[sheet.id].y));
    const width = Math.max(400, ...local.map((n) => n.pos[sheet.id].x - minX + CARD_W + 100));
    const height = Math.max(300, ...local.map((n) => n.pos[sheet.id].y - minY + 320));
    nodes.push({ id: `group-${serial++}`, type: "group", label: sheet.name, x: offsetX, y: 0, width, height, color: sheet.color });
    for (const n of local) {
      const id = `node-${serial++}`;
      if (!appearances.has(n.id)) appearances.set(n.id, new Map());
      appearances.get(n.id)!.set(sheet.id, id);
      nodes.push({ id, type: "text", text: `# ${n.name}\n\n${n.body}\n\nPlyLoom ID: ${n.id}`, x: offsetX + n.pos[sheet.id].x - minX + 40,
        y: n.pos[sheet.id].y - minY + 60, width: CARD_W, height: 220, color: sheet.color, plyloomNodeId: n.id, plyloomSheetId: sheet.id });
    }
    offsetX += width + 160;
  }
  for (const e of g.edges) {
    const from = appearances.get(e.from), to = appearances.get(e.to);
    if (!from || !to) continue;
    const common = [...from.keys()].filter((s) => to.has(s));
    const pairs = common.length ? common.map((s) => [from.get(s)!, to.get(s)!]) : [[from.values().next().value!, to.values().next().value!]];
    for (const [fromNode, toNode] of pairs) edges.push({ id: `edge-${serial++}`, fromNode, toNode, toEnd: "arrow", label: e.label || e.kind || "flow", plyloomEdgeId: e.id });
  }
  return { nodes, edges };
}

/** What a sheet is laid out by. Replaces the ID-order chunking of 0.7.0 and earlier:
 *  a new sheet boundary has to mean something a reader can name. */
export type SpreadKey = { by: "attribute"; id: string } | { by: "tag" } | { by: "type" };
/** How dictionary definitions and values are named in the resulting sheet names.
 *  The UI passes its own labeller so the names match the interface language. */
export interface SpreadNaming { label?: (d: { label: string; labelEn?: string }) => string; english?: boolean }

export const NO_VALUE = "Без значения", NO_VALUE_EN = "No value";

/** Keys of one node under the chosen feature. A multi attribute or several tags give
 *  several keys — the entity simply stands on several of the new sheets, which is
 *  exactly what memberships are for. An unset value gives none. */
function nodeKeys(n: GNode, key: SpreadKey, registry: TypeRegistry | undefined, name: (d: { label: string; labelEn?: string }) => string, english: boolean): string[] {
  if (key.by === "type") {
    const def = registry?.nodes.find((k) => k.id === n.kind);
    return [def ? name(def) : KIND_BY_ID[n.kind] ? name(KIND_BY_ID[n.kind]) : String(n.kind)];
  }
  if (key.by === "tag")
    return (n.tags ?? []).map((id) => { const def = registry?.tags.find((t) => t.id === id); return def ? name(def) : id; });
  const value = n.attributes?.[key.id];
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  return [attributeText(value, english)];
}

/** Dictionary order for the keys, so the result does not depend on node order. */
function keyOrder(key: SpreadKey, registry: TypeRegistry | undefined, name: (d: { label: string; labelEn?: string }) => string): string[] {
  if (key.by === "type") return [...(registry?.nodes ?? []), ...KINDS].map(name);
  if (key.by === "tag") return (registry?.tags ?? []).map(name);
  return registry?.attributes.find((a) => a.id === key.id)?.options ?? [];
}

/**
 * Lays one sheet out into several, one per value of an attribute, a node tag or a node type.
 * Identities, relations, coordinates and every other membership are preserved; only the
 * membership on this sheet is replaced. Deterministic: same input, same output.
 */
export function spreadSheet(g: Graph, sheetId: string, key: SpreadKey, naming: SpreadNaming = {}): Graph {
  const english = naming.english ?? false;
  const name = naming.label ?? ((d: { label: string; labelEn?: string }) => (english ? d.labelEn || d.label : d.label));
  const at = g.sheets.findIndex((s) => s.id === sheetId);
  if (at < 0) throw new Error("Лист не найден");
  const source = g.sheets[at];
  if(source.smartFilter)throw new Error("Сначала сделайте умный лист обычным");
  const local = g.nodes.filter((n) => n.sheets.includes(sheetId));
  if (!local.length) throw new Error("На листе нет узлов — раскладывать нечего");
  if (key.by === "attribute" && !g.types?.attributes.some((a) => a.id === key.id))
    throw new Error("Такого атрибута нет в словаре проекта");

  const blank = english ? NO_VALUE_EN : NO_VALUE;
  const keys = new Map<string, string[]>();
  const found = new Set<string>();
  for (const n of local) {
    const list = [...new Set(nodeKeys(n, key, g.types, name, english))];
    keys.set(n.id, list.length ? list : [blank]);
    for (const k of keys.get(n.id)!) found.add(k);
  }
  const order = keyOrder(key, g.types, name);
  const buckets = [...found].sort((a, b) => {
    if (a === blank || b === blank) return a === blank ? 1 : -1;
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== ib) return ia < 0 ? 1 : ib < 0 ? -1 : ia - ib;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (buckets.length < 2) throw new Error("У всех узлов листа одно значение — раскладывать не на что");

  const ids = new Set(g.sheets.map((s) => s.id));
  const sheetOf = new Map<string, string>();
  const made: Sheet[] = [];
  for (const bucket of buckets) {
    let id = `${sheetId}-${made.length + 1}`;
    while (ids.has(id)) id += "-";
    ids.add(id);
    sheetOf.set(bucket, id);
    made.push({ ...source, overviewPos: undefined, id, name: `${source.name} · ${bucket}`.slice(0, 80),
      color: source.color || PALETTE[made.length % PALETTE.length] });
  }
  const sheetsOf = (nodeId: string) => (keys.get(nodeId) ?? []).map((k) => sheetOf.get(k)!);

  return {
    ...g,
    sheets: [...g.sheets.slice(0, at), ...made, ...g.sheets.slice(at + 1)],
    nodes: g.nodes.map((n) => {
      if (!keys.has(n.id)) return n;
      const spread = <T,>(from: Record<string, T>) => Object.fromEntries(Object.entries(from).flatMap(([s, v]) =>
        s === sheetId ? sheetsOf(n.id).map((id) => [id, v] as [string, T]) : [[s, v] as [string, T]]));
      return { ...n, sheets: n.sheets.flatMap((s) => (s === sheetId ? sheetsOf(n.id) : [s])), pos: spread(n.pos),
        ...(n.appearance ? { appearance: spread(n.appearance) } : {}) };
    }),
    // A waypoint survives only where both ends still share the sheet it was drawn on.
    edges: g.edges.map((e) => e.routes?.[sheetId] ? { ...e, routes: Object.fromEntries(Object.entries(e.routes).flatMap(([sid, route]) => {
      if (sid !== sheetId) return [[sid, route] as [string, typeof route]];
      const from = new Set(sheetsOf(e.from));
      return sheetsOf(e.to).filter((id) => from.has(id)).map((id) => [id, route] as [string, typeof route]);
    })) } : e),
  };
}
