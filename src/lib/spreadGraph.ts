import { CARD_W, type GEdge, type GNode, type Graph, type Pos } from "../model/types";
import { nodeH, type Index, type Sizes } from "./graph";

export interface SheetRoute { key: string; edge: GEdge; fromSheet: string; toSheet: string }
export interface IdentityRoute { key:string; node:GNode; fromSheet:string; toSheet:string }
/** A chain needs n−1 lines to connect n appearances, with no synthetic graph edges. */
export function identityRoutes(graph:Graph,visible:string[]):IdentityRoute[] {
  return graph.nodes.flatMap((node)=>{
    const sheets=[...new Set(visible)].filter((sid)=>node.sheets.includes(sid));
    return sheets.slice(1).map((sid,i)=>({key:JSON.stringify([node.id,sheets[i],sid]),node,fromSheet:sheets[i],toSheet:sid}));
  });
}
/** Give every hidden boundary reference a route to an actual visible appearance. */
export function sheetRoutes(graph: Graph, idx: Index, visible: string[]): SheetRoute[] {
  const order = new Map(visible.map((sid,i) => [sid,i]));
  const routes = new Map<string,SheetRoute>();
  const nearest = (n: GNode, sid: string) => n.sheets.filter((id) => order.has(id)).sort((a,b) => Math.abs(order.get(a)!-order.get(sid)!)-Math.abs(order.get(b)!-order.get(sid)!) || order.get(a)!-order.get(b)!)[0];
  for (const sid of visible) for (const edge of graph.edges) {
    const from=idx.nodeById.get(edge.from),to=idx.nodeById.get(edge.to);
    if(!from||!to)continue;
    const f=from.sheets.includes(sid),t=to.sheets.includes(sid);
    if(f===t)continue;
    const other=nearest(f?to:from,sid);
    if(!other)continue;
    const fromSheet=f?sid:other,toSheet=f?other:sid;
    const key=JSON.stringify([edge.id,fromSheet,toSheet]);
    routes.set(key,{key,edge,fromSheet,toSheet});
  }
  return [...routes.values()];
}
export function isVisibleElsewhere(node: GNode, sid: string, visible: string[]) { return node.sheets.some((id) => id!==sid&&visible.includes(id)); }

/** View-only reflow: maximize readable card scale for the actual pane aspect ratio. */
export function responsivePositions(nodes: GNode[], sizes: Sizes, width: number, height: number, externalColumns=0): Map<string,Pos> {
  if(!nodes.length)return new Map();
  const W=Math.max(180,width-40),H=Math.max(120,height-40);
  let best:Map<string,Pos>=new Map(),score=-Infinity;
  for(let cols=1;cols<=Math.min(nodes.length,24);cols++) {
    const candidate=new Map<string,Pos>();let y=0;
    for(let i=0;i<nodes.length;i+=cols) {
      const row=nodes.slice(i,i+cols);
      row.forEach((n,j)=>candidate.set(n.id,{x:j*(CARD_W+40),y}));
      y+=Math.max(...row.map((n)=>nodeH(sizes,n.id)))+32;
    }
    const contentW=cols*CARD_W+(cols-1)*40+externalColumns*(CARD_W+90);
    const scale=Math.min(W/contentW,H/Math.max(1,y-32),1.8);
    const empty=(Math.ceil(nodes.length/cols)*cols-nodes.length)/nodes.length;
    const current=scale-empty*.015;
    if(current>score){score=current;best=candidate;}
  }
  return best;
}

/** Focused overview uses direct routes to every other sheet, including all shared appearances. */
export function overviewRoutes(graph:Graph,idx:Index,visible:string[],focus?:string):{edges:SheetRoute[];identities:IdentityRoute[]} {
  const ids=[...new Set(visible)];
  if(!focus)return {edges:sheetRoutes(graph,idx,ids),identities:identityRoutes(graph,ids)};
  if(!ids.includes(focus))return {edges:[],identities:[]};
  const others=ids.filter(sid=>sid!==focus);
  return {edges:others.flatMap(sid=>sheetRoutes(graph,idx,[focus,sid])),identities:others.flatMap(sid=>identityRoutes(graph,[focus,sid]))};
}
