import { SpatialGrid, intersects, boundsOfPoints } from "../lib/spatial";
import { useSceneViewport } from "./useSceneViewport";
import { useTypes } from "../lib/TypeContext";
import { useI18n } from "../lib/i18n";
import { LINE_STYLE } from "../lib/lineStyles";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CARD_W, STUB_H, type GEdge, type GNode, type NodeAppearance, type NodeTypeDefinition, type View, type Sheet } from "../model/types";
import { dimensions, routedPath, appearanceForType } from "../lib/appearance";
import { clamp, edgePath, type Sizes, type Stub } from "../lib/graph";
import { NodeCard } from "./NodeCard";
import { mutedAttr } from "../lib/nodeFilter";

export interface Placed {
  node: GNode;
  x: number;
  y: number;
}

interface Props {
  id: string;
  placed: Placed[];
  edges: GEdge[];
  stubs: Stub[];
  view: View;
  setView: (v: View) => void;
  sizes: Sizes;
  observe: (el: HTMLElement | null, id: string) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onCreate?: (x: number, y: number) => void;
  onStubClick?: (stub: Stub) => void;
  linking: boolean;
  hybrid: boolean;
  showBody: boolean;
  onManageAttributes?:()=>void;
  colorOf: (n: GNode) => string;
  sheetName: (id: string) => string;
  extraOf?: (n: GNode) => number;
  fitTick: number;
  header?: ReactNode;
  readOnly?: boolean;
  sheet?: Sheet;
  className?: string;
  layoutKey?: string;
  maxFitScale?: number;
  expanded?:Set<string>;
  onToggleBody?:(id:string)=>void;
  onEditNode?:(id:string,patch:Partial<GNode>)=>void;
  /** Dim mode only: objects outside these sets are drawn faded. In hide mode the arrays are already filtered. */
  muted?:{nodes:Set<string>|null;edges:Set<string>|null};
}

/** Continuous gestures move the camera directly in the DOM; React state receives the result after a short pause. */
export const CAMERA_COMMIT_MS = 160;

