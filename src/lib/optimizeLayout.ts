import { SpatialGrid } from "./spatial";
import type { Pos } from "../model/types";
import { edgePath, type Rect } from "./graph";

export interface LayoutBox extends Rect { id:string }
export interface LayoutLink { from:string; to:string }
export interface LayoutNode extends LayoutBox { group:string }
export interface LayoutGroup { id:string; aspect:number }
export interface LayoutScene { boxes:LayoutBox[]; links:LayoutLink[] }
export interface LayoutRequest {
  nodes:LayoutNode[];
  links:LayoutLink[];
  groups:LayoutGroup[];
  // Project each candidate into the same geometry as the rendered view.
  // Spread panes stay fixed. Boundary references move with their local nodes.
  scene?:(positions:Map<string,Pos>)=>LayoutScene;
}
export interface LayoutMetrics {
  overlaps:number; nodeHits:number; crossings:number; sharedSegments:number;
  length:number; sampled:boolean; checkedEdges:number; totalEdges:number;
}
export interface LayoutResult {
  positions:Map<string,Pos>; before:LayoutMetrics; after:LayoutMetrics;
  changed:boolean; evaluated:number;
}
const compareId=(a:string,b:string)=>a<b?-1:a>b?1:0;
const near=(a:Pos,b:Pos)=>Math.hypot(a.x-b.x,a.y-b.y)<.5;
const cross=(a:Pos,b:Pos,c:Pos)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const intersectBoxes=(a:Rect,b:Rect)=>a.x<b.x+b.w-.1&&a.x+a.w>b.x+.1&&a.y<b.y+b.h-.1&&a.y+a.h>b.y+.1;
const touchBoxes=(a:Rect,b:Rect)=>a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y;

function bounds(points:Pos[]):Rect {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys);
  return{x:x-.01,y:y-.01,w:Math.max(...xs)-x+.02,h:Math.max(...ys)-y+.02};
}
// Proper crossings, including a sampled curve vertex, but not shared endpoints.
// Parallel shared runs are counted separately (one penalty per pair of edges).
function segmentConflict(a:Pos,b:Pos,c:Pos,d:Pos):0|1|2 {
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(Math.abs(abC)<.01&&Math.abs(abD)<.01){
    const horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y),key=horizontal?"x":"y";
    const run=Math.min(Math.max(a[key],b[key]),Math.max(c[key],d[key]))-Math.max(Math.min(a[key],b[key]),Math.min(c[key],d[key]));
    return run>4?2:0;
  }
  if(abC*abD<=0&&cdA*cdB<=0)return 1;
  return 0;
}
function segmentInRect(a:Pos,b:Pos,r:Rect):boolean {
  // Liang–Barsky clipping. A small inset avoids counting a grazing border.
  let lo=0,hi=1;
  const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y]]){
    if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return false;
  }
  return hi>=lo;
}

/** Estimate the actual cubic curves, not center-to-center straight edges.
 * Fixed sampling and budgets make the result reproducible. Dense maps use an
 * explicitly reported, stable edge sample; no nodes or graph edges are deleted.
 */
export function measureLayout(scene:LayoutScene):LayoutMetrics {
  const {boxes}=scene,byId=new Map(boxes.map(b=>[b.id,b]));
  const valid=scene.links.filter(e=>e.from!==e.to&&byId.has(e.from)&&byId.has(e.to));
  const ordered=[...valid].sort((a,b)=>compareId(a.from,b.from)||compareId(a.to,b.to));
  const limit=400;
  const links=ordered.length<=limit?ordered:Array.from({length:limit},(_,i)=>ordered[Math.floor(i*ordered.length/limit)]);
  let overlaps=0,nodeHits=0,crossings=0,sharedSegments=0,length=0;
  const grid = new SpatialGrid(boxes);
  for(let i=0;i<boxes.length;i++)for(const j of grid.query(boxes[i]))if(j>i&&intersectBoxes(boxes[i],boxes[j]))overlaps++;
  const curves=links.map(edge=>{
    const [a,b,c,d]=edgePath(byId.get(edge.from)!,byId.get(edge.to)!).points;
    const pts=Array.from({length:9},(_,i)=>{const t=i/8,u=1-t;return{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};});
    const segments=pts.slice(1).map((p,i)=>({a:pts[i],b:p,box:bounds([pts[i],p])}));
    length+=segments.reduce((s,l)=>s+Math.hypot(l.b.x-l.a.x,l.b.y-l.a.y),0);
    return{edge,pts,segments,box:bounds(pts)};
  });
  for(let i=0;i<curves.length;i++){
    const a=curves[i];
    for(const index of grid.query(a.box)){
      const box=boxes[index];
      if(box.id===a.edge.from||box.id===a.edge.to||!touchBoxes(a.box,box))continue;
      const inset={x:box.x+.5,y:box.y+.5,w:Math.max(.1,box.w-1),h:Math.max(.1,box.h-1)};
      if(a.segments.some(s=>segmentInRect(s.a,s.b,inset)))nodeHits++;
    }
    for(let j=i+1;j<curves.length;j++){
      const b=curves[j];if(!touchBoxes(a.box,b.box))continue;
      let hit=false,shared=false;
      for(const x of a.segments){
        for(const y of b.segments){
          if(!touchBoxes(x.box,y.box))continue;
          const conflict=segmentConflict(x.a,x.b,y.a,y.b);
          if(conflict===2)shared=true;
          if(conflict===1){
            const sharedEnd=[a.pts[0],a.pts[8]].some(p=>[b.pts[0],b.pts[8]].some(q=>near(p,q))&&[x.a,x.b].some(q=>near(p,q))&&[y.a,y.b].some(q=>near(p,q)));
            if(!sharedEnd)hit=true;
          }
          if(hit&&shared)break;
        }
        if(hit&&shared)break;
      }
      if(hit)crossings++;if(shared)sharedSegments++;
    }
  }
  return{overlaps,nodeHits,crossings,sharedSegments,length,sampled:links.length<valid.length,checkedEdges:links.length,totalEdges:valid.length};
}

