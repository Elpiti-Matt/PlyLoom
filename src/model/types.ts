import type { NodeFilter } from "../lib/nodeFilter";
import type { SavedView } from "../lib/savedViews";
export type BuiltinNodeKind =
  | "entity"
  | "process"
  | "decision"
  | "hypothesis"
  | "metric"
  | "rule"
  | "risk"
  | "person"
  | "note";

export type NodeKind = BuiltinNodeKind | (string & {});
export type EdgeKind = "flow" | "depends" | "supports" | "contradicts" | "ref" | (string & {});

export interface TypeDefinition { id: string; label: string; labelEn?: string; description?: string; color: string }
/** Notation IDs written since 0.7.0-rc.7. Files written earlier carry "plyra"; loadGraph maps it. */
export type NotationId = "plyloom" | "flowchart" | "canvas" | "bpmn" | "drawio";
export type NodeShape = "rectangle" | "rounded" | "ellipse" | "diamond" | "parallelogram" | "cylinder" | "document" | "text" | "group";
export interface NodeTypeDefinition extends TypeDefinition { base: BuiltinNodeKind; glyph?: string; notation?: NotationId; shape?: NodeShape }
/** Legacy style fields are accepted on input; line rendering belongs to the view. */
export interface EdgeTypeDefinition extends TypeDefinition { directed?: boolean; dash?: string }
export interface SheetTypeDefinition extends TypeDefinition {}
export type AttributeDataType = "text" | "number" | "boolean" | "date" | "url" | "select" | "multi";
export interface AttributeDefinition { id:string; label:string; labelEn?:string; description?:string; dataType:AttributeDataType; options?:string[] }
/** "multi" stores a list of chosen options; an empty list means "attached but not set". */
export type AttributeValue = string | number | boolean | string[] | null;
export interface TypeRegistry { nodes: NodeTypeDefinition[]; edges: EdgeTypeDefinition[]; sheets: SheetTypeDefinition[]; tags:TypeDefinition[]; attributes:AttributeDefinition[] }
export interface NodeAppearance { width:number; height:number; shape:NodeShape; fill:string; stroke:string; fontColor:string; fontSize?:number; strokeWidth?:number; rotation?:number; bold?:boolean; align?:"left"|"center"|"right"; marker?:"start"|"end"|"intermediate"|"exclusive"|"parallel"|"inclusive"; sourceType?:string }
export interface EdgeRoute { points:Pos[]; from:{x:number;y:number;width:number;height:number}; to:{x:number;y:number;width:number;height:number} }

export interface Sheet {
  id: string;
  name: string;
  notation: string;
  /** Classification is independent from the notation of the diagram. */
  typeId?: string;
  tags?: string[];
  color: string;
  /** Legacy: read, clamped and written back so old files round-trip. A sheet boundary
   *  is a meaning, not a count, so since 0.7.1 no view, check or export consults it. */
  limit?: number;
  description?: string;
  /** Keep the authored/optimized positions in spreads; otherwise reflow to fit. */
  layout?: "manual";
  /** Position of the whole sheet on the overview; independent of node positions. */
  overviewPos?: Pos;
  /** Node query evaluated over the ordinary sheets; memberships are a portable snapshot. */
  smartFilter?: NodeFilter;
}

export interface Pos {
  x: number;
  y: number;
}

/** Узел второй версии: стоит на одном или нескольких листах, координаты свои на каждом. */
export interface GNode {
  id: string;
  sheets: string[]; // [0] — основной лист
  pos: Record<string, Pos>;
  name: string;
  kind: NodeKind;
  body: string;
  tags?: string[];
  attributes?: Record<string, AttributeValue>;
  /** Geometry and shapes belong to an appearance, never to the shared entity. */
  appearance?: Record<string, NodeAppearance>;
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
  directed?: boolean;
  sourceType?: string;
  routes?: Record<string, EdgeRoute>;
}

export interface Graph {
  version: 2 | 3;
  title: string;
  description?: string;
  sheets: Sheet[];
  nodes: GNode[];
  edges: GEdge[];
  /** Independent positions for the All-to-1 canvas; native JSON round-trips. */
  flatPositions?: Record<string, Pos>;
  types?: TypeRegistry;
  savedViews?: SavedView[];
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export type Mode = "sheet" | "board" | "spread" | "stack" | "contents" | "flat" | "generate" | "faq";

export const KINDS: { id: NodeKind; label: string; glyph: string }[] = [
  { id: "entity", label: "Сущность", glyph: "▭" },
  { id: "process", label: "Процесс", glyph: "⟶" },
  { id: "decision", label: "Решение", glyph: "◇" },
  { id: "hypothesis", label: "Гипотеза", glyph: "?" },
  { id: "metric", label: "Метрика", glyph: "#" },
  { id: "rule", label: "Требование", glyph: "§" },
  { id: "risk", label: "Риск", glyph: "!" },
  { id: "person", label: "Человек / роль", glyph: "☺" },
  { id: "note", label: "Заметка", glyph: "✎" },
];

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<
  NodeKind,
  (typeof KINDS)[number]
>;

export const EDGE_KINDS: {
  id: EdgeKind;
  label: string;
  color: string;
  dash?: string;
}[] = [
  { id: "flow", label: "затем", color: "#475569" },
  { id: "depends", label: "зависит от", color: "#475569", dash: "6 4" },
  { id: "supports", label: "подтверждает", color: "#059669" },
  { id: "contradicts", label: "противоречит", color: "#dc2626", dash: "2 4" },
  { id: "ref", label: "см.", color: "#94a3b8", dash: "1 5" },
];

export const EDGE_BY_ID = Object.fromEntries(EDGE_KINDS.map((k) => [k.id, k])) as Record<
  EdgeKind,
  (typeof EDGE_KINDS)[number]
>;

export const CARD_W = 208;
export const CARD_H_DEFAULT = 64;
export const STUB_H = 88;

export const PALETTE = [
  "#0ea5e9",
  "#84cc16",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#f43f5e",
  "#eab308",
];
