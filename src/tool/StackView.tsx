import { useTypes } from "../lib/TypeContext";
import { mutedAttr } from "../lib/nodeFilter";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GNode, Graph, View } from "../model/types";
import { clamp, hash01, type Index } from "../lib/graph";
import { useI18n } from "../lib/i18n";
import { sheetRoutes } from "../lib/spreadGraph";
import { LINE_STYLE } from "../lib/lineStyles";
import { groupStackSheets } from "../lib/stackLayout";
import { sheetTypeId } from "../lib/typeRegistry";
import { layoutSteps } from "../lib/optimizeLayout";
import { ConnectionLegend } from "./ConnectionLegend";

export interface StackState {
  ids: string[];
  presentation:"rows"|"graph";
  groupBy:string;
  positions?:Record<string,{x:number;y:number}>;
  focus: number;
  gap: number; // 45…180
  tilt: number; // 12…78
  labels: "all" | "none";
  nodes: "dot" | "tile";
  onlyCross: boolean;
  connections: boolean;
  spines: boolean;
  view: View;
}

export function initialStack(g: Graph): StackState {
  return {
    ids: g.sheets.map((s) => s.id),
    presentation:"graph",
    groupBy:"none",
    focus: 0,
    gap: 90,
    tilt: 38,
    labels: "all",
    nodes: "dot",
    onlyCross: false,
    connections: true,
    spines: true,
    view: { x: 0, y: 0, k: 0.8 },
  };
}

interface Props {
  graph: Graph;
  /** null = nothing hidden. Plate geometry uses every node; hidden ones are skipped at render. */
  visibleNodeIds?:Set<string>|null;
  visibleEdgeIds?:Set<string>|null;
  /** Dim mode: draw objects outside the sets faded instead of skipping them. */
  dimHidden?:boolean;
  idx: Index;
  stack: StackState;
  setStack: (f: (s: StackState) => StackState) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpenSheet:(sid:string)=>void;
  onInspect:(id:string)=>void;
}

const F = (tilt: number) => 0.13 + (tilt / 90) * 0.5;
const CROSS = LINE_STYLE.external.color,
  INTRA = LINE_STYLE.local.color,
  SPINE = LINE_STYLE.identity.color,
  INK = "#0F172A";
const TH = 9,
  LH = 19;

interface Plate {
  id: string;
  i: number;
  nodes: GNode[];
  total: number;
  cols: number;
  rows: number;
  hx: number;
  hy: number;
}

