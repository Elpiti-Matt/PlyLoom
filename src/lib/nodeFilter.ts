import type { AttributeDefinition, AttributeValue, GEdge, GNode, Sheet, TypeRegistry } from "../model/types";

/**
 * Node filter (S3): one description of "what is shown" for every view.
 * Between different conditions — AND; inside one condition — OR.
 * The filter lives in the session only: it never changes the project or its exports.
 */
export interface AttributeCondition {
  /** number / date: inclusive bounds as typed in the form ("" or absent = open). */
  min?: string;
  max?: string;
  /** text / url: case-insensitive "contains". */
  text?: string;
  /** select / multi: chosen options; boolean: "true" / "false". */
  values?: string[];
  /** multi only: require every checked option instead of any of them. */
  all?: boolean;
  /** The node has the attribute, but its value is not set (null or ""). */
  unset?: boolean;
  /** The node does not have this attribute at all. */
  missing?: boolean;
}
/** Where the search line looks. Empty list or empty text = the search does not filter. */
export type SearchField = "name" | "body" | "tags" | "sheet" | "attrs";
export const SEARCH_FIELDS: readonly SearchField[] = ["name", "body", "tags", "sheet", "attrs"];
/** "sheet" matches a node whose sheet name or sheet tag contains the text; "attrs" — its attribute values. */
export interface NodeSearch { text: string; fields: SearchField[] }
export interface NodeFilter {
  hiddenNodeTypes: string[];
  hiddenEdgeTypes: string[];
  attributes: Record<string, AttributeCondition>;
  search?: NodeSearch;
}
/** What happens to objects the filter does not let through. */
export type FilterMode = "hide" | "dim";
/** Objects the user created, opened or edited stay visible until the filter changes. */
export interface FilterPins { nodes: ReadonlySet<string>; edges: ReadonlySet<string> }
export type NodePredicate = (node: GNode) => boolean;

export const EMPTY_SEARCH: NodeSearch = { text: "", fields: [...SEARCH_FIELDS] };
export const EMPTY_FILTER: NodeFilter = { hiddenNodeTypes: [], hiddenEdgeTypes: [], attributes: {}, search: EMPTY_SEARCH };
export const NO_PINS: FilterPins = { nodes: new Set(), edges: new Set() };

const has = (o: object | undefined, key: string) => !!o && Object.prototype.hasOwnProperty.call(o, key);
export const isUnset = (v: AttributeValue | undefined) => v === null || v === "" || (Array.isArray(v) && v.length === 0);
const numberOf = (s?: string) => { if (s === undefined || s.trim() === "") return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };
const dateOf = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/** A test on a set value, or null when the condition has no value part (only unset / missing). */
function valueTest(def: AttributeDefinition, c: AttributeCondition): ((v: AttributeValue) => boolean) | null {
  switch (def.dataType) {
    case "number": {
      const lo = numberOf(c.min), hi = numberOf(c.max);
      if (lo === undefined && hi === undefined) return null;
      return v => typeof v === "number" && (lo === undefined || v >= lo) && (hi === undefined || v <= hi);
    }
    case "date": {
      const lo = dateOf(c.min), hi = dateOf(c.max);
      if (lo === undefined && hi === undefined) return null;
      return v => typeof v === "string" && (lo === undefined || v >= lo) && (hi === undefined || v <= hi);
    }
    case "boolean":
    case "select": {
      if (!c.values?.length) return null;
      const set = new Set(c.values);
      return v => set.has(String(v));
    }
    case "multi": {
      if (!c.values?.length) return null;
      const wanted = [...c.values], set = new Set(wanted);
      // "any of" — the node has at least one checked option; "all selected" — it has every one.
      return c.all
        ? v => Array.isArray(v) && wanted.every(x => v.includes(x))
        : v => Array.isArray(v) && v.some(x => set.has(x));
    }
    default: {
      const q = c.text?.trim().toLocaleLowerCase();
      if (!q) return null;
      return v => String(v).toLocaleLowerCase().includes(q);
    }
  }
}

/** The search line filters only when it has at least one word and one area to look in. */
export function searchQuery(f: NodeFilter): { words: string[]; fields: Set<SearchField> } | null {
  const words = (f.search?.text ?? "").trim().split(/\s+/).filter(Boolean);
  const fields = new Set(f.search?.fields ?? []);
  return words.length && fields.size ? { words, fields } : null;
}

/**
 * Case-insensitive "contains" as a regular expression. Lowercasing the text instead would copy
 * every node body on every pass — 39 ms per 10 000 nodes with 1 KB bodies against 4 ms here.
 */
