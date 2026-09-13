import { BackgroundUnavailable, runBackground } from "../lib/background";
import type { LoadResult } from "../lib/graph";
import type { LayoutResult } from "../lib/optimizeLayout";
import { SavedViewsDialog } from "./SavedViewsDialog";
import type { SavedView } from "../lib/savedViews";
import { SearchHighlightProvider } from "../lib/Body";
import { useTypes } from "../lib/TypeContext";
import { appearanceForType } from "../lib/appearance";
import { emptyProject, serializeProject } from "../lib/typeRegistry";
import { parseCanvas, parseBpmn } from "../lib/diagramImports";
import { appendDrawio, exportDrawio, parseDrawio, MAX_IMPORT_BYTES } from "../lib/drawio";
import { TypeManager } from "./TypeManager";
import { NewProjectDialog, NewSheetDialog, NewRelationDialog } from "./ProjectDialogs";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { VisibilityDialog } from "./VisibilityDialog";
import { FilterPanel, type FilterSummary } from "./FilterPanel";
import { EMPTY_FILTER, NO_PINS, activeConditions, compileNodeFilter, visibleEdges, visibleNodes, type FilterMode, type FilterPins, type NodeFilter } from "../lib/nodeFilter";
import { Modal } from "./Modal";
import { useI18n } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {  PALETTE, type GEdge, type GNode, type Graph, type Mode, type Sheet, type View, type Pos } from "../model/types";
import { buildIndex, flatten, forceLayout, freeSpot, isCross, lint, loadGraph, stubsForSheet, uid, type LintItem, type Stub } from "../lib/graph";
import { SheetCanvas, type Placed } from "./SheetCanvas";
import { OverviewCanvas } from "./OverviewCanvas";
import { moveOverviewSheet, moveOverviewNode } from "../lib/overviewLayout";
import { ContentsView } from "./ContentsView";
import { StackView, initialStack, type StackState } from "./StackView";
import { LintPanel, NodePanel, SheetPanel, type Actions } from "./Inspector";
import { useSizes } from "./useSizes";
import { cn } from "../utils/cn";
import { csvGraph, spreadSheet, toCanvas, type SpreadKey } from "../lib/io";
import { notationFor, notationLoss } from "../lib/notation";
import { makeSoftwareDemo } from "../data/software";
import { SheetNavigation } from "./SheetNavigation";
import { MultiSpread, type SpreadLayoutHandle } from "./MultiSpread";
import { applyViewLayout, viewLayoutRequest, type LayoutSnapshot } from "../lib/layoutViews";
import { layoutSteps } from "../lib/optimizeLayout";
import { AddNodeDialog } from "./AddNodeDialog";
import { reconcileSpread, replaceSpreadSlot } from "./spreadLayout";
import { HelpView } from "./HelpView";

