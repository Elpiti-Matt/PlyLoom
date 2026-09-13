import { boundsOfPoints, intersects } from "../lib/spatial";
import { useSceneViewport } from "./useSceneViewport";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mutedAttr } from "../lib/nodeFilter";
import type { GNode, Graph, Pos, View } from "../model/types";
import { clamp, edgePath, type Index } from "../lib/graph";
import { routedPath } from "../lib/appearance";
import { overviewRoutes } from "../lib/spreadGraph";
import { OVERVIEW, clampOverviewNode, fitOverview, overviewContent, overviewNodeSize, overviewPositions, type OverviewContent } from "../lib/overviewLayout";
import { LINE_STYLE } from "../lib/lineStyles";
import { useI18n } from "../lib/i18n";
import { useTypes } from "../lib/TypeContext";
import { sheetTypeId } from "../lib/typeRegistry";
import { ConnectionLegend } from "./ConnectionLegend";
import { NotationShape } from "./NotationShape";

interface Props {
 graph:Graph;idx:Index;view:View|null;onView:(v:View)=>void;fitTick:number;
 activeSheet:string;selected:string|null;visibleNodeIds:Set<string>|null;visibleEdgeIds:Set<string>|null;dimHidden?:boolean;linking:boolean;
 onSheet:(sid:string)=>void;onSelect:(nid:string,sid:string)=>void;onOpen:(sid:string,nid?:string)=>void;
 onMoveSheet:(sid:string,pos:Pos,positions:Map<string,Pos>)=>void;onMoveNode:(nid:string,sid:string,pos:Pos)=>void;
}
interface Preview {kind:"sheet"|"node";sid:string;nid?:string;pos:Pos}
interface Gesture {
 kind:"pan"|"pinch"|"sheet"|"node";pointer:number;start:Pos;view:View;moved:boolean;source:Graph;
 sid?:string;nid?:string;origin?:Pos;content?:OverviewContent;positions?:Map<string,Pos>;distance?:number;
}
function lines(text:string,width:number,max=3){
 const cap=Math.max(5,Math.floor(width/7.4)),words=text.replace(/\s+/g," ").trim().split(" "),out:string[]=[];let line="";
 for(const word of words){if(line&&(line+" "+word).length>cap){out.push(line);line=word;}else line+=(line?" ":"")+word;}
 if(line)out.push(line);return out.slice(0,max).map((s,i)=>s.length>cap?s.slice(0,cap-1)+"…":i===max-1&&out.length>max?s.slice(0,cap-1)+"…":s);
}

