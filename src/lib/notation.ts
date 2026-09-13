import type { EdgeKind, GNode, Graph, Sheet, TypeRegistry } from "../model/types";
import { defaultTypes, sheetTypeId } from "./typeRegistry";
/** Legacy API: a sheet classification never excludes nodes or relations. */
export const NOTATIONS=defaultTypes().sheets.map(s=>({...s,nodes:null,edges:null}));
export function notationFor(sheet?:Sheet,types:TypeRegistry=defaultTypes()) {
  const id=sheet?sheetTypeId(sheet,types):"свободная";
  return {...(types.sheets.find(s=>s.id===id)??types.sheets[0]),nodes:null,edges:null};
}
export function allowsNode(_sheet:Sheet|undefined,_node:GNode,_types?:TypeRegistry){return true;}
export function allowsEdge(_sheet:Sheet|undefined,_kind:EdgeKind="flow",_types?:TypeRegistry){return true;}
export function notationLoss(g:Graph,sheet:Sheet){
 const local=new Set(g.nodes.filter(n=>n.sheets.includes(sheet.id)).map(n=>n.id));
 return {nodes:0,totalNodes:local.size,edges:0,totalEdges:g.edges.filter(e=>local.has(e.from)||local.has(e.to)).length};
}
