import { readNodeFilter, readSavedViews, resolveSmartSheets } from "./savedViews";
import {
  CARD_H_DEFAULT,
  CARD_W,
  STUB_H,
  type EdgeKind,
  type GEdge,
  type GNode,
  type Graph,
  type NodeKind,
  type Pos,
  type Sheet,
} from "../model/types";
import { readAttributes } from "./attributes";
import { readAppearances, readRoutes, dimensions } from "./appearance";
import { readTypes, typesFor, sheetTypeId } from "./typeRegistry";

// ---------- утилиты ----------

export function uid(prefix: string) {
  return prefix + (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
}

/** FNV-1a → [0,1), детерминированно. */
export function hash01(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

// ---------- миграция и валидация ----------

export interface LoadResult {
  graph: Graph | null;
  errors: string[];
  migrated: boolean;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Читает первый и второй формат. Не мутирует вход. */
export function loadGraph(input: unknown): LoadResult {
  const errors: string[] = [];
  if (!isObj(input)) return { graph: null, errors: ["Корень JSON должен быть объектом"], migrated: false };
  let raw: Record<string, unknown> = input;
  if (raw.version !== undefined && raw.version !== 1 && raw.version !== 2 && raw.version !== 3)
    return { graph: null, errors: ["Неизвестная версия формата"], migrated: false };
  let types:Graph["types"],savedViews:Graph["savedViews"];
  try {
    if(raw.types!==undefined && raw.version!==3)throw new Error("Словари типов требуют version: 3");
    if(raw.version===3)types=readTypes(raw.types);
    savedViews=readSavedViews(raw.savedViews);
  }catch(e){return {graph:null,errors:[(e as Error).message],migrated:false};}
  const registry=typesFor({types});
  const KIND_SET=new Set(registry.nodes.map(k=>k.id));
  const EDGE_SET=new Set(registry.edges.map(k=>k.id));
  if (raw.sheets === undefined && Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
    const ids = new Set<string>();
    for (const n of raw.nodes) if (isObj(n)) {
      const memberships = Array.isArray(n.sheets) ? n.sheets : Array.isArray(n.layers) ? n.layers : [typeof n.sheet === "string" ? n.sheet : "main"];
      memberships.forEach((id) => { if (typeof id === "string") ids.add(id); });
    }
    raw = { ...raw, sheets: [...(ids.size ? ids : new Set(["main"]))].sort().map((id) => ({ id, name: id, notation: "свободная", limit: 15 })) };
  }
  if (!Array.isArray(raw.sheets) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    return { graph: null, errors: ["Нужны массивы sheets, nodes и edges"], migrated: false };
  }
  const migrated = raw.version !== 2 && raw.version !== 3;
  const reservedEdgeIds = new Set(raw.edges.flatMap((e: unknown) => isObj(e) && typeof e.id === "string" ? [e.id] : []));
  const validId = (id: unknown) => typeof id === "string" && id.trim().length > 0 && id.length <= 200 && !["__proto__", "constructor", "prototype", "__flat"].includes(id);
  const positions = new Map<string, number>();
  const nextPos = (id: string) => { const i = positions.get(id) ?? 0; positions.set(id, i + 1); return gridLayout(12, i, id + i); };
  const sheets: Sheet[] = [];
  const sheetIds = new Set<string>();
  raw.sheets.forEach((s: unknown, i: number) => {
    if (!isObj(s) || typeof s.id !== "string" || !validId(s.id)) return errors.push(`sheets[${i}]: нет id`);
    if (sheetIds.has(s.id)) return errors.push(`sheets[${i}]: дубликат id «${s.id}»`);
    sheetIds.add(s.id);
    if(s.typeId!==undefined&&!registry.sheets.some(t=>t.id===s.typeId))errors.push(`Лист «${s.id}»: неизвестный тип листа`);
    if(s.tags!==undefined&&(!Array.isArray(s.tags)||s.tags.length>200||s.tags.some(id=>!registry.tags.some(t=>t.id===id))))errors.push(`Лист «${s.id}»: неизвестные теги`);
    if (String(s.name ?? s.id).length > 80) errors.push(`Лист «${s.id}»: название длиннее 80 символов`);
    if (s.layout !== undefined && s.layout !== "manual") errors.push(`Лист «${s.id}»: неизвестный режим расположения`);
    if(s.overviewPos!==undefined&&(!isObj(s.overviewPos)||![s.overviewPos.x,s.overviewPos.y].every(v=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=10000000)))errors.push(`Лист «${s.id}»: некорректная позиция в обзоре`);
    const color = typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#64748b";
    // Kept and clamped for round-trip compatibility only: since 0.7.1 nothing reads it back.
    const limit = typeof s.limit === "number" && Number.isFinite(s.limit) ? Math.floor(clamp(s.limit, 3, 60)) : 15;
    let smartFilter:Sheet["smartFilter"];
    try { if(s.smartFilter!==undefined)smartFilter=readNodeFilter(s.smartFilter); } catch(e) { errors.push((e as Error).message); }
    sheets.push({
      id: s.id,
      ...(smartFilter?{smartFilter}:{}),
      name: String(s.name ?? s.id).slice(0, 80),
      notation: (s.notation === "plyra" ? "plyloom" : String(s.notation ?? "plyloom")).slice(0, 60),
      typeId:typeof s.typeId==="string"?s.typeId:sheetTypeId({notation:String(s.notation??"свободная")} as Sheet,registry),
      tags:Array.isArray(s.tags)?[...new Set(s.tags as string[])]:[],
      color,
      limit,
      description: typeof s.description === "string" ? s.description.slice(0, 2000) : undefined,
      ...(s.layout === "manual" ? {layout:"manual" as const} : {}),
      ...(isObj(s.overviewPos)?{overviewPos:{x:Number(s.overviewPos.x),y:Number(s.overviewPos.y)}}:{}),
    });
  });
  if (sheets.length === 0) errors.push("Нужен хотя бы один лист");
  if(sheets.length&&!sheets.some(s=>!s.smartFilter))errors.push("Нужен хотя бы один обычный лист");
  const defaultSheet = sheets[0]?.id ?? "main";

  const nodes: GNode[] = [];
  const nodeIds = new Set<string>();
  raw.nodes.forEach((n: unknown, i: number) => {
    if (!isObj(n) || typeof n.id !== "string" || !validId(n.id)) return errors.push(`nodes[${i}]: нет id`);
    if (nodeIds.has(n.id)) return errors.push(`nodes[${i}]: дубликат id «${n.id}»`);
    let sheetsArr: string[];
    let pos: Record<string, Pos> = Object.create(null);
    if (Array.isArray(n.sheets)) {
      if (n.sheets.some((s) => typeof s !== "string")) errors.push(`Узел «${n.id}»: членства должны быть строками`);
      sheetsArr = Array.from(new Set(n.sheets.filter((s): s is string => typeof s === "string")));
      const p = isObj(n.pos) ? n.pos : {};
      for (const s of sheetsArr) {
        const q = p[s];
        if (q !== undefined && (!isObj(q) || !Number.isFinite(q.x) || !Number.isFinite(q.y) || Math.abs(Number(q.x)) > 10000000 || Math.abs(Number(q.y)) > 10000000)) errors.push(`Узел «${n.id}»: некорректные координаты на листе «${s}»`);
        pos[s] = isObj(q) && Number.isFinite(q.x) && Number.isFinite(q.y) ? { x: Number(q.x), y: Number(q.y) } : nextPos(s);
      }
    } else {
      // Первая версия: sheet, x, y — либо layers (демо-набор)
      const s = typeof n.sheet === "string" ? n.sheet : Array.isArray(n.layers) ? String(n.layers[0]) : defaultSheet;
      sheetsArr = Array.isArray(n.layers) ? Array.from(new Set(n.layers.map(String))) : [s];
      for (const sid of sheetsArr) pos[sid] = Number.isFinite(n.x) && Number.isFinite(n.y) ? { x: Number(n.x), y: Number(n.y) } : nextPos(sid);
    }
    for (const sid of sheetsArr) if (!sheetIds.has(sid)) errors.push(`Узел «${n.id}»: неизвестный лист «${sid}»`);
    sheetsArr = sheetsArr.filter((s) => sheetIds.has(s));
    if (sheetsArr.length === 0) {
      errors.push(`nodes[${i}] «${n.id}»: ни одного существующего листа, перенесён на «${defaultSheet}»`);
      sheetsArr = [defaultSheet];
      pos = { [defaultSheet]: { x: 0, y: 0 } };
    }
    if (n.kind !== undefined && n.kind !== "" && !KIND_SET.has(String(n.kind))) errors.push(`Узел «${n.id}»: неизвестный тип «${n.kind}»`);
    if (String(n.name ?? "").length > 200) errors.push(`Узел «${n.id}»: имя длиннее 200 символов`);
    if (typeof n.body === "string" && n.body.length > 1000000) errors.push(`Узел «${n.id}»: тело больше 1 млн символов`);
    if (isObj(n.body) && Array.isArray(n.body.table) && n.body.table.some((row) => !Array.isArray(row))) errors.push(`Узел «${n.id}»: некорректная таблица`);
    if (Array.isArray(n.tags) && n.tags.length > 20) errors.push(`Узел «${n.id}»: больше 20 тегов`);
    const kind = KIND_SET.has(String(n.kind)) ? (n.kind as NodeKind) : "entity";
    let attributes:GNode["attributes"],appearance:GNode["appearance"];
    try{attributes=readAttributes(n.attributes,registry);appearance=readAppearances(n.appearance,sheetsArr);}catch(e){errors.push(`Узел «${n.id}»: ${(e as Error).message}`);}
    nodeIds.add(n.id);
    nodes.push({
      id: n.id,
      sheets: sheetsArr,
      pos: Object.fromEntries(sheetsArr.map((s) => [s, pos[s]])),
      name: String(n.name ?? "Без имени").slice(0, 200),
      kind,
      body: bodyToString(n.body),
      ...(attributes?{attributes}:{}),...(appearance?{appearance}:{}),
      tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 20) : undefined,
    });
  });

  const edges: GEdge[] = [];
  const edgeIds = new Set<string>();
  const explicitEdgeIds = new Set<string>();
  raw.edges.forEach((e: unknown, i: number) => {
    if (!isObj(e) || typeof e.from !== "string" || typeof e.to !== "string") return errors.push(`edges[${i}]: нет from/to`);
    if (e.id && (!validId(e.id) || explicitEdgeIds.has(String(e.id)))) return errors.push(`edges[${i}]: некорректный или повторяющийся id`);
    if (e.id) explicitEdgeIds.add(String(e.id));
    let id = typeof e.id === "string" && e.id ? e.id : `edge-${i}`;
    if (!e.id) while (edgeIds.has(id) || reservedEdgeIds.has(id)) id += "-";
    if (e.kind !== undefined && e.kind !== "" && !EDGE_SET.has(String(e.kind))) errors.push(`Ребро «${id}»: неизвестный тип «${e.kind}»`);
    if (typeof e.label === "string" && e.label.length > 120) errors.push(`Ребро «${id}»: подпись длиннее 120 символов`);
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) return errors.push(`edges[${i}] ${e.from}→${e.to}: висячий конец, пропущено`);
    let routes:GEdge["routes"];
    try{routes=readRoutes(e.routes,sheetIds);}catch(err){errors.push(`Связь «${id}»: ${(err as Error).message}`);}
    if(e.directed!==undefined&&typeof e.directed!=="boolean")errors.push(`Связь «${id}»: некорректное направление`);
    edgeIds.add(id);
    edges.push({
      id,
      from: e.from,
      to: e.to,
      ...(routes?{routes}:{}),...(typeof e.directed==="boolean"?{directed:e.directed}:{}),
      ...(typeof e.sourceType==="string"?{sourceType:e.sourceType.slice(0,160)}:{}),
      kind: EDGE_SET.has(String(e.kind)) ? (e.kind as EdgeKind) : "flow",
      label: typeof e.label === "string" ? e.label.slice(0, 120) : undefined,
    });
  });

  let flatPositions:Record<string,Pos>|undefined;
  if(raw.flatPositions!==undefined){
    if(!isObj(raw.flatPositions))errors.push("flatPositions: нужен объект координат");
    else{
      flatPositions=Object.create(null) as Record<string,Pos>;
      for(const [id,p] of Object.entries(raw.flatPositions)){
        if(!nodeIds.has(id)||!isObj(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(Number(p.x))>10000000||Math.abs(Number(p.y))>10000000)errors.push(`flatPositions: некорректная позиция «${id}»`);
        else flatPositions[id]={x:Number(p.x),y:Number(p.y)};
      }
    }
  }
  if (sheets.length === 0 || errors.length) return { graph: null, errors, migrated };
  return {
    graph: resolveSmartSheets({
      version: raw.version===3 ? 3 : 2,
      title: String(raw.title ?? "PlyLoom").slice(0, 120),
      description: typeof raw.description === "string" ? raw.description : undefined,
      sheets,
      nodes,
      edges,
      ...(types ? {types} : {}),
      ...(flatPositions ? {flatPositions} : {}),
      ...(savedViews ? {savedViews} : {}),
    }),
    errors,
    migrated,
  };
}

/** Тело узла из демо-формата {text, table, image} → markdown-строка. */
function bodyToString(b: unknown): string {
  if (typeof b === "string") return b;
  if (!isObj(b)) return "";
  const parts: string[] = [];
  if (typeof b.text === "string") parts.push(b.text);
  if (Array.isArray(b.table)) {
    const rows = b.table as unknown[][];
    rows.filter(Array.isArray).forEach((r, i) => {
      parts.push("| " + r.map(String).join(" | ") + " |");
      if (i === 0) parts.push("|" + r.map(() => "---").join("|") + "|");
    });
  }
  if (typeof b.image === "string") parts.push(`![](${b.image})`);
  return parts.join("\n").slice(0, 1000000);
}

/** Экспорт «в дерево»: у каждого узла остаётся только sheets[0]. */
export function flatten(g: Graph): { graph: Record<string, unknown>; droppedMemberships: number; affectedNodes: number } {
  let dropped = 0;
  let affected = 0;
  const nodes = g.nodes.map((n) => {
    if (n.sheets.length > 1) {
      dropped += n.sheets.length - 1;
      affected++;
    }
    const s = n.sheets[0];
    return { id: n.id, sheet: s, name: n.name, kind: n.kind, x: n.pos[s].x, y: n.pos[s].y, body: n.body, tags: n.tags };
  });
  return {
    graph: { title: g.title, description: g.description, sheets: g.sheets, nodes, edges: g.edges },
    droppedMemberships: dropped,
    affectedNodes: affected,
  };
}

// ---------- индексы ----------

export interface Index {
  nodeById: Map<string, GNode>;
  sheetById: Map<string, Sheet>;
  degree: Map<string, number>;
  adj: Map<string, GEdge[]>; // все рёбра узла
  bySheet: Map<string, GNode[]>;
  edgesBySheet: Map<string, GEdge[]>;
  boundaryBySheet: Map<string, GEdge[]>;
}

export function buildIndex(g: Graph): Index {
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
  const sheetById = new Map(g.sheets.map((s) => [s.id, s]));
  const degree = new Map<string, number>();
  const adj = new Map<string, GEdge[]>();
  for (const n of g.nodes) {
    degree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of g.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    adj.get(e.from)?.push(e);
    adj.get(e.to)?.push(e);
  }
  const bySheet = new Map<string, GNode[]>();
  for (const s of g.sheets) bySheet.set(s.id, []);
  for (const n of g.nodes) for (const s of n.sheets) bySheet.get(s)?.push(n);
  const edgesBySheet = new Map(g.sheets.map(s => [s.id, [] as GEdge[]]));
  const boundaryBySheet = new Map(g.sheets.map(s => [s.id, [] as GEdge[]]));
  const memberships = new Map(g.nodes.map(n => [n.id, new Set(n.sheets)]));
  for (const e of g.edges) {
    const a = memberships.get(e.from), b = memberships.get(e.to);
    if (!a || !b) continue;
    for (const sid of a) (b.has(sid) ? edgesBySheet : boundaryBySheet).get(sid)?.push(e);
    for (const sid of b) if (!a.has(sid)) boundaryBySheet.get(sid)?.push(e);
  }
  return { nodeById, sheetById, degree, adj, bySheet, edgesBySheet, boundaryBySheet };
}

export function sharesSheet(a: GNode, b: GNode) {
  return a.sheets.some((s) => b.sheets.includes(s));
}

/** Ребро «межлистовое», если у концов нет общего листа (правило после миграции). */
export function isCross(e: GEdge, idx: Index) {
  const a = idx.nodeById.get(e.from);
  const b = idx.nodeById.get(e.to);
  return !!a && !!b && !sharesSheet(a, b);
}

/** Edges crossing either sheet's boundary, including endpoints with a shared third sheet. */
export function edgesBetweenSheets(g: Graph, idx: Index, a: string, b: string) {
  if (a === b) return [];
  return g.edges.filter((e) => {
    const f = idx.nodeById.get(e.from);
    const t = idx.nodeById.get(e.to);
    if (!f || !t) return false;
    return (f.sheets.includes(a) && !t.sheets.includes(a) && t.sheets.includes(b)) ||
      (t.sheets.includes(a) && !f.sheets.includes(a) && f.sheets.includes(b)) ||
      (f.sheets.includes(b) && !t.sheets.includes(b) && t.sheets.includes(a)) ||
      (t.sheets.includes(b) && !f.sheets.includes(b) && f.sheets.includes(a));
  });
}

// ---------- геометрия ----------

export type Sizes = Map<string, number>; // nodeId → высота карточки

export function nodeH(sizes: Sizes, id: string) {
  return sizes.get(id) ?? CARD_H_DEFAULT;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Кубическая кривая между двумя прямоугольниками с учётом сторон выхода. */
export function edgePath(a: Rect, b: Rect) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  let x1: number, y1: number, x2: number, y2: number, c1x: number, c1y: number, c2x: number, c2y: number;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    const dir = dx > 0 ? 1 : -1;
    x1 = dir > 0 ? a.x + a.w : a.x;
    y1 = acy;
    x2 = dir > 0 ? b.x : b.x + b.w;
    y2 = bcy;
    const c = Math.max(36, Math.abs(x2 - x1) * 0.45);
    c1x = x1 + dir * c;
    c1y = y1;
    c2x = x2 - dir * c;
    c2y = y2;
  } else {
    const dir = dy > 0 ? 1 : -1;
    x1 = acx;
    y1 = dir > 0 ? a.y + a.h : a.y;
    x2 = bcx;
    y2 = dir > 0 ? b.y : b.y + b.h;
    const c = Math.max(30, Math.abs(y2 - y1) * 0.45);
    c1x = x1;
    c1y = y1 + dir * c;
    c2x = x2;
    c2y = y2 - dir * c;
  }
  const mid = {
    x: 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2,
    y: 0.125 * y1 + 0.375 * c1y + 0.375 * c2y + 0.125 * y2,
  };
  return { d: `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`, mid,
    points: [{x:x1,y:y1},{x:c1x,y:c1y},{x:c2x,y:c2y},{x:x2,y:y2}] };
}

// ---------- стабы ----------

export interface Stub {
  key: string;
  node: GNode; // чужой узел
  side: "left" | "right";
  x: number;
  y: number;
  edges: GEdge[];
  locals: string[];
}

/** Стабы листа: рёбра, у которых ровно один конец стоит на листе. */
export function stubsForSheet(_g: Graph, idx: Index, sheetId: string, sizes: Sizes, positions?: Map<string, Pos>, visibleSheets: string[] = []): Stub[] {
  const locals = idx.bySheet.get(sheetId) ?? [];
  if (locals.length === 0) return [];
  const localSet = new Set(locals.map((n) => n.id));
  let minX = Infinity,
    maxX = -Infinity;
  for (const n of locals) {
    const p = positions?.get(n.id) ?? n.pos[sheetId];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + dimensions(n,sheetId,sizes).w);
  }
  const groups = new Map<string, Stub>();
  for (const e of idx.boundaryBySheet.get(sheetId) ?? []) {
    const fL = localSet.has(e.from);
    const tL = localSet.has(e.to);
    if (fL === tL) continue;
    const localId = fL ? e.from : e.to;
    const otherId = fL ? e.to : e.from;
    const other = idx.nodeById.get(otherId);
    if (!other || other.sheets.some((sid) => sid !== sheetId && visibleSheets.includes(sid))) continue;
    const side: "left" | "right" = fL ? "right" : "left";
    const key = otherId + ":" + side;
    let st = groups.get(key);
    if (!st) {
      st = { key, node: other, side, x: 0, y: 0, edges: [], locals: [] };
      groups.set(key, st);
    }
    st.edges.push(e);
    st.locals.push(localId);
  }
  const res = Array.from(groups.values());
  for (const st of res) {
    let sy = 0;
    for (const lid of st.locals) {
      const ln = idx.nodeById.get(lid)!;
      sy += (positions?.get(lid) ?? ln.pos[sheetId]).y + dimensions(ln,sheetId,sizes).h / 2;
    }
    st.y = sy / st.locals.length - STUB_H / 2;
    st.x = st.side === "right" ? maxX + 90 : minX - 90 - CARD_W;
  }
  for (const side of ["left", "right"] as const) {
    const col = res.filter((s) => s.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) {
      const prev = col[i - 1];
      if (col[i].y < prev.y + STUB_H + 10) col[i].y = prev.y + STUB_H + 10;
    }
  }
  return res;
}