export function OverviewCanvas(p:Props){
 const {t,name,locale}=useI18n(),{registry,nodeType,edgeType,label}=useTypes(),uid=useId().replace(/:/g,"");
 const wrap=useRef<HTMLDivElement>(null),[size,setSize]=useState({w:1000,h:600});
 const [external,setExternal]=useState(true),[identities,setIdentities]=useState(true),[selectedOnly,setSelectedOnly]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null),previewRef=useRef<Preview|null>(null);
 // Camera: continuous gestures update the DOM directly and reach React state after a pause; see SheetCanvas.
 const viewRef=useRef<View>(p.view??{x:40,y:40,k:.5}),propView=useRef(p.view);
 if(p.view!==propView.current){propView.current=p.view;viewRef.current=p.view??{x:40,y:40,k:.5};}
 const view=viewRef.current,sceneRef=useRef<SVGGElement>(null),zoomLabel=useRef<HTMLOutputElement>(null),commitTimer=useRef(0);
 const viewport=useSceneViewport(wrap,viewRef.current,p.graph.nodes.length>200||p.graph.sheets.length>25);
 const graphRef=useRef(p.graph);graphRef.current=p.graph;
 const gesture=useRef<Gesture|null>(null),pointers=useRef(new Map<number,Pos>());
 const positions=useMemo(()=>overviewPositions(p.graph),[p.graph.sheets]);
 const positionsRef=useRef(positions);positionsRef.current=positions;
 const ids=useMemo(()=>p.graph.sheets.map(s=>s.id),[p.graph.sheets]);
 const {edges:allRoutes,identities:allShared}=useMemo(()=>overviewRoutes(p.graph,p.idx,ids,selectedOnly?p.activeSheet:undefined),[p.graph,p.idx,ids,selectedOnly,p.activeSheet]);
 // Filtered objects are not drawn at all. Sheet frames and their content scale are still
 // computed from every node, so toggling a filter never moves or rescales what stays visible.
 // In dim mode nothing is removed; objects outside the sets get data-filter-muted instead.
 const mv=p.visibleNodeIds,me=p.visibleEdgeIds,dim=p.dimHidden,vn=dim?null:mv,ve=dim?null:me;
 const routes=useMemo(()=>ve?allRoutes.filter(r=>ve.has(r.edge.id)):allRoutes,[allRoutes,ve]);
 const shared=useMemo(()=>vn?allShared.filter(r=>vn.has(r.node.id)):allShared,[allShared,vn]);
 const shownNodes=useMemo(()=>{
  const out=new Map<string,GNode[]>();
  for(const s of p.graph.sheets){const all=p.idx.bySheet.get(s.id)??[];out.set(s.id,vn?all.filter(n=>vn.has(n.id)):all);}
  return out;
 },[p.graph.sheets,p.idx,vn]);
 // A fixed viewport per membership set prevents a dragged node from moving all its neighbours.
 const cache=useRef(new Map<string,{stamp:string;content:OverviewContent}>());
 const contents=useMemo(()=>new Map(p.graph.sheets.map(s=>{
  const nodes=p.idx.bySheet.get(s.id)??[],stamp=JSON.stringify(nodes.map(n=>[n.id,overviewNodeSize(n,s.id)]));
  if(cache.current.get(s.id)?.stamp!==stamp)cache.current.set(s.id,{stamp,content:overviewContent(nodes,s.id)});
  return [s.id,cache.current.get(s.id)!.content];
 })),[p.graph.sheets,p.idx]);
 // Relations drawn inside each sheet frame, grouped once per graph version instead of filtered per sheet per render.
 const localEdges=useMemo(()=>{
  const out=new Map<string,Graph["edges"]>();
  for(const e of p.graph.edges){if(ve&&!ve.has(e.id))continue;const a=p.idx.nodeById.get(e.from),b=p.idx.nodeById.get(e.to);if(!a||!b)continue;
   for(const sid of a.sheets)if(b.sheets.includes(sid)){let list=out.get(sid);if(!list)out.set(sid,list=[]);list.push(e);}}
  return out;
 },[p.graph.edges,p.idx,ve]);
 const paintView=(v:View)=>{
  viewRef.current=v;sceneRef.current?.setAttribute("transform",`translate(${v.x} ${v.y}) scale(${v.k})`);
  const el=wrap.current;
  if(el){el.dataset.overviewZoom=String(v.k);el.dataset.overviewX=String(v.x);el.dataset.overviewY=String(v.y);
   el.querySelectorAll<HTMLElement>("[data-overview-open]").forEach(b=>{const pos=positionsRef.current.get(b.dataset.overviewOpen!);if(!pos)return;b.style.left=`${v.x+(pos.x+OVERVIEW.width)*v.k-36}px`;b.style.top=`${v.y+pos.y*v.k+4}px`;});}
  if(zoomLabel.current)zoomLabel.current.textContent=`${Math.round(v.k*100)}%`;
 };
 const commitView=()=>{if(!commitTimer.current)return;window.clearTimeout(commitTimer.current);commitTimer.current=0;if(viewRef.current!==propView.current)onViewRef.current(viewRef.current);};
 const commitRef=useRef(commitView);commitRef.current=commitView;
 /** Discrete actions (buttons, keys, fit) commit immediately. */
 const updateView=(v:View)=>{window.clearTimeout(commitTimer.current);commitTimer.current=0;paintView(v);p.onView(v);};
 /** Pan, pinch and wheel: DOM now, React state after a pause. */
 const liveView=(v:View)=>{viewport.onCamera(v);paintView(v);window.clearTimeout(commitTimer.current);commitTimer.current=window.setTimeout(()=>commitRef.current(),160);};
 const liveViewRef=useRef(liveView);liveViewRef.current=liveView;
 useEffect(()=>()=>commitRef.current(),[]);
 const updatePreview=(v:Preview|null)=>{previewRef.current=v;setPreview(v);};
 const fit=()=>updateView(fitOverview(positionsRef.current,wrap.current?.clientWidth||window.innerWidth||size.w,wrap.current?.clientHeight||size.h));
 const fitRef=useRef(fit);fitRef.current=fit;
 useLayoutEffect(()=>{
  const el=wrap.current!;const measure=()=>setSize({w:el.clientWidth||window.innerWidth||1000,h:el.clientHeight||600});
  measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();
 },[]);
 useLayoutEffect(()=>{if(!p.view)fitRef.current();},[p.view,size.w,size.h]);
 const lastFit=useRef(p.fitTick);
 useLayoutEffect(()=>{if(lastFit.current!==p.fitTick){lastFit.current=p.fitTick;fitRef.current();}},[p.fitTick]);
 const onViewRef=useRef(p.onView);onViewRef.current=p.onView;
 useEffect(()=>{
  const el=wrap.current!;
  const wheel=(e:WheelEvent)=>{
   e.preventDefault();if(gesture.current)return;const v=viewRef.current;
   if(e.ctrlKey||e.metaKey){const r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,k=clamp(v.k*Math.exp(-e.deltaY*.002),OVERVIEW.minZoom,OVERVIEW.maxZoom);liveViewRef.current({x:x-(x-v.x)/v.k*k,y:y-(y-v.y)/v.k*k,k});}
   else liveViewRef.current({...v,x:v.x-e.deltaX,y:v.y-e.deltaY});
  };
  el.addEventListener("wheel",wheel,{passive:false});return()=>el.removeEventListener("wheel",wheel);
 },[]);
 const point=(e:React.PointerEvent):Pos=>({x:e.clientX,y:e.clientY});
 const cancel=()=>{gesture.current=null;pointers.current.clear();updatePreview(null);};
 const begin=(e:React.PointerEvent,kind:"pan"|"sheet"|"node",sid?:string,nid?:string)=>{
  if(e.pointerType==="mouse"&&e.button!==0)return;
  e.stopPropagation();e.preventDefault();
  if(p.linking&&nid){p.onSelect(nid,sid!);return;}
  pointers.current.set(e.pointerId,point(e));wrap.current?.setPointerCapture?.(e.pointerId);
  const v=viewRef.current;
  if(pointers.current.size>=2){
   const [a,b]=[...pointers.current.values()],start={x:(a.x+b.x)/2,y:(a.y+b.y)/2};updatePreview(null);
   gesture.current={kind:"pinch",pointer:e.pointerId,start,view:v,moved:true,source:p.graph,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};return;
  }
  if(sid)p.onSheet(sid);if(nid)p.onSelect(nid,sid!);
  gesture.current={kind,pointer:e.pointerId,start:point(e),view:v,moved:false,source:p.graph,sid,nid,origin:kind==="sheet"?positions.get(sid!):nid?p.idx.nodeById.get(nid)!.pos[sid!]:undefined,content:sid?contents.get(sid):undefined,positions};
 };
 const move=(e:React.PointerEvent)=>{
  if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,point(e));const g=gesture.current;if(!g)return;
  if(g.kind==="pinch"){
   const [a,b]=[...pointers.current.values()];if(!a||!b)return;const r=wrap.current!.getBoundingClientRect(),k=clamp(g.view.k*Math.hypot(a.x-b.x,a.y-b.y)/g.distance!,OVERVIEW.minZoom,OVERVIEW.maxZoom);
   liveView({x:(a.x+b.x)/2-r.left-(g.start.x-r.left-g.view.x)/g.view.k*k,y:(a.y+b.y)/2-r.top-(g.start.y-r.top-g.view.y)/g.view.k*k,k});return;
  }
  const dx=e.clientX-g.start.x,dy=e.clientY-g.start.y;if(!g.moved&&Math.hypot(dx,dy)<4)return;g.moved=true;
  if(g.kind==="pan"){liveView({...g.view,x:g.view.x+dx,y:g.view.y+dy});return;}
  if(graphRef.current!==g.source){cancel();return;}
  const scale=g.view.k*(g.kind==="node"?g.content!.k:1),candidate={x:g.origin!.x+dx/scale,y:g.origin!.y+dy/scale};
  const pos=g.kind==="node"?clampOverviewNode(candidate,p.idx.nodeById.get(g.nid!)!,g.sid!,g.content!):{x:clamp(candidate.x,-1e7,1e7),y:clamp(candidate.y,-1e7,1e7)};
  updatePreview({kind:g.kind,sid:g.sid!,nid:g.nid,pos});
 };
 const finish=(e:React.PointerEvent)=>{
  if(e.type==="pointercancel"){cancel();return;}
  pointers.current.delete(e.pointerId);const g=gesture.current;
  if(g?.kind==="pinch"){
   const [remaining]=[...pointers.current.entries()];gesture.current=remaining?{kind:"pan",pointer:remaining[0],start:remaining[1],view:viewRef.current,moved:true,source:p.graph}:null;return;
  }
  if(!g||g.pointer!==e.pointerId)return;
  const change=previewRef.current;gesture.current=null;updatePreview(null);
  if(g.moved&&change&&graphRef.current===g.source){
   if(change.kind==="sheet")p.onMoveSheet(change.sid,change.pos,g.positions!);
   else p.onMoveNode(change.nid!,change.sid,change.pos);
  }
 };
 const zoom=(factor:number)=>{const v=viewRef.current,k=clamp(v.k*factor,OVERVIEW.minZoom,OVERVIEW.maxZoom),x=size.w/2,y=size.h/2;updateView({x:x-(x-v.x)/v.k*k,y:y-(y-v.y)/v.k*k,k});};
 const shownSheets=p.graph.sheets.filter(s=>!viewport.bounds||p.activeSheet===s.id||intersects({...positions.get(s.id)!,w:OVERVIEW.width,h:OVERVIEW.height},viewport.bounds));
 const shownSignature=shownSheets.map(s=>s.id).join("\0");
 const sheetPos=(sid:string)=>preview?.kind==="sheet"&&preview.sid===sid?preview.pos:positions.get(sid)!;
 const nodePos=(n:GNode,sid:string)=>preview?.kind==="node"&&preview.sid===sid&&preview.nid===n.id?preview.pos:n.pos[sid];
 const nodeRect=(n:GNode,sid:string)=>({...nodePos(n,sid),...overviewNodeSize(n,sid)});
 const worldRect=(n:GNode,sid:string)=>{const a=nodeRect(n,sid),c=contents.get(sid)!,s=sheetPos(sid);return{x:s.x+c.x+a.x*c.k,y:s.y+c.y+a.y*c.k,w:a.w*c.k,h:a.h*c.k};};
 const keyMove=(e:React.KeyboardEvent,sid:string,n?:GNode)=>{
  if(e.key==="Escape"){e.stopPropagation();cancel();return;}
  if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();p.onOpen(sid,n?.id);return;}
  const delta:Record<string,Pos>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
  if(!Object.prototype.hasOwnProperty.call(delta,e.key))return;e.preventDefault();e.stopPropagation();const d=delta[e.key],step=e.shiftKey?50:10;
  if(n){const a=n.pos[sid];p.onMoveNode(n.id,sid,clampOverviewNode({x:a.x+d.x*step,y:a.y+d.y*step},n,sid,contents.get(sid)!));}
  else{const a=positions.get(sid)!;p.onMoveSheet(sid,{x:a.x+d.x*step,y:a.y+d.y*step},positions);}
 };
 const sheetScenes=useMemo(()=>shownSheets.map((s)=>{
      const i=p.graph.sheets.indexOf(s);
      const pos=sheetPos(s.id),content=contents.get(s.id)!,nodes=shownNodes.get(s.id)??[],type=registry.sheets.find(d=>d.id===sheetTypeId(s,registry))!,tags=(s.tags??[]).map(id=>registry.tags.find(d=>d.id===id)).filter(Boolean).map(d=>label(d!));
      return <g key={s.id} data-board-sheet={s.id} transform={`translate(${pos.x} ${pos.y})`}>
       <g clipPath={`url(#${uid}-clip-${i})`}><g transform={`translate(${content.x} ${content.y}) scale(${content.k})`}>
        {!(nodes.length>200&&content.k<.2)&&(localEdges.get(s.id)??[]).map(e=>{
         const a=p.idx.nodeById.get(e.from)!,b=p.idx.nodeById.get(e.to)!,path=routedPath(e,s.id,nodeRect(a,s.id),nodeRect(b,s.id))??edgePath(nodeRect(a,s.id),nodeRect(b,s.id)),high=p.selected===a.id||p.selected===b.id;
         return <g key={e.id} data-overview-edge={e.id} data-filter-muted={mutedAttr(me,e.id,dim)} data-line-kind="local" opacity={high?1:p.selected?.3:.85} pointerEvents="none"><path d={path.d} fill="none" stroke={LINE_STYLE.local.color} strokeWidth={1.3} vectorEffect="non-scaling-stroke" markerEnd={e.directed!==false?`url(#${uid}-local)`:undefined}/>{(e.label||high||e.sourceType?.startsWith("bpmn:"))&&<text className="edge-label" x={path.mid.x} y={path.mid.y-5} fontSize={12} textAnchor="middle" fill="#475569" stroke="#fff" strokeWidth={4} paintOrder="stroke">{e.label?name(e.label):label(edgeType(e.kind))}</text>}</g>;
        })}
        {nodes.length>200&&content.k<.2?<g data-overview-compact={s.id}><title>{nodes.length} {t("узлов — откройте лист для редактирования","nodes — open the sheet to edit")}</title>{[false,true].map(faded=><g key={String(faded)} data-filter-muted={faded?"":undefined}><path data-overview-compact-edges d={(localEdges.get(s.id)??[]).filter(e=>(!!dim&&!!me&&!me.has(e.id))===faded).map(e=>{const a=p.idx.nodeById.get(e.from)!,b=p.idx.nodeById.get(e.to)!;return(routedPath(e,s.id,nodeRect(a,s.id),nodeRect(b,s.id))??edgePath(nodeRect(a,s.id),nodeRect(b,s.id))).d;}).join(" ")} fill="none" stroke={LINE_STYLE.local.color} strokeWidth={1/content.k} opacity={.5}/><path d={nodes.filter(n=>(!!dim&&!!mv&&!mv.has(n.id))===faded).map(n=>{const r=nodeRect(n,s.id);return `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`;}).join(" ")} fill={s.color} opacity={.65}/></g>)}</g>:[...nodes].sort((a,b)=>Number(b.appearance?.[s.id]?.shape==="group")-Number(a.appearance?.[s.id]?.shape==="group")).map(n=>{
         const a=n.appearance?.[s.id],r=nodeRect(n,s.id),isSelected=p.selected===n.id,def=nodeType(n.kind),text=lines(name(n.name),r.w-(a?.shape==="diamond"?r.w*.4:20),a?.marker?2:3);
         return <g key={n.id} data-overview-node={n.id} data-filter-muted={mutedAttr(mv,n.id,dim)} data-sheet-id={s.id} data-content-scale={content.k} transform={`translate(${r.x} ${r.y})`} tabIndex={0} role="button" aria-label={t(`${name(n.name)}, лист ${name(s.name)}`,`${name(n.name)}, sheet ${name(s.name)}`)} className="overview-node" onPointerDown={e=>begin(e,"node",s.id,n.id)} onDoubleClick={e=>{e.stopPropagation();p.onOpen(s.id,n.id);}} onKeyDown={e=>keyMove(e,s.id,n)}>
          <title>{name(n.name)} · {label(def)}{Object.keys(n.attributes??{}).length?` · ${t("Атрибуты","Attributes")}: ${Object.keys(n.attributes!).length}`:""}</title>
          <rect width={r.w} height={r.h} fill="transparent"/>
          <g transform={a?.rotation?`rotate(${a.rotation} ${r.w/2} ${r.h/2})`:undefined}>{a?<NotationShape appearance={a} embedded/>:<><rect width={r.w} height={r.h} rx={7} fill="#fff" stroke="#94a3b8" strokeWidth={1.4}/><rect x={0} y={0} width={4} height={r.h} rx={2} fill={s.color}/></>}
          <text fill={a?.fontColor??"#1e293b"} fontSize={a?.fontSize??14} fontWeight={a?.bold?700:500} textAnchor={a?.shape==="group"?"start":"middle"} pointerEvents="none">{text.map((line,j)=><tspan key={j} x={a?.shape==="group"?12:r.w/2} y={a?.marker?r.h+18+j*17:a?.shape==="group"?24+j*17:r.h/2-(text.length-1)*8+5+j*17}>{line}</tspan>)}</text></g>
          {isSelected&&<rect x={-4} y={-4} width={r.w+8} height={r.h+8} rx={7} fill="none" stroke="#6c45a0" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
         </g>;
        })}
       </g></g>
       {!nodes.length&&<text x={OVERVIEW.width/2} y={OVERVIEW.height/2+22} textAnchor="middle" fill="#a199b0" fontSize={24} pointerEvents="none">{t("Пустой лист","Empty sheet")}</text>}
       <g data-overview-handle={s.id} className="overview-sheet-handle" role="button" tabIndex={0} aria-label={t(`Переместить лист ${name(s.name)}`,`Move sheet ${name(s.name)}`)} onFocus={()=>p.onSheet(s.id)} onPointerDown={e=>begin(e,"sheet",s.id)} onDoubleClick={e=>{e.stopPropagation();p.onOpen(s.id);}} onKeyDown={e=>keyMove(e,s.id)}>
        <rect width={OVERVIEW.width} height={OVERVIEW.header} rx={13} fill="#f5f3f9"/><path d={`M0 ${OVERVIEW.header}H${OVERVIEW.width}`} stroke="#ddd8e8" strokeWidth={1}/><rect x={18} y={20} width={6} height={28} rx={3} fill={s.color}/>
        <text x={38} y={30} fontSize={24} fontWeight={650} fill="#352544" pointerEvents="none">{name(s.name).length>36?name(s.name).slice(0,35)+"…":name(s.name)}</text><text x={38} y={52} fontSize={15} fill="#8b7a9c" pointerEvents="none">{[label(type),`${nodes.length} ${t("узлов","nodes")}`,...tags].join(" · ").slice(0,74)}</text><title>{t("За заголовок — перемещение листа. Стрелки — с клавиатуры; Enter — открыть.","Drag the header to move the sheet. Arrow keys move it; Enter opens it.")}</title>
       </g>
      </g>;
     }),[p.graph,p.idx,p.activeSheet,p.selected,p.linking,shownNodes,localEdges,contents,positions,preview,registry,locale,shownSignature,mv,me,dim]);
 return <section className="overview-canvas">
  <div className="overview-canvas-bar"><div><h2>{t("Обзор листов","Helicopter view")}</h2><p>{t("Свободное расположение всех листов проекта","Arrange all project sheets")} · {p.graph.sheets.length}</p></div><div className="overview-canvas-actions"><label><input type="checkbox" checked={external} onChange={e=>setExternal(e.target.checked)}/>{t("Между листами","Between sheets")}</label><label><input type="checkbox" checked={identities} onChange={e=>setIdentities(e.target.checked)}/>{t("Один ID","Same ID")}</label><label><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/>{t("Только для выделенного листа","Selected sheet only")}</label><ConnectionLegend/></div></div>
  {selectedOnly&&<div className="overview-focus-note" role="status">{t("Связи выделенного листа:","Connections of selected sheet:")} <strong>{name(p.idx.sheetById.get(p.activeSheet)?.name??"")}</strong> · {t("Нажмите заголовок другого листа, чтобы выделить его.","Click another sheet header to select it.")}</div>}
  <div ref={wrap} className="overview-viewport" data-overview-zoom={view.k} data-overview-x={view.x} data-overview-y={view.y} tabIndex={0} aria-label={t("Обзор всех листов","Overview of all sheets")} onPointerDown={e=>begin(e,"pan")} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId))cancel();}} onPointerLeave={()=>commitRef.current()} onKeyDown={e=>{if(e.key==="Escape"){cancel();e.stopPropagation();}else if(e.target===e.currentTarget&&(e.key==="+"||e.key==="="||e.key==="-")){e.preventDefault();zoom(e.key==="-"?1/1.25:1.25);}}}>
   <svg className="board-scene" aria-label={t("Листы с узлами и связями","Sheets with nodes and relations")}>
    <defs>{(["local","external"] as const).map(kind=><marker key={kind} id={`${uid}-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill={LINE_STYLE[kind].color}/></marker>)}{p.graph.sheets.map((s,i)=><clipPath id={`${uid}-clip-${i}`} key={s.id}><rect x={4} y={OVERVIEW.header} width={OVERVIEW.width-8} height={OVERVIEW.height-OVERVIEW.header-4}/></clipPath>)}</defs>
    <g ref={sceneRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
     {shownSheets.map(s=>{const pos=sheetPos(s.id);return <rect key={s.id} x={pos.x} y={pos.y} width={OVERVIEW.width} height={OVERVIEW.height} rx={14} fill="#fff" stroke={p.activeSheet===s.id?s.color:"#cdd2df"} strokeWidth={p.activeSheet===s.id?2:1} vectorEffect="non-scaling-stroke" className="overview-sheet-frame"/>;})}
     <g className="overview-cross-lines" pointerEvents="none">
      {external&&routes.map(r=>{const from=p.idx.nodeById.get(r.edge.from)!,to=p.idx.nodeById.get(r.edge.to)!,path=edgePath(worldRect(from,r.fromSheet),worldRect(to,r.toSheet)),high=p.selected===from.id||p.selected===to.id;if(viewport.bounds&&!intersects(boundsOfPoints(path.points),viewport.bounds))return null;return <path key={r.key} data-overview-edge={r.edge.id} data-filter-muted={mutedAttr(me,r.edge.id,dim)} data-from-sheet={r.fromSheet} data-to-sheet={r.toSheet} data-line-kind="external" d={path.d} fill="none" stroke={LINE_STYLE.external.color} strokeDasharray={LINE_STYLE.external.dash} strokeWidth={high?1.8:1.2} vectorEffect="non-scaling-stroke" opacity={high?.95:p.selected?.18:.5} markerEnd={r.edge.directed!==false?`url(#${uid}-external)`:undefined}/>;})}
      {identities&&shared.map(r=>{const path=edgePath(worldRect(r.node,r.fromSheet),worldRect(r.node,r.toSheet)),high=p.selected===r.node.id;if(viewport.bounds&&!intersects(boundsOfPoints(path.points),viewport.bounds))return null;return <path key={r.key} data-overview-identity={r.node.id} data-filter-muted={mutedAttr(mv,r.node.id,dim)} data-from-sheet={r.fromSheet} data-to-sheet={r.toSheet} data-line-kind="identity" d={path.d} fill="none" stroke={LINE_STYLE.identity.color} strokeWidth={high?2.6:1.7} vectorEffect="non-scaling-stroke" opacity={high?1:p.selected?.2:.7}/>;})}
     </g>
     {sheetScenes}
    </g>
   </svg>
   {shownSheets.map(s=>{const pos=sheetPos(s.id),x=view.x+(pos.x+OVERVIEW.width)*view.k-36,y=view.y+pos.y*view.k+4;return <button key={s.id} data-overview-open={s.id} className="overview-open-sheet" style={{left:x,top:y}} aria-label={t(`Редактировать лист ${name(s.name)}`,`Edit sheet ${name(s.name)}`)} title={t(`Открыть лист «${name(s.name)}»`,`Open “${name(s.name)}”`)} onPointerDown={e=>e.stopPropagation()} onClick={()=>p.onOpen(s.id)}>+</button>;})}
  </div>
  <div className="overview-canvas-footer"><span>{t("Лист — за заголовок · узел — внутри листа · фон — перемещение обзора","Drag headers to move sheets · drag nodes within sheets · drag the background to pan")}</span><div><button onClick={()=>zoom(1/1.25)} aria-label={t("Уменьшить обзор","Zoom out overview")}>−</button><output ref={zoomLabel}>{Math.round(view.k*100)}%</output><button onClick={()=>zoom(1.25)} aria-label={t("Увеличить обзор","Zoom in overview")}>+</button><button onClick={fit}>{t("Вписать все листы","Fit all sheets")}</button></div></div>
 </section>;
}
