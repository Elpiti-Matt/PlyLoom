import type { Graph, GNode, TypeRegistry, Pos, NodeShape, NodeAppearance, GEdge, Sheet } from "../model/types";
import { loadGraph } from "./graph";
import { defaultTypes, readTypes, typesFor, sheetTypeId } from "./typeRegistry";

import { safeColor, dimensions } from "./appearance";
import { LINE_STYLE } from "./lineStyles";

export const MAX_IMPORT_BYTES=128*1024*1024;
export interface DrawioImport { graph:Graph; warnings:string[]; decodedBytes:number }
const canonical=(v:unknown):string=>JSON.stringify(v,(_,value)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const bytes=(s:string)=>new TextEncoder().encode(s).length;
const xml=(s:string)=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");

/** Labels are plain text. Imported HTML is never inserted into the document. */
export function drawioText(value:string):string {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,"").replace(/<br\s*\/?\s*>|<\/div>|<\/p>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{
    const names:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "};
    if(entity[0]!=="#")return names[entity.toLowerCase()]??"";
    const n=entity[1].toLowerCase()==="x"?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):"";
  }).trim();
}
function parseXml(text:string):XMLDocument {
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("draw.io: DTD и XML-сущности не поддерживаются");
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("draw.io: повреждённый XML");
  return doc;
}
async function inflatePage(text:string,budget:number):Promise<string>{
  let packed:Uint8Array;
  try{packed=Uint8Array.from(atob(text.replace(/\s/g,"")),c=>c.charCodeAt(0));}catch{throw new Error("draw.io: некорректная сжатая страница");}
  let stream:DecompressionStream;
  try{stream=new DecompressionStream("deflate-raw");}catch{throw new Error("Этот браузер не распаковывает draw.io. Экспортируйте из draw.io XML без сжатия.");}
  const reader=new Blob([packed as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks:Uint8Array[]=[];let total=0;
  try{while(true){const r=await reader.read();if(r.done)break;total+=r.value.length;if(total>budget){await reader.cancel();throw new Error("draw.io: распакованные данные больше 128 МиБ");}chunks.push(r.value);}}
  catch(e){throw new Error(`draw.io: не удалось распаковать страницу. ${(e as Error).message}`);}
  const all=new Uint8Array(total);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
  try{return decodeURIComponent(new TextDecoder().decode(all));}catch{throw new Error("draw.io: повреждённый текст сжатой страницы");}
}

const styleMap=(text:string)=>Object.fromEntries(text.split(";").filter(Boolean).map(token=>{const i=token.indexOf("=");return i<0?[token,"1"]:[token.slice(0,i),token.slice(i+1)];}));
const geometry=(cell:Element)=>Array.from(cell.children).find(e=>e.tagName==="mxGeometry");
const number=(v:string|undefined|null,fallback:number)=>{if(v==null||v==="")return fallback;const n=Number(v);if(!Number.isFinite(n)||Math.abs(n)>10000000)throw new Error("draw.io: некорректная геометрия");return n;};
export function drawioShape(style:Record<string,string>):{shape:NodeShape;kind:string;known:boolean}{
 const raw=style.shape??(style.group?"group":style.ellipse?"ellipse":style.rhombus?"rhombus":style.text?"text":style.swimlane?"swimlane":"rectangle");
 const mapped:Record<string,NodeShape>={rectangle:style.rounded==="1"?"rounded":"rectangle",ellipse:"ellipse",rhombus:"diamond",cylinder:"cylinder",cylinder3:"cylinder",document:"document",parallelogram:"parallelogram",text:"text",group:"group",swimlane:"group"};
 const shape=mapped[raw]??"rectangle";
 const kinds:Partial<Record<NodeShape,string>>={diamond:"flowchart:decision",parallelogram:"flowchart:data",document:"flowchart:document",rounded:"flowchart:terminator"};
 return {shape,kind:kinds[shape]??(shape==="group"?"canvas:group":shape==="text"?"canvas:text":"entity"),known:!!mapped[raw]};
}
const box=(n:GNode,sid:string)=>{const p=n.pos[sid]??{x:0,y:0},d=dimensions(n,sid);return {...p,width:d.w,height:d.h};};
const anchor=(a:ReturnType<typeof box>,b:ReturnType<typeof box>,x?:string,y?:string):Pos=>{
 if(x!==undefined&&y!==undefined)return {x:a.x+number(x,.5)*a.width,y:a.y+number(y,.5)*a.height};
 const cx=a.x+a.width/2,cy=a.y+a.height/2,dx=b.x+b.width/2-cx,dy=b.y+b.height/2-cy;
 const k=1/Math.max(Math.abs(dx)/(a.width/2),Math.abs(dy)/(a.height/2),1);
 return {x:cx+dx*k,y:cy+dy*k};
};
/** Common draw.io shapes and geometry; PlyLoom supplies one relation line grammar. */
// Files written before 0.7.0-rc.7 use plyra* attribute names; every read falls back to them.
const legacyKey=(key:string)=>key.startsWith("plyloom")?"plyra"+key.slice(7):key;
const own=(el:Element,key:string)=>el.getAttribute(key)??el.getAttribute(legacyKey(key));
export async function parseDrawio(source:string,filename="draw.io",decodedBudget=MAX_IMPORT_BYTES):Promise<DrawioImport>{
 if(bytes(source)>MAX_IMPORT_BYTES)throw new Error("draw.io: файл больше 128 МиБ");
 const doc=parseXml(source),root=doc.documentElement;
 if(!["mxfile","mxGraphModel"].includes(root.tagName))throw new Error("Ожидается файл .drawio или XML draw.io");
 const rawTypes=own(root,"plyloomTypes");
 const registry=rawTypes?readTypes(JSON.parse(rawTypes)):defaultTypes();
 const pageEls=root.tagName==="mxGraphModel"?[root]:Array.from(root.children).filter(e=>e.tagName==="diagram");
 if(!pageEls.length)throw new Error("draw.io: требуется хотя бы одна страница");
 const graph:Graph={version:3,title:filename.replace(/\.(drawio|xml)$/i,"").slice(0,120),types:registry,sheets:[],nodes:[],edges:[]};
 const warnings:string[]=[],nodes=new Map<string,GNode>(),edgeIds=new Map<string,GEdge>();
 const pages:{sid:string;cells:Element[];mapped:Map<string,string>;position:(cell:Element)=>Pos}[]=[];
 let expandedBytes=0,skipped=0,unsupported=0,truncated=0,images=0,styledLines=0;
 const attr=(cell:Element,key:string)=>own(cell,key)??(["object","UserObject"].includes(cell.parentElement?.tagName??"")?own(cell.parentElement!,key):null);
 for(let pi=0;pi<pageEls.length;pi++){
  const page=pageEls[pi];let model:Element|null=page.tagName==="mxGraphModel"?page:page.querySelector("mxGraphModel");
  if(!model){const payload=(page.textContent??"").trim();const text=payload.startsWith("<")?payload:await inflatePage(payload,decodedBudget-expandedBytes);model=parseXml(text).documentElement;}
  expandedBytes+=bytes(model.outerHTML);if(expandedBytes>decodedBudget)throw new Error("draw.io: суммарные распакованные данные больше лимита 128 МиБ");
  if(model.tagName!=="mxGraphModel")throw new Error("draw.io: нет mxGraphModel");
  const sid=`page-${pi+1}`,sheetName=page.getAttribute("name")||`${filename} ${pi+1}`;
  const rawSheet=own(page,"plyloomSheet");
  const meta=rawSheet?JSON.parse(rawSheet):{};
  graph.sheets.push({id:sid,name:sheetName.slice(0,80),notation:typeof meta.notation==="string"?meta.notation:"drawio",typeId:meta.typeId??"свободная",tags:meta.tags??[],color:safeColor(meta.color,["#0ea5e9","#a855f7","#14b8a6","#f97316"][pi%4]),layout:"manual",limit:15});
  const cells=Array.from(model.querySelectorAll("mxCell")),ids=new Map<string,Element>(),mapped=new Map<string,string>();
  for(const cell of cells){const id=attr(cell,"id");if(!id||ids.has(id))throw new Error("draw.io: элемент без id или повторяющийся id");ids.set(id,cell);}
  const position=(cell:Element,seen=new Set<Element>()):Pos=>{
   if(seen.has(cell)||seen.size>100)throw new Error("draw.io: циклические или слишком глубокие группы");seen.add(cell);
   const geo=geometry(cell),parent=ids.get(attr(cell,"parent")??"");let x=number(geo?.getAttribute("x"),0),y=number(geo?.getAttribute("y"),0);
   if(geo?.getAttribute("relative")==="1"&&attr(cell,"vertex")==="1"&&parent){const pg=geometry(parent);x*=number(pg?.getAttribute("width"),208);y*=number(pg?.getAttribute("height"),80);}
   const offset=geo?.querySelector('mxPoint[as="offset"]');x+=number(offset?.getAttribute("x"),0);y+=number(offset?.getAttribute("y"),0);
   const p=parent?position(parent,seen):{x:0,y:0};return{x:p.x+x,y:p.y+y};
  };
  for(const cell of cells){
   if(attr(cell,"vertex")!=="1")continue;
   const cid=attr(cell,"id")!,style=styleMap(attr(cell,"style")??""),converted=drawioShape(style),geo=geometry(cell);
   if(!converted.known)unsupported++;if(style.image)images++;
   const ownId=attr(cell,"plyloomNodeId"),id=ownId?`shared:${ownId}`:`${sid}:${cid}`,kind=attr(cell,"plyloomKind")??converted.kind;
   if(!registry.nodes.some(k=>k.id===kind))throw new Error(`draw.io: неизвестный тип узла «${kind}»`);
   const rawLabel=attr(cell,"label")??attr(cell,"value")??"",plain=style.html==="0"?rawLabel:drawioText(rawLabel),body=attr(cell,"plyloomBody")??(plain.length>200||converted.shape==="text"?plain:"");if(plain.length>200)truncated++;
   const name=(plain||"Без названия").slice(0,200),attributes=attr(cell,"plyloomAttributes")?JSON.parse(attr(cell,"plyloomAttributes")!):undefined,existing=nodes.get(id);
   if(existing&&(existing.name!==name||existing.kind!==kind||existing.body!==body||canonical(existing.attributes??{})!==canonical(attributes??{})))throw new Error("draw.io: противоречащие друг другу копии общего узла");
   const node:GNode=existing??{id,sheets:[],pos:{},name,kind,body,...(attributes?{attributes}:{})};
   if(attr(cell,"plyloomExternal")!=="1"){
    if(!node.sheets.includes(sid))node.sheets.push(sid);node.pos[sid]=position(cell);
    const appearance:NodeAppearance=attr(cell,"plyloomAppearance")?JSON.parse(attr(cell,"plyloomAppearance")!):{width:number(geo?.getAttribute("width"),208),height:number(geo?.getAttribute("height"),80),shape:converted.shape,fill:safeColor(style.fillColor,converted.shape==="group"||converted.shape==="text"?"transparent":"#ffffff"),stroke:safeColor(style.strokeColor,"#000000"),strokeWidth:number(style.strokeWidth,1),fontColor:safeColor(style.fontColor,"#000000"),fontSize:number(style.fontSize,12),rotation:number(style.rotation,0),bold:(number(style.fontStyle,0)&1)===1,align:["left","center","right"].includes(style.align)?style.align as NodeAppearance["align"]:"center",sourceType:"drawio:"+(style.shape??converted.shape)};
    node.appearance={...node.appearance,[sid]:appearance};
   }
   nodes.set(id,node);mapped.set(cid,id);
  }
  pages.push({sid,cells,mapped,position});
 }
 graph.nodes=[...nodes.values()];
 if(graph.nodes.some(n=>!n.sheets.length))throw new Error("draw.io: внешняя карточка не имеет исходного узла ни на одной странице");
 for(const page of pages)for(const cell of page.cells){
  if(attr(cell,"edge")!=="1")continue;
  const from=page.mapped.get(attr(cell,"source")??""),to=page.mapped.get(attr(cell,"target")??"");
  if(!from||!to){skipped++;continue;}
  const id=attr(cell,"plyloomEdgeId")?`shared:${attr(cell,"plyloomEdgeId")}`:`${page.sid}:${attr(cell,"id")}`,style=styleMap(attr(cell,"style")??"");
  const rawLabel=attr(cell,"label")??attr(cell,"value")??"",label=style.html==="0"?rawLabel:drawioText(rawLabel);if(label.length>120)truncated++;
  const kind=attr(cell,"plyloomKind")??"ref";
  if(!registry.edges.some(k=>k.id===kind))throw new Error(`draw.io: неизвестный тип связи «${kind}»`);
  if(style.dashed==="1"||style.curved==="1")styledLines++;
  const edge:GEdge={id,from,to,kind,label:label.slice(0,120),directed:style.endArrow!=="none",sourceType:attr(cell,"plyloomSourceType")??"drawio:connector"},previous=edgeIds.get(id);
  if(previous&&canonical({...previous,routes:undefined})!==canonical(edge))throw new Error("draw.io: противоречащие друг другу копии связи");
  const fn=nodes.get(from)!,tn=nodes.get(to)!;
  if(fn.sheets.includes(page.sid)&&tn.sheets.includes(page.sid)){
   const a=box(fn,page.sid),b=box(tn,page.sid),geo=geometry(cell),start=anchor(a,b,style.exitX,style.exitY),end=anchor(b,a,style.entryX,style.entryY),offset=page.position(cell);
   let points=Array.from(geo?.querySelectorAll('Array[as="points"] > mxPoint')??[]).map(p=>({x:number(p.getAttribute("x"),0)+offset.x,y:number(p.getAttribute("y"),0)+offset.y}));
   if(!points.length&&style.edgeStyle?.includes("orthogonal"))points=[{x:(start.x+end.x)/2,y:start.y},{x:(start.x+end.x)/2,y:end.y}];
   const route=attr(cell,"plyloomRoute")?JSON.parse(attr(cell,"plyloomRoute")!):{from:a,to:b,points:[start,...points,end]};
   edge.routes={...(previous?.routes??{}),[page.sid]:route};
  }else if(previous?.routes)edge.routes=previous.routes;
  edgeIds.set(id,edge);
 }
 graph.edges=[...edgeIds.values()];
 warnings.push("Сохраняются позиции, размеры, основные формы, цвета узлов и точки маршрутов. Все связи внутри листа показаны сплошными; смысл остаётся в типе и подписи.");
 if(styledLines)warnings.push(`Линии приведены к легенде PlyLoom: ${styledLines}. Кривые с точками превращены в ломаные.`);
 if(unsupported)warnings.push(`Неподдержанные пользовательские фигуры: ${unsupported}; заменены прямоугольниками с исходными размерами.`);
 if(images)warnings.push(`Изображения и вложения не перенесены: ${images}. Их рамки и подписи сохранены.`);
 if(graph.edges.some(e=>e.sourceType==="drawio:connector"&&e.kind==="ref"))warnings.push("У обычных соединителей draw.io без семантического типа выбран тип «см.». Подписи сохранены; проверьте типы отношений, особенно в UML и BPMN, нарисованных в draw.io.");
 if(skipped)warnings.push(`Пропущено соединителей без двух известных узлов: ${skipped}.`);
 if(truncated)warnings.push(`Сокращено длинных названий или подписей: ${truncated}; полный текст узла сохранён в описании.`);
 const loaded=loadGraph(graph);if(!loaded.graph)throw new Error(loaded.errors.join("\n"));
 return{graph:loaded.graph,warnings,decodedBytes:expandedBytes};
}
/** Append any supported diagram. Metadata and geometry are remapped with the same IDs. */
export function appendDrawio(target:Graph,imports:DrawioImport[]):Graph {
 let result:Graph={...target,version:3,types:readTypes(typesFor(target)),sheets:[...target.sheets],nodes:[...target.nodes],edges:[...target.edges]};
 for(let i=0;i<imports.length;i++){
  const incoming=imports[i].graph,prefix=`io${result.sheets.length}_${i}_`,used=new Set([...result.sheets,...result.nodes,...result.edges].map(x=>x.id));let serial=0;
  const ids=new Map<string,string>(),id=(category:string,value:string)=>{const key=`${category}:${value}`;if(!ids.has(key)){let next:string;do{next=prefix+(serial++);}while(used.has(next));used.add(next);ids.set(key,next);}return ids.get(key)!;};
  const registry=readTypes(typesFor(incoming)),dest=readTypes(typesFor(result)),remap:Record<keyof TypeRegistry,Map<string,string>>={nodes:new Map(),edges:new Map(),sheets:new Map(),tags:new Map(),attributes:new Map()};
  for(const category of ["nodes","edges","sheets","tags","attributes"] as const)for(const def of registry[category]){
   const previous=dest[category].find(t=>t.id===def.id);let typeId=def.id;
   if(previous&&canonical(previous)!==canonical(def)){let n=0;do{typeId=`${prefix}type_${category}_${n++}`;}while(dest[category].some(t=>t.id===typeId));}
   remap[category].set(def.id,typeId);if(!dest[category].some(t=>t.id===typeId))(dest[category] as unknown[]).push({...def,id:typeId});
  }
  const onSheets=<T,>(value:Record<string,T>|undefined)=>value?Object.fromEntries(Object.entries(value).map(([sid,v])=>[id("s",sid),v])):undefined;
  result={...result,types:dest,sheets:[...result.sheets,...incoming.sheets.map(s=>({...s,id:id("s",s.id),typeId:remap.sheets.get(sheetTypeId(s,registry))??sheetTypeId(s,registry),tags:s.tags?.map(tag=>remap.tags.get(tag)??tag)}))],
   nodes:[...result.nodes,...incoming.nodes.map(n=>({...n,id:id("n",n.id),kind:remap.nodes.get(n.kind)??n.kind,sheets:n.sheets.map(s=>id("s",s)),pos:onSheets(n.pos)!,...(n.appearance?{appearance:onSheets(n.appearance)}:{}),...(n.attributes?{attributes:Object.fromEntries(Object.entries(n.attributes).map(([key,v])=>[remap.attributes.get(key)??key,v]))}:{})}))],
   edges:[...result.edges,...incoming.edges.map(e=>({...e,id:id("e",e.id),from:id("n",e.from),to:id("n",e.to),kind:remap.edges.get(e.kind??"flow")??e.kind,...(e.routes?{routes:onSheets(e.routes)}:{})}))]};
 }
 const loaded=loadGraph(result);if(!loaded.graph)throw new Error(loaded.errors.join("\n"));return loaded.graph;
}
export function exportDrawio(graph:Graph):string {
 const registry=readTypes(typesFor(graph)),byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const data=(name:string,value:unknown)=>value===undefined?"":` ${name}="${xml(JSON.stringify(value))}"`;
 const textAttr=(name:string,value:string)=>` ${name}="${xml(value).replace(/\n/g,'&#10;').replace(/\r/g,'&#13;')}"`;
 const pages=graph.sheets.map((sheet,si)=>{
  const locals=graph.nodes.filter(n=>n.sheets.includes(sheet.id)),localIds=new Set(locals.map(n=>n.id));
  const edges=graph.edges.filter(e=>localIds.has(e.from)||localIds.has(e.to)),externalIds=new Set(edges.flatMap(e=>[e.from,e.to]).filter(id=>!localIds.has(id)));
  const all=[...locals,...[...externalIds].map(id=>byId.get(id)!)],cellIds=new Map(all.map((n,i)=>[n.id,`n${i+1}`]));
  const vertices=all.map((n,i)=>{
   const def=registry.nodes.find(k=>k.id===n.kind)!,p=n.pos[sheet.id]??{x:800,y:(i-locals.length)*120},external=!localIds.has(n.id),a=n.appearance?.[sheet.id],d=dimensions(n,sheet.id);
   const shape=a?.shape==="diamond"?"rhombus":a?.shape==="rounded"?"rectangle":a?.shape??(def.base==="decision"?"rhombus":"rectangle");
   const style=`shape=${shape};whiteSpace=wrap;html=0;rounded=${a?.shape==="rounded"?1:0};strokeColor=${a?.stroke??def.color};fillColor=${a?.fill??"#ffffff"};fontColor=${a?.fontColor??"#0f172a"};fontSize=${a?.fontSize??14};rotation=${a?.rotation??0};fontStyle=${a?.bold?1:0};align=${a?.align??"center"};${external?'dashed=1;opacity=60;':''}`;
   return `<mxCell id="${cellIds.get(n.id)}"${textAttr("value",n.name)} vertex="1" parent="1"${textAttr("plyloomNodeId",n.id)}${textAttr("plyloomKind",n.kind)}${textAttr("plyloomBody",n.body)}${data("plyloomAttributes",n.attributes)}${data("plyloomAppearance",a)}${external?' plyloomExternal="1"':''} style="${xml(style)}"><mxGeometry x="${p.x}" y="${p.y}" width="${d.w}" height="${a?.height??80}" as="geometry"/></mxCell>`;
  }).join("\n");
  const connectors=edges.map((e,i)=>{
   const cross=!localIds.has(e.from)||!localIds.has(e.to),style=cross?LINE_STYLE.external:LINE_STYLE.local,route=!cross?e.routes?.[sheet.id]:undefined;
   const points=route?.points.slice(1,-1).map(p=>`<mxPoint x="${p.x}" y="${p.y}"/>`).join("");
   return `<mxCell id="e${i+1}"${textAttr("value",e.label??"")} edge="1" parent="1" source="${cellIds.get(e.from)}" target="${cellIds.get(e.to)}"${textAttr("plyloomEdgeId",e.id)}${textAttr("plyloomKind",e.kind??"flow")}${textAttr("plyloomSourceType",e.sourceType??"drawio:connector")}${data("plyloomRoute",route)} style="html=0;strokeColor=${style.color};endArrow=${e.directed===false?'none':'classic'};${cross?'dashed=1;':''}"><mxGeometry relative="1" as="geometry">${points?`<Array as="points">${points}</Array>`:""}</mxGeometry></mxCell>`;
  }).join("\n");
  return `<diagram id="sheet${si}" name="${xml(sheet.name)}"${data("plyloomSheet",{typeId:sheetTypeId(sheet,registry),tags:sheet.tags??[],notation:sheet.notation,color:sheet.color} satisfies Partial<Sheet>)}><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>\n${vertices}\n${connectors}\n</root></mxGraphModel></diagram>`;
 }).join("\n");
 return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="PlyLoom" plyloomTypes="${xml(JSON.stringify(registry))}">\n${pages}\n</mxfile>`;
}