interface Props {
  graph: Graph;
  setGraph: (f: (g: Graph) => Graph) => void;
  replaceGraph: (g: Graph) => void;
  demo: () => Graph;
  saveStatus: string;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const DEFAULT_VIEW: View = { x: 40, y: 40, k: 1 };

export function Tool({ graph, setGraph, replaceGraph, demo, saveStatus, undo, redo, canUndo, canRedo }: Props) {
  const {t,name:displayName,locale,setLocale}=useI18n();
  const {sheetTypes,registry,label:typeLabel}=useTypes();

  const idx = useMemo(() => buildIndex(graph), [graph]);
  const [mode, setMode] = useState<Mode>("sheet");
  const [overviewView,setOverviewView]=useState<View|null>(null);
  const [sheetA, setSheetA] = useState(graph.sheets[0]?.id ?? "");
  const [spreadSheets, setSpreadSheets] = useState(() => graph.sheets.slice(0,2).map((s) => s.id));
  const [spreadCount, setSpreadCount] = useState(2);
  const [spreadRatio, setSpreadRatio] = useState(50);
  const visibleSpread = useMemo(() => reconcileSpread(spreadSheets,graph.sheets,spreadCount),[spreadSheets,graph.sheets,spreadCount]);
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [panel, setPanel] = useState<"node" | "sheet" | "lint">("sheet");
  const [hybrid, setHybrid] = useState(true);
  const [showBody, setShowBody] = useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const [showStubs, setShowStubs] = useState(true);
  // One filter (types, tags, attributes) produces one visible set that feeds every view.
  // null means "nothing filtered" — the views take a fast path. In "hide" mode filtered objects
  // are not rendered at all; in "dim" mode the same set only marks them to be drawn faded.
  const [filter,setFilterState]=useState<NodeFilter>(EMPTY_FILTER);
  const [filterMode,setFilterMode]=useState<FilterMode>("hide");
  const [filterOpen,setFilterOpen]=useState(false);
  const [recentSearches,setRecentSearches]=useState<string[]>(()=>{
    try { const value:unknown=JSON.parse(localStorage.getItem("plyloom.search.recent")??"[]"); return Array.isArray(value)?[...new Set(value.filter((v):v is string=>typeof v==="string"&&!!v.trim()).map(v=>v.slice(0,4096)))].slice(0,6):[]; } catch { return []; }
  });
  useEffect(()=>{try{localStorage.setItem("plyloom.search.recent",JSON.stringify(recentSearches));}catch{/* Optional preference. */}},[recentSearches]);
  // Pinned objects (created, opened or edited by the user) stay visible until the filter changes.
  const [pins,setPins]=useState<FilterPins>(NO_PINS);
  const setFilter=useCallback((f:NodeFilter)=>{setFilterState(f);setPins(NO_PINS);},[]);
  const predicate=useMemo(()=>compileNodeFilter(registry,filter,graph.sheets),[registry,filter,graph.sheets]);
  const hiddenEdgeTypeSet=useMemo(()=>new Set(filter.hiddenEdgeTypes),[filter.hiddenEdgeTypes]);
  const visibleNodeIds=useMemo(()=>visibleNodes(graph.nodes,predicate,pins),[graph.nodes,predicate,pins]);
  const visibleEdgeIds=useMemo(()=>visibleEdges(graph.edges,visibleNodeIds,hiddenEdgeTypeSet,pins),[graph.edges,visibleNodeIds,hiddenEdgeTypeSet,pins]);
  // Which sheets still hold matching nodes: the sheet strip marks the rest, so the search also helps navigation.
  const sheetHits=useMemo(()=>{if(!visibleNodeIds)return null;const out=new Set<string>();for(const n of graph.nodes)if(visibleNodeIds.has(n.id))for(const sid of n.sheets)out.add(sid);return out;},[graph.nodes,visibleNodeIds]);
  const dimFiltered=filterMode==="dim";
  const hiddenNodeCount=visibleNodeIds?graph.nodes.length-visibleNodeIds.size:0;
  const hiddenEdgeCount=visibleEdgeIds?graph.edges.length-visibleEdgeIds.size:0;
  const conditionCount=useMemo(()=>activeConditions(registry,filter),[registry,filter]);
  const filterActive=conditionCount>0;
  const showAll=useCallback(()=>setFilter(EMPTY_FILTER),[setFilter]);
  const predicateNow=useRef(predicate);predicateNow.current=predicate;
  const pinsNow=useRef(pins);pinsNow.current=pins;
  const viewGraph=graph;
  // viewGraph is the graph itself; a second index would repeat the same work on every edit.
  const viewIdx=idx;
  const [linking, setLinking] = useState(false);
  const [views, setViews] = useState<Record<string, View>>({});
  const [fitTick, setFitTick] = useState(0);
  const [stack, setStackState] = useState<StackState>(() => initialStack(graph));
  const setStack = useCallback((f: (s: StackState) => StackState) => setStackState(f), []);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sizes, observe] = useSizes();
  const [compact, setCompact] = useState(() => window.innerWidth < 1024);
  const drawers = compact || ["spread","stack","generate","faq","contents","board"].includes(mode);
  const [addOpen, setAddOpen] = useState(false);
  const [typeTab,setTypeTab]=useState<"sheets"|"nodes"|"edges"|"attributes">("sheets");
  const [dialog,setDialog]=useState<"project"|"sheet"|"relation"|"types"|"visibility"|"drawio-export"|"views"|null>(null);
  const [preview,setPreview]=useState<{graph:Graph;source:Graph;append:boolean;warnings:string[];title:string}|null>(null);
  const [busyImport,setBusyImport]=useState(false);
  const openDialog=(which:NonNullable<typeof dialog>)=>{setLeftOpen(false);setRightOpen(false);setLinking(false);setDialog(which);};
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const spreadLayoutRef=useRef<SpreadLayoutHandle>(null);
  const graphNow=useRef(graph);graphNow.current=graph;
  const optimization=useRef<{cancel:boolean;abort:AbortController}|null>(null);
  const importController=useRef<AbortController|null>(null);
  const [optimizing,setOptimizing]=useState<number|null>(null);
  const cancelLayoutRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>()=>{importController.current?.abort();if(optimization.current){optimization.current.cancel=true;optimization.current.abort.abort();}},[]);
  useEffect(()=>{if(optimizing!==null)cancelLayoutRef.current?.focus();},[optimizing===null]);
  const leftRef = useRef<HTMLElement>(null), rightRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(mq.matches);
    mq.addEventListener("change", update); return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!drawers || addOpen || (!leftOpen && !rightOpen)) return;
    const el = (rightOpen ? rightRef : leftRef).current;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => [...(el?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]') ?? [])].filter((e) => e.getClientRects().length > 0);
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = controls(), first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    el?.addEventListener("keydown", trap);
    return () => { el?.removeEventListener("keydown", trap); previous?.focus(); };
  }, [drawers, leftOpen, rightOpen, addOpen]);
  const fileRef = useRef<HTMLInputElement>(null),drawioRef=useRef<HTMLInputElement>(null),csvRef=useRef<HTMLInputElement>(null),canvasImportRef=useRef<HTMLInputElement>(null),bpmnRef=useRef<HTMLInputElement>(null);

  // защита от исчезнувших листов
  useEffect(() => {
    if (!idx.sheetById.has(sheetA)) setSheetA(graph.sheets[0]?.id ?? "");
    if (mode === "spread" && !visibleSpread.includes(sheetA)) setSheetA(visibleSpread[0] ?? "");
    setStackState((s) => {
      const ids = s.ids.filter((id) => idx.sheetById.has(id));
      return ids.length === s.ids.length ? s : { ...s, ids, focus: Math.min(s.focus, Math.max(0, ids.length - 1)) };
    });
  }, [graph.sheets, idx, sheetA, mode, visibleSpread]);
  useEffect(() => {
    if (selected && !idx.nodeById.has(selected)) setSelectedRaw(null);
  }, [selected, idx]);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((current) => current === m ? null : current), 6000);
  };
  const viewOf = (k: string) => views[k] ?? DEFAULT_VIEW;
  const setViewFor = useCallback((k: string) => (v: View) => setViews((vs) => ({ ...vs, [k]: v })), []);
  const viewSetters = useMemo(() => {
    const m: Record<string, (v: View) => void> = {};
    for (const s of graph.sheets) m[s.id] = setViewFor(s.id);
    m.__flat = setViewFor("__flat");
    return m;
  }, [graph.sheets, setViewFor]);
  const fit = () => setFitTick((t) => t + 1);
  const undoAndFit=()=>{undo();fit();};
  const redoAndFit=()=>{redo();fit();};
  const flatKey=mode==="flat"?JSON.stringify([graph.nodes.map(n=>n.id),graph.edges.map(e=>[e.from,e.to])]):"";
  const flatLayout=useMemo(()=>{
    if(mode!=="flat")return new Map<string,Pos>();
    const fallback=graph.nodes.every(n=>graph.flatPositions?.[n.id])?new Map<string,Pos>():forceLayout(graph);
    return new Map(graph.nodes.map(n=>[n.id,graph.flatPositions?.[n.id]??fallback.get(n.id)??{x:0,y:0}]));
  },[mode,flatKey,graph.flatPositions]);
  const optimize=async()=>{
    if(optimization.current)return;
    const previous=document.activeElement as HTMLElement|null;
    const canvas=document.querySelector<HTMLElement>("main [data-canvas-id]");
    const w=canvas?.clientWidth||Math.max(300,window.innerWidth-(drawers?0:496)),h=canvas?.clientHeight||500;
    const snapshot:LayoutSnapshot|undefined=mode==="spread"?spreadLayoutRef.current?.snapshot():{
      flat:mode==="flat",external:mode!=="flat"&&showStubs,
      panes:[{sid:mode==="flat"?"__flat":sheetA,width:w,height:h,positions:mode==="flat"?flatLayout:new Map((idx.bySheet.get(sheetA)??[]).map(n=>[n.id,n.pos[sheetA]]))}],
    };
    if(!snapshot)return;
    const token={cancel:false,abort:new AbortController()};optimization.current=token;setOptimizing(0);setToast(null);
    const pause=()=>new Promise<void>(resolve=>window.setTimeout(resolve,0));
    try{
      await pause();
      if(token.cancel||graphNow.current!==graph)return;
      let result:LayoutResult|undefined;
      if(graph.nodes.length>300){
        try{result=await runBackground<LayoutResult>({kind:"layout",graph,sizes,snapshot},token.abort.signal,setOptimizing);}
        catch(error){if(!(error instanceof BackgroundUnavailable))throw error;}
      }
      if(!result){
        const steps=layoutSteps(viewLayoutRequest(graph,sizes,snapshot));let step=steps.next(),lastYield=performance.now();
        while(!step.done){
          if(token.cancel||graphNow.current!==graph)return;
          if(performance.now()-lastYield>12){setOptimizing(step.value);await pause();lastYield=performance.now();}
          step=steps.next();
        }
        result=step.value;
      }
      if(token.cancel||graphNow.current!==graph)return;
      if(result.changed){
        replaceGraph(applyViewLayout(graph,snapshot,result));fit();
        const a=result.before,b=result.after;
        say(t(`Готово. Проходов через карточки: ${a.nodeHits} → ${b.nodeHits}; пересечений: ${a.crossings} → ${b.crossings}. Отменить — вернуть позиции.`,`Done. Edges through cards: ${a.nodeHits} → ${b.nodeHits}; crossings: ${a.crossings} → ${b.crossings}. Undo restores positions.`)+(b.sampled?t(" Оценка по выборке связей."," Estimated from an edge sample."):"")+(filterActive?t(" Скрытые фильтром узлы тоже учтены и могли сдвинуться."," Nodes hidden by the filter were included and may have moved."):""));
      }else say(t("Более удачное расположение не найдено. Позиции сохранены.","No better arrangement found. Positions were kept."));
    }catch(error){
      if(!token.cancel)say(t("Не удалось рассчитать расположение. Карта сохранена.","Could not calculate a layout. Your map was kept."));
    }finally{
      if(optimization.current===token){optimization.current=null;setOptimizing(null);window.setTimeout(()=>previous?.isConnected&&previous.focus(),0);}
    }
  };

  // ---------- мутации ----------
  // A node the user just created, opened or edited must not vanish: if the filter does not let it
  // through, it is pinned on top of the filter until the next filter change; a toast explains why.
  const kept=()=>dimFiltered?t(" Он не приглушается, пока фильтр не изменится.", " It is not dimmed until the filter changes."):t(" Он остаётся на экране, пока фильтр не изменится.", " It stays on screen until the filter changes.");
  const pinNode=(n:GNode|undefined,quiet=false)=>{
    const p=predicateNow.current;if(!n||!p||p(n)||pinsNow.current.nodes.has(n.id))return false;
    const next={...pinsNow.current,nodes:new Set(pinsNow.current.nodes).add(n.id)};pinsNow.current=next;setPins(next);
    if(!quiet)say(t(`«${displayName(n.name)}» не подходит под фильтр.`,`"${displayName(n.name)}" does not match the filter.`)+kept());
    return true;
  };
  const pinEdge=(e:GEdge,from?:GNode,to?:GNode)=>{
    const ends=[pinNode(from,true),pinNode(to,true)].some(Boolean);
    let edge=false;
    if(hiddenEdgeTypeSet.has(e.kind??"flow")&&!pinsNow.current.edges.has(e.id)){const next={...pinsNow.current,edges:new Set(pinsNow.current.edges).add(e.id)};pinsNow.current=next;setPins(next);edge=true;}
    if(ends||edge)say(t("Связь не подходит под фильтр.","The relation does not match the filter.")+(dimFiltered?t(" Она не приглушается, пока фильтр не изменится."," It is not dimmed until the filter changes."):t(" Она остаётся на экране, пока фильтр не изменится."," It stays on screen until the filter changes.")));
    return ends||edge;
  };
  const updateNode = (id: string, patch: Partial<GNode>) => { const current=idx.nodeById.get(id);if(current)pinNode({...current,...patch}); setGraph(g=>({...g,nodes:g.nodes.map(n=>{
    if(n.id!==id)return n;
    if(patch.kind&&patch.kind!==n.kind){const def=registry.nodes.find(k=>k.id===patch.kind),base=def&&appearanceForType(def);return {...n,...patch,appearance:base?Object.fromEntries(n.sheets.map(sid=>[sid,{...base,...(n.appearance?.[sid]?{width:n.appearance[sid].width,height:n.appearance[sid].height}:{})}])):undefined};}
    return {...n,...patch};
  })})); };
  const moveNode = (id: string, sid: string, x: number, y: number) =>
    setGraph((g) => ({ ...g, sheets:g.sheets.map(s=>s.id===sid?{...s,layout:"manual"}:s),nodes: g.nodes.map((n) => (n.id === id ? { ...n, pos: { ...n.pos, [sid]: { x, y } } } : n)) }));
  const moveSheet=(sid:string,positions:Map<string,Pos>)=>setGraph(g=>({...g,sheets:g.sheets.map(s=>s.id===sid?{...s,layout:"manual"}:s),nodes:g.nodes.map(n=>positions.has(n.id)?{...n,pos:{...n.pos,[sid]:positions.get(n.id)!}}:n)}));
  const addMembership = (id: string, sid: string) => {
    if(idx.sheetById.get(sid)?.smartFilter)return;
    const p = freeSpot(idx, sid, sizes);
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id && !n.sheets.includes(sid) ? { ...n, sheets: [...n.sheets, sid], pos: { ...n.pos, [sid]: p },...(n.appearance?.[n.sheets[0]]?{appearance:{...n.appearance,[sid]:{...n.appearance[n.sheets[0]]}}}:{}) } : n)),
    }));
  };
  const removeMembership = (id: string, sid: string) =>
    setGraph((g) => ({
      ...g,
      edges:g.edges.map(e=>e.routes&&(e.from===id||e.to===id)&&g.nodes.find(n=>n.id===id)!.sheets.length>1?{...e,routes:Object.fromEntries(Object.entries(e.routes).filter(([key])=>key!==sid))}:e),
      nodes: g.nodes.map((n) => {
        if (n.id !== id || idx.sheetById.get(sid)?.smartFilter || n.sheets.filter(s=>!idx.sheetById.get(s)?.smartFilter).length < 2) return n;
        const pos = { ...n.pos },appearance={...n.appearance};
        delete pos[sid];delete appearance[sid];
        return { ...n, sheets: n.sheets.filter((s) => s !== sid), pos,appearance };
      }),
    }));
  const createNode = (sid: string, x?: number, y?: number, details?: Pick<GNode,"name"|"kind"|"body">) => {
    if (!idx.sheetById.has(sid)) return;
    if (idx.sheetById.get(sid)?.smartFilter) { sid=graph.sheets.find(s=>!s.smartFilter)!.id; setSheetA(sid); }
    const p = x === undefined || y === undefined ? freeSpot(idx, sid, sizes) : { x, y };
    const n: GNode = { id: uid("n_"), sheets: [sid], pos: { [sid]: p }, name: t("Новый узел"), kind: "entity", body: "", ...details };
    const appearance=appearanceForType(registry.nodes.find(k=>k.id===n.kind)??registry.nodes[0]);
    if(appearance)n.appearance={[sid]:appearance};
    replaceGraph({ ...graph, nodes: [...graph.nodes, n] });
    pinNode(n);
    select(n.id);
    if (drawers) setRightOpen(true);
  };
  const deleteNode = (id: string) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id),...(g.flatPositions?{flatPositions:Object.fromEntries(Object.entries(g.flatPositions).filter(([key])=>key!==id))}:{}) }));
    setSelectedRaw(null);
    setPanel("sheet");
  };
  const addEdge = (from: string, to: string) => {
    if (from === to) return say("Нельзя связать узел с самим собой");
    if (graph.edges.some((e) => e.from === from && e.to === to && e.kind === "ref")) return say("Между этими узлами уже есть связь");
    const edge:GEdge={ id: uid("e_"), from, to, kind: "ref" };
    replaceGraph({ ...graph, edges: [...graph.edges, edge] });
    if(!pinEdge(edge,idx.nodeById.get(from),idx.nodeById.get(to)))say("Связь создана (тип «см.» — измените в панели узла)");
  };
  const updateEdge = (id: string, patch: Partial<GEdge>) => { const current=graph.edges.find(e=>e.id===id);if(current&&patch.kind)pinEdge({...current,...patch}); setGraph((g) => ({ ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })); };
  const deleteEdge = (id: string) => setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }));
  const addSheet = () => openDialog("sheet");
  const createSheet = (name:string,typeId:string,tags:string[]=[]) => {
    const s: Sheet = { id: uid("s_"), name, typeId, tags, notation:"plyloom", limit: 15, layout:"manual", color: sheetTypes.find(s=>s.id===typeId)?.color??PALETTE[graph.sheets.length % PALETTE.length] };
    replaceGraph({ ...graph, sheets: [...graph.sheets, s] });
    setSheetA(s.id);
    setMode("sheet");
    setLeftOpen(false);
    if (compact) setRightOpen(true);
    setPanel("sheet");
  };
  const updateSheet = (id: string, patch: Partial<Sheet>) => setGraph((g) => ({ ...g, sheets: g.sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const deleteSheet = (id: string) => {
    if ((idx.bySheet.get(id)?.length ?? 0) > 0 || graph.sheets.length < 2 || (!idx.sheetById.get(id)?.smartFilter&&graph.sheets.filter(s=>!s.smartFilter).length<2)) return;
    setGraph((g) => ({ ...g, sheets: g.sheets.filter((s) => s.id !== id),edges:g.edges.map(e=>e.routes?{...e,routes:Object.fromEntries(Object.entries(e.routes).filter(([sid])=>sid!==id))}:e) }));
  };

  // ---------- навигация ----------
  const chooseSpreadSheet = (slot: number, sid: string) => {
    setSpreadSheets(replaceSpreadSlot(visibleSpread, slot, sid));
    setSheetA(sid);
    setPanel("sheet");
  };
  const openAdd = (sid = mode === "stack" ? stack.ids[stack.focus] ?? sheetA : sheetA) => { setSheetA(sid); setLeftOpen(false); setRightOpen(false); setLinking(false); setAddOpen(true); };
  const select = (id: string | null) => {
    setSelectedRaw(id);
    if (id) setPanel("node");
  };
  const onSelectFromCanvas = (id: string | null) => {
    if (linking && selected && id && id !== selected) {
      addEdge(selected, id);
      setLinking(false);
      select(id);
      return;
    }
    if (linking && !id) setLinking(false);
    select(id);
    if (compact && id && !linking) { setLeftOpen(false); setRightOpen(true); }
  };
  const goSheet = (id: string) => {
    if (mode === "spread" && !visibleSpread.includes(id)) setSpreadSheets(replaceSpreadSlot(visibleSpread,Math.max(0,visibleSpread.indexOf(sheetA)),id));
    setSheetA(id);
    if (mode !== "sheet" && mode !== "spread") setMode("sheet");
    setPanel("sheet");
    setLeftOpen(false);
    setRightOpen(false);
    fit();
  };
  /** One sheet becomes several, one per value of the chosen feature. The sheet
   *  boundary then means that value, which ID-order splitting never did. */
  const spreadSheetBy = (id: string, key: SpreadKey) => {
    try {
      const next = spreadSheet(graph, id, key, { label: typeLabel, english: locale === "en" });
      const made = next.sheets.filter((s) => !idx.sheetById.has(s.id));
      replaceGraph(next);
      setSpreadSheets(visibleSpread.map((sid) => (sid === id ? made[0].id : sid)));
      setStack((s) => ({ ...s, ids: s.ids.flatMap((sid) => (sid === id ? made.map((m) => m.id) : [sid])) }));
      setSheetA(made[0].id);
      setPanel("sheet");
      fit();
      say(t("Лист разложен, новых листов:", "The sheet was laid out, new sheets:") + " " + made.length + ". " + t("Изменение можно отменить.", "This change can be undone."));
    } catch (e) {
      say((e as Error).message);
    }
  };
  const goNode = (id: string, sid: string) => {
    const n = idx.nodeById.get(id);
    if (!n) return;
    pinNode(n);
    const target = n.sheets.includes(sid) ? sid : n.sheets[0];
    if (mode === "stack") {
      setStack((s) => {
        const order = graph.sheets.map((x) => x.id);
        const ids = s.ids.includes(target) ? s.ids : order.filter((x) => s.ids.includes(x) || x === target);
        return { ...s, ids, focus: ids.indexOf(target) };
      });
    } else if (mode === "spread") {
      if (!visibleSpread.includes(target)) setSpreadSheets(replaceSpreadSlot(visibleSpread,Math.max(0,visibleSpread.indexOf(sheetA)),target));
      setSheetA(target);
    } else if (mode !== "flat") {
      setMode("sheet");
      if (target !== sheetA) {
        setSheetA(target);
        fit();
      }
    }
    select(id);
    if (compact) setRightOpen(true);
  };
  /** Enter in the search line: remember the query and walk the matches in graph order. */
  const findNext = () => {
    const query=(filter.search?.text??"").trim();
    if(query)setRecentSearches(r=>[query,...r.filter(x=>x!==query)].slice(0,6));
    if(!query||!visibleNodeIds)return;
    const matches=graph.nodes.filter(n=>visibleNodeIds.has(n.id));
    if(!matches.length){say(t("Под поиск ничего не подходит.","Nothing matches the search."));return;}
    const at=selected?matches.findIndex(n=>n.id===selected):-1;
    const next=matches[(at+1)%matches.length];
    goNode(next.id,next.sheets[0]);
    say(t(`Совпадение ${(at+1)%matches.length+1} из ${matches.length}.`,`Match ${(at+1)%matches.length+1} of ${matches.length}.`));
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    setLinking(false);
    setLeftOpen(false);
    setRightOpen(false);
    if (m === "spread" && !visibleSpread.includes(sheetA)) setSpreadSheets(replaceSpreadSlot(visibleSpread,0,sheetA));
    if (m === "stack" && stack.ids.length === 0) setStack((s) => ({ ...s, ids: graph.sheets.slice(0, 4).map((x) => x.id), focus: 0 }));
    if (m === "stack" && sheetA && !stack.ids.includes(sheetA)) {
      setStack((s) => {
        const order = graph.sheets.map((x) => x.id);
        const ids = order.filter((x) => s.ids.includes(x) || x === sheetA);
        return { ...s, ids, focus: ids.indexOf(sheetA) };
      });
    } else if (m === "stack") setStack((s) => ({ ...s, focus: Math.max(0, s.ids.indexOf(sheetA)) }));
    if (m === "sheet" && mode === "stack" && stack.ids[stack.focus]) setSheetA(stack.ids[stack.focus]);
    fit();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLinking(false);
        setLeftOpen(false);
        setRightOpen(false);
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setSelectedRaw(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- импорт / экспорт ----------
  const download = (name: string, data: string, mime="application/json;charset=utf-8") => {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const slug = () => (graph.title || "plyloom").toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "") + "-" + new Date().toISOString().slice(0, 10);
  const exportJson = () => download(`${slug()}.plyloom`, serializeProject(graph));
  const exportTree = () => {
    if(graph.version===3)return say(t("Дерево v1 не поддерживает словари типов. Сохраните .plyloom или экспортируйте .drawio.","A v1 tree does not support type dictionaries. Save .plyloom or export .drawio."));
    const r = flatten(graph);
    if (r.droppedMemberships > 0 && !confirm(t(`Экспорт в дерево уберёт ${r.droppedMemberships} членств у ${r.affectedNodes} узлов. Останется основной лист; связи сохранятся. Продолжить?`,`Tree export will remove ${r.droppedMemberships} memberships from ${r.affectedNodes} nodes. Each retains its primary sheet; edges are preserved. Continue?`))) return;
    download(`${slug()}-tree.json`, JSON.stringify(r.graph, null, 2));
  };
  const currentView=(id:string,name:string):SavedView=>({id,name,filter:structuredClone(filter),filterMode,mode:mode==="generate"||mode==="faq"?"sheet":mode,sheetId:sheetA,sheetIds:mode==="spread"?visibleSpread:mode==="stack"?stack.ids:undefined});
  const applySavedView=(v:SavedView)=>{
    setFilter(structuredClone(v.filter));setFilterMode(v.filterMode);setMode(v.mode);
    const sid=idx.sheetById.has(v.sheetId??"")?v.sheetId!:graph.sheets[0].id;setSheetA(sid);
    const ids=v.sheetIds?.filter(id=>idx.sheetById.has(id))??[];
    if(v.mode==="spread"){setSpreadCount(Math.max(2,Math.min(6,ids.length)));setSpreadSheets(ids);}
    if(v.mode==="stack")setStackState(s=>({...s,ids,focus:0}));
    setDialog(null);setFilterOpen(false);setSelectedRaw(null);fit();
  };
  const createSmartSheet=(name:string)=>{
    const id=uid("smart_"),smartFilter=structuredClone({...filter,hiddenEdgeTypes:[]});
    replaceGraph({...graph,sheets:[...graph.sheets,{id,name,notation:"plyloom",typeId:"свободная",color:PALETTE[graph.sheets.length%PALETTE.length],layout:"manual",smartFilter}]});
    setFilter(EMPTY_FILTER);setSheetA(id);setMode("sheet");setDialog(null);setFilterOpen(false);fit();
  };
  const activateProject=(g:Graph,firstSheet=g.sheets[0].id,keepMode=false)=>{
    replaceGraph(g);setOverviewView(null);setImportErrors([]);setSelectedRaw(null);setViews({});setLinking(false);setExpanded(new Set());
    setSheetA(firstSheet);setSpreadSheets(g.sheets.slice(0,spreadCount).map(s=>s.id));setStackState(initialStack(g));
    setFilter(EMPTY_FILTER);setLeftOpen(false);setRightOpen(false);setPanel("sheet");if(!keepMode||mode==="faq"||mode==="generate")setMode("sheet");fit();
  };
  const importFiles = async (files:File[],format:"native"|"drawio"|"canvas"|"bpmn"|"csv"="native") => {
    const source=graphNow.current,controller=new AbortController();importController.current?.abort();importController.current=controller;setBusyImport(true);setLeftOpen(false);setRightOpen(false);
    try {
      if(files.reduce((sum,f)=>sum+f.size,0)>MAX_IMPORT_BYTES)throw new Error(t("Максимум 128 МиБ на импорт","Maximum import size: 128 MiB"));
      if(files.reduce((sum,f)=>sum+f.size,0)>20*1024*1024 && !confirm(t("Большой файл (больше 20 МиБ). Чтение может занять время. Продолжить?","Large file (over 20 MiB). Reading may take a while. Continue?")))return;
      if(format==="native"&&files.length!==1)throw new Error(t("Откройте один файл проекта","Open one project file"));
      const data=await Promise.all(files.map(async f=>({name:f.name,text:await f.text()})));
      if(controller.signal.aborted)return;
      let next:Graph,warnings:string[]=[],decodedBytes=files.reduce((sum,f)=>sum+f.size,0);
      if(format==="drawio"||format==="canvas"||format==="bpmn"){
        next=source;let remaining=MAX_IMPORT_BYTES;
        for(const f of data){const imported=format==="drawio"?await parseDrawio(f.text,f.name,remaining):format==="canvas"?parseCanvas(f.text,f.name):parseBpmn(f.text,f.name);remaining-=imported.decodedBytes;if(remaining<0)throw new Error(t("Суммарно больше 128 МиБ","More than 128 MiB in total"));next=appendDrawio(next,[imported]);warnings.push(...imported.warnings);if(controller.signal.aborted)return;}
        decodedBytes=MAX_IMPORT_BYTES-remaining;
        warnings=[...new Set(warnings)];
      }else{
        let result:LoadResult|undefined;
        if(format==="native"&&data[0].text.length>1024*1024){
          try{result=await runBackground<LoadResult>({kind:"load",text:data[0].text},controller.signal);}
          catch(error){if(!(error instanceof BackgroundUnavailable))throw error;}
        }
        result??=loadGraph(format==="csv"?csvGraph(data):JSON.parse(data[0].text));
        if(!result.graph)throw new Error(result.errors.join("\n"));next=result.graph;
      }
      if(controller.signal.aborted)return;
      if(decodedBytes>20*1024*1024&&files.reduce((n,f)=>n+f.size,0)<=20*1024*1024&&!confirm(t("После распаковки больше 20 МиБ. Открыть предпросмотр?","Expanded data exceeds 20 MiB. Open preview?")))return;
      if(graphNow.current!==source)throw new Error(t("Проект изменился во время чтения файла. Повторите импорт.","The project changed while reading the file. Please import again."));
      const definitions=next.types?Object.values(next.types).reduce((n,list)=>n+list.length,0):0;
      if((next.nodes.length>10000||next.edges.length>50000||next.sheets.length>1000||definitions>2000) && !confirm(t(`Огромный проект: ${next.nodes.length} узлов, ${next.edges.length} связей, ${next.sheets.length} листов, ${definitions} определений. Открыть предпросмотр?`,`Very large project: ${next.nodes.length} nodes, ${next.edges.length} relations, ${next.sheets.length} sheets, ${definitions} definitions. Open preview?`)))return;
      setPreview({graph:next,source,append:["drawio","canvas","bpmn"].includes(format),warnings,title:data.map(f=>f.name).join(", ")});setImportErrors([]);
    }catch(e){if(!controller.signal.aborted){setImportErrors([(e as Error).message]);setPanel("lint");setRightOpen(true);}}
    finally{if(importController.current===controller){importController.current=null;setBusyImport(false);}}
  };
  const reset = (source: () => Graph = demo) => {
    if (!confirm(t("Заменить текущую карту демонстрационным набором? Предыдущую можно вернуть кнопкой «Отменить».","Replace this map with the demo? Undo can restore the previous map."))) return;
    const g = source();
    activateProject(g);
    setSelectedRaw(null);
    setSheetA(g.sheets[0].id);
    setSpreadSheets(g.sheets.slice(0,spreadCount).map((s)=>s.id));
    setViews({}); setImportErrors([]);
    setStackState(initialStack(g));
    fit();
  };

  // ---------- производные для холстов ----------
  const lintItems = useMemo(() => lint(graph, idx), [graph, idx]);
  const errs = lintItems.filter((i) => i.level === "error").length;
  const warns = lintItems.filter((i) => i.level === "warn").length;
  const crossEdges = useMemo(() => graph.edges.filter((e) => isCross(e, idx)).length, [graph, idx]);
  const colorOf = (n: GNode) => idx.sheetById.get(n.sheets[0])?.color ?? "#64748b";
  const sheetName = (id: string) => displayName(idx.sheetById.get(id)?.name ?? id);

  // Per-sheet derived data is cached per graph version: renders that do not edit
  // the graph (selection, panels, camera commits) reuse the same arrays.
  const placedOn = useMemo(() => {
    const cache = new Map<string, Placed[]>();
    return (sid: string): Placed[] => {
      let v = cache.get(sid);
      if (!v) { v = (idx.bySheet.get(sid) ?? []).map((n) => ({ node: n, x: n.pos[sid].x, y: n.pos[sid].y })); cache.set(sid, v); }
      return v;
    };
  }, [idx]);
  const localEdges = useMemo(() => {
    const cache = new Map<string, GEdge[]>();
    return (sid: string) => {
      let v = cache.get(sid);
      if (!v) {
        v = viewGraph.edges.filter((e) => {
          const f = idx.nodeById.get(e.from),
            t = idx.nodeById.get(e.to);
          return f && t && f.sheets.includes(sid) && t.sheets.includes(sid);
        });
        cache.set(sid, v);
      }
      return v;
    };
  }, [viewGraph.edges, idx]);
  const stubsOn = useMemo(() => {
    const cache = new Map<string, Stub[]>();
    return (sid: string): Stub[] => {
      if (!showStubs) return [];
      let v = cache.get(sid);
      if (!v) { v = stubsForSheet(viewGraph, viewIdx, sid, sizes); cache.set(sid, v); }
      return v;
    };
  }, [viewGraph, viewIdx, sizes, showStubs]);
  const onStubClick = (st: Stub) => {
    if (linking && selected) {
      addEdge(selected, st.node.id);
      setLinking(false);
      select(st.node.id);
    } else goNode(st.node.id, st.node.sheets[0]);
  };
  // The three views built from a prepared array (single sheet, spread panes, All-to-1)
  // receive already-filtered data, so SheetCanvas never sees a hidden object. Filtering
  // sits on top of the memoised caches, so it re-runs only over what a sheet actually holds.
  // In dim mode nothing is removed here: SheetCanvas receives the sets through `muted` instead.
  const hideNodes=dimFiltered?null:visibleNodeIds,hideEdges=dimFiltered?null:visibleEdgeIds;
  const filterPlaced=useCallback((list:Placed[])=>hideNodes?list.filter(q=>hideNodes.has(q.node.id)):list,[hideNodes]);
  const filterEdges=useCallback((list:GEdge[])=>hideEdges?list.filter(e=>hideEdges.has(e.id)):list,[hideEdges]);
  const filterStubs=useCallback((list:Stub[])=>{
    if(!hideNodes&&!hideEdges)return list;
    const out:Stub[]=[];
    for(const s of list){
      if(hideNodes&&!hideNodes.has(s.node.id))continue;
      const edges=hideEdges?s.edges.filter(e=>hideEdges.has(e.id)):s.edges;
      if(!edges.length)continue;
      out.push(edges===s.edges?s:{...s,edges});
    }
    return out;
  },[hideNodes,hideEdges]);
  const muted=useMemo(()=>dimFiltered&&(visibleNodeIds||visibleEdgeIds)?{nodes:visibleNodeIds,edges:visibleEdgeIds}:undefined,[dimFiltered,visibleNodeIds,visibleEdgeIds]);
  // Per-sheet filtered arrays keep their identity between renders that do not change the
  // graph or the filter (camera commits, selection), like the unfiltered caches above.
  const shownOn=useMemo(()=>{
    const cache=new Map<string,{placed:Placed[];edges:GEdge[];stubs:Stub[]}>();
    return (sid:string)=>{
      let v=cache.get(sid);
      if(!v){v={placed:filterPlaced(placedOn(sid)),edges:filterEdges(localEdges(sid)),stubs:filterStubs(stubsOn(sid))};cache.set(sid,v);}
      return v;
    };
  },[placedOn,localEdges,stubsOn,filterPlaced,filterEdges,filterStubs]);

  // The status bar counts the whole project and, on a sheet or spread, the sheets on screen.
  const filterSummary=useMemo<FilterSummary>(()=>{
    const pinned=predicate&&visibleNodeIds?graph.nodes.filter(n=>pins.nodes.has(n.id)&&!predicate(n)).length:0;
    const base={shown:graph.nodes.length-hiddenNodeCount,total:graph.nodes.length,hiddenEdges:hiddenEdgeCount,pinned};
    if(!visibleNodeIds)return base;
    // The overview shows every sheet, so its own number is how many sheets still hold something.
    if(mode==="board"||mode==="contents")return sheetHits?{...base,scope:{label:mode==="contents"?t("листов в оглавлении","sheets in contents"):t("листов с узлами","sheets with nodes"),shown:sheetHits.size,total:graph.sheets.length}}:base;
    const on=mode==="spread"?visibleSpread:mode==="stack"?stack.ids:mode==="sheet"?[sheetA]:null;
    if(!on)return base;
    const ids=new Set<string>();for(const sid of on)for(const n of idx.bySheet.get(sid)??[])ids.add(n.id);
    let shown=0;for(const id of ids)if(visibleNodeIds.has(id))shown++;
    return {...base,scope:{label:mode==="spread"?t("в развороте","in spread"):mode==="stack"?t("в стопке","in stack"):t("на листе","on sheet"),shown,total:ids.size}};
  },[graph.nodes,graph.sheets.length,hiddenNodeCount,hiddenEdgeCount,pins,predicate,visibleNodeIds,sheetHits,mode,visibleSpread,stack.ids,sheetA,idx,t]);
  const header = (sid: string) => {
    const s = idx.sheetById.get(sid);
    if (!s) return null;
    const c = idx.bySheet.get(sid)?.length ?? 0;
    const loss = notationLoss(graph, s);
    return (
      <div className="sheet-caption pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
        <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
        <button className="text-[13px] font-semibold text-slate-800 hover:underline" onClick={() => { setSheetA(sid); setPanel("sheet"); if (compact) setRightOpen(true); }}>
          {displayName(s.name)}
        </button>
        <span className="text-[11px] text-slate-500">{typeLabel(sheetTypes.find(k=>k.id===notationFor(s,registry).id)??sheetTypes[0])}</span>
        <span className="rounded bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600" title={t("узлов на листе","nodes on the sheet")}>
          {c}
        </span>
        {(loss.nodes > 0 || loss.edges > 0) && <span className="text-[12px] text-amber-800">{t("Вне вида: ")}{loss.nodes}{t(" узл. · ")}{loss.edges}{t(" связ.")}</span>}
      </div>
    );
  };

  const actions: Actions = { manageAttributes:()=>{setTypeTab("attributes");openDialog("types");}, updateNode, addMembership, removeMembership, deleteNode, updateEdge, deleteEdge, startLink: () => { setLinking(true); setRightOpen(false); }, goNode, goSheet, updateSheet, deleteSheet, spreadSheet: spreadSheetBy };
  const selNode = selected ? idx.nodeById.get(selected) : undefined;
  const curSheet = idx.sheetById.get(mode === "stack" ? stack.ids[stack.focus] ?? sheetA : sheetA);

  const canvasProps = (sid: string) => ({
    sizes,
    observe,
    selected,
    onSelect: (id: string | null) => { if (sid !== "__flat") setSheetA(sid); onSelectFromCanvas(id); },
    linking,
    hybrid,
    showBody,
    expanded,
    onToggleBody:(id:string)=>{setExpanded((old)=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});setSelectedRaw(id);setPanel("node");},
    onEditNode:updateNode,
    onManageAttributes:()=>{setTypeTab("attributes");openDialog("types");},
    colorOf,
    sheetName,
    extraOf: (n: GNode) => n.sheets.length - 1,
    fitTick,
    view: viewOf(sid),
    setView: viewSetters[sid] ?? setViewFor(sid),
    onMove: (id: string, x: number, y: number) => moveNode(id, sid, x, y),
    onCreate: (x: number, y: number) => createNode(sid, x, y),
    onStubClick,
    header: header(sid),
    sheet: idx.sheetById.get(sid),
    muted,
  });

  const zoomBy = (m: number) => {
    const k = mode === "flat" ? "__flat" : sheetA;
    const el = document.getElementById(`canvas-${k}`);
    // A gesture may still be settling inside the canvas; its live camera is on the element.
    const live = el?.dataset.viewK ? { x: Number(el.dataset.viewX), y: Number(el.dataset.viewY), k: Number(el.dataset.viewK) } : undefined;
    const v = live && [live.x, live.y, live.k].every(Number.isFinite) ? live : viewOf(k);
    const cw = el?.clientWidth ?? 800,
      ch = el?.clientHeight ?? 600;
    const nk = Math.max(0.15, Math.min(2.5, v.k * m));
    setViewFor(k)({ x: cw / 2 - ((cw / 2 - v.x) / v.k) * nk, y: ch / 2 - ((ch / 2 - v.y) / v.k) * nk, k: nk });
  };

  const openOverviewSheet=(sid:string,nid?:string)=>{
    setSheetA(sid);changeMode("sheet");setSelectedRaw(nid??null);setPanel(nid?"node":"sheet");
  };
  const moveOnOverview=(sid:string,pos:Pos,positions:Map<string,Pos>)=>replaceGraph(moveOverviewSheet(graph,sid,pos,positions));
  const moveNodeOnOverview=(nid:string,sid:string,pos:Pos)=>replaceGraph(moveOverviewNode(graph,nid,sid,pos));
  const moveFlatNode=(id:string,x:number,y:number)=>setGraph(g=>({...g,flatPositions:{...Object.fromEntries(flatLayout),...g.flatPositions,[id]:{x,y}}}));

  // ---------- рендер ----------
  return (
    <SearchHighlightProvider value={filter.search}><div inert={addOpen||dialog!==null||preview!==null||busyImport||optimizing!==null} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-slate-800" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="workspace-titlebar"><span className="workspace-wordmark" title="PlyLoom 0.8.0">PlyLoom<span className="workspace-version">0.8</span><span> / {t("карта знаний","knowledge map")}</span></span><h1 title={displayName(graph.title)}>{displayName(graph.title)}</h1><div className="language-switch" role="group" aria-label="Interface language / Язык интерфейса"><button lang="ru" aria-pressed={locale==="ru"} onClick={()=>setLocale("ru")}>RU</button><button lang="en" aria-pressed={locale==="en"} onClick={()=>setLocale("en")}>ENG</button></div></div>
      <WorkspaceToolbar mode={mode} panels={drawers} onMode={changeMode} saveStatus={saveStatus} canUndo={canUndo} canRedo={canRedo} undo={undoAndFit} redo={redoAndFit}
        onProject={()=>openDialog("project")} onOpen={()=>fileRef.current?.click()} onSave={exportJson} onCanvasImport={()=>canvasImportRef.current?.click()} onBpmnImport={()=>bpmnRef.current?.click()} onDrawioImport={()=>drawioRef.current?.click()} onDrawioExport={()=>openDialog("drawio-export")}
        onCsv={()=>csvRef.current?.click()} onCanvas={()=>{download(`${slug()}.canvas`,JSON.stringify(toCanvas(graph),null,2));say(t("Canvas создаёт отдельные карточки для появлений узла. Для продолжения работы сохраните .plyloom.","Canvas exports appearances as separate cards. Keep .plyloom to continue editing."));}} onTree={exportTree} onDemo={software=>reset(software?()=>makeSoftwareDemo(locale):demo)}
        onTypes={()=>{setTypeTab("sheets");openDialog("types");}} onVisibility={()=>openDialog("visibility")} onFilter={()=>{setLeftOpen(false);setRightOpen(false);if(mode==="generate"||mode==="faq")changeMode("sheet");setFilterOpen(o=>!(o&&mode!=="generate"&&mode!=="faq"));}} filterOpen={filterOpen&&mode!=="generate"&&mode!=="faq"} filterCount={conditionCount} onSheet={addSheet} onNode={()=>openAdd()} onRelation={()=>openDialog("relation")} canRelate={graph.nodes.length>=2}
        onSheets={()=>{setRightOpen(false);setLeftOpen(true);}} onProperties={()=>{setLeftOpen(false);setRightOpen(true);}} onCheck={()=>{setPanel("lint");setRightOpen(true);setLeftOpen(false);}} issues={errs+warns}/>
      <input ref={fileRef} data-import="native" type="file" accept=".plyloom,.plyra,.json,application/json" className="hidden" onChange={e=>{const files=[...(e.target.files??[])];e.target.value="";if(files.length)void importFiles(files,"native");}}/>
      <input ref={canvasImportRef} data-import="canvas" type="file" multiple accept=".canvas,application/json" className="hidden" onChange={e=>{const files=[...(e.target.files??[])];e.target.value="";if(files.length)void importFiles(files,"canvas");}}/>
      <input ref={bpmnRef} data-import="bpmn" type="file" multiple accept=".bpmn,.xml,application/xml" className="hidden" onChange={e=>{const files=[...(e.target.files??[])];e.target.value="";if(files.length)void importFiles(files,"bpmn");}}/>
      <input ref={drawioRef} data-import="drawio" type="file" multiple accept=".drawio,.xml,application/xml,text/xml" className="hidden" onChange={e=>{const files=[...(e.target.files??[])];e.target.value="";if(files.length)void importFiles(files,"drawio");}}/>
      <input ref={csvRef} data-import="csv" type="file" multiple accept=".csv,text/csv" className="hidden" onChange={e=>{const files=[...(e.target.files??[])];e.target.value="";if(files.length)void importFiles(files,"csv");}}/>

      <div className="relative flex min-h-0 flex-1">
        {/* левая панель */}
        {(
          <aside ref={leftRef} aria-label={t("Листы")} inert={drawers && !leftOpen} role={drawers && leftOpen ? "dialog" : undefined} aria-modal={drawers && leftOpen ? true : undefined}
            className={cn(
              "z-30 flex shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white",
              drawers ? "fixed inset-y-0 left-0 w-[84vw] max-w-[320px] transition-transform" : "static w-[196px]",
              drawers && !leftOpen && "-translate-x-full",
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Листы")}</span>
              <div className="flex gap-1">
                <button onClick={addSheet} className="rounded border border-slate-300 px-1.5 text-[12px] hover:bg-slate-100" aria-label={t("Добавить лист")}>
                  +
                </button>
                <button onClick={() => setLeftOpen(false)} className={cn("rounded px-1.5 text-[14px]",!drawers&&"hidden")} aria-label={t("Закрыть")}>
                  ×
                </button>
              </div>
            </div>
            <ul className="px-1.5">
              {graph.sheets.map((s) => {
                const c = idx.bySheet.get(s.id)?.length ?? 0;
                const active = mode === "spread" ? visibleSpread.includes(s.id) : mode === "stack" ? stack.ids[stack.focus] === s.id : s.id === sheetA;
                return (
                  <li key={s.id} className={cn("mb-0.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px]", active && "bg-slate-100")}>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() => {
                        if (mode === "stack") {
                          setStack((st) => {
                            const order = graph.sheets.map((x) => x.id);
                            const ids = st.ids.includes(s.id) ? st.ids : order.filter((x) => st.ids.includes(x) || x === s.id);
                            return { ...st, ids, focus: ids.indexOf(s.id) };
                          });
                          setSheetA(s.id);
                          setPanel("sheet");
                          setLeftOpen(false);
                        } else goSheet(s.id);
                      }}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{displayName(s.name)}</span>
                        <span className="block truncate text-[10px] text-slate-500">{typeLabel(sheetTypes.find(k=>k.id===notationFor(s,registry).id)??sheetTypes[0])}</span>
                      </span>
                    </button>
                    <span className="shrink-0 tabular-nums text-[10.5px] text-slate-500" title={t("узлов на листе","nodes on the sheet")}>
                      {c}
                    </span>
                    {mode === "spread" && active && <span className="pane-slot-badge">{visibleSpread.indexOf(s.id)+1}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto border-t border-slate-200 px-3 py-2 text-[10.5px] text-slate-500">
              <div>{graph.nodes.length}{t(" узлов · ")}{graph.edges.length}{t(" связей")}</div>
              <div>{crossEdges}{t(" межлистовых · ")}{graph.nodes.filter((n) => n.sheets.length > 1).length}{t(" на нескольких листах")}</div>
            </div>
          </aside>
        )}
        {drawers && (leftOpen || rightOpen) && (
          <div
            className="drawer-backdrop fixed inset-0 z-20 bg-black/30"
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        )}

        {/* центр */}
        <main className="relative flex min-w-0 flex-1 flex-col" inert={drawers && (leftOpen || rightOpen)}>
          {linking && (
            <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] text-white shadow">{t("Выберите узел или карточку за листом, с которой связать «")}{displayName(selNode?.name)}{t("» · Esc — отмена ")}</div>
          )}
          {toast && <div role="status" className="toast absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-[11px] text-white shadow">{t(toast)}</div>}

          {(mode === "sheet" || mode === "spread") && <SheetNavigation graph={graph} hits={sheetHits} active={sheetA} visible={mode === "spread" ? visibleSpread : [sheetA]} spread={mode === "spread"} count={Math.min(spreadCount,graph.sheets.length)} ratio={spreadRatio} onChoose={goSheet} onCount={(n) => { setSpreadCount(n); setSpreadSheets(reconcileSpread(visibleSpread,graph.sheets,n)); fit(); }} onRatio={setSpreadRatio} onAdd={() => openAdd()} />}
          {mode!=="generate"&&mode!=="faq"&&<FilterPanel graph={graph} filter={filter} setFilter={setFilter} active={conditionCount} mode={filterMode} setMode={setFilterMode} open={filterOpen} setOpen={setFilterOpen} summary={filterSummary} onReset={showAll} onManageAttributes={()=>{setTypeTab("attributes");openDialog("types");}} onFindNext={findNext} recent={recentSearches} onClearRecent={()=>setRecentSearches([])} onViews={()=>openDialog("views")}/>}
          <div className="relative min-h-0 flex-1">
            {mode==="sheet"&&<button className="canvas-level-up" aria-label={t("Выйти к обзору листов","Go to sheet overview")} title={t("Обзор всех листов проекта","See all project sheets")} onClick={()=>changeMode("board")}><b aria-hidden="true">−</b><span>{t("Все листы","All sheets")}</span></button>}
            {mode==="board"&&<OverviewCanvas graph={viewGraph} idx={viewIdx} view={overviewView} onView={setOverviewView} fitTick={fitTick} activeSheet={sheetA} selected={selected} visibleNodeIds={visibleNodeIds} visibleEdgeIds={visibleEdgeIds} dimHidden={dimFiltered} linking={linking} onSheet={sid=>{setSheetA(sid);setPanel("sheet");}} onSelect={(nid,sid)=>{setSheetA(sid);if(linking)onSelectFromCanvas(nid);else select(nid);}} onOpen={openOverviewSheet} onMoveSheet={moveOnOverview} onMoveNode={moveNodeOnOverview}/>}
            {(mode==="generate"||mode==="faq")&&<HelpView page={mode} onImport={()=>fileRef.current?.click()}/>}
            {mode === "sheet" && curSheet && (idx.bySheet.get(sheetA)?.length??0)>0 && (
              <SheetCanvas key={sheetA} id={sheetA} placed={shownOn(sheetA).placed} edges={shownOn(sheetA).edges} stubs={shownOn(sheetA).stubs} {...canvasProps(sheetA)} />
            )}
            {mode==="sheet"&&curSheet&&(idx.bySheet.get(sheetA)?.length??0)===0&&<div className="empty-sheet-guide"><span className="empty-sheet-kicker">{displayName(curSheet.name)}</span><h2>{t("Лист пока пустой","This sheet is empty")}</h2><p>{t("Соберите первую схему: добавьте два узла и свяжите их. Другие листы помогут показать разные стороны проекта.","Build your first diagram: add two nodes and connect them. Add sheets to show other sides of the project.")}</p><ol><li><span>1</span><div><b>{t("Добавьте узел","Add a node")}</b><small>{t("Требование, документ, компонент или заметку","A requirement, document, component or note")}</small></div><button className="primary-button" onClick={()=>openAdd()}>{t("Создать узел","Create node")}</button></li><li><span>2</span><div><b>{t("Добавьте другой лист","Add another sheet")}</b><small>{t("Например, «Архитектура» или «Проверки»","For example, Architecture or Verification")}</small></div><button onClick={addSheet}>{t("Создать лист","Create sheet")}</button></li><li><span>3</span><div><b>{t("Соедините узлы","Connect nodes")}</b><small>{t("В том числе с разных листов","Including nodes on different sheets")}</small></div><button disabled={graph.nodes.length<2} onClick={()=>openDialog("relation")}>{t("Создать связь","Create relation")}</button></li></ol><button className="empty-import" onClick={()=>drawioRef.current?.click()}>{t("Или добавить листы из draw.io","Or add sheets from draw.io")}</button></div>}
            {mode === "spread" && (
              <MultiSpread layoutRef={spreadLayoutRef} ids={visibleSpread} active={sheetA} ratio={spreadRatio} compact={compact} selected={selected} graph={viewGraph} idx={viewIdx} sizes={sizes} views={views} fitTick={fitTick} visibleNodeIds={visibleNodeIds} visibleEdgeIds={visibleEdgeIds} dimHidden={dimFiltered} showExternal={showStubs} onShowExternal={(show)=>{setShowStubs(show);fit();}} onMoveSheet={moveSheet}
                onActive={setSheetA} onReplace={chooseSpreadSheet} onAdd={openAdd} onOpen={(sid) => { setSheetA(sid); changeMode("sheet"); }}
                render={(sid,visible,placed,onMove,layoutKey) => <SheetCanvas key={sid} id={sid} placed={filterPlaced(placed)} edges={shownOn(sid).edges} stubs={showStubs?filterStubs(stubsForSheet(viewGraph,viewIdx,sid,sizes,new Map(placed.map((q)=>[q.node.id,{x:q.x,y:q.y}])),visible)):[]} {...canvasProps(sid)} onMove={onMove} layoutKey={layoutKey} maxFitScale={1.8} header={undefined} />}
              />
            )}
            {mode === "stack" && <StackView graph={viewGraph} idx={viewIdx} visibleNodeIds={visibleNodeIds} visibleEdgeIds={visibleEdgeIds} dimHidden={dimFiltered} stack={stack} setStack={setStack} selected={selected} onSelect={select} onOpenSheet={(sid) => { changeMode("sheet"); setSheetA(sid); }} onInspect={(id) => { select(id); setRightOpen(true); setLeftOpen(false); }} />}
            {mode === "contents" && (
              <ContentsView
                graph={viewGraph}
                idx={viewIdx}
                visibleEdgeIds={visibleEdgeIds}
                visibleNodeIds={visibleNodeIds}
                dimHidden={dimFiltered}
                compact={compact}
                onOpenSheet={goSheet}
                onOpenSpread={(a, b) => {
                  setSheetA(a);
                  changeMode("spread");
                  setSpreadCount(2);
                  setSpreadSheets([a,b]);
                }}
              />
            )}
            {mode === "flat" && <AllToOne graph={viewGraph} layout={flatLayout} filterPlaced={filterPlaced} filterEdges={filterEdges} onMove={moveFlatNode} canvasProps={canvasProps} view={viewOf("__flat")} setView={viewSetters.__flat} />}
          </div>

          {(mode === "sheet" || mode === "spread" || mode === "flat") && (
            <div className="canvas-toolbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-1 text-[11px]" style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}>
              <Btn className="optimize-button" disabled={graph.nodes.length<2} onClick={()=>void optimize()} title={t("Развести карточки и уменьшить пересечения линий. Разворот учитывает открытые слои и связи между ними. Действие можно отменить.","Separate cards and reduce crossing lines. Spreads include open layers and their connections. This action can be undone.")}>{t("Оптимизировать расположение","Optimize layout")}</Btn>
              <Btn onClick={() => zoomBy(1 / 1.2)} aria-label={t("Уменьшить")}>−</Btn>
              <Btn onClick={() => zoomBy(1.2)} aria-label={t("Увеличить")}>+</Btn>
              <Btn onClick={fit}>{t("вписать")}</Btn>
              <Btn onClick={() => { setPanel("sheet"); setRightOpen(true); setLeftOpen(false); }}>{t("Читать лист")}</Btn>
              <span className="ml-auto hidden text-slate-400 sm:inline">
                {t(mode === "flat" ? "Все на один лист · отдельное расположение" : "двойной клик — новый узел · drag — перенос · колесо — панорама · Ctrl+колесо — зум")}
              </span>
            </div>
          )}
        </main>

        {/* правая панель */}
        <aside ref={rightRef} aria-label={t("Свойства карты")} inert={drawers && !rightOpen} role={drawers && rightOpen ? "dialog" : undefined} aria-modal={drawers && rightOpen ? true : undefined}
          className={cn(
            "z-30 flex shrink-0 flex-col border-l border-slate-200 bg-white",
            drawers ? "fixed inset-y-0 right-0 w-[90vw] max-w-[360px] transition-transform" : "static w-[300px]",
            drawers && !rightOpen && "translate-x-full",
          )}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-2 py-1.5 text-[11px]">
            {(["node", "sheet", "lint"] as const).map((p) => (
              <button key={p} aria-pressed={panel === p} onClick={() => setPanel(p)} className={cn("rounded px-2 py-0.5", panel === p ? "bg-slate-800 text-white" : "hover:bg-slate-100")}>
                {t(p === "node" ? "узел" : p === "sheet" ? "лист" : "lint")}
              </button>
            ))}
            <button onClick={() => setRightOpen(false)} className={cn("ml-auto rounded px-1.5 text-[14px]",!drawers&&"hidden")} aria-label={t("Закрыть")}>
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {panel === "node" &&
              (selNode ? (
                <NodePanel node={selNode} graph={graph} idx={idx} a={actions} stackIds={stack.ids} mode={mode} />
              ) : (
                <div className="p-4 text-[12px] text-slate-500">{t("Выберите узел на листе. Новый узел можно добавить через «+ Узел» или двойным кликом по пустому месту.")}</div>
              ))}
            {panel === "sheet" && (curSheet ? <SheetPanel sheet={curSheet} graph={graph} idx={idx} a={actions} /> : <div className="p-4 text-[12px] text-slate-500">{t("Нет листов")}</div>)}
            {panel === "lint" && importErrors.length > 0 && <div role="alert" className="m-3 rounded border border-red-300 bg-red-50 p-3 text-sm"><b>{t("Импорт отклонён. Текущая карта сохранена.")}</b><ul>{importErrors.slice(0, 20).map((e, i) => <li key={i}>{t(e)}</li>)}</ul><button onClick={() => setImportErrors([])}>{t("Закрыть сообщение")}</button></div>}
            {panel === "lint" && (
              <LintPanel
                items={lintItems}
                graph={graph}
                onGo={(it: LintItem) => {
                  if (it.nodeId) goNode(it.nodeId, it.sheetId ?? idx.nodeById.get(it.nodeId)?.sheets[0] ?? sheetA);
                  else if (it.sheetId) goSheet(it.sheetId);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
    {dialog==="project"&&<NewProjectDialog onClose={()=>setDialog(null)} onSave={exportJson} onCreate={(title,sheet)=>{activateProject(emptyProject(title,sheet));setDialog(null);say(t("Пустой проект создан. Добавьте первый узел.","Empty project created. Add your first node."));}}/>}
    {dialog==="sheet"&&<NewSheetDialog onClose={()=>setDialog(null)} onCreate={(name,type,tags)=>{createSheet(name,type,tags);setRightOpen(false);setDialog(null);}}/>}
    {dialog==="relation"&&<NewRelationDialog graph={graph} selected={selected} onClose={()=>setDialog(null)} onCreate={edge=>{const created={...edge,id:uid("e_")};replaceGraph({...graph,edges:[...graph.edges,created]});setDialog(null);if(!pinEdge(created,idx.nodeById.get(edge.from),idx.nodeById.get(edge.to)))say(t("Связь создана. Её можно изменить в свойствах узла.","Relation created. Edit it in the node's properties."));}}/>}
    {dialog==="views"&&<SavedViewsDialog views={graph.savedViews??[]} smartSheet={idx.sheetById.get(sheetA)?.smartFilter?idx.sheetById.get(sheetA):undefined} onClose={()=>setDialog(null)} onApply={applySavedView}
      onSave={name=>{replaceGraph({...graph,savedViews:[...(graph.savedViews??[]),currentView(uid("view_"),name)]});say(t("Вид сохранён в проекте","View saved in the project"));}}
      onRename={(id,name)=>setGraph(g=>({...g,savedViews:g.savedViews?.map(v=>v.id===id?{...v,name}:v)}))}
      onUpdate={id=>setGraph(g=>({...g,savedViews:g.savedViews?.map(v=>v.id===id?currentView(id,v.name):v)}))}
      onDelete={id=>setGraph(g=>({...g,savedViews:g.savedViews?.filter(v=>v.id!==id)}))}
      onSmart={createSmartSheet} onUpdateSmart={()=>{updateSheet(sheetA,{smartFilter:structuredClone({...filter,hiddenEdgeTypes:[]})});setDialog(null);setFilter(EMPTY_FILTER);fit();}}/>}
    {dialog==="types"&&<TypeManager initialTab={typeTab} graph={graph} onClose={()=>setDialog(null)} onSave={(types,sheets)=>{replaceGraph({...graph,version:3,types,sheets});setDialog(null);say(t("Типы сохранены в проекте","Types saved in the project"));}}/>}
    {dialog==="visibility"&&<VisibilityDialog hybrid={hybrid} setHybrid={setHybrid} body={showBody} setBody={setShowBody} external={showStubs} setExternal={v=>{setShowStubs(v);fit();}} onFilter={()=>{setDialog(null);setFilterOpen(true);}} onClose={()=>setDialog(null)}/>}
    {dialog==="drawio-export"&&<Modal title={t("Экспорт в draw.io","Export to draw.io")} onClose={()=>setDialog(null)}><p className="modal-intro">{t("Каждый лист станет страницей draw.io, узлы — редактируемыми фигурами. Связи с другими листами получат внешние карточки. Оформление и размеры карточек преобразуются; это не резервная копия проекта.","Each sheet becomes a draw.io page with editable shapes. Cross-sheet relations use external reference cards. Card styling and sizes are converted; this is not a project backup.")}</p><p className="field-help">{t("Для продолжения работы без потерь сохраните также файл .plyloom.","Also save .plyloom to continue your work without losing project details.")}</p><footer><button onClick={exportJson}>{t("Скачать .plyloom","Download .plyloom")}</button><button className="primary" onClick={()=>{download(`${slug()}.drawio`,exportDrawio(graph),"application/xml;charset=utf-8");setDialog(null);}}>{t("Скачать .drawio","Download .drawio")}</button></footer></Modal>}
    {preview&&<Modal title={preview.append?t("Добавить листы draw.io","Add draw.io sheets"):t("Открыть проект","Open project")} onClose={()=>setPreview(null)}><p className="modal-intro">{preview.title}</p><dl className="import-summary"><div><dt>{t("Листов","Sheets")}</dt><dd>{preview.graph.sheets.length-(preview.append?preview.source.sheets.length:0)}</dd></div><div><dt>{t("Узлов","Nodes")}</dt><dd>{preview.graph.nodes.length-(preview.append?preview.source.nodes.length:0)}</dd></div><div><dt>{t("Связей","Relations")}</dt><dd>{preview.graph.edges.length-(preview.append?preview.source.edges.length:0)}</dd></div></dl><p>{preview.append?t("Новые листы добавятся в текущий проект. Одинаковые названия не объединяются автоматически.","New sheets will be added to the current project. Matching names are not merged automatically."):t("Этот файл заменит текущий проект целиком. Прежний доступен через «Отменить» до перезагрузки страницы.","This file replaces the entire current project. Undo can restore it until the page is reloaded.")}</p>{preview.warnings.length>0&&<ul className="import-warnings">{preview.warnings.map((w,i)=><li key={i}>{t(w)}</li>)}</ul>}<footer><button onClick={exportJson}>{t("Скачать текущий .plyloom","Download current .plyloom")}</button><button onClick={()=>setPreview(null)}>{t("Отмена","Cancel")}</button><button className="primary" onClick={()=>{if(graphNow.current!==preview.source){setPreview(null);say(t("Проект изменился. Повторите импорт.","Project changed. Please import again."));return;}const first=preview.graph.sheets[preview.append?preview.source.sheets.length:0]?.id;activateProject(preview.graph,first,!preview.append);setPreview(null);say(t("Готово. Действие можно отменить.","Done. You can undo this action."));}}>{preview.append?t("Добавить листы","Add sheets"):t("Открыть и заменить","Open and replace")}</button></footer></Modal>}
    {busyImport&&<Modal title={t("Импорт","Import")} onClose={()=>{importController.current?.abort();setBusyImport(false);}}><p role="status">{t("Читаем и проверяем файл…","Reading and validating the file…")}</p><button onClick={()=>{importController.current?.abort();setBusyImport(false);}}>{t("Отмена","Cancel")}</button></Modal>}
    {optimizing!==null&&<div className="layout-progress-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="layout-progress-title" className="layout-progress" onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(optimization.current){optimization.current.cancel=true;optimization.current.abort.abort();}}if(e.key==="Tab"){e.preventDefault();cancelLayoutRef.current?.focus();}}}>
      <b id="layout-progress-title">{t("Расставляем ноды…","Arranging nodes…")}</b><p role="status">{t(`Проверено вариантов: ${optimizing}`,`Arrangements checked: ${optimizing}`)}</p><p>{t("Ищем меньше пересечений и проходов через карточки.","Looking for fewer crossings and edges through cards.")}</p><button ref={cancelLayoutRef} onClick={()=>{if(optimization.current){optimization.current.cancel=true;optimization.current.abort.abort();}}}>{t("Прервать расчёт","Cancel calculation")}</button>
    </div></div>}{addOpen && <AddNodeDialog graph={graph} sheetId={sheetA} onClose={() => setAddOpen(false)} onCreate={(name,kind,sid,body) => { goSheet(sid); createNode(sid,undefined,undefined,{name,kind,body}); setAddOpen(false);setRightOpen(false);fit(); }} />}</SearchHighlightProvider>
  );
}

// ---------- Все на один лист: independent layout of the same entities ----------
type CanvasBase = Omit<React.ComponentProps<typeof SheetCanvas>, "id" | "placed" | "edges" | "stubs">;
function AllToOne({ graph, layout, canvasProps, view, setView, onMove, filterPlaced, filterEdges }: { graph: Graph; layout:Map<string,Pos>;onMove:(id:string,x:number,y:number)=>void;canvasProps: (sid: string) => CanvasBase; view: View; setView: (v: View) => void; filterPlaced:(list:Placed[])=>Placed[]; filterEdges:(list:GEdge[])=>GEdge[] }) {
  const {t}=useI18n();

  const placed: Placed[] = filterPlaced(graph.nodes.map((n) => {
    const p = layout.get(n.id) ?? { x: 0, y: 0 };
    return { node: n, x: p.x, y: p.y };
  }));
  const props = canvasProps("__flat");
  return (
    <SheetCanvas
      {...props}
      id="__flat"
      placed={placed}
      edges={filterEdges(graph.edges)}
      stubs={[]}
      view={view}
      setView={setView}
      onMove={onMove}
      onCreate={undefined}
      header={
        <div className="all-to-one-note pointer-events-auto rounded-lg border border-violet-200 bg-white/95 px-3 py-1.5 text-[12px] text-slate-600 shadow-sm">
          <b>{t("Все на один лист","All-to-1")}</b> · {graph.nodes.length}{t(" узлов · ")}{graph.edges.length}{t(" связей. ")}<span>{t("Каждая сущность один раз. Расположение отдельное; текст и атрибуты общие с листами.","Each entity appears once. Positions are independent; text and attributes are shared with sheets.")}</span></div>
      }
    />
  );
}

function Btn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cn("shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-100", p["aria-pressed"] && "border-emerald-600 bg-emerald-50 text-emerald-800", p.className)} />;
}
