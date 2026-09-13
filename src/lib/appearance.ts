import { CARD_W, CARD_H_DEFAULT, type EdgeRoute, type GEdge, type GNode, type NodeAppearance, type NodeTypeDefinition, type Pos } from "../model/types";
import { SHAPES } from "./typeRegistry";

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const coord=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=10000000;
export const safeColor=(v:unknown,fallback:string)=>typeof v==="string"&&(/^(#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8})$/i.test(v)||["transparent","none"].includes(v))?v:fallback;
export function appearanceForType(def:NodeTypeDefinition):NodeAppearance|undefined {
  if(!def.shape)return;
  const event=def.id.startsWith("bpmn:")&&def.id.includes("Event"),gateway=def.id.startsWith("bpmn:")&&def.id.includes("Gateway");
  const marker:NodeAppearance["marker"]=def.id.includes("startEvent")?"start":def.id.includes("endEvent")?"end":event?"intermediate":def.id.includes("exclusiveGateway")?"exclusive":def.id.includes("parallelGateway")?"parallel":def.id.includes("inclusiveGateway")?"inclusive":undefined;
  return {width:event?52:gateway?72:208,height:event?52:gateway?72:80,shape:def.shape,fill:def.shape==="group"?"transparent":"#ffffff",stroke:def.color,fontColor:"#0f172a",fontSize:14,marker,sourceType:def.id};
}
export function readAppearances(raw:unknown,sheets:string[]):Record<string,NodeAppearance>|undefined {
  if(raw===undefined)return undefined;
  if(!object(raw))throw new Error("Представления узла: нужен объект");
  return Object.fromEntries(Object.entries(raw).map(([sid,a])=>{
    if(!sheets.includes(sid)||!object(a)||!coord(a.width)||!coord(a.height)||a.width<1||a.height<1||a.width>100000||a.height>100000||!SHAPES.includes(a.shape as NodeAppearance["shape"]))throw new Error("Некорректная геометрия узла");
    return [sid,{width:a.width,height:a.height,shape:a.shape,fill:safeColor(a.fill,"#ffffff"),stroke:safeColor(a.stroke,"#475569"),fontColor:safeColor(a.fontColor,"#0f172a"),
      ...(typeof a.fontSize==="number"&&a.fontSize>=1&&a.fontSize<=200?{fontSize:a.fontSize}:{}),
      ...(typeof a.strokeWidth==="number"&&a.strokeWidth>=0&&a.strokeWidth<=20?{strokeWidth:a.strokeWidth}:{}),
      ...(coord(a.rotation)?{rotation:a.rotation%360}:{}),...(a.bold===true?{bold:true}:{}),
      ...(["left","center","right"].includes(String(a.align))?{align:a.align}:{}),
      ...(["start","end","intermediate","exclusive","parallel","inclusive"].includes(String(a.marker))?{marker:a.marker}:{}),
      ...(typeof a.sourceType==="string"?{sourceType:a.sourceType.slice(0,160)}:{}),
    } as NodeAppearance];
  }));
}
export function dimensions(node:GNode,sid:string,sizes?:Map<string,number>) {
  const a=node.appearance?.[sid];
  return {w:a?.width??CARD_W,h:sizes?.get(JSON.stringify([sid,node.id]))??a?.height??sizes?.get(node.id)??CARD_H_DEFAULT};
}
export function readRoutes(raw:unknown,sheets:Set<string>):Record<string,EdgeRoute>|undefined {
  if(raw===undefined)return undefined;
  if(!object(raw))throw new Error("Маршруты связей: нужен объект");
  return Object.fromEntries(Object.entries(raw).map(([sid,r])=>{
    if(!sheets.has(sid)||!object(r)||!Array.isArray(r.points)||r.points.length<2||r.points.length>1000||r.points.some(p=>!object(p)||!coord(p.x)||!coord(p.y)))throw new Error("Некорректный маршрут связи");
    const box=(p:unknown)=>{if(!object(p)||!coord(p.x)||!coord(p.y)||!coord(p.width)||!coord(p.height)||p.width<=0||p.height<=0)throw new Error("Некорректная привязка связи");return {x:p.x,y:p.y,width:p.width,height:p.height};};
    return [sid,{points:r.points.map(p=>({x:p.x,y:p.y})),from:box(r.from),to:box(r.to)}];
  }));
}
/** Only geometry is imported. The current view always supplies the line grammar. */
export function routedPath(edge:GEdge,sid:string,a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number}):{d:string;mid:Pos;points:Pos[]}|undefined {
  const route=edge.routes?.[sid];if(!route)return;
  const points=route.points.map(p=>({...p}));
  const attach=(p:Pos,old:EdgeRoute["from"],box:typeof a)=>({x:box.x+(p.x-old.x)*box.w/old.width,y:box.y+(p.y-old.y)*box.h/old.height});
  points[0]=attach(points[0],route.from,a);points[points.length-1]=attach(points[points.length-1],route.to,b);
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let half=lengths.reduce((s,n)=>s+n,0)/2,mid=points[0];
  for(let i=0;i<lengths.length;i++){if(half<=lengths[i]){const k=lengths[i]?half/lengths[i]:0;mid={x:points[i].x+(points[i+1].x-points[i].x)*k,y:points[i].y+(points[i+1].y-points[i].y)*k};break;}half-=lengths[i];}
  return {points,d:points.map((p,i)=>`${i?"L":"M"}${p.x} ${p.y}`).join(" "),mid};
}
