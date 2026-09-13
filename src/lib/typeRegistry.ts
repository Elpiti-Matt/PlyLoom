import { KINDS, EDGE_KINDS, type BuiltinNodeKind, type Graph, type TypeRegistry, type AttributeDefinition, type NodeShape, type NotationId, type Sheet } from "../model/types";

export const SHAPES:NodeShape[]=["rectangle","rounded","ellipse","diamond","parallelogram","cylinder","document","text","group"];
export const NOTATION_IDS:NotationId[]=["plyloom","flowchart","canvas","bpmn","drawio"];
/** Notation ID used before 0.7.0-rc.7; accepted on read so earlier files keep working. */
export const LEGACY_NOTATION="plyra";
export const readNotation=(raw:unknown):NotationId=>{const v=raw===LEGACY_NOTATION?"plyloom":raw;return NOTATION_IDS.includes(v as NotationId)?v as NotationId:"plyloom";};
export const DATA_TYPES=["text","number","boolean","date","url","select","multi"] as const;
/** Data types that carry a dictionary of options. */
export const CHOICE_TYPES=["select","multi"] as const;
export const STANDARD_NODES = [
  ["flowchart:process","Действие","Action","process","flowchart","rectangle"],
  ["flowchart:decision","Условие","Decision","decision","flowchart","diamond"],
  ["flowchart:terminator","Начало / конец","Start / end","process","flowchart","rounded"],
  ["flowchart:data","Данные / ввод-вывод","Data / input-output","entity","flowchart","parallelogram"],
  ["flowchart:document","Документ","Document","rule","flowchart","document"],
  ["canvas:text","Текст","Text","note","canvas","rectangle"],
  ["canvas:link","Ссылка","Link","note","canvas","rectangle"],
  ["canvas:file","Файл","File","rule","canvas","rectangle"],
  ["canvas:group","Группа","Group","entity","canvas","group"],
  ["bpmn:task","Задача","Task","process","bpmn","rounded"],
  ["bpmn:startEvent","Начальное событие","Start event","process","bpmn","ellipse"],
  ["bpmn:endEvent","Конечное событие","End event","process","bpmn","ellipse"],
  ["bpmn:intermediateCatchEvent","Промежуточное событие","Intermediate event","process","bpmn","ellipse"],
  ["bpmn:exclusiveGateway","Исключающий шлюз","Exclusive gateway","decision","bpmn","diamond"],
  ["bpmn:parallelGateway","Параллельный шлюз","Parallel gateway","decision","bpmn","diamond"],
  ["bpmn:inclusiveGateway","Включающий шлюз","Inclusive gateway","decision","bpmn","diamond"],
  ["bpmn:participant","Участник / пул","Participant / pool","entity","bpmn","group"],
  ["bpmn:lane","Дорожка","Lane","entity","bpmn","group"],
] as const;
export function defaultTypes(): TypeRegistry {
  return {
    nodes: [...KINDS.map(k => ({id:k.id,label:k.label,base:k.id as BuiltinNodeKind,color:"#475569",notation:"plyloom" as const})),...STANDARD_NODES.map(([id,label,labelEn,base,notation,shape])=>({id,label,labelEn,base,notation,shape,color:"#475569"}))],
    edges: [...EDGE_KINDS.map(k => ({id:k.id,label:k.label,color:"#475569"})),
      {id:"inherits",label:"наследует от",labelEn:"inherits from",color:"#475569"},
      {id:"implements",label:"реализует",labelEn:"implements",color:"#475569"},
      {id:"uses",label:"использует",labelEn:"uses",color:"#475569"}],
    sheets: [
      {id:"свободная",label:"Свободный лист",labelEn:"Free sheet",color:"#0ea5e9"},
      {id:"процесс",label:"Процесс",labelEn:"Process",color:"#f97316"},
      {id:"данные",label:"Данные",labelEn:"Data",color:"#14b8a6"},
      {id:"аргументы",label:"Аргументы",labelEn:"Arguments",color:"#a855f7"},
    ],
    tags:[{id:"draft",label:"Черновик",labelEn:"Draft",color:"#64748b"},{id:"review",label:"На проверке",labelEn:"In review",color:"#d97706"},{id:"reference",label:"Справочный",labelEn:"Reference",color:"#2563eb"}],
    attributes:[],
  };
}