export function StackView({ graph, visibleNodeIds: mv, visibleEdgeIds: me, dimHidden, idx, stack, setStack, selected, onSelect, onOpenSheet, onInspect }: Props) {
  const {t,name:displayName}=useI18n();
  const visibleNodeIds=dimHidden?null:mv,visibleEdgeIds=dimHidden?null:me;
  const {registry,label}=useTypes();
  const edgeMap=useMemo(()=>new Map(graph.edges.map(e=>[e.id,e])),[graph.edges]);
  const [arranging,setArranging]=useState(false);
  const graphRef=useRef(graph);graphRef.current=graph;
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const wrap = useRef<HTMLDivElement>(null);
  const rootG = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ W: 800, H: 600 });
  const { ids, focus, gap, tilt, view } = stack;
  const f = F(tilt);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    setSize({ W: el.clientWidth, H: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- Layout retains every appearance, independent of filters. ----
  const layout = useMemo(() => {
    const plates: Plate[] = [];
    const pos = new Map<string, { x: number; y: number }>(); // nodeId|sheetId
    ids.forEach((sid, i) => {
      const all = (idx.bySheet.get(sid) ?? [])
        .slice()
        .sort((a, b) => (idx.degree.get(b.id) ?? 0) - (idx.degree.get(a.id) ?? 0) || a.name.localeCompare(b.name, "ru"));
      const nodes = all;
      const n = Math.max(1, nodes.length);
      const cols = stack.presentation==="rows"?1:Math.max(3, Math.ceil(Math.sqrt(n * 1.7)));
      const rows = Math.ceil(n / cols);
      nodes.forEach((nd, k) => {
        const col = k % cols,
          row = Math.floor(k / cols);
        const j = (hash01(nd.id + sid) - 0.5) * 16;
        pos.set(JSON.stringify([nd.id,sid]), stack.presentation==="rows"?{x:0,y:(row-(rows-1)/2)*30}:stack.positions?.[JSON.stringify([nd.id,sid])]??{x:(col-(cols-1)/2)*90+j,y:(row-(rows-1)/2)*72+j*.7});
      });
      const points=nodes.map(n=>pos.get(JSON.stringify([n.id,sid]))!);
      if(stack.presentation==="graph"&&stack.positions&&points.length){const cx=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,cy=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;nodes.forEach(n=>{const key=JSON.stringify([n.id,sid]),p=pos.get(key)!;pos.set(key,{x:p.x-cx,y:p.y-cy});});}
      const final=nodes.map(n=>pos.get(JSON.stringify([n.id,sid]))!);
      plates.push({ id:sid,i,nodes,total:all.length,cols,rows,hx:stack.presentation==="rows"?190:Math.max(150,...final.map(p=>Math.abs(p.x)+76)),hy:stack.presentation==="rows"?rows*15+45:Math.max(100,...final.map(p=>Math.abs(p.y)+60)) });
    });
    return { plates, pos };
  }, [ids, idx, stack.presentation, stack.positions]);

  const { plates, pos } = layout;
  const L = ids.length;

  // ---- геометрия стопки ----
  const geo = useMemo(() => {
    let natural = 200,
      planeW = 300,
      planeH = 200;
    for (const p of plates) {
      natural = Math.max(natural, stack.presentation==="rows"?p.hy*2+90:(p.hx+p.hy)*f*2+30);
      planeW = Math.max(planeW, stack.presentation==="rows"?p.hx*2:(p.hx+p.hy)*.87*2);
      planeH = Math.max(planeH, stack.presentation==="rows"?p.hy*2:(p.hx+p.hy)*f*2);
    }
    const step = natural * (stack.presentation==="rows"?Math.max(1,gap/100):gap/100);
    return { step, planeW, planeH, depth: (i: number) => (L - 1 - i) * step };
  }, [plates, f, gap, L,stack.presentation]);

  const proj = useCallback((x: number, y: number, depth: number): [number, number] => stack.presentation==="rows"?[x,y-depth]:[(x-y)*.87,(x+y)*f-depth], [f,stack.presentation]);
  const spos = useCallback(
    (nid: string, i: number): [number, number] | null => {
      const p = pos.get(JSON.stringify([nid,ids[i]]));
      return p ? proj(p.x, p.y, geo.depth(i)) : null;
    },
    [pos, ids, proj, geo],
  );

  // ---- камера ----
  const frame = useCallback(
    (keepZoom: boolean) => {
      setStack((s) => {
        const { W, H } = size;
        const needW = geo.planeW + (stack.presentation==="rows"?80:540);
        const needH = geo.step * Math.max(0,L-1) + geo.planeH + 110;
        const k = keepZoom ? s.view.k : clamp(Math.min((W - 60) / needW, (H - 70) / needH), 0.01, 1.15);
        const fi = clamp(s.focus, 0, Math.max(0, s.ids.length - 1));
        const focusY = keepZoom ? -geo.depth(fi) : -geo.step*Math.max(0,L-1)/2;
        return { ...s, view: { x: W / 2, y: H * 0.46 - focusY * k, k } };
      });
    },
    [geo, size, setStack, L,stack.presentation],
  );
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const idsKey = JSON.stringify(ids);
  const lastComposition=useRef(idsKey);
  useLayoutEffect(() => {
    frameRef.current(false);
  }, [idsKey, tilt, gap, size.W, size.H,stack.presentation,stack.positions]);
  const lastFocus=useRef(focus);
  useLayoutEffect(() => {
    if(lastComposition.current===idsKey&&lastFocus.current!==focus)frameRef.current(true);
    lastFocus.current=focus;
    lastComposition.current=idsKey;
  }, [focus,idsKey]);

  const fitAll = () => frameRef.current(false);

  // ---- производные ----
  const shownOn = useMemo(() => {
    const m = new Map<string, number[]>();
    plates.forEach((p) => p.nodes.forEach((n) => m.set(n.id, [...(m.get(n.id) ?? []), p.i])));
    return m;
  }, [plates]);
  const neighbors = useMemo(() => {
    if (!selected) return new Set<string>();
    const s = new Set<string>();
    for (const e of idx.adj.get(selected) ?? []) s.add(e.from === selected ? e.to : e.from);
    return s;
  }, [selected, idx]);

  const wires = useMemo(() => {
    const out: {key:string;id:string;label?:string;a:[number,number];b:[number,number];cross:boolean;from:string;to:string}[]=[];
    for(const e of graph.edges){
      const from=shownOn.get(e.from)??[],to=shownOn.get(e.to)??[];
      for(const i of from.filter((j)=>to.includes(j)))out.push({key:JSON.stringify([e.id,ids[i]]),id:e.id,label:e.label,a:spos(e.from,i)!,b:spos(e.to,i)!,cross:false,from:e.from,to:e.to});
    }
    const routes=sheetRoutes(graph,idx,ids);
    for(const r of routes){
      const a=spos(r.edge.from,ids.indexOf(r.fromSheet)),b=spos(r.edge.to,ids.indexOf(r.toSheet));
      if(a&&b)out.push({key:r.key,id:r.edge.id,label:r.edge.label,a,b,cross:true,from:r.edge.from,to:r.edge.to});
    }
    return {list:out,crossCount:new Set(routes.map((r)=>r.edge.id)).size};
  },[graph,idx,ids,shownOn,spos]);

  const multi = useMemo(() => Array.from(shownOn.entries()).filter(([, p]) => p.length > 1), [shownOn]);
  const unionCount = shownOn.size;
  const focusSheet = ids[focus];

  // Pan and pinch use the current camera and survive pointer cancellation.
  const viewRef=useRef(view);viewRef.current=view;
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const gest=useRef<{sx:number;sy:number;ox:number;oy:number;k:number;distance?:number;moved:boolean}|null>(null);
  const onDown=(e:React.PointerEvent)=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    e.currentTarget.setPointerCapture(e.pointerId);
    const v=viewRef.current,list=[...pointers.current.values()];
    if(list.length===2){const[a,b]=list;gest.current={sx:(a.x+b.x)/2,sy:(a.y+b.y)/2,ox:v.x,oy:v.y,k:v.k,distance:Math.hypot(a.x-b.x,a.y-b.y),moved:true};}
    else if(list.length===1)gest.current={sx:e.clientX,sy:e.clientY,ox:v.x,oy:v.y,k:v.k,moved:false};
  };
  const onMove=(e:React.PointerEvent)=>{
    if(!pointers.current.has(e.pointerId)||!gest.current)return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const g=gest.current,list=[...pointers.current.values()];
    if(list.length>=2&&g.distance!==undefined){
      const[a,b]=list,r=wrap.current!.getBoundingClientRect(),k=clamp(g.k*Math.hypot(a.x-b.x,a.y-b.y)/(g.distance||1),.01,3.2);
      const x=(a.x+b.x)/2-r.left-((g.sx-r.left-g.ox)/g.k)*k,y=(a.y+b.y)/2-r.top-((g.sy-r.top-g.oy)/g.k)*k;
      viewRef.current={x,y,k};setStack((s)=>({...s,view:{x,y,k}}));return;
    }
    const dx=e.clientX-g.sx,dy=e.clientY-g.sy;if(!g.moved&&Math.hypot(dx,dy)<4)return;
    g.moved=true;const next={x:g.ox+dx,y:g.oy+dy,k:viewRef.current.k};viewRef.current=next;setStack((s)=>({...s,view:next}));
  };
  const onUp=(e:React.PointerEvent)=>{
    if(!pointers.current.has(e.pointerId))return;
    pointers.current.delete(e.pointerId);
    if(gest.current&&!gest.current.moved&&e.type!=="pointercancel"&&e.target===e.currentTarget)onSelect(null);
    const q=[...pointers.current.values()][0],v=viewRef.current;
    gest.current=q?{sx:q.x,sy:q.y,ox:v.x,oy:v.y,k:v.k,moved:true}:null;
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left,
        my = e.clientY - rect.top;
      setStack((s) => {
        const k = clamp(s.view.k * Math.exp(-e.deltaY * 0.0018), 0.01, 3.2);
        return { ...s, view: { x: mx - ((mx - s.view.x) / s.view.k) * k, y: my - ((my - s.view.y) / s.view.k) * k, k } };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setStack]);

  const setFocus = (i: number) => setStack((s) => ({ ...s, focus: clamp(i, 0, Math.max(0, s.ids.length - 1)) }));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocus(focus - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocus(focus + 1);
    } else if (e.key === "Escape") onSelect(null);
  };
  const toggleLayer=(sid:string,checked:boolean)=>setStack((s)=>{
    const focused=s.ids[s.focus];
    const next=groupStackSheets(graph,graph.sheets.map((x)=>x.id).filter((id)=>id===sid?checked:s.ids.includes(id)),s.groupBy);
    return {...s,ids:next,focus:Math.max(0,next.indexOf(focused))};
  });
  const sheetOf = (id: string) => idx.sheetById.get(id)!;
  const pick = (e: React.SyntheticEvent, id: string) => {
    e.stopPropagation();
    onSelect(selected === id ? null : id);
  };

  const group=(groupBy:string)=>setStack(s=>{const focused=s.ids[s.focus],ids=groupStackSheets(graph,s.ids,groupBy);return {...s,ids,groupBy,focus:Math.max(0,ids.indexOf(focused))};});
  const arrange=async()=>{
    if(arranging)return;setArranging(true);const source=graph;
    try{
      const positions:Record<string,{x:number;y:number}>={};
      for(const plate of plates){
        const nodes=plate.nodes.map(n=>({id:n.id,group:plate.id,...pos.get(JSON.stringify([n.id,plate.id]))!,w:60,h:36}));
        const ids=new Set(nodes.map(n=>n.id)),links=graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>({from:e.from,to:e.to}));
        const steps=layoutSteps({nodes,links,groups:[{id:plate.id,aspect:1.6}]});let step=steps.next(),last=performance.now();
        while(!step.done){if(performance.now()-last>12){await new Promise<void>(r=>setTimeout(r,0));last=performance.now();if(!mounted.current||graphRef.current!==source)return;}step=steps.next();}
        for(const [id,p] of step.value.positions)positions[JSON.stringify([id,plate.id])]=p;
      }
      if(mounted.current&&graphRef.current===source)setStack(s=>({...s,positions,presentation:"graph"}));
    }finally{if(mounted.current)setArranging(false);}
  };

  // ---- подписи ----
  const labelPlates = new Set<number>();
  if (stack.labels === "all") plates.forEach((p) => labelPlates.add(p.i));

  const lod = view.k < 0.62;

  return (
    <div className="classic-stack flex h-full w-full flex-col bg-[#F6F7FB]">
      <div className="stack-presentation-bar"><div className="overview-switch" role="group" aria-label={t("Представление стопки","Stack presentation")}><button aria-pressed={stack.presentation==="rows"} onClick={()=>setStack(s=>({...s,presentation:"rows"}))}>{t("Построчно","Rows")}</button><button aria-pressed={stack.presentation==="graph"} onClick={()=>setStack(s=>({...s,presentation:"graph"}))}>{t("Узлы и связи","Nodes & edges")}</button></div><label>{t("Группировка","Group by")}<select aria-label={t("Группировка листов","Group sheets")} value={stack.groupBy} onChange={e=>group(e.target.value)}><option value="none">{t("Порядок листов","Sheet order")}</option><option value="type">{t("По типу листа","Sheet type")}</option>{registry.tags.map(tag=><option key={tag.id} value={"tag:"+tag.id}>{t("По тегу","Tag")}: {label(tag)}</option>)}</select></label><button disabled={arranging||!unionCount} onClick={()=>void arrange()}>{arranging?t("Располагаю…","Arranging…"):t("Оптимизировать расположение","Optimize layout")}</button>{stack.positions&&<button onClick={()=>setStack(s=>({...s,positions:undefined}))}>{t("Вернуть расположение","Restore layout")}</button>}</div>
      <div className="stack-layer-checks" aria-label={t("Видимые слои","Visible layers")}>
        <b>{t("Слои","Layers")}</b>{graph.sheets.map((sheet)=><label key={sheet.id}><input type="checkbox" checked={ids.includes(sheet.id)} onChange={(e)=>toggleLayer(sheet.id,e.target.checked)} aria-label={t(`Показать слой ${displayName(sheet.name)}`,`Show layer ${displayName(sheet.name)}`)}/><i style={{background:sheet.color}}/>{displayName(sheet.name)}<small>{idx.bySheet.get(sheet.id)?.length??0}</small></label>)}
        <button onClick={()=>setStack((s)=>({...s,ids:groupStackSheets(graph,graph.sheets.map((x)=>x.id),s.groupBy),focus:0}))}>{t("Все","All")}</button><button onClick={()=>setStack((s)=>({...s,ids:[],focus:0}))}>{t("Очистить","Clear")}</button>
      </div>
      <details className="stack-settings" open={window.innerWidth>=1024}><summary>{t("Настройки Стопки","Stack settings")}</summary><div className="stack-settings-row">
        {stack.presentation==="graph"&&<Slider label={t("Наклон","Tilt")} v={tilt} min={12} max={78} onChange={(v)=>setStack((s)=>({...s,tilt:v}))}/>}
        <Slider label={t("Расстояние","Spacing")} v={gap} min={45} max={200} onChange={(v)=>setStack((s)=>({...s,gap:v}))}/>
        <Slider label={t("Масштаб %","Scale %")} v={Math.round(view.k*100)} min={1} max={320} onChange={(v)=>setStack((s)=>{const k=v/100;return {...s,view:{k,x:size.W/2-((size.W/2-s.view.x)/s.view.k)*k,y:size.H/2-((size.H/2-s.view.y)/s.view.k)*k}}})}/>
        <label><input type="checkbox" checked={stack.labels!=="none"} onChange={(e)=>setStack((s)=>({...s,labels:e.target.checked?"all":"none"}))}/>{t("Подписи узлов","Node labels")}</label>
        <label><input type="checkbox" checked={stack.connections} onChange={(e)=>setStack((s)=>({...s,connections:e.target.checked}))}/>{t("Связи","Connections")}</label>
        <label><input type="checkbox" checked={stack.onlyCross} onChange={(e)=>setStack((s)=>({...s,onlyCross:e.target.checked}))}/>{t("Только между слоями","Between layers only")}</label>
        <label><input type="checkbox" checked={stack.spines} onChange={(e)=>setStack((s)=>({...s,spines:e.target.checked}))}/>{t("Один ID на слоях","Same ID across layers")}</label>
        <button onClick={fitAll}>{t("Вписать Стопку","Fit stack")}</button>
      </div></details>
      {/* сцена */}
      <div
        ref={wrap}
        tabIndex={0}
        onKeyDown={onKey}
        className="relative min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
        style={{ touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {L === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">{t("Выберите слои галочками сверху","Select layers using the checkboxes above")}</div>
        ) : (
          <svg id="stack-svg" className="absolute inset-0 h-full w-full" aria-label={t("Стопка слоёв","Layer stack")}>
            <defs><marker id="stack-arrow" viewBox="0 0 10 10" refX="14" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill={CROSS}/></marker><linearGradient id="stack-identity-gold" x1="0%" y1="0%" x2="0%" y2="100%"><stop stopColor={SPINE}/><stop offset=".5" stopColor={LINE_STYLE.identity.light}/><stop offset="1" stopColor={SPINE}/></linearGradient></defs>
            <g ref={rootG} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {/* planes */}
              <g>
                {plates.map((p) => {
                  const d = geo.depth(p.i);
                  const s = sheetOf(p.id);
                  const A = proj(-p.hx, -p.hy, d),
                    B = proj(p.hx, -p.hy, d),
                    C = proj(p.hx, p.hy, d),
                    D = proj(-p.hx, p.hy, d);
                  const act = p.i === focus;
                  const grid: string[] = [];
                  for (let x = -p.hx + 67; x < p.hx; x += 135) {
                    const a = proj(x, -p.hy, d),
                      b = proj(x, p.hy, d);
                    grid.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`);
                  }
                  for (let y = -p.hy + 54; y < p.hy; y += 108) {
                    const a = proj(-p.hx, y, d),
                      b = proj(p.hx, y, d);
                    grid.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`);
                  }
                  const lw = Math.max(118, displayName(s.name).length * 7.4 + 20);
                  return (
                    <g key={p.id} opacity={act ? 1 : 0.9}>
                      <path d={`M${D[0]} ${D[1]}L${C[0]} ${C[1]}L${B[0]} ${B[1]}L${B[0]} ${B[1] + TH}L${C[0]} ${C[1] + TH}L${D[0]} ${D[1] + TH}Z`} fill={s.color} opacity={0.28} />
                      <path
                        d={`M${A[0]} ${A[1]}L${B[0]} ${B[1]}L${C[0]} ${C[1]}L${D[0]} ${D[1]}Z`}
                        fill={s.color}
                        fillOpacity={act ? 0.13 : 0.07}
                        stroke={s.color}
                        strokeOpacity={act ? 0.95 : 0.5}
                        strokeWidth={act ? 1.8 : 1.2}
                      />
                      <path d={grid.join("")} stroke={s.color} strokeWidth={0.6} strokeOpacity={act ? 0.16 : 0.09} fill="none" />
                      {/* ярлык */}
                      <g
                        role="button" tabIndex={0} aria-label={t(`Активировать слой ${displayName(s.name)}`,`Focus layer ${displayName(s.name)}`)}
                        className="cursor-pointer"
                        onPointerDown={(e)=>e.stopPropagation()}
                        onClick={(e)=>{e.stopPropagation();setFocus(p.i);}}
                        onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();setFocus(p.i);}}}
                      >
                        <line x1={A[0]} y1={A[1] - 54 + 29} x2={A[0]} y2={A[1]} stroke={s.color} strokeWidth={1.4} opacity={0.65} />
                        <rect x={A[0] - lw / 2} y={A[1] - 54} width={lw} height={29} rx={5} fill="#fff" stroke={s.color} strokeWidth={2} opacity={act ? 1 : 0.88} />
                        <text x={A[0]} y={A[1] - 54 + 12} fontSize={12} fontWeight={640} fill={INK} textAnchor="middle">
                          {displayName(s.name)}
                        </text>
                        <text x={A[0]} y={A[1] - 54 + 24} fontSize={10} fill="#64748b" fillOpacity={1} textAnchor="middle">
                          {p.total} {t("узлов","nodes")} · {label(registry.sheets.find(d=>d.id===sheetTypeId(s,registry))??registry.sheets[0])}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
              {/* wires */}
              <g style={{ pointerEvents: "none" }}>
                {wires.list.map((w) => {
                  if (!stack.connections || (stack.onlyCross && !w.cross)) return null;
                  if (visibleEdgeIds && !visibleEdgeIds.has(w.id)) return null;
                  const hi = selected && (w.from === selected || w.to === selected);
                  const def=edgeMap.get(w.id);
                  const my = (w.a[1] + w.b[1]) / 2;
                  return (
                    <g key={w.key}><path
                      data-stack-edge={w.id}
                      data-filter-muted={mutedAttr(me,w.id,dimHidden)}
                      data-line-kind={w.cross?"external":"local"}
                      markerEnd={def?.directed!==false?"url(#stack-arrow)":undefined}
                      d={`M${w.a[0]} ${w.a[1]}C${w.a[0]} ${my} ${w.b[0]} ${my} ${w.b[0]} ${w.b[1]}`}
                      fill="none"
                      stroke={hi ? CROSS : w.cross ? CROSS : INTRA}
                      strokeWidth={hi ? 1.8 : w.cross ? LINE_STYLE.external.width : LINE_STYLE.local.width}
                      strokeDasharray={w.cross?LINE_STYLE.external.dash:undefined}
                      vectorEffect="non-scaling-stroke"
                      opacity={hi ? 1 : selected ? 0.18 : w.cross ? 0.65 : 0.4}
                    />{hi&&w.label&&<text x={(w.a[0]+w.b[0])/2} y={my-6} textAnchor="middle" fontSize={12} fill={CROSS}>{displayName(w.label)}</text>}</g>
                  );
                })}
              </g>
              {/* spines */}
              <g style={{ pointerEvents: "none" }}>
                {stack.spines && multi.map(([nid, ps]) => {
                  if (visibleNodeIds && !visibleNodeIds.has(nid)) return null;
                  const n = idx.nodeById.get(nid)!;
                  const show = selected ? selected === nid : n.sheets.includes(focusSheet);
                  if (!show) return null;
                  const pts = ps
                    .slice()
                    .sort((a, b) => a - b)
                    .map((i) => spos(nid, i)!)
                    .map((q) => q.join(","))
                    .join(" ");
                  const hi = selected === nid;
                  return <g key={nid} data-line-kind="identity" data-identity-node={nid} data-filter-muted={mutedAttr(mv,nid,dimHidden)} opacity={hi?1:.78}><polyline points={pts} fill="none" stroke={LINE_STYLE.identity.glow} strokeWidth={7} opacity=".17" vectorEffect="non-scaling-stroke"/><polyline points={pts} fill="none" stroke={SPINE} strokeWidth={hi?3:2.4} vectorEffect="non-scaling-stroke"/><polyline points={pts} fill="none" stroke="url(#stack-identity-gold)" strokeWidth={1.2} vectorEffect="non-scaling-stroke"/></g>;
                })}
              </g>
              {/* nodes */}
              <g>
                {plates.map((p) => {
                  const s = sheetOf(p.id);
                  const act = p.i === focus;
                  return p.nodes.map((n) => {
                    if (visibleNodeIds && !visibleNodeIds.has(n.id)) return null;
                    const [x, y] = spos(n.id, p.i)!;
                    const isSel = selected === n.id;
                    const isMulti = (shownOn.get(n.id)?.length ?? 1) > 1;
                    const op = selected && !isSel && !neighbors.has(n.id) ? 0.28 : act ? 1 : 0.82;
                    const title = `${displayName(n.name)} — ${n.sheets.map((sid) => displayName(sheetOf(sid)?.name)).join(", ")}`;
                    if(stack.presentation==="rows")return <g key={n.id} data-stack-node={n.id} data-filter-muted={mutedAttr(mv,n.id,dimHidden)} opacity={op} role="button" tabIndex={0} className="stack-row-node" aria-label={displayName(n.name)} onPointerDown={e=>e.stopPropagation()} onClick={e=>pick(e,n.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(e,n.id);}}}><rect x={x-165} y={y-12} width={330} height={26} rx={4} fill="#ffffff" stroke={isMulti?SPINE:s.color} strokeWidth={isSel?2:1}/><text x={x-155} y={y+5} fontSize={13} fill={INK}>{displayName(n.name).length>38?displayName(n.name).slice(0,37)+"…":displayName(n.name)}</text>{isMulti&&<circle cx={x+153} cy={y} r={4} fill={SPINE}/>}<title>{title}</title></g>;
                    if (lod && !act && !isSel) {
                      return (
                        <circle key={n.id} data-stack-node={n.id} data-filter-muted={mutedAttr(mv,n.id,dimHidden)} cx={x} cy={y} r={2.2} fill={isMulti ? SPINE : s.color} opacity={op} onPointerDown={(e) => e.stopPropagation()} onClick={(e)=>pick(e,n.id)} role="button" tabIndex={0} aria-label={displayName(n.name)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(e,n.id);}}} className="cursor-pointer">
                          <title>{title}</title>
                        </circle>
                      );
                    }
                    if (stack.nodes === "tile") {
                      const stroke = isSel ? CROSS : isMulti ? SPINE : s.color;
                      return (
                        <g key={n.id} data-stack-node={n.id} data-filter-muted={mutedAttr(mv,n.id,dimHidden)} opacity={op} className="cursor-pointer" onPointerDown={(e) => e.stopPropagation()} onClick={(e)=>pick(e,n.id)} role="button" tabIndex={0} aria-label={displayName(n.name)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(e,n.id);}}}>
                          <g transform={`matrix(0.87 ${f} -0.87 ${f} ${x} ${y})`}>
                            <rect x={-42} y={-15} width={84} height={30} rx={3} fill="#fff" fillOpacity={0.94} stroke={stroke} strokeWidth={isSel ? 2.4 : isMulti ? 2 : 1.3} />
                          </g>
                          <text x={x} y={y} fontSize={8.4} fontWeight={640} fill={INK} textAnchor="middle" dominantBaseline="middle">
                            {displayName(n.name).length > 16 ? displayName(n.name).slice(0, 15) + "…" : displayName(n.name)}
                          </text>
                          <title>{title}</title>
                        </g>
                      );
                    }
                    const r = isMulti ? 7 : 5.4;
                    return (
                      <g key={n.id} data-stack-node={n.id} data-filter-muted={mutedAttr(mv,n.id,dimHidden)} opacity={op} className="cursor-pointer" onPointerDown={(e) => e.stopPropagation()} onClick={(e)=>pick(e,n.id)} role="button" tabIndex={0} aria-label={displayName(n.name)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(e,n.id);}}}>
                        <ellipse cx={x} cy={y + 3.5} rx={r * 0.95} ry={r * 0.42} fill={INK} opacity={0.13} />
                        <circle cx={x} cy={y} r={r} fill={isSel ? CROSS : isMulti ? "#fff" : s.color} stroke={isSel ? CROSS : isMulti ? SPINE : "#fff"} strokeWidth={isMulti ? 2.4 : 1.4} />
                        {isMulti && !isSel && <circle cx={x} cy={y} r={2.6} fill={s.color} />}
                        <title>{title}</title>
                      </g>
                    );
                  });
                })}
              </g>
              {/* labels */}
              <g>
                {plates.map((p) => {
                  if (stack.presentation==="rows"||!labelPlates.has(p.i)) return null;
                  const d = geo.depth(p.i);
                  const act = p.i === focus;
                  const nodes = p.nodes;
                  const cy = proj(0, 0, d)[1];
                  const cols = { left: [] as GNode[], right: [] as GNode[] };
                  for (const n of nodes) if (!visibleNodeIds || visibleNodeIds.has(n.id)) (pos.get(JSON.stringify([n.id,p.id]))!.x < 0 ? cols.left : cols.right).push(n);
                  return (["left", "right"] as const).map((side) => {
                    const list = cols[side].slice().sort((a, b) => spos(a.id, p.i)![1] - spos(b.id, p.i)![1]);
                    const y0 = cy - ((list.length - 1) * LH) / 2;
                    const lx = side === "left" ? proj(-p.hx, p.hy, d)[0] - 34 : proj(p.hx, -p.hy, d)[0] + 34;
                    return list.map((n, j) => {
                      const [nx, ny] = spos(n.id, p.i)!;
                      const ly = y0 + j * LH;
                      const hi = selected && (n.id === selected || neighbors.has(n.id));
                      const bend = side === "left" ? lx + 12 : lx - 12;
                      return (
                        <g key={n.id + side} data-filter-muted={mutedAttr(mv,n.id,dimHidden)}>
                          <path d={`M${nx} ${ny}L${bend} ${ly}L${lx} ${ly}`} fill="none" stroke={hi ? CROSS : "#94a3b8"} strokeWidth={0.6} opacity={0.5} style={{ pointerEvents: "none" }} />
                          <text
                            x={lx}
                            y={ly}
                            fontSize={13.5}
                            fontWeight={hi ? 640 : 400}
                            fill={hi ? CROSS : act ? INK : "#475569"}
                            textAnchor={side === "left" ? "end" : "start"}
                            dominantBaseline="middle"
                            className="cursor-pointer"
                            onPointerDown={(e) => e.stopPropagation()} onClick={(e)=>pick(e,n.id)} role="button" tabIndex={0} aria-label={displayName(n.name)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(e,n.id);}}}
                          >
                            {displayName(n.name).length > 36 ? displayName(n.name).slice(0, 35) + "…" : displayName(n.name)}
                          </text>
                        </g>
                      );
                    });
                  });
                })}
              </g>
            </g>
          </svg>
        )}
        <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-500 hidden sm:block">{t("↑ ↓ — активный слой · drag — панорама · колесо / pinch — зум","↑ ↓ active layer · drag to pan · wheel / pinch to zoom")}</div>
      </div>

      <div className="stack-bottom-bar"><span>{t("Слоёв:","Layers:")} {L}/{graph.sheets.length} · {t("узлов:","nodes:")} {unionCount}/{graph.nodes.length} · {t("связей между слоями:","connections between layers:")} {wires.crossCount}</span>
        <ConnectionLegend/>
        <div><Btn disabled={!ids.length} onClick={()=>setFocus(focus-1)} aria-label={t("Слой выше","Layer above")}>↑</Btn><Btn disabled={!ids.length} onClick={()=>setFocus(focus+1)} aria-label={t("Слой ниже","Layer below")}>↓</Btn><Btn disabled={!focusSheet} onClick={()=>onOpenSheet(focusSheet)}>{t("Открыть слой","Open layer")}</Btn></div>
        {selected&&idx.nodeById.has(selected)&&<button className="stack-selected-node" onClick={()=>onInspect(selected)}>{displayName(idx.nodeById.get(selected)!.name)} ↗</button>}
      </div>
    </div>
  );
}

function Slider({ label, v, min, max, onChange }: { label: string; v: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-slate-800" aria-label={label} />
      <span className="w-6 tabular-nums text-slate-800">{v}</span>
    </label>
  );
}
function Btn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-100" />;
}
