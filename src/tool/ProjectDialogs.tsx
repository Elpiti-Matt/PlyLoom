import { useState } from "react";
import type { Graph, GEdge } from "../model/types";
import { useI18n } from "../lib/i18n";
import { useTypes } from "../lib/TypeContext";
import { TagChoices } from "./TypeManager";
import { Modal } from "./Modal";

export function NewProjectDialog({onCreate,onClose,onSave}:{onCreate:(title:string,sheet:string)=>void;onClose:()=>void;onSave:()=>void}){
  const {t}=useI18n(),[title,setTitle]=useState(t("Новый проект","New project")),[sheet,setSheet]=useState(t("Первый лист","First sheet"));
  return <Modal title={t("Новый пустой проект","New empty project")} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(title.trim()&&sheet.trim())onCreate(title.trim(),sheet.trim());}}>
    <p className="modal-intro">{t("Начните с одного пустого листа. Затем добавьте узлы, второй лист и связи между ними.","Start with one empty sheet. Then add nodes, another sheet and relations between them.")}</p>
    <label htmlFor="new-project-title">{t("Название проекта","Project name")}</label><input data-autofocus id="new-project-title" required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/>
    <label htmlFor="new-project-sheet">{t("Первый лист","First sheet")}</label><input id="new-project-sheet" required maxLength={80} value={sheet} onChange={e=>setSheet(e.target.value)}/>
    <p className="field-help">{t("Новый проект заменит открытый. Прежний можно вернуть кнопкой «Отменить» до перезагрузки страницы.","This replaces the open project. Undo can restore it until you reload the page.")}</p><button type="button" onClick={onSave}>{t("Сначала скачать текущий .plyloom","Download current .plyloom first")}</button>
    <footer><button type="button" onClick={onClose}>{t("Отмена","Cancel")}</button><button className="primary" type="submit">{t("Создать пустой проект","Create empty project")}</button></footer>
  </form></Modal>;
}

export function NewSheetDialog({onCreate,onClose}:{onCreate:(name:string,type:string,tags:string[])=>void;onClose:()=>void}){
  const {t}=useI18n(),{sheetTypes,registry,label}=useTypes(),[name,setName]=useState(""),[type,setType]=useState("свободная"),[tags,setTags]=useState<string[]>([]);
  return <Modal title={t("Новый лист","New sheet")} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(name.trim())onCreate(name.trim(),type,tags);}}>
    <p className="modal-intro">{t("Лист — отдельный взгляд на проект. Один узел может присутствовать на нескольких листах с общими названием и содержимым.","A sheet is a view of your project. One node can appear on multiple sheets, sharing its name and content.")}</p>
    <label htmlFor="new-sheet-name">{t("Название листа","Sheet name")}</label><input id="new-sheet-name" data-autofocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
    <label htmlFor="new-sheet-type">{t("Тип листа","Sheet type")}</label><select id="new-sheet-type" value={type} onChange={e=>setType(e.target.value)}>{sheetTypes.map(s=><option key={s.id} value={s.id}>{label(s)}</option>)}</select>
    <fieldset><legend>{t("Теги листа","Sheet tags")}</legend><TagChoices tags={registry.tags} value={tags} onChange={setTags}/></fieldset>
    <footer><button type="button" onClick={onClose}>{t("Отмена","Cancel")}</button><button className="primary" type="submit">{t("Создать лист","Create sheet")}</button></footer>
  </form></Modal>;
}

export function NewRelationDialog({graph,selected,onCreate,onClose}:{graph:Graph;selected:string|null;onCreate:(edge:Omit<GEdge,"id">)=>void;onClose:()=>void}){
  const {t,name}=useI18n(),{edgeTypes,label}=useTypes(),[from,setFrom]=useState(selected??graph.nodes[0]?.id??""),[to,setTo]=useState(graph.nodes.find(n=>n.id!==(selected??graph.nodes[0]?.id))?.id??""),[kind,setKind]=useState("ref"),[caption,setCaption]=useState("");
  const option=(id:string)=>{const n=graph.nodes.find(n=>n.id===id)!;return `${name(n.name)} · ${n.sheets.map(sid=>name(graph.sheets.find(s=>s.id===sid)?.name??sid)).join(", ")}`;};
  return <Modal title={t("Новая связь","New relation")} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(from&&to&&from!==to)onCreate({from,to,kind,label:caption.trim()});}}>
    <p className="modal-intro">{t("Выберите два узла из любых листов. Связь между разными узлами отличается от размещения одного общего узла на нескольких листах.","Choose two nodes from any sheets. A relation connects distinct nodes; placing one shared node on several sheets keeps a single identity.")}</p>
    <label htmlFor="new-edge-from">{t("От узла","From node")}</label><select data-autofocus id="new-edge-from" value={from} onChange={e=>setFrom(e.target.value)}>{graph.nodes.map(n=><option key={n.id} value={n.id}>{option(n.id)}</option>)}</select>
    <label htmlFor="new-edge-to">{t("К узлу","To node")}</label><select id="new-edge-to" value={to} onChange={e=>setTo(e.target.value)}>{graph.nodes.map(n=><option key={n.id} value={n.id}>{option(n.id)}</option>)}</select>
    <label htmlFor="new-edge-kind">{t("Тип связи","Relation type")}</label><select id="new-edge-kind" value={kind} onChange={e=>setKind(e.target.value)}>{edgeTypes.map(k=><option key={k.id} value={k.id}>{label(k)}</option>)}</select>
    <label htmlFor="new-edge-label">{t("Подпись (необязательно)","Label (optional)")}</label><input id="new-edge-label" maxLength={120} value={caption} onChange={e=>setCaption(e.target.value)}/>
    {from===to&&<p className="form-error">{t("Выберите разные узлы.","Choose two different nodes.")}</p>}
    <footer><button type="button" onClick={onClose}>{t("Отмена","Cancel")}</button><button className="primary" type="submit" disabled={!from||!to||from===to}>{t("Создать связь","Create relation")}</button></footer>
  </form></Modal>;
}
