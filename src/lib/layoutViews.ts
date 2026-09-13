import { CARD_W, STUB_H, type Graph, type Pos } from "../model/types";
import { buildIndex, stubsForSheet, type Sizes, type Rect } from "./graph";
import { dimensions } from "./appearance";
import { identityRoutes, sheetRoutes } from "./spreadGraph";
import type { LayoutBox, LayoutLink, LayoutNode, LayoutRequest, LayoutResult } from "./optimizeLayout";

export interface LayoutPane { sid:string; positions:Map<string,Pos>; width:number; height:number; frame?:Rect }
export interface LayoutSnapshot { panes:LayoutPane[]; flat?:boolean; external:boolean; connections?:boolean; identities?:boolean }
export const appearanceId=(sid:string,id:string)=>JSON.stringify([sid,id]);

/** Build the same appearances/curves that a sheet, spread or flat view renders. */
export function viewLayoutRequest(graph:Graph,sizes:Sizes,snapshot:LayoutSnapshot):LayoutRequest {
  const idx=buildIndex(graph),visible=snapshot.panes.map(p=>p.sid);
  const nodes:LayoutNode[]=snapshot.panes.flatMap(pane=>(snapshot.flat?graph.nodes:idx.bySheet.get(pane.sid)??[]).map(n=>({
    id:appearanceId(pane.sid,n.id),group:pane.sid,...(pane.positions.get(n.id)??n.pos[pane.sid]??{x:0,y:0}),...dimensions(n,pane.sid,sizes),
  })));
  const internal=snapshot.panes.flatMap(pane=>graph.edges.filter(e=>snapshot.flat||(idx.nodeById.get(e.from)?.sheets.includes(pane.sid)&&idx.nodeById.get(e.to)?.sheets.includes(pane.sid))).map(e=>({from:appearanceId(pane.sid,e.from),to:appearanceId(pane.sid,e.to)})));
  const links:LayoutLink[]=[...internal];
  if(!snapshot.flat&&snapshot.connections!==false)for(const r of sheetRoutes(graph,idx,visible))links.push({from:appearanceId(r.fromSheet,r.edge.from),to:appearanceId(r.toSheet,r.edge.to)});
  if(!snapshot.flat&&snapshot.identities!==false)for(const r of identityRoutes(graph,visible))links.push({from:appearanceId(r.fromSheet,r.node.id),to:appearanceId(r.toSheet,r.node.id)});
  return{nodes,links,groups:snapshot.panes.map(p=>({id:p.sid,aspect:Math.max(180,p.width)/Math.max(120,p.height)})),scene:(positions)=>{
    const boxes:LayoutBox[]=[],allLinks=[...links];
    for(const pane of snapshot.panes){
      const own=nodes.filter(n=>n.group===pane.sid);
      const placed=new Map((idx.bySheet.get(pane.sid)??[]).map(n=>[n.id,positions.get(appearanceId(pane.sid,n.id))!]));
      const stubs=!snapshot.flat&&snapshot.external?stubsForSheet(graph,idx,pane.sid,sizes,placed,visible):[];
      const localBoxes:LayoutBox[]=own.map(n=>({...n,...positions.get(n.id)!}));
      for(const stub of stubs){
        const id=JSON.stringify([pane.sid,"reference",stub.key]);
        localBoxes.push({id,x:stub.x,y:stub.y,w:CARD_W,h:STUB_H});
        for(const edge of stub.edges)allLinks.push({from:edge.from===stub.node.id?id:appearanceId(pane.sid,edge.from),to:edge.to===stub.node.id?id:appearanceId(pane.sid,edge.to)});
      }
      if(!localBoxes.length)continue;
      if(pane.frame){
        const f=pane.frame,x0=Math.min(...localBoxes.map(b=>b.x)),y0=Math.min(...localBoxes.map(b=>b.y));
        const w=Math.max(...localBoxes.map(b=>b.x+b.w))-x0,h=Math.max(...localBoxes.map(b=>b.y+b.h))-y0;
        const k=Math.max(.15,Math.min(f.w/(w+80),f.h/(h+80),1.8));
        boxes.push(...localBoxes.map(b=>({...b,x:f.x+(f.w-w*k)/2+(b.x-x0)*k,y:f.y+(f.h-h*k)/2+(b.y-y0)*k,w:b.w*k,h:b.h*k})));
      }else boxes.push(...localBoxes);
    }
    return{boxes,links:allLinks};
  }};
}

/** One immutable graph update; App's ordinary undo/redo and JSON save own it. */
export function applyViewLayout(graph:Graph,snapshot:LayoutSnapshot,result:LayoutResult):Graph {
  if(!result.changed)return graph;
  if(snapshot.flat)return{...graph,flatPositions:Object.fromEntries(graph.nodes.map(n=>[n.id,result.positions.get(appearanceId("__flat",n.id))!]))};
  const visible=new Set(snapshot.panes.map(p=>p.sid));
  return{...graph,edges:graph.edges.map(e=>e.routes?{...e,routes:Object.fromEntries(Object.entries(e.routes).filter(([sid])=>!visible.has(sid)))}:e),sheets:graph.sheets.map(s=>visible.has(s.id)?{...s,layout:"manual"}:s),nodes:graph.nodes.map(n=>{
    const pos={...n.pos};let changed=false;
    for(const sid of n.sheets)if(visible.has(sid)){pos[sid]=result.positions.get(appearanceId(sid,n.id))!;changed=true;}
    return changed?{...n,pos}:n;
  })};
}