const containsTest = (q: string) => { const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"); return (text: string) => re.test(text); };

/** Sheet name and sheet tag names, joined once per compile: "sheet" looks here. */
function sheetHaystacks(sheets: readonly Sheet[], registry: TypeRegistry): Map<string, string> {
  const tag = new Map(registry.tags.map(d => [d.id, [d.id, d.label, d.labelEn ?? ""].join(" ")]));
  return new Map(sheets.map(s => [s.id, [s.name, ...(s.tags ?? []).map(id => tag.get(id) ?? id)].join(" ")]));
}

/** Attribute values of one node as a single string; built only when the "attrs" area is on. */
function attributeHaystack(n: GNode): string {
  const a = n.attributes;
  if (!a) return "";
  let out = "";
  for (const v of Object.values(a)) out += Array.isArray(v) ? " " + v.join(" ") : v === null ? "" : " " + v;
  return out;
}

export function conditionActive(def: AttributeDefinition | undefined, c: AttributeCondition | undefined): boolean {
  return !!def && !!c && (!!c.unset || !!c.missing || valueTest(def, c) !== null);
}

/** Number of active conditions (types, attributes); 0 means the filter lets everything through. */
export function activeConditions(registry: TypeRegistry, f: NodeFilter): number {
  let n = (f.hiddenNodeTypes.length ? 1 : 0) + (f.hiddenEdgeTypes.length ? 1 : 0) + (searchQuery(f) ? 1 : 0);
  for (const [id, c] of Object.entries(f.attributes)) if (conditionActive(registry.attributes.find(a => a.id === id), c)) n++;
  return n;
}

/**
 * Prepares the node predicate once per filter change, so checking 10 000 nodes is a single
 * cheap pass. Returns null when no node condition is active (every node matches).
 */
export function compileNodeFilter(registry: TypeRegistry, f: NodeFilter, sheets: readonly Sheet[] = []): NodePredicate | null {
  const tests: NodePredicate[] = [];
  if (f.hiddenNodeTypes.length) { const kinds = new Set(f.hiddenNodeTypes); tests.push(n => !kinds.has(n.kind)); }
  const search = searchQuery(f);
  if (search) {
    const { words, fields } = search;
    // Every word must be found somewhere (AND); the areas of one word are joined by OR.
    const hits = words.map(containsTest);
    const name = fields.has("name"), body = fields.has("body"), tags = fields.has("tags"), attrs = fields.has("attrs");
    const sheetText = fields.has("sheet") ? sheetHaystacks(sheets, registry) : null;
    tests.push(n => {
      const values = attrs ? attributeHaystack(n) : "";
      word: for (const hit of hits) {
        if (name && hit(n.name)) continue;
        if (body && hit(n.body)) continue;
        if (tags && n.tags?.some(hit)) continue;
        if (values && hit(values)) continue;
        if (sheetText) for (const id of n.sheets) { const h = sheetText.get(id); if (h !== undefined && hit(h)) continue word; }
        return false;
      }
      return true;
    });
  }
  for (const [id, c] of Object.entries(f.attributes)) {
    const def = registry.attributes.find(a => a.id === id);
    if (!def || !conditionActive(def, c)) continue;
    const value = valueTest(def, c), unset = !!c.unset, missing = !!c.missing;
    tests.push(n => {
      if (!has(n.attributes, id)) return missing;
      const v = n.attributes![id];
      if (isUnset(v)) return unset;
      return value ? value(v) : false;
    });
  }
  if (!tests.length) return null;
  return n => { for (const test of tests) if (!test(n)) return false; return true; };
}

/** The pure form of the filter: (node, registry, filter) → boolean. */
export function matchNode(node: GNode, registry: TypeRegistry, filter: NodeFilter, sheets: readonly Sheet[] = []): boolean {
  const p = compileNodeFilter(registry, filter, sheets);
  return p ? p(node) : true;
}

/** Visible nodes: matching or pinned. null = nothing is filtered. */
export function visibleNodes(nodes: readonly GNode[], predicate: NodePredicate | null, pins: FilterPins = NO_PINS): Set<string> | null {
  if (!predicate) return null;
  const out = new Set<string>();
  for (const n of nodes) if (predicate(n) || pins.nodes.has(n.id)) out.add(n.id);
  return out;
}

/** A relation is visible when its type is shown (or it is pinned) and both ends are visible. */
export function visibleEdges(edges: readonly GEdge[], nodes: Set<string> | null, hiddenEdgeTypes: ReadonlySet<string>, pins: FilterPins = NO_PINS): Set<string> | null {
  if (!nodes && !hiddenEdgeTypes.size) return null;
  const out = new Set<string>();
  for (const e of edges) {
    if (hiddenEdgeTypes.has(e.kind ?? "flow") && !pins.edges.has(e.id)) continue;
    if (nodes && (!nodes.has(e.from) || !nodes.has(e.to))) continue;
    out.add(e.id);
  }
  return out;
}

/** For dim mode: an empty attribute value marks an object outside the visible set. */
export const mutedAttr = (set: Set<string> | null | undefined, id: string, dim: boolean | undefined) => (dim && set && !set.has(id) ? "" : undefined);

export interface AttributeFacet { missing: number; unset: number; values: Map<string, number> }
export interface FilterFacets { nodeTypes: Map<string, number>; edgeTypes: Map<string, number>; attributes: Map<string, AttributeFacet> }
/** Counts over the whole project for the filter panel: types and attribute values. */
export function filterFacets(nodes: readonly GNode[], edges: readonly GEdge[], registry: TypeRegistry): FilterFacets {
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const nodeTypes = new Map<string, number>(), edgeTypes = new Map<string, number>();
  const attributes = new Map(registry.attributes.map(d => [d.id, { missing: nodes.length, unset: 0, values: new Map<string, number>() } as AttributeFacet]));
  for (const n of nodes) {
    inc(nodeTypes, n.kind);
    for (const [id, v] of Object.entries(n.attributes ?? {})) {
      const facet=attributes.get(id); if(!facet)continue;
      facet.missing--;
      if(isUnset(v))facet.unset++;
      else if(Array.isArray(v))for(const x of v)inc(facet.values,x);
      else inc(facet.values,String(v));
    }
  }
  for (const e of edges) inc(edgeTypes, e.kind ?? "flow");
  return { nodeTypes, edgeTypes, attributes };
}