export function SheetCanvas(p: Props) {
  const {t,name:displayName}=useI18n();
  const {nodeType,edgeType,label}=useTypes();

  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(p);
  latest.current = p;

  // ---- камера ----
  // The canvas owns the camera while a pan, pinch or wheel gesture is running.
  // Rendering every intermediate camera through React re-rendered the whole tool
  // and every card on each frame. A new view from the parent (fit, zoom buttons,
  // mode switch) always wins over the local one.
  const viewRef = useRef(p.view);
  const propView = useRef(p.view);
  if (p.view !== propView.current) { propView.current = p.view; viewRef.current = p.view; }
  const setView = p.setView;
  const pathCache=useRef(new WeakMap<object,Path2D>());
  const denseCanvas = useRef<HTMLCanvasElement>(null), drawDense = useRef<()=>void>(()=>{});
  const viewport = useSceneViewport(ref, viewRef.current, p.placed.length>200, drawDense);
  const onCamera = viewport.onCamera;
  const commitTimer = useRef(0);
  const commitView = useCallback(() => {
    if (!commitTimer.current) return;
    window.clearTimeout(commitTimer.current);
    commitTimer.current = 0;
    if (viewRef.current !== propView.current) latest.current.setView(viewRef.current);
  }, []);
  const applyView = useCallback((v: View) => {
    viewRef.current = v; onCamera(v);
    const root = ref.current;
    if (root) { root.dataset.viewX = String(v.x); root.dataset.viewY = String(v.y); root.dataset.viewK = String(v.k); }
    sceneRef.current?.setAttribute("transform", `translate(${v.x} ${v.y}) scale(${v.k})`);
    if (layerRef.current) layerRef.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(commitView, CAMERA_COMMIT_MS);
  }, [commitView,onCamera]);
  // Unmounting (sheet or mode switch) must not lose an uncommitted camera.
  useEffect(() => () => commitView(), [commitView]);

  // ---- вписать ----
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cw = el.clientWidth,
      ch = el.clientHeight;
    if (cw < 40 || ch < 40) return;
    const rects = [
      ...p.placed.map((q) => ({ x: q.x, y: q.y, ...dimensions(q.node,p.id,p.sizes) })),
      ...p.stubs.map((s) => ({ x: s.x, y: s.y, w: CARD_W, h: STUB_H })),
    ];
    window.clearTimeout(commitTimer.current);
    commitTimer.current = 0;
    if (rects.length === 0) {
      setView({ x: 40, y: 40, k: 1 });
      return;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const r of rects) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    const w = x1 - x0 + 80,
      h = y1 - y0 + 80;
    let k = Math.min(cw / w, ch / h, p.maxFitScale ?? 1.1);
    if (!Number.isFinite(k) || k <= 0) k = 1;
    k = Math.max(0.15, k);
    setView({ x: (cw - (x1 - x0) * k) / 2 - x0 * k, y: (ch - (y1 - y0) * k) / 2 - y0 * k, k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.placed, p.stubs, p.sizes, setView]);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  useLayoutEffect(() => {
    fitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitTick, p.id, p.layoutKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (Math.abs(w - last.w) > 8 || Math.abs(h - last.h) > 8) {
        last = { w, h };
        fitRef.current();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- панорама / зум / пинч ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pan" | "pinch"; sx: number; sy: number; ox: number; oy: number; d0?: number; k0?: number; moved: boolean } | null>(null);

  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const v = viewRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { kind: "pinch", sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, ox: v.x, oy: v.y, d0: Math.hypot(a.x - b.x, a.y - b.y), k0: v.k, moved: true };
    } else {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false };
    }
  };
  const onBgMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = clamp((g.k0 ?? 1) * (d / (g.d0 || 1)), 0.15, 2.5);
      const rect = ref.current!.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left,
        cy = (a.y + b.y) / 2 - rect.top;
      const wx = (g.sx - rect.left - g.ox) / (g.k0 ?? 1),
        wy = (g.sy - rect.top - g.oy) / (g.k0 ?? 1);
      applyView({ x: cx - wx * k, y: cy - wy * k, k });
      return;
    }
    const dx = e.clientX - g.sx,
      dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    applyView({ ...viewRef.current, x: g.ox + dx, y: g.oy + dy });
  };
  const onBgUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if(g&&!g.moved&&e.type!=="pointercancel"){if(denseCanvas.current&&(e.target===e.currentTarget||e.target===denseCanvas.current))densePick(e);else if(e.target===e.currentTarget)p.onSelect(null);}
    const remaining = [...pointers.current.values()][0];
    gesture.current = remaining ? { kind: "pan", sx: remaining.x, sy: remaining.y, ox: viewRef.current.x, oy: viewRef.current.y, moved: true } : null;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left,
          my = e.clientY - rect.top;
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0022), 0.15, 2.5);
        applyView({ x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k, k });
      } else {
        applyView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyView]);

  // ---- перетаскивание узла ----
  // The dragged card is previewed locally; the graph (history, autosave, indexes,
  // project check) changes once, on release. Cancel leaves the graph untouched.
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const onCardDown = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    const p = latest.current;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    if (p.linking) {
      p.onSelect(id);
      return;
    }
    const q = p.placed.find((item) => item.node.id === id);
    if (!q) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: q.x, oy: q.y, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.sx,
        dy = ev.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      if (latest.current.readOnly || !latest.current.onMove) return;
      const k = viewRef.current.k;
      const next = { id: d.id, x: Math.round(d.ox + dx / k), y: Math.round(d.oy + dy / k) };
      previewRef.current = next;
      setPreview(next);
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      const p = latest.current;
      const final = previewRef.current;
      if (ev.type !== "pointercancel" && d && !d.moved) p.onSelect(p.selected === d.id ? null : d.id);
      if (ev.type !== "pointercancel" && d?.moved && final?.id === d.id && !p.readOnly) p.onMove?.(final.id, final.x, final.y);
      previewRef.current = null;
      setPreview(null);
      drag.current = null;
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const cardDown = useRef(onCardDown);
  cardDown.current = onCardDown;

  // ---- стабильные свойства карточек ----
  // NodeCard is memoized; it only skips work when every prop keeps its identity.
  type CardHandlers = { activate: () => void; down: (e: React.PointerEvent<HTMLDivElement>) => void; measure: (el: HTMLDivElement | null) => void; toggle: () => void; edit: (patch: Partial<GNode>) => void };
  const handlers = useRef(new Map<string, CardHandlers>());
  const handlersFor = (id: string) => {
    let h = handlers.current.get(id);
    if (!h) {
      const key = JSON.stringify([p.id, id]);
      h = {
        activate: () => latest.current.onSelect(id),
        down: (e) => cardDown.current(id, e),
        measure: (el) => latest.current.observe(el, key),
        toggle: () => latest.current.onToggleBody?.(id),
        edit: (patch) => latest.current.onEditNode?.(id, patch),
      };
      handlers.current.set(id, h);
    }
    return h;
  };
  const styles = useRef(new Map<string, CSSProperties>());
  const styleFor = (id: string, x: number, y: number, zIndex: number) => {
    const old = styles.current.get(id);
    if (old && old.left === x && old.top === y && old.zIndex === zIndex) return old;
    const next = { left: x, top: y, zIndex };
    styles.current.set(id, next);
    return next;
  };
  const typeAppearances = useRef(new WeakMap<NodeTypeDefinition, NodeAppearance>());
  const typeAppearance = (def: NodeTypeDefinition) => {
    if (!def.shape) return undefined;
    let a = typeAppearances.current.get(def);
    if (!a) { a = { ...appearanceForType(def)!, width: 208, height: 64 }; typeAppearances.current.set(def, a); }
    return a;
  };
  const manageAttributes = useCallback(() => latest.current.onManageAttributes?.(), []);

  const onDbl = (e: React.MouseEvent) => {
    if (!p.onCreate || p.readOnly || e.target !== e.currentTarget && e.target !== denseCanvas.current) return;
    const rect = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    p.onCreate(Math.round((e.clientX - rect.left - v.x) / v.k - CARD_W / 2), Math.round((e.clientY - rect.top - v.y) / v.k - 20));
  };

  // ---- геометрия для рёбер ----
  const placed = useMemo(()=>preview ? p.placed.map(q=>q.node.id===preview.id?{...q,x:preview.x,y:preview.y}:q) : p.placed,[p.placed,preview]);
  const geometry = useMemo(()=>{
    const boxes=placed.map(q=>({id:q.node.id,x:q.x,y:q.y,...dimensions(q.node,p.id,p.sizes)}));
    return {nodeOf:new Map(placed.map(q=>[q.node.id,q.node])),rectOf:new Map(boxes.map(b=>[b.id,b])),grid:new SpatialGrid(boxes.map((b,i)=>{const angle=(placed[i].node.appearance?.[p.id]?.rotation??0)*Math.PI/180;const w=Math.abs(b.w*Math.cos(angle))+Math.abs(b.h*Math.sin(angle)),h=Math.abs(b.w*Math.sin(angle))+Math.abs(b.h*Math.cos(angle));return {...b,x:b.x+(b.w-w)/2,y:b.y+(b.h-h)/2,w,h};}))};
  },[placed,p.id,p.sizes]);
  const {nodeOf,rectOf}=geometry;
  const stubRect = useMemo(()=>new Map(p.stubs.map(s=>[s.key,{x:s.x,y:s.y,w:CARD_W,h:STUB_H}])),[p.stubs]);
  const paths = useMemo(()=>p.edges.flatMap(e=>{
    const a=rectOf.get(e.from),b=rectOf.get(e.to);if(!a||!b)return [];
    const path=routedPath(e,p.id,a,b)??edgePath(a,b),points=path.points;
    let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
    for(const point of points){x=Math.min(x,point.x);y=Math.min(y,point.y);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);}
    return [{e,path,x,y,w:right-x,h:bottom-y}];
  }),[p.edges,p.id,rectOf]);
  const edgeGrid=useMemo(()=>new SpatialGrid(paths),[paths]);
  const visibleIndexes=viewport.bounds?geometry.grid.query(viewport.bounds):placed.map((_,i)=>i);
  const visiblePlaced=visibleIndexes.map(i=>placed[i]);
  // Retain a focused/edited/dragged card even while it crosses the overscan boundary.
  for(const q of placed)if((q.node.id===p.selected||q.node.id===preview?.id||p.expanded?.has(q.node.id))&&!visiblePlaced.includes(q))visiblePlaced.push(q);
  const visiblePaths=viewport.bounds?edgeGrid.query(viewport.bounds).map(i=>paths[i]):paths;
  const visibleStubs=viewport.bounds?p.stubs.filter(s=>intersects(stubRect.get(s.key)!,viewport.bounds!)):p.stubs;
  const dense=!!viewport.bounds&&p.placed.length>500&&viewRef.current.k<.35&&!p.linking&&!p.expanded?.size;
  useLayoutEffect(()=>{
    const id=p.selected,q=id?rectOf.get(id):undefined,el=ref.current;
    if(!q||!el?.clientWidth||p.placed.length<=200)return;
    const v=viewRef.current,screen={x:-v.x/v.k,y:-v.y/v.k,w:el.clientWidth/v.k,h:el.clientHeight/v.k};
    if(v.k<.45||!intersects(q,screen)){const k=Math.max(.7,v.k);latest.current.setView({x:el.clientWidth/2-(q.x+q.w/2)*k,y:el.clientHeight/2-(q.y+q.h/2)*k,k});}
  },[p.selected,p.id]);
  drawDense.current=()=>{
    const canvas=denseCanvas.current,el=ref.current;if(!canvas||!el)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    const ratio=Math.min(window.devicePixelRatio||1,2),w=el.clientWidth,h=el.clientHeight;
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
    const v=viewRef.current,visible={x:-v.x/v.k,y:-v.y/v.k,w:w/v.k,h:h/v.k};
    ctx.translate(v.x,v.y);ctx.scale(v.k,v.k);ctx.lineWidth=1/v.k;
    for(const i of edgeGrid.query(visible)){
      const item=paths[i],muted=latest.current.muted?.edges;
      ctx.globalAlpha=muted&&!muted.has(item.e.id)?.12:.55;ctx.strokeStyle=LINE_STYLE.local.color;ctx.setLineDash([]);
      let path=pathCache.current.get(item);if(!path){path=new Path2D(item.path.d);pathCache.current.set(item,path);}
      ctx.stroke(path);
    }
    for(const i of geometry.grid.query(visible)){
      const q=placed[i],b=rectOf.get(q.node.id)!,a=q.node.appearance?.[p.id],muted=latest.current.muted?.nodes;
      ctx.globalAlpha=muted&&!muted.has(q.node.id)?.16:1;
      ctx.fillStyle=a?.fill??"#fff";ctx.strokeStyle=q.node.id===p.selected?"#6c45a0":a?.stroke??p.colorOf(q.node);
      ctx.beginPath();
      if(a?.shape==="ellipse")ctx.ellipse(b.x+b.w/2,b.y+b.h/2,b.w/2,b.h/2,0,0,Math.PI*2);
      else if(a?.shape==="diamond"){ctx.moveTo(b.x+b.w/2,b.y);ctx.lineTo(b.x+b.w,b.y+b.h/2);ctx.lineTo(b.x+b.w/2,b.y+b.h);ctx.lineTo(b.x,b.y+b.h/2);ctx.closePath();}
      else ctx.rect(b.x,b.y,b.w,b.h);
      ctx.fill();ctx.stroke();
      ctx.fillStyle=p.colorOf(q.node);ctx.fillRect(b.x+5,b.y+5,Math.max(4,b.w-10),Math.min(7,b.h/4));
    }
    ctx.globalAlpha=1;
  };
  useLayoutEffect(()=>{drawDense.current();});
  const densePick=(e:React.PointerEvent)=>{
    const el=ref.current;if(!el)return;const r=el.getBoundingClientRect(),v=viewRef.current;
    const hit=geometry.grid.query({x:(e.clientX-r.left-v.x)/v.k,y:(e.clientY-r.top-v.y)/v.k,w:0,h:0}).at(-1);
    if(hit===undefined){p.onSelect(null);return;}
    p.onSelect(placed[hit].node.id);
  };

  const sel = p.selected;
  const view = viewRef.current;
  let localLeft = placed.length ? Infinity : 0, localRight = placed.length ? -Infinity : CARD_W, borderTop = 0, borderBottom = 0;
  for (const r of rectOf.values()) {
    localLeft = Math.min(localLeft, r.x); localRight = Math.max(localRight, r.x + r.w);
    borderTop = Math.min(borderTop, r.y); borderBottom = Math.max(borderBottom, r.y + r.h);
  }
  for (const s of p.stubs) { borderTop = Math.min(borderTop, s.y); borderBottom = Math.max(borderBottom, s.y + STUB_H); }
  borderTop -= 68;
  borderBottom += 40;
  const sides = (["left","right"] as const).filter((side) => p.stubs.some((s) => s.side===side));

  const mutedNode = (id: string) => mutedAttr(p.muted?.nodes, id, !!p.muted) !== undefined;
  const edgeEl = (e: GEdge, a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, ghost = false, faded = false) => {
    const ek = edgeType(e.kind);
    const { d, mid } = (!ghost?routedPath(e,p.id,a,b):undefined)??edgePath(a, b);
    const hi = sel && (e.from === sel || e.to === sel);
    const fromN = nodeOf.get(e.from);
    const toN = nodeOf.get(e.to);
    if(p.id==="__flat"&&fromN&&toN)ghost=!fromN.sheets.some(sid=>toN.sheets.includes(sid));
    const op = hi ? 1 : sel ? 0.22 : ghost ? 0.55 : 0.85;
    return (
      <g key={e.id} opacity={op} data-edge-id={e.id} data-line-kind={ghost?"external":"local"} data-filter-muted={faded||mutedAttr(p.muted?.edges,e.id,!!p.muted)!==undefined?"":undefined}>
        <path d={d} fill="none" stroke={ghost?LINE_STYLE.external.color:LINE_STYLE.local.color} strokeWidth={hi ? 1.7 : ghost?LINE_STYLE.external.width:LINE_STYLE.local.width} strokeDasharray={ghost?LINE_STYLE.external.dash:undefined} markerEnd={e.directed!==false?`url(#arr-${p.id}-${ghost?"external":"local"})`:undefined} vectorEffect="non-scaling-stroke" />
        {(e.label||hi||e.sourceType) && (
          <text className="edge-label" x={mid.x} y={mid.y} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="#334155" paintOrder="stroke" stroke="#f8fafc" strokeWidth={3} style={{ fontWeight: 500 }}>
            {e.sourceType?.startsWith("bpmn:")?label(ek)+(e.label?" · "+t(e.label):""):e.label?t(e.label):label(ek)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div
      ref={ref}
      id={`canvas-${p.id}`}
      data-canvas-id={p.id}
      data-renderer={dense?"canvas":"dom"}
      data-visible-nodes={p.placed.length}
      data-dimmed-nodes={p.muted?.nodes?p.placed.filter(q=>!p.muted!.nodes!.has(q.node.id)).length:0}
      data-rendered-nodes={visiblePlaced.length}
      data-view-x={view.x}
      data-view-y={view.y}
      data-view-k={view.k}
      className={"relative h-full w-full overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:22px_22px] bg-slate-50 outline-none " + (p.className ?? "")}
      style={{ touchAction: "none" }}
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
      onPointerCancel={onBgUp}
      onPointerLeave={commitView}
      onDoubleClick={onDbl}
      tabIndex={-1}
    >
      {dense&&<canvas ref={denseCanvas} className="dense-scene" aria-label={t(`Упрощённая карта: ${p.placed.length} узлов. Нажмите узел, чтобы увеличить.`, `Simplified map: ${p.placed.length} nodes. Click a node to zoom in.`)}/> }
      <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
        <defs>
          {sides.map((side) => <linearGradient key={side} id={`outside-${p.id}-${side}`} x1={side==="right"?"0":"1"} y1="0" x2={side==="right"?"1":"0"} y2="0"><stop stopColor="#e5eaf4" stopOpacity=".9"/><stop offset="1" stopColor="#f8fafc" stopOpacity="0"/></linearGradient>)}
          {(["local","external"] as const).map((kind) => (
            <marker key={kind} id={`arr-${p.id}-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={LINE_STYLE[kind].color} />
            </marker>
          ))}
        </defs>
        <g ref={sceneRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {sides.map((side) => {
            const boundary = side === "right" ? localRight+46 : localLeft-46;
            return <g key={side}>
              <rect x={side==="right"?boundary:boundary-320} y={borderTop} width="320" height={borderBottom-borderTop} fill={`url(#outside-${p.id}-${side})`}/>
              <line x1={boundary} x2={boundary} y1={borderTop} y2={borderBottom} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="7 7"/>
              <text x={side==="right"?boundary+16:boundary-16} y={borderTop+23} textAnchor={side==="right"?"start":"end"} fill="#64748b" fontSize="11" fontWeight="600" letterSpacing="1.3">{t("НА ДРУГОМ ЛИСТЕ")}</text>
            </g>;
          })}
          {!dense&&visiblePaths.map(({e})=>edgeEl(e,rectOf.get(e.from)!,rectOf.get(e.to)!))}
          {p.stubs.map((s) =>
            s.edges.map((e) => {
              const local = rectOf.get(s.side === "right" ? e.from : e.to);
              const sr = stubRect.get(s.key)!;
              if (!local) return null;
              if(viewport.bounds&&!intersects(boundsOfPoints(edgePath(local,sr).points),viewport.bounds))return null;
              const faded = mutedAttr(p.muted?.edges, e.id, !!p.muted) !== undefined || mutedNode(s.node.id);
              return s.side === "right" ? edgeEl({ ...e, id: e.id + s.key }, local, sr, true, faded) : edgeEl({ ...e, id: e.id + s.key }, sr, local, true, faded);
            }),
          )}
        </g>
      </svg>
      <div ref={layerRef} className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
        {visibleStubs.map((s) => <button key={s.key} data-external-node={s.node.id} className={`external-reference external-${s.side}${sel===s.node.id?" is-selected":""}`} aria-label={t(`${p.linking?"Связать с":"Перейти к"} ${displayName(s.node.name)}, на листе ${p.sheetName(s.node.sheets[0])}`,`${p.linking?"Connect to":"Go to"} ${displayName(s.node.name)} on ${p.sheetName(s.node.sheets[0])}`)} title={`${displayName(s.node.name)} · ${p.sheetName(s.node.sheets[0])}`} data-filter-muted={p.muted&&(mutedNode(s.node.id)||(p.muted.edges&&!s.edges.some(e=>p.muted!.edges!.has(e.id))))?"":undefined} style={{left:s.x,top:s.y,width:CARD_W,height:STUB_H}} onPointerDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();p.onStubClick?.(s);}}>
          <span className="external-destination"><i style={{background:p.colorOf(s.node)}}/>{p.sheetName(s.node.sheets[0])}<b>↗</b></span>
          <span className="external-name">{displayName(s.node.name)}</span>
          <span className="external-action">{s.edges.length}{t(" связ. · ")}{t(p.linking?"связать":"перейти на лист")}</span>
        </button>)}
        {(dense?visiblePlaced.filter(q=>q.node.id===sel):visiblePlaced).map((q) => { const h = handlersFor(q.node.id); return (
          <NodeCard
            key={q.node.id}
            node={q.node}
            color={p.colorOf(q.node)}
            hybrid={p.hybrid}
            showBody={p.showBody}
            simplified={p.placed.length>200&&view.k<.35&&!p.expanded?.has(q.node.id)}
            simplifiedHeight={rectOf.get(q.node.id)?.h}
            selected={sel === q.node.id}
            muted={mutedNode(q.node.id)}
            appearance={q.node.appearance?.[p.id]??typeAppearance(nodeType(q.node.kind))}
            onManageAttributes={p.onManageAttributes ? manageAttributes : undefined}
            onActivate={h.activate}
            linkTarget={p.linking && sel !== q.node.id}
            extraSheets={p.extraOf ? p.extraOf(q.node) : 0}
            style={styleFor(q.node.id, q.x, q.y, q.node.appearance?.[p.id]?.shape==="group"?0:1)}
            measureRef={h.measure}
            onPointerDown={h.down}
            expanded={!p.readOnly&&!!p.expanded?.has(q.node.id)}
            onToggle={!p.readOnly&&p.onToggleBody?h.toggle:undefined}
            onEdit={!p.readOnly&&p.onEditNode?h.edit:undefined}
          />
        ); })}
      </div>
      {dense&&<div className="dense-scene-hint" onPointerDown={e=>e.stopPropagation()}><span>{t("Упрощённый вид · нажмите узел или используйте поиск", "Simplified view · click a node or use search")}</span><button onClick={()=>{const el=ref.current!,v=viewRef.current,k=.8;setView({x:el.clientWidth/2-(el.clientWidth/2-v.x)/v.k*k,y:el.clientHeight/2-(el.clientHeight/2-v.y)/v.k*k,k});}}>{t("Увеличить", "Zoom in")}</button></div>}
      {p.header && <div className="canvas-caption pointer-events-none absolute left-3 top-3 z-10">{p.header}</div>}
      {!!p.stubs.length && <div className="sheet-boundary-legend" aria-hidden="true"><i/>{t("За пунктиром — ссылки на другие листы")}</div>}
    </div>
  );
}