/** Lexicographic priorities: cards, edges through cards, tangled edges, length.
 * We never trade an extra card collision for a shorter connection. */
export function compareLayout(a:LayoutMetrics,b:LayoutMetrics):number {
  return a.overlaps-b.overlaps||a.nodeHits-b.nodeHits||
    (a.crossings+2*a.sharedSegments)-(b.crossings+2*b.sharedSegments)||a.length-b.length;
}

function grid(nodes:LayoutNode[],cols:number):Map<string,Pos> {
  const positions=new Map<string,Pos>();let y=0;
  const cellW=Math.max(...nodes.map(n=>n.w),1)+64;
  for(let i=0;i<nodes.length;i+=cols){
    const row=nodes.slice(i,i+cols);
    row.forEach((n,j)=>positions.set(n.id,{x:j*cellW,y}));
    y+=Math.max(...row.map(n=>n.h),1)+56;
  }
  return positions;
}

function orders(nodes:LayoutNode[],links:LayoutLink[]):LayoutNode[][] {
  const byId=new Map(nodes.map(n=>[n.id,n])),adj=new Map(nodes.map(n=>[n.id,new Set<string>()]));
  for(const e of links)if(byId.has(e.from)&&byId.has(e.to)&&e.from!==e.to){adj.get(e.from)!.add(e.to);adj.get(e.to)!.add(e.from);}
  const rank=(a:LayoutNode,b:LayoutNode)=>adj.get(b.id)!.size-adj.get(a.id)!.size||compareId(a.id,b.id);
  const roots=[...nodes].sort(rank),seen=new Set<string>(),bfs:LayoutNode[]=[];
  for(const root of roots){
    if(seen.has(root.id))continue;
    const queue=[root];seen.add(root.id);
    for(let i=0;i<queue.length;i++){
      const n=queue[i];bfs.push(n);
      const next=[...adj.get(n.id)!].filter(id=>!seen.has(id)).map(id=>byId.get(id)!).sort(rank);
      next.forEach(n=>seen.add(n.id));queue.push(...next);
    }
  }
  let bary=[...bfs];
  for(let k=0;k<5;k++){
    const index=new Map(bary.map((n,i)=>[n.id,i]));
    const center=(n:LayoutNode)=>{const neighbors=[...adj.get(n.id)!];return(index.get(n.id)!+neighbors.reduce((s,id)=>s+index.get(id)!,0))/(neighbors.length+1);};
    bary=[...bary].sort((a,b)=>center(a)-center(b)||compareId(a.id,b.id));
  }
  return[bfs,bary,[...nodes].sort((a,b)=>a.y-b.y||a.x-b.x||compareId(a.id,b.id)),[...nodes].sort((a,b)=>compareId(a.id,b.id))];
}

/** A second cheap seed: put hubs and their neighbors in consecutive bands.
 * An undirected breadth-first walk handles cycles without a DAG requirement.
 * Neighbor ordering sweeps untangle bands before the geometric search. */