export function typesFor(g?: Pick<Graph,"types">): TypeRegistry {
  const base=defaultTypes();
  const merge=<T extends {id:string}>(a:T[],b:T[]=[]) => [...new Map([...a,...b].map(x=>[x.id,x])).values()];
  return {nodes:merge(base.nodes,g?.types?.nodes),edges:merge(base.edges,g?.types?.edges),sheets:merge(base.sheets,g?.types?.sheets),tags:g?.types?.tags??base.tags,attributes:g?.types?.attributes??[]};
}
export function sheetTypeId(s:Sheet,registry:TypeRegistry=defaultTypes()):string {
  const aliases:Record<string,string>={free:"свободная",process:"процесс",data:"данные",arguments:"аргументы"};
  return s.typeId??(registry.sheets.some(t=>t.id===s.notation)?s.notation:(Object.prototype.hasOwnProperty.call(aliases,s.notation)?aliases[s.notation]:"свободная"));
}
const object=(v:unknown):v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);
export const safeTypeId=(v:unknown):v is string => typeof v==="string" && v.trim().length>0 && v.length<=60 && /^[\p{L}\p{N}_.:-]+$/u.test(v) && !["__proto__","constructor","prototype","__flat"].includes(v);
export function readTypes(input:unknown):TypeRegistry {
  if(!object(input))throw new Error("Словари: нужен объект");
  const out=defaultTypes();
  for(const category of ["nodes","edges","sheets","tags","attributes"] as const){
    const list=input[category]??((category==="tags"||category==="attributes")?out[category]:undefined);
    if(!Array.isArray(list))throw new Error(`Словарь ${category}: нужен массив`);
    const ids=new Set<string>();
    const parsed=list.map(raw=>{
      if(!object(raw)||!safeTypeId(raw.id)||ids.has(raw.id))throw new Error(`Словарь ${category}: некорректный или повторяющийся id`);
      ids.add(raw.id);
      if(typeof raw.label!=="string"||!raw.label.trim()||raw.label.length>80)throw new Error(`«${raw.id}»: нужно название до 80 символов`);
      if(raw.labelEn!==undefined&&(typeof raw.labelEn!=="string"||raw.labelEn.length>80))throw new Error(`«${raw.id}»: некорректное английское название`);
      if(raw.description!==undefined&&(typeof raw.description!=="string"||raw.description.length>2000))throw new Error(`«${raw.id}»: некорректное описание`);
      const common={id:raw.id,label:raw.label.trim(),...(raw.labelEn?{labelEn:String(raw.labelEn)}:{}),...(raw.description?{description:String(raw.description)}:{})};
      if(category==="attributes"){
        if(!DATA_TYPES.includes(raw.dataType as AttributeDefinition["dataType"]))throw new Error(`Атрибут «${raw.id}»: неизвестный тип данных`);
        const choice=raw.dataType==="select"||raw.dataType==="multi";
        const options=choice?raw.options:undefined;
        if(choice&&(!Array.isArray(options)||!options.length||options.length>100||options.some(x=>typeof x!=="string"||!x.trim()||x.length>200)||new Set(options).size!==options.length))throw new Error(`Атрибут «${raw.id}»: задайте уникальные непустые варианты`);
        return {...common,dataType:raw.dataType,...(options?{options}:{})};
      }
      const color=category==="edges"?"#475569":raw.color;
      if(typeof color!=="string"||!/^#[0-9a-fA-F]{6}$/.test(color))throw new Error(`«${raw.id}»: нужен цвет #RRGGBB`);
      if(category==="nodes"){
        if(!KINDS.some(k=>k.id===raw.base))throw new Error(`Тип «${raw.id}»: неизвестная базовая форма`);
        if(raw.shape!==undefined&&!SHAPES.includes(raw.shape as NodeShape))throw new Error(`Тип «${raw.id}»: неизвестная форма`);
        if(raw.notation!==undefined&&raw.notation!==LEGACY_NOTATION&&!NOTATION_IDS.includes(raw.notation as NotationId))throw new Error(`Тип «${raw.id}»: неизвестная нотация`);
        return {...common,color,base:raw.base as BuiltinNodeKind,notation:readNotation(raw.notation),...(raw.shape?{shape:raw.shape}:{})};
      }
      return {...common,color};
    });
    (out[category] as unknown[])=parsed;
  }
  return typesFor({types:out});
}
export function serializeProject(g:Graph):string { return JSON.stringify({...g,version:3,types:readTypes(typesFor(g)),sheets:g.sheets.map(s=>({...s,typeId:sheetTypeId(s,typesFor(g)),tags:s.tags??[]}))},null,2); }
export function emptyProject(title="Новый проект",sheetName="Первый лист"):Graph {
  return {version:3,title:title.trim()||"Новый проект",types:defaultTypes(),sheets:[{id:"main",name:sheetName.trim()||"Первый лист",notation:"plyloom",typeId:"свободная",tags:[],color:"#0ea5e9",layout:"manual",limit:15}],nodes:[],edges:[]};
}
export function typeUsage(g:Graph,category:keyof TypeRegistry,id:string):number {
  const filters=[...(g.savedViews??[]).map(v=>v.filter),...g.sheets.flatMap(s=>s.smartFilter?[s.smartFilter]:[])];
  const references=filters.filter(f=>category==="attributes"?Object.prototype.hasOwnProperty.call(f.attributes,id):category==="nodes"?f.hiddenNodeTypes.includes(id):category==="edges"?f.hiddenEdgeTypes.includes(id):false).length;
  if(category==="sheets")return g.sheets.filter(s=>sheetTypeId(s,typesFor(g))===id).length;
  if(category==="tags")return g.sheets.filter(s=>s.tags?.includes(id)).length;
  if(category==="attributes")return references+g.nodes.filter(n=>Object.prototype.hasOwnProperty.call(n.attributes??{},id)).length;
  return references+(category==="nodes"?g.nodes.filter(n=>n.kind===id).length:g.edges.filter(e=>(e.kind??"flow")===id).length);
}
