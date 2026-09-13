import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Graph } from "../model/types";
import { typesFor } from "./typeRegistry";
import { useI18n } from "./i18n";

const Context=createContext(typesFor());
export function TypeProvider({graph,children}:{graph:Graph;children:ReactNode}){
  const value=useMemo(()=>typesFor(graph),[graph.types]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTypes(){
  const registry=useContext(Context),{locale,t}=useI18n();
  return {registry,nodeTypes:registry.nodes,edgeTypes:registry.edges,sheetTypes:registry.sheets,
    nodeType:(id:string)=>registry.nodes.find(k=>k.id===id)??registry.nodes[0],
    edgeType:(id="flow")=>registry.edges.find(k=>k.id===id)??registry.edges[0],
    label:(k:{label:string;labelEn?:string})=>locale==="en"?(k.labelEn||t(k.label)):k.label};
}
