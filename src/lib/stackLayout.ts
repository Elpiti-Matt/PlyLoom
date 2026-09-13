import type { Graph } from "../model/types";
import { sheetTypeId, typesFor } from "./typeRegistry";
/** One sheet appears once, even with multiple tags. A tag cluster is an explicit chosen tag. */
export function groupStackSheets(graph:Graph,ids:string[],groupBy:string):string[]{
 const registry=typesFor(graph),sheets=new Map(graph.sheets.map(s=>[s.id,s]));
 const key=(id:string)=>{const s=sheets.get(id);if(!s)return "";if(groupBy==="type")return registry.sheets.find(t=>t.id===sheetTypeId(s,registry))?.label??"";if(groupBy.startsWith("tag:"))return s.tags?.includes(groupBy.slice(4))?"0":"1";return "";};
 return [...ids].sort((a,b)=>key(a).localeCompare(key(b),"ru")||ids.indexOf(a)-ids.indexOf(b));
}
