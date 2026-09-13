import type { Graph, GNode, GEdge, NodeAppearance, NodeTypeDefinition, Pos } from "../model/types";
import { defaultTypes } from "./typeRegistry";
import { dimensions, safeColor } from "./appearance";
import { loadGraph } from "./graph";
import { MAX_IMPORT_BYTES, type DrawioImport } from "./drawio";
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const checkSize=(source:string)=>{const n=new TextEncoder().encode(source).length;if(n>MAX_IMPORT_BYTES)throw new Error("Максимум 128 МиБ на импорт");return n;};
const number=(v:unknown)=>{const n=typeof v==="string"?Number(v):v;if(typeof n!=="number"||!Number.isFinite(n)||Math.abs(n)>10000000)throw new Error("Некорректная геометрия диаграммы");return n;};
const box=(n:GNode,sid:string)=>{const p=n.pos[sid],d=dimensions(n,sid);return {...p,width:d.w,height:d.h};};
const side=(a:ReturnType<typeof box>,where:unknown):Pos=>where==="left"?{x:a.x,y:a.y+a.height/2}:where==="top"?{x:a.x+a.width/2,y:a.y}:where==="bottom"?{x:a.x+a.width/2,y:a.y+a.height}:{x:a.x+a.width,y:a.y+a.height/2};
const finish=(graph:Graph,warnings:string[],decodedBytes:number):DrawioImport=>{const r=loadGraph(graph);if(!r.graph)throw new Error(r.errors.join("\n"));return {graph:r.graph,warnings,decodedBytes};};

