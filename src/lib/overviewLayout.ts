import { CARD_H_DEFAULT, CARD_W, type GNode, type Graph, type Pos, type View } from "../model/types";

export const OVERVIEW = {width:640,height:450,header:68,pad:24,gap:150,minZoom:.035,maxZoom:3};
export interface OverviewContent { x:number;y:number;k:number;left:number;top:number;right:number;bottom:number }
export function overviewNodeSize(n:GNode,sid:string){return {w:n.appearance?.[sid]?.width??CARD_W,h:n.appearance?.[sid]?.height??CARD_H_DEFAULT};}
/** Default locations never displace saved sheets, including after an import. */
export function overviewPositions(graph:Graph):Map<string,Pos>{
 const positions=new Map(graph.sheets.filter(s=>s.overviewPos).map(s=>[s.id,{...s.overviewPos!}]));
 const columns=Math.max(1,Math.ceil(Math.sqrt(graph.sheets.length)));
 const overlaps=(p:Pos)=>[...positions.values()].some(q=>p.x<q.x+OVERVIEW.width+32&&p.x+OVERVIEW.width+32>q.x&&p.y<q.y+OVERVIEW.height+32&&p.y+OVERVIEW.height+32>q.y);
 let cell=0;
 for(const s of graph.sheets){if(positions.has(s.id))continue;let p:Pos;do{p={x:(cell%columns)*(OVERVIEW.width+OVERVIEW.gap),y:Math.floor(cell/columns)*(OVERVIEW.height+OVERVIEW.gap)};cell++;}while(overlaps(p));positions.set(s.id,p);}
 return positions;
}
/** Native node coordinates are independent of sheet positions on the overview. */
export function overviewContent(nodes:GNode[],sid:string):OverviewContent{
 const boxes=nodes.map(n=>({...n.pos[sid],...overviewNodeSize(n,sid)}));
 const left=Math.min(0,...boxes.map(p=>p.x))-80,top=Math.min(0,...boxes.map(p=>p.y))-80;
 const right=Math.max(left+800,...boxes.map(p=>p.x+p.w+80)),bottom=Math.max(top+440,...boxes.map(p=>p.y+p.h+100));
 const w=OVERVIEW.width-OVERVIEW.pad*2,h=OVERVIEW.height-OVERVIEW.header-OVERVIEW.pad*2;
 const k=Math.min(w/(right-left),h/(bottom-top));
 const x=OVERVIEW.pad+(w-(right-left)*k)/2-left*k,y=OVERVIEW.header+OVERVIEW.pad+(h-(bottom-top)*k)/2-top*k;
 return {x,y,k,left:(OVERVIEW.pad-x)/k,top:(OVERVIEW.header+OVERVIEW.pad-y)/k,right:(OVERVIEW.width-OVERVIEW.pad-x)/k,bottom:(OVERVIEW.height-OVERVIEW.pad-y)/k};
}
export function clampOverviewNode(p:Pos,node:GNode,sid:string,content:OverviewContent):Pos{
 const d=overviewNodeSize(node,sid),clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
 return {x:Math.round(clamp(p.x,content.left,content.right-d.w)),y:Math.round(clamp(p.y,content.top,content.bottom-d.h))};
}
export function fitOverview(positions:Map<string,Pos>,width:number,height:number):View{
 const values=[...positions.values()];if(!values.length)return{x:40,y:40,k:1};
 const x=Math.min(...values.map(p=>p.x)),y=Math.min(...values.map(p=>p.y));
 const w=Math.max(...values.map(p=>p.x+OVERVIEW.width))-x,h=Math.max(...values.map(p=>p.y+OVERVIEW.height))-y;
 const k=Math.max(OVERVIEW.minZoom,Math.min((Math.max(200,width)-80)/w,(Math.max(180,height)-80)/h,1.2));
 return {x:(width-w*k)/2-x*k,y:(height-h*k)/2-y*k,k};
}
export function moveOverviewSheet(graph:Graph,sid:string,p:Pos,positions=overviewPositions(graph)):Graph{
 if(!graph.sheets.some(s=>s.id===sid)||![p.x,p.y].every(Number.isFinite))return graph;
 const before=positions.get(sid);if(before&&Math.round(p.x)===before.x&&Math.round(p.y)===before.y)return graph;
 return {...graph,sheets:graph.sheets.map(s=>({...s,overviewPos:s.id===sid?{x:Math.round(Math.max(-1e7,Math.min(1e7,p.x))),y:Math.round(Math.max(-1e7,Math.min(1e7,p.y)))}:positions.get(s.id)??s.overviewPos}))};
}
export function moveOverviewNode(graph:Graph,nid:string,sid:string,p:Pos):Graph{
 if(!graph.nodes.some(n=>n.id===nid&&n.sheets.includes(sid))||![p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e7))return graph;
 const before=graph.nodes.find(n=>n.id===nid)!.pos[sid];if(before.x===p.x&&before.y===p.y)return graph;
 return {...graph,sheets:graph.sheets.map(s=>s.id===sid?{...s,layout:"manual"}:s),nodes:graph.nodes.map(n=>n.id===nid?{...n,pos:{...n.pos,[sid]:{...p}}}:n)};
}