// ---------- свободное место на листе ----------

export function freeSpot(idx: Index, sheetId: string, sizes: Sizes): Pos {
  const locals = idx.bySheet.get(sheetId) ?? [];
  if (locals.length === 0) return { x: 80, y: 80 };
  const occupied = locals.map((n) => ({ x: n.pos[sheetId].x, y: n.pos[sheetId].y, ...dimensions(n,sheetId,sizes) }));
  let maxY = -Infinity;
  let minX = Infinity;
  for (const r of occupied) {
    maxY = Math.max(maxY, r.y + r.h);
    minX = Math.min(minX, r.x);
  }
  // сетка снизу вверх, слева направо; первая свободная ячейка
  const step = 240;
  const rowH = 120;
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 8; col++) {
      const x = minX + col * step;
      const y = maxY + 40 + row * rowH;
      const hit = occupied.some((r) => x < r.x + r.w + 20 && x + CARD_W + 20 > r.x && y < r.y + r.h + 20 && y + 80 > r.y);
      if (!hit) return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return { x: minX, y: maxY + 60 };
}

/** Регулярная раскладка листа (для генерации демо и автораскладки). */
export function gridLayout(n: number, i: number, seed: string): Pos {
  const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.5)));
  const col = i % cols;
  const row = Math.floor(i / cols);
  const j = hash01(seed);
  return { x: Math.round(col * 270 + j * 30), y: Math.round(row * 150 + (col % 2) * 28 + j * 20) };
}