function layered(nodes:LayoutNode[],links:LayoutLink[],vertical:boolean):Map<string,Pos> {
  const byId=new Map(nodes.map(n=>[n.id,n])),adj=new Map(nodes.map(n=>[n.id,new Set<string>()]));
  for(const e of links)if(byId.has(e.from)&&byId.has(e.to)&&e.from!==e.to){adj.get(e.from)!.add(e.to);adj.get(e.to)!.add(e.from);}
  const rank=(a:LayoutNode,b:LayoutNode)=>adj.get(b.id)!.size-adj.get(a.id)!.size||compareId(a.id,b.id);
  const depth=new Map<string,number>(),queue:LayoutNode[]=[];
  for(const root of [...nodes].sort(rank)){
    if(depth.has(root.id))continue;
    depth.set(root.id,0);const start=queue.length;queue.push(root);
    for(let i=start;i<queue.length;i++)for(const id of [...adj.get(queue[i].id)!].sort(compareId)){
      if(depth.has(id))continue;depth.set(id,depth.get(queue[i].id)!+1);queue.push(byId.get(id)!);
    }
  }
  let layers=Array.from({length:Math.max(...depth.values(),0)+1},(_,level)=>queue.filter(n=>depth.get(n.id)===level));
  for(let pass=0;pass<8;pass++){
    const index=new Map(layers.flatMap(layer=>layer.map((n,i)=>[n.id,i-(layer.length-1)/2] as const)));
    const bary=(n:LayoutNode)=>[...adj.get(n.id)!].reduce((s,id)=>s+index.get(id)!,0)/Math.max(1,adj.get(n.id)!.size);
    layers=layers.map(layer=>[...layer].sort((a,b)=>bary(a)-bary(b)||compareId(a.id,b.id)));
  }
  const out=new Map<string,Pos>(),maxW=Math.max(...nodes.map(n=>n.w),1),maxH=Math.max(...nodes.map(n=>n.h),1);
  layers.forEach((layer,c)=>{
    let along=-layer.reduce((s,n)=>s+(vertical?n.w:n.h)+56,0)/2;
    layer.forEach(n=>{out.set(n.id,vertical?{x:along,y:c*(maxH+96)}:{x:c*(maxW+142),y:along});along+=(vertical?n.w:n.h)+56;});
  });
  return out;
}

/** Cooperative search: caller can yield to the UI between candidates and cancel.
 * No random seeds, wall-clock cutoffs, dependency downloads, or network calls.
 * Every accepted candidate improves the measured score relative to the input.
 */
export function* layoutSteps(request:LayoutRequest):Generator<number,LayoutResult> {
  const nodes=[...request.nodes].sort((a,b)=>compareId(a.id,b.id));
  const original=new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
  const scene=request.scene??((positions:Map<string,Pos>)=>({boxes:nodes.map(n=>({...n,...positions.get(n.id)!})),links:request.links}));
  const before=measureLayout(scene(original));let best=original,score=before,evaluated=1;
  const accept=(positions:Map<string,Pos>)=>{
    const next=measureLayout(scene(positions));evaluated++;
    if(compareLayout(next,score)<-.00001){best=positions;score=next;}
  };
  yield evaluated;
  const groups=request.groups.map(group=>({...group,nodes:nodes.filter(n=>n.group===group.id)})).filter(g=>g.nodes.length>1);
  // Large maps get fewer seeds and swaps; sampling is declared in the result.
  const large=nodes.length>180||before.totalEdges>400;
  for(const group of groups){
    for(const vertical of large?[group.aspect<1]:[false,true]){
      const candidate=new Map(best);for(const [id,p] of layered(group.nodes,request.links,vertical))candidate.set(id,p);
      accept(candidate);yield evaluated;
    }
    const variants=orders(group.nodes,request.links);
    const avgH=group.nodes.reduce((s,n)=>s+n.h,0)/group.nodes.length;
    const cols=Math.max(1,Math.min(group.nodes.length,Math.round(Math.sqrt(group.nodes.length*Math.max(.2,Math.min(6,group.aspect))*(avgH+56)/(group.nodes[0].w+64)))));
    const counts=large?[cols]:[...new Set([cols,Math.max(1,cols-1),Math.min(group.nodes.length,cols+1)])];
    for(const order of variants.slice(0,large?2:4))for(const count of counts){
      const candidate=new Map(best);for(const [id,p] of grid(order,count))candidate.set(id,p);
      accept(candidate);yield evaluated;
    }
  }
  // Pair swaps keep appearances on their original sheets. The scene callback
  // makes inter-sheet arrows and identity spines participate in this score too.
  const budget=large?12:Math.min(200,Math.max(30,nodes.length*6));
  for(const group of groups){
    let remaining=Math.max(2,Math.floor(budget*group.nodes.length/Math.max(1,nodes.length)));
    const ns=group.nodes;
    for(let pass=0;pass<2&&remaining>0;pass++)for(let offset=1;offset<ns.length&&remaining>0;offset++)for(let i=0;i<ns.length-offset&&remaining>0;i++){
      const a=ns[i],b=ns[i+offset],candidate=new Map(best);
      candidate.set(a.id,best.get(b.id)!);candidate.set(b.id,best.get(a.id)!);
      accept(candidate);remaining--;yield evaluated;
    }
  }
  const changed=nodes.some(n=>{const p=best.get(n.id)!;return p.x!==n.x||p.y!==n.y;});
  return{positions:best,before,after:score,changed,evaluated};
}

export function optimizeLayout(request:LayoutRequest):LayoutResult {
  const steps=layoutSteps(request);let step=steps.next();
  while(!step.done)step=steps.next();return step.value;
}
