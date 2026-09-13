import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { mutedAttr } from "../lib/nodeFilter";
import { type Graph, type GNode, type View, type Pos } from "../model/types";
import { edgePath, nodeH, stubsForSheet, type Index } from "../lib/graph";
import { identityRoutes, responsivePositions, sheetRoutes } from "../lib/spreadGraph";
import { LINE_STYLE } from "../lib/lineStyles";
import { ConnectionLegend } from "./ConnectionLegend";
import { compositionStyle } from "./spreadLayout";
import { dimensions } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import type { Placed } from "./SheetCanvas";
import type { LayoutSnapshot } from "../lib/layoutViews";

export interface SpreadLayoutHandle { snapshot:()=>LayoutSnapshot }

interface Props {
  graph:Graph; idx:Index; ids:string[]; active:string; ratio:number; compact:boolean;
  selected:string|null; sizes:Map<string,number>; views:Record<string,View>; fitTick:number; visibleNodeIds:Set<string>|null; visibleEdgeIds:Set<string>|null; dimHidden?:boolean;
  showExternal:boolean; onShowExternal:(show:boolean)=>void;
  onActive:(sid:string)=>void; onReplace:(slot:number,sid:string)=>void; onAdd:(sid:string)=>void; onOpen:(sid:string)=>void;
  onMoveSheet:(sid:string,positions:Map<string,Pos>)=>void;
  layoutRef:Ref<SpreadLayoutHandle>;
  render:(sid:string,visible:string[],placed:Placed[],onMove:(id:string,x:number,y:number)=>void,layoutKey:string)=>ReactNode;
}
type Frame={x:number;y:number;w:number;h:number};
export function MultiSpread(p:Props) {
  const {t,name}=useI18n();
  const root=useRef<HTMLDivElement>(null);
  const [frames,setFrames]=useState<Record<string,Frame>>({});
  const [connections,setConnections]=useState(true);
  const [identities,setIdentities]=useState(true);
  const key=JSON.stringify(p.ids);
  const visible=p.compact?[p.active]:p.ids;
  useLayoutEffect(()=>{
    const el=root.current;if(!el)return;
    const measure=()=>{
      const origin=el.getBoundingClientRect(),next:Record<string,Frame>={};
      el.querySelectorAll<HTMLElement>("[data-spread-canvas]").forEach((pane)=>{const r=pane.getBoundingClientRect();next[pane.dataset.spreadCanvas!]={x:r.left-origin.left,y:r.top-origin.top,w:r.width,h:r.height};});
      setFrames((old)=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    measure();const ro=new ResizeObserver(measure);ro.observe(el);
    el.querySelectorAll("[data-spread-canvas]").forEach((pane)=>ro.observe(pane));
    return()=>ro.disconnect();
  },[key,p.ratio,p.compact,p.active]);
  const epoch=JSON.stringify([key,p.ratio,p.compact,p.fitTick,p.showExternal,frames]);
  const layouts=useMemo(()=>{
    const out=new Map<string,Map<string,Pos>>();
    for(const sid of visible){
      const nodes=p.idx.bySheet.get(sid)??[],frame=frames[sid];
      const remaining=p.showExternal?stubsForSheet(p.graph,p.idx,sid,p.sizes,undefined,visible):[];
      const columns=new Set(remaining.map((s)=>s.side)).size;
      const automatic=responsivePositions(nodes,p.sizes,frame?.w||600,frame?.h||400,columns);
      out.set(sid,p.idx.sheetById.get(sid)?.layout==="manual"?new Map(nodes.map(n=>[n.id,n.pos[sid]??automatic.get(n.id)!])):automatic);
    }
    return out;
  },[p.graph,p.idx,p.sizes,JSON.stringify(visible),frames,epoch]);
  useImperativeHandle(p.layoutRef,()=>({snapshot:()=>({external:p.showExternal,connections,identities,panes:visible.map((sid,i)=>{
    const raw=frames[sid],f=raw?.w>0&&raw?.h>0?raw:undefined,w=f?.w||600,h=f?.h||400;
    return{sid,positions:new Map(layouts.get(sid)),width:w,height:h,frame:{x:f?.x??i*600,y:f?.y??0,w,h}};
  })})}));
  // Pane layouts use every node, so a filter hides objects without moving the rest.
  const mv=p.visibleNodeIds,me=p.visibleEdgeIds,dim=p.dimHidden,vn=dim?null:mv,ve=dim?null:me;
  const allRoutes=useMemo(()=>sheetRoutes(p.graph,p.idx,visible),[p.graph,p.idx,JSON.stringify(visible)]);
  const allIdentity=useMemo(()=>identityRoutes(p.graph,visible),[p.graph,JSON.stringify(visible)]);
  const routes=useMemo(()=>ve?allRoutes.filter(r=>ve.has(r.edge.id)):allRoutes,[allRoutes,ve]);
  const identity=useMemo(()=>vn?allIdentity.filter(r=>vn.has(r.node.id)):allIdentity,[allIdentity,vn]);
  const edgeCount=new Set(routes.map((r)=>r.edge.id)).size;
  const outside=visible.reduce((n,sid)=>n+stubsForSheet(p.graph,p.idx,sid,p.sizes,layouts.get(sid),visible).filter(s=>(!vn||vn.has(s.node.id))&&(!ve||s.edges.some(e=>ve.has(e.id)))).length,0);
  const rectFor=(n:GNode,sid:string):Frame|null=>{
    const f=frames[sid],v=p.views[sid]??{x:40,y:40,k:1},pos=layouts.get(sid)?.get(n.id);
    if(!f||!pos||f.w<1||f.h<1)return null;
    const dim=dimensions(n,sid,p.sizes);
    const x=v.x+pos.x*v.k,y=v.y+pos.y*v.k,w=dim.w*v.k,h=dim.h*v.k;
    // Endpoints outside the pane attach to its boundary instead of silently losing the route.
    if(x+w<0||y+h<0||x>f.w||y>f.h){return{x:f.x+Math.max(2,Math.min(f.w-2,x+w/2)),y:f.y+Math.max(2,Math.min(f.h-2,y+h/2)),w:1,h:1};}
    const left=Math.max(0,x),top=Math.max(0,y);
    return{x:f.x+left,y:f.y+top,w:Math.max(1,Math.min(f.w,x+w)-left),h:Math.max(1,Math.min(f.h,y+h)-top)};
  };
  const step=(slot:number,delta:number)=>{const i=p.graph.sheets.findIndex((s)=>s.id===p.ids[slot]);p.onReplace(slot,p.graph.sheets[(i+delta+p.graph.sheets.length)%p.graph.sheets.length].id);};
  return <div className="multi-spread unified-spread">
    <div className="spread-context"><span>{t("Слоёв:","Layers:")} <b>{p.ids.length}</b> · {t("связей между ними:","connections between them:")} <b>{edgeCount}</b></span>
      <div className="spread-display-controls">
        <button className="external-toggle" aria-pressed={p.showExternal} title={t("Показать или скрыть боковые карточки переходов. Связи между открытыми слоями сохраняются.","Show or hide side navigation cards. Connections between open layers remain.")} onClick={()=>p.onShowExternal(!p.showExternal)}>{p.showExternal?t("Боковые переходы","Side references"):t("Переходы скрыты","References hidden")} <span>{outside}</span></button>
        {!p.compact&&<><label className="connection-switch"><input type="checkbox" checked={connections} onChange={(e)=>setConnections(e.target.checked)}/>{t("Между слоями","Across layers")}</label><label className="connection-switch"><input type="checkbox" checked={identities} onChange={(e)=>setIdentities(e.target.checked)}/>{t("Один ID","Same ID")}</label></>}
        <ConnectionLegend/>
      </div>
    </div>
    <div ref={root} className={"spread-grid"+(p.compact?" spread-mobile":"")} data-count={p.ids.length} style={compositionStyle(p.ids.length,p.ratio)}>
      {p.ids.map((sid,slot)=>{
        if(!visible.includes(sid))return null;
        const s=p.idx.sheetById.get(sid);if(!s)return null;
        const nodes=p.idx.bySheet.get(sid)??[],positions=layouts.get(sid)!;
        const placed=nodes.map((node)=>({node,...positions.get(node.id)!}));
        const move=(id:string,x:number,y:number)=>{
          p.onMoveSheet(sid,new Map([...positions,[id,{x,y}]]));
        };
        const layoutKey=JSON.stringify([epoch,nodes.map((n)=>[n.id,nodeH(p.sizes,n.id)])]);
        return <section key={sid} className={"spread-pane"+(sid===p.active?" is-active":"")} data-sheet-id={sid} aria-label={t(`Слой ${slot+1}: ${name(s.name)}`,`Layer ${slot+1}: ${name(s.name)}`)} style={{gridArea:"abcdef"[slot],"--layer-color":s.color} as React.CSSProperties} onPointerDownCapture={()=>p.onActive(sid)} onFocusCapture={()=>{if(!p.compact)p.onActive(sid);}}>
          <div className="spread-pane-header"><span className="layer-marker" style={{background:s.color}}/><span className="layer-prefix">{t("Слой:","Layer:")}</span>
            <select value={sid} aria-label={t(`Лист в окне ${slot+1}`,`Sheet in pane ${slot+1}`)} onChange={(e)=>p.onReplace(slot,e.target.value)}>{p.graph.sheets.map((sheet)=><option key={sheet.id} value={sheet.id}>{name(sheet.name)}</option>)}</select>
            <span className="pane-count" title={t("Узлов на листе","Nodes on the sheet")}>{nodes.length}</span>
            <button aria-label={t(`Предыдущий лист в окне ${slot+1}`,`Previous sheet in pane ${slot+1}`)} onClick={()=>step(slot,-1)}>‹</button><button aria-label={t(`Следующий лист в окне ${slot+1}`,`Next sheet in pane ${slot+1}`)} onClick={()=>step(slot,1)}>›</button>
            <button title={t("Открыть этот лист отдельно")} aria-label={t(`Развернуть лист ${name(s.name)}`,`Expand sheet ${name(s.name)}`)} onClick={()=>p.onOpen(sid)}>⤢</button><button aria-label={t(`Добавить узел на лист ${name(s.name)}`,`Add node to ${name(s.name)}`)} onClick={()=>p.onAdd(sid)}>＋</button>
          </div>
          <div className="spread-pane-canvas" data-spread-canvas={sid}>{p.render(sid,visible,placed,move,layoutKey)}</div>
        </section>;
      })}
      {!p.compact&&<svg className="spread-connections" aria-hidden="true"><defs><marker id="spread-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill={LINE_STYLE.external.color}/></marker><linearGradient id="spread-identity-gold" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%"><stop stopColor={LINE_STYLE.identity.color}/><stop offset=".5" stopColor={LINE_STYLE.identity.light}/><stop offset="1" stopColor={LINE_STYLE.identity.color}/></linearGradient></defs>
        {connections&&routes.map((r)=>{const from=p.idx.nodeById.get(r.edge.from)!,to=p.idx.nodeById.get(r.edge.to)!,a=rectFor(from,r.fromSheet),b=rectFor(to,r.toSheet);if(!a||!b)return null;
          const high=p.selected===from.id||p.selected===to.id;
          const path=edgePath(a,b);
          return <g key={r.key} data-spread-edge={r.edge.id} data-filter-muted={mutedAttr(me,r.edge.id,dim)} data-line-kind="external" opacity={high?1:p.selected?.24:.7}><path d={path.d} fill="none" stroke={LINE_STYLE.external.color} strokeWidth={high?1.8:LINE_STYLE.external.width} strokeDasharray={LINE_STYLE.external.dash} markerEnd={r.edge.directed!==false?"url(#spread-arrow)":undefined}/>{r.edge.label&&high&&<text x={path.mid.x} y={path.mid.y-5} fontSize="10" textAnchor="middle" fill="#594272" stroke="#f7f7fc" strokeWidth="3" paintOrder="stroke">{name(r.edge.label)}</text>}</g>;
        })}
        {identities&&identity.map((r)=>{const a=rectFor(r.node,r.fromSheet),b=rectFor(r.node,r.toSheet);if(!a||!b)return null;const path=edgePath(a,b),high=p.selected===r.node.id;return <g key={r.key} data-identity-node={r.node.id} data-filter-muted={mutedAttr(mv,r.node.id,dim)} data-line-kind="identity" opacity={p.selected&&!high?.18:.95}><path d={path.d} fill="none" stroke={LINE_STYLE.identity.glow} strokeWidth={high?7:5} opacity=".17"/><path d={path.d} fill="none" stroke={LINE_STYLE.identity.color} strokeWidth={high?3.2:2.6}/><path d={path.d} fill="none" stroke="url(#spread-identity-gold)" strokeWidth={high?1.9:1.3}/><circle cx={path.mid.x} cy={path.mid.y} r={5} fill="#fffaee" stroke={LINE_STYLE.identity.color} strokeWidth="1.1"/>{high&&<text x={path.mid.x} y={path.mid.y-10} textAnchor="middle" fill={LINE_STYLE.identity.color} fontSize="11" stroke="#fffaf1" strokeWidth="4" paintOrder="stroke">{t("Один ID","Same ID")} · {name(r.node.name)}</text>}</g>;})}
      </svg>}
    </div>
  </div>;
}