// ---------- силовая раскладка «одной плоскости» ----------

export function forceLayout(g: Graph): Map<string, Pos> {
  if (g.nodes.length > 300) return new Map([...g.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((n, i) => [n.id, gridLayout(g.nodes.length, i, n.id)]));
  const W = 2400,
    H = 1400;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const ids = g.nodes.map((n) => n.id);
  const idxOf = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const px = new Float64Array(n),
    py = new Float64Array(n),
    vx = new Float64Array(n),
    vy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = rnd() * W;
    py[i] = rnd() * H;
  }
  const links = g.edges
    .map((e) => [idxOf.get(e.from), idxOf.get(e.to)] as [number | undefined, number | undefined])
    .filter((l): l is [number, number] => l[0] !== undefined && l[1] !== undefined);
  const iters = 220;
  for (let it = 0; it < iters; it++) {
    const maxStep = 40 * (1 - it / iters) + 2;
    vx.fill(0);
    vy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = rnd() - 0.5;
          dy = rnd() - 0.5;
          d2 = 1;
        }
        const f = 26000 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f,
          fy = (dy / d) * f;
        vx[i] += fx;
        vy[i] += fy;
        vx[j] -= fx;
        vy[j] -= fy;
      }
    }
    for (const [a, b] of links) {
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 220) * 0.02;
      const fx = (dx / d) * f,
        fy = (dy / d) * f;
      vx[a] += fx;
      vy[a] += fy;
      vx[b] -= fx;
      vy[b] -= fy;
    }
    for (let i = 0; i < n; i++) {
      vx[i] += (W / 2 - px[i]) * 0.004;
      vy[i] += (H / 2 - py[i]) * 0.004;
      const l = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      const s = l > maxStep ? maxStep / l : 1;
      px[i] += vx[i] * s;
      py[i] += vy[i] * s;
    }
  }
  const out = new Map<string, Pos>();
  ids.forEach((id, i) => out.set(id, { x: Math.round(px[i]), y: Math.round(py[i]) }));
  return out;
}