/** JSON Canvas 1.0: one source canvas stays one sheet; groups remain visible frames. */
export function parseCanvas(source:string,filename="Obsidian.canvas"):DrawioImport {
 const decodedBytes=checkSize(source),raw:unknown=JSON.parse(source);
 if(!object(raw)||(!Array.isArray(raw.nodes)&&raw.nodes!==undefined)||(!Array.isArray(raw.edges)&&raw.edges!==undefined)||(!("nodes" in raw)&&!("edges" in raw)))throw new Error("Canvas: ожидаются массивы nodes и edges");
 const list=(raw.nodes??[]) as unknown[],edges=(raw.edges??[]) as unknown[];
 const graph:Graph={version:3,title:filename.replace(/\.canvas$/i,"").slice(0,120),types:defaultTypes(),sheets:[{id:"canvas",name:filename.replace(/\.canvas$/i,"").slice(0,80),notation:"canvas",typeId:"свободная",tags:[],color:"#64748b",layout:"manual"}],nodes:[],edges:[]},sid="canvas",ids=new Set<string>();
 let external=0,backgrounds=0;
 const presets:Record<string,string>={"1":"#fb464c","2":"#e9973f","3":"#e0de71","4":"#44cf6e","5":"#53dfdd","6":"#a882ff"};
 const color=(v:unknown)=>typeof v==="string"?presets[v]??safeColor(v,"#64748b"):"#64748b";
 for(const n of list){
  if(!object(n)||typeof n.id!=="string"||ids.has(n.id)||!['text','file','link','group'].includes(String(n.type)))throw new Error("Canvas: некорректный узел или повторный ID");ids.add(n.id);
  const body=n.type==="text"?n.text:n.type==="file"?n.file:n.type==="link"?n.url:n.label??"";
  if(typeof body!=="string")throw new Error(`Canvas: узел ${n.id} без текста / ссылки`);
  if(n.type==="file"||n.type==="link")external++;if(n.background)backgrounds++;
  const border=color(n.color),a:NodeAppearance={width:number(n.width),height:number(n.height),shape:n.type==="group"?"group":"rectangle",fill:n.type==="group"?"transparent":"#ffffff",stroke:border,fontColor:"#1e293b",fontSize:14,align:"left",sourceType:`canvas:${n.type}`};
  graph.nodes.push({id:n.id,sheets:[sid],pos:{[sid]:{x:number(n.x),y:number(n.y)}},name:(body.replace(/^#+\s*/,"").split("\n")[0]||"Без названия").slice(0,200),body:n.type==="group"?"":body,kind:`canvas:${n.type}`,appearance:{[sid]:a}});
 }
 const byId=new Map(graph.nodes.map(n=>[n.id,n])),edgeIds=new Set<string>();
 for(const e of edges){
  if(!object(e)||typeof e.id!=="string"||edgeIds.has(e.id)||typeof e.fromNode!=="string"||typeof e.toNode!=="string"||!byId.has(e.fromNode)||!byId.has(e.toNode))throw new Error("Canvas: некорректная связь или неизвестный узел");edgeIds.add(e.id);
  if([e.fromSide,e.toSide].some(s=>s!==undefined&&!['top','right','bottom','left'].includes(String(s))))throw new Error("Canvas: неизвестная сторона связи");
  if([e.fromEnd,e.toEnd].some(s=>s!==undefined&&!['none','arrow'].includes(String(s))))throw new Error("Canvas: неизвестное направление связи");
  const a=box(byId.get(e.fromNode)!,sid),b=box(byId.get(e.toNode)!,sid),reverse=e.fromEnd==="arrow"&&e.toEnd==="none";
  const points=[side(a,e.fromSide??"right"),side(b,e.toSide??"left")];
  if(reverse)points.reverse();
  graph.edges.push({id:e.id,from:reverse?e.toNode:e.fromNode,to:reverse?e.fromNode:e.toNode,kind:"ref",label:typeof e.label==="string"?e.label.slice(0,120):"",directed:reverse||e.toEnd!=="none",sourceType:"canvas:edge",routes:{[sid]:{points,from:reverse?b:a,to:reverse?a:b}}});
 }
 const warnings=["Canvas: сохранены координаты, размеры, группы, текст и стороны соединений. Линии внутри листа показаны сплошными. Цветовые пресеты используют палитру PlyLoom; оформление текста может отличаться от Obsidian."];
 if(external||backgrounds)warnings.push(`Ссылки на файлы / страницы: ${external}, фоны групп: ${backgrounds}. Содержимое внешних файлов и фоны не загружаются; сохранены текстовые ссылки.`);
 if(edges.some(e=>object(e)&&e.fromEnd==="arrow"&&(e.toEnd===undefined||e.toEnd==="arrow")))warnings.push("Двусторонние стрелки Canvas показаны как направление от исходного узла к целевому; проверьте такие отношения.");
 return finish(graph,warnings,decodedBytes);
}
const children=(el:Element,local:string)=>Array.from(el.children).filter(x=>x.localName===local);
const descendants=(el:Element,local:string)=>Array.from(el.getElementsByTagNameNS("*",local));
/** BPMN 2.0 diagram interchange. No execution engine or automatic layout of missing DI. */
export function parseBpmn(source:string,filename="Process.bpmn"):DrawioImport {
 const decodedBytes=checkSize(source);if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error("BPMN: DTD и XML-сущности не поддерживаются");
 const doc=new DOMParser().parseFromString(source,"application/xml");if(doc.querySelector("parsererror")||doc.documentElement.localName!=="definitions")throw new Error("BPMN: повреждённый документ definitions");
 const definitions=new Map<string,Element>();for(const el of Array.from(doc.getElementsByTagName("*"))){const id=el.getAttribute("id");if(id){if(definitions.has(id))throw new Error(`BPMN: повторный ID ${id}`);definitions.set(id,el);}}
 const resolve=(id:string|null)=>id?definitions.get(id)??definitions.get(id.split(":").at(-1)!):undefined;
 const diagrams=descendants(doc.documentElement,"BPMNDiagram");if(!diagrams.length)throw new Error("BPMN: нужны данные расположения BPMN DI, хотя бы одна диаграмма");
 const registry=defaultTypes(),graph:Graph={version:3,title:filename.replace(/\.bpmn$/i,"").slice(0,120),types:registry,sheets:[],nodes:[],edges:[]},nodes=new Map<string,GNode>(),edges=new Map<string,GEdge>();
 let fallback=0,markers=0,skipped=0;
 for(let i=0;i<diagrams.length;i++){
  const diagram=diagrams[i],sid=`bpmn-${i+1}`;
  graph.sheets.push({id:sid,name:(diagram.getAttribute("name")||`${graph.title}${diagrams.length>1?` ${i+1}`:""}`).slice(0,80),notation:"bpmn",typeId:"процесс",tags:[],color:"#64748b",layout:"manual",limit:15});
  for(const shape of descendants(diagram,"BPMNShape")){
   const sourceNode=resolve(shape.getAttribute("bpmnElement")),bounds=children(shape,"Bounds")[0];if(!sourceNode||!bounds)throw new Error("BPMN: фигура без элемента или Bounds");
   const id=sourceNode.getAttribute("id")!,local=sourceNode.localName,kind=`bpmn:${local}`;
   let def=registry.nodes.find(k=>k.id===kind);
   if(!def){const task=/Task$/.test(local)||["subProcess","callActivity"].includes(local),event=/Event$/.test(local),gateway=/Gateway$/.test(local);def={id:kind,label:local,labelEn:local,color:"#475569",notation:"bpmn",base:task?"process":gateway?"decision":event?"process":"entity",shape:task?"rounded":event?"ellipse":gateway?"diamond":local==="textAnnotation"?"text":local==="dataStoreReference"?"cylinder":local==="dataObjectReference"?"document":local==="group"?"group":"rectangle"} as NodeTypeDefinition;registry.nodes.push(def);if(!task&&!event&&!gateway&&!['textAnnotation','dataStoreReference','dataObjectReference','group'].includes(local))fallback++;}
   const body=children(sourceNode,"documentation").map(d=>d.textContent??"").join("\n"),name=(sourceNode.getAttribute("name")||children(sourceNode,"text")[0]?.textContent||local).slice(0,200);
   const marker:NodeAppearance["marker"]=local==="startEvent"?"start":local==="endEvent"?"end":/Event$/.test(local)?"intermediate":local==="exclusiveGateway"?"exclusive":local==="parallelGateway"?"parallel":local==="inclusiveGateway"?"inclusive":undefined;
   if(Array.from(sourceNode.children).some(el=>/EventDefinition$|Characteristics$/.test(el.localName)))markers++;
   const a:NodeAppearance={width:number(bounds.getAttribute("width")),height:number(bounds.getAttribute("height")),shape:def.shape??"rectangle",fill:safeColor(Array.from(shape.attributes).find(a=>a.localName==="fill")?.value,def.shape==="group"?"transparent":"#ffffff"),stroke:safeColor(Array.from(shape.attributes).find(a=>a.localName==="stroke")?.value,"#000000"),fontColor:"#0f172a",fontSize:12,marker,sourceType:kind};
   const n:GNode=nodes.get(id)??{id,name,body,kind,sheets:[],pos:{}};
   if(n.sheets.includes(sid))throw new Error("BPMN: два появления одного ID на одном листе");
   n.sheets.push(sid);n.pos[sid]={x:number(bounds.getAttribute("x")),y:number(bounds.getAttribute("y"))};n.appearance={...n.appearance,[sid]:a};nodes.set(id,n);
  }
 }
 for(let i=0;i<diagrams.length;i++){
  const diagram=diagrams[i],sid=`bpmn-${i+1}`;
  for(const route of descendants(diagram,"BPMNEdge")){
   const flow=resolve(route.getAttribute("bpmnElement"));if(!flow){skipped++;continue;}
   const sourceRef=flow.getAttribute("sourceRef")??children(flow,"sourceRef")[0]?.textContent??null,targetRef=flow.getAttribute("targetRef")??children(flow,"targetRef")[0]?.textContent??null;
   const from=resolve(sourceRef)?.getAttribute("id"),to=resolve(targetRef)?.getAttribute("id");
   if(!from||!to||!nodes.get(from)?.sheets.includes(sid)||!nodes.get(to)?.sheets.includes(sid)){skipped++;continue;}
   const id=flow.getAttribute("id")!,kind=`bpmn:${flow.localName}`,label=({sequenceFlow:"последовательность",messageFlow:"сообщение",association:"ассоциация",dataInputAssociation:"входные данные",dataOutputAssociation:"выходные данные"} as Record<string,string>)[flow.localName]??flow.localName;
   if(!registry.edges.some(e=>e.id===kind))registry.edges.push({id:kind,label,labelEn:flow.localName,color:"#475569"});
   const points=children(route,"waypoint").map(p=>({x:number(p.getAttribute("x")),y:number(p.getAttribute("y"))}));if(points.length<2)throw new Error("BPMN: связь без точек маршрута");
   const e:GEdge=edges.get(id)??{id,from,to,kind,label:(flow.getAttribute("name")??"").slice(0,120),sourceType:kind,directed:flow.localName!=="association"||flow.getAttribute("associationDirection")==="One"};
   e.routes={...e.routes,[sid]:{points,from:box(nodes.get(from)!,sid),to:box(nodes.get(to)!,sid)}};edges.set(id,e);
  }
 }
 graph.nodes=[...nodes.values()];graph.edges=[...edges.values()];
 const warnings=["BPMN: сохранены базовые формы, типы, координаты и маршруты из BPMN DI. Все внутренние связи сплошные; различия sequence flow / message flow / association остаются в текстовых типах. Это представление PlyLoom, не строгая визуальная нотация BPMN."];
 if(markers||fallback||graph.nodes.some(n=>["bpmn:participant","bpmn:lane"].includes(n.kind)))warnings.push(`Упрощены дополнительные маркеры событий / задач: ${markers}; неподдержанные формы: ${fallback}. Пулы и дорожки показаны рамками. Проверьте подписи и сложные элементы.`);
 if(skipped)warnings.push(`Не перенесены связи без двух отображаемых концов: ${skipped}.`);
 return finish(graph,warnings,decodedBytes);
}
