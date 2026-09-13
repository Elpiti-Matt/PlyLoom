import type { Graph, Mode } from "../model/types";
import { compileNodeFilter, SEARCH_FIELDS, type AttributeCondition, type FilterMode, type NodeFilter } from "./nodeFilter";
import { typesFor } from "./typeRegistry";

export interface SavedView { id: string; name: string; filter: NodeFilter; filterMode: FilterMode; mode: Mode; sheetId?: string; sheetIds?: string[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const safe = (s: string) => !["__proto__", "constructor", "prototype"].includes(s);
const text = (v: unknown, max = 4096): v is string => typeof v === "string" && v.length <= max;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => text(x));

/** Validate persisted filter descriptions without evaluating user supplied code. */
export function readNodeFilter(raw: unknown): NodeFilter {
  if (!object(raw) || !strings(raw.hiddenNodeTypes) || !strings(raw.hiddenEdgeTypes) || !object(raw.attributes)) throw new Error("Некорректный сохранённый фильтр");
  const attributes: Record<string, AttributeCondition> = Object.create(null);
  for (const [id, value] of Object.entries(raw.attributes)) {
    if (!safe(id) || !object(value)) throw new Error("Некорректное условие атрибута");
    const c: AttributeCondition = {};
    for (const key of ["min", "max", "text"] as const) if (value[key] !== undefined) {
      if (!text(value[key])) throw new Error("Некорректное значение условия"); c[key] = value[key];
    }
    for (const key of ["all", "unset", "missing"] as const) if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") throw new Error("Некорректный флаг условия"); c[key] = value[key];
    }
    if (value.values !== undefined) { if (!strings(value.values)) throw new Error("Некорректные варианты условия"); c.values = [...new Set(value.values)]; }
    attributes[id] = c;
  }
  const filter: NodeFilter = { hiddenNodeTypes: [...new Set(raw.hiddenNodeTypes)], hiddenEdgeTypes: [...new Set(raw.hiddenEdgeTypes)], attributes };
  if (raw.search !== undefined) {
    const s = raw.search;
    if (!object(s) || !text(s.text) || !strings(s.fields) || s.fields.some(f => !(SEARCH_FIELDS as readonly string[]).includes(f))) throw new Error("Некорректная область поиска");
    filter.search = { text: s.text, fields: [...new Set(s.fields)] as NonNullable<NodeFilter["search"]>["fields"] };
  }
  return filter;
}

export function readSavedViews(raw: unknown): SavedView[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error("savedViews: нужен массив");
  const ids = new Set<string>();
  return raw.map(v => {
    if (!object(v) || !text(v.id, 200) || !v.id.trim() || !safe(v.id) || ids.has(v.id) || !text(v.name, 80) || !v.name.trim() || !["hide", "dim"].includes(String(v.filterMode)) || !["sheet", "board", "spread", "stack", "contents", "flat"].includes(String(v.mode))) throw new Error("Некорректный сохранённый вид");
    if (v.sheetId !== undefined && !text(v.sheetId, 200) || v.sheetIds !== undefined && !strings(v.sheetIds)) throw new Error("Некорректные листы сохранённого вида");
    ids.add(v.id);
    return { id: v.id, name: v.name, filter: readNodeFilter(v.filter), filterMode: v.filterMode as FilterMode, mode: v.mode as Mode, ...(v.sheetId ? {sheetId: v.sheetId as string} : {}), ...(v.sheetIds ? {sheetIds: [...new Set(v.sheetIds as string[])]} : {}) };
  });
}

/** Smart memberships are derived from ordinary memberships only. This prevents
 * recursive "sheet name" queries and guarantees that an entity retains a home.
 * Snapshots are stored too, so older readers still display the current result. */
export function resolveSmartSheets(graph: Graph): Graph {
  const smart = graph.sheets.filter(s => s.smartFilter), ids = new Set(smart.map(s => s.id));
  if (!smart.length) return graph;
  const ordinary = graph.sheets.filter(s => !ids.has(s.id));
  if (!ordinary.length) throw new Error("Нужен хотя бы один обычный лист");
  const registry = typesFor(graph), predicates = smart.map(s => compileNodeFilter(registry, s.smartFilter!, ordinary));
  let changed = false;
  const nodes = graph.nodes.map((n, i) => {
    const home = n.sheets.filter(sid => !ids.has(sid));
    if (!home.length) home.push(ordinary[0].id);
    const base = {...n, sheets: home};
    const matches = smart.filter((_, j) => !predicates[j] || predicates[j]!(base));
    const sheets = [...home, ...matches.map(s => s.id)];
    if (sheets.length === n.sheets.length && sheets.every((sid,j) => sid === n.sheets[j]) && sheets.every(sid => n.pos[sid])) return n;
    changed = true;
    const pos = Object.fromEntries(sheets.map(sid => [sid, n.pos[sid] ?? {x:(i%20)*270, y:Math.floor(i/20)*150}]));
    const appearance = n.appearance ? Object.fromEntries(Object.entries(n.appearance).filter(([sid]) => sheets.includes(sid))) : undefined;
    return {...n, sheets, pos, ...(appearance ? {appearance} : {})};
  });
  return changed ? {...graph, nodes} : graph;
}