// ---------- lint ----------

export type Level = "error" | "warn" | "info";
export interface LintItem {
  level: Level;
  code: string;
  text: string;
  nodeId?: string;
  sheetId?: string;
}

/** Upper median: on one or two values it returns the largest, so a relative
 *  threshold built on it never fires in a project too small to compare. */
function upperMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function lint(g: Graph, idx: Index): LintItem[] {
  const out: LintItem[] = [];
  for (const e of g.edges) {
    if (!idx.nodeById.has(e.from) || !idx.nodeById.has(e.to))
      out.push({ level: "error", code: "dangling-edge", text: `Ребро ${e.id} ссылается на отсутствующий узел` });
  }
  // Sheet size is not a defect: the boundary is a meaning, not a number (0.7.1).
  // What is worth saying out loud is that one sheet stands out against the rest of this project.
  const crowdedAt = Math.max(40, upperMedian(g.sheets.map((s) => (idx.bySheet.get(s.id) ?? []).length)) * 3);
  for (const s of g.sheets) {
    const list = idx.bySheet.get(s.id) ?? [];
    if (list.length >= crowdedAt)
      out.push({ level: "info", code: "sheet-crowded", text: `Лист «${s.name}»: ${list.length} узлов — заметно больше остальных; читать помогут фильтр и поиск`, sheetId: s.id });
    if (list.length === 0) out.push({ level: "info", code: "sheet-empty", text: `Лист «${s.name}» пуст`, sheetId: s.id });
    else {
      const hasCross = !!idx.boundaryBySheet.get(s.id)?.length;
      const hasMulti = list.some((n) => n.sheets.length > 1);
      if (!hasCross && !hasMulti)
        out.push({ level: "warn", code: "sheet-island", text: `Лист «${s.name}» ни с чем не связан`, sheetId: s.id });
    }
  }
  // Both thresholds below are relative to this project: a hub in a sparse map is
  // ordinary in a dense one, and a node on five sheets is ordinary in fifty.
  const hubAt = Math.max(8, upperMedian(g.nodes.map((n) => idx.degree.get(n.id) ?? 0)) * 3);
  const spreadAt = Math.max(5, Math.ceil(g.sheets.length / 2));
  for (const n of g.nodes) {
    const deg = idx.degree.get(n.id) ?? 0;
    if (deg === 0) out.push({ level: "warn", code: "orphan", text: `«${n.name}» ни с чем не связан`, nodeId: n.id });
    if (deg >= hubAt) out.push({ level: "info", code: "hub", text: `«${n.name}» — хаб: ${deg} связей`, nodeId: n.id });
    if (!n.body.trim()) out.push({ level: "info", code: "empty-body", text: `«${n.name}» без тела`, nodeId: n.id });
    if (n.name.length > 44) out.push({ level: "info", code: "long-name", text: `«${n.name.slice(0, 30)}…» — слишком длинное имя`, nodeId: n.id });

    // --- мультичленство ---
    const edges = idx.adj.get(n.id) ?? [];
    const neighbors = [...new Set(edges.map((e) => e.from === n.id ? e.to : e.from))].map((id) => idx.nodeById.get(id)).filter((x): x is GNode => !!x);
    const neighborSheets = new Set(neighbors.flatMap(m => m.sheets));
    for (const s of n.sheets) {
      if (deg > 0 && !neighborSheets.has(s)) {
        const sh = idx.sheetById.get(s);
        out.push({
          level: "warn",
          code: "orphan-membership",
          text: `«${n.name}» числится на листе «${sh?.name ?? s}», но ни с чем там не связан`,
          nodeId: n.id,
          sheetId: s,
        });
      }
    }
    if (n.sheets.length === 1) {
      const counts = new Map<string, number>();
      for (const m of neighbors) {
        const s0 = m.sheets[0];
        if (s0 !== n.sheets[0] && !m.sheets.includes(n.sheets[0])) counts.set(s0, (counts.get(s0) ?? 0) + 1);
      }
      for (const [s, c] of counts) {
        if (c >= 4) {
          const sh = idx.sheetById.get(s);
          out.push({
            level: "warn",
            code: "membership-candidate",
            text: `«${n.name}»: ${c} соседей на листе «${sh?.name ?? s}» — вероятно, ему туда же`,
            nodeId: n.id,
            sheetId: s,
          });
        }
      }
    }
    if (n.sheets.length >= spreadAt)
      out.push({
        level: "info",
        code: "over-membership",
        text: `«${n.name}» стоит на ${n.sheets.length} листах из ${g.sheets.length} — возможно, это тема, а не узел`,
        nodeId: n.id,
      });
  }
  for (const e of g.edges) {
    if (e.kind === "contradicts") {
      const f = idx.nodeById.get(e.from),
        t = idx.nodeById.get(e.to);
      out.push({ level: "info", code: "contradiction", text: `Противоречие: «${f?.name}» ↔ «${t?.name}»`, nodeId: e.from });
    }
  }
  const order: Record<Level, number> = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function lintReport(g: Graph, items: LintItem[]) {
  const sym: Record<Level, string> = { error: "✖", warn: "▲", info: "·" };
  const lines = [`PlyLoom «${g.title}»: ${g.nodes.length} узлов, ${g.edges.length} рёбер, ${g.sheets.length} листов`, ""];
  for (const it of items) lines.push(`${sym[it.level]} [${it.code}] ${it.text}`);
  const c = (l: Level) => items.filter((i) => i.level === l).length;
  lines.push("", `Ошибок: ${c("error")}, предупреждений: ${c("warn")}, заметок: ${c("info")}`);
  return lines.join("\n");
}
