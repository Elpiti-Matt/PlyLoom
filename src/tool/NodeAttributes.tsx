import { MarkedText } from "../lib/Body";
import { useEffect, useId, useState } from "react";
import type { AttributeDefinition, AttributeValue, GNode } from "../model/types";
import { attributeError, attributeText } from "../lib/attributes";
import { useTypes } from "../lib/TypeContext";
import { useI18n } from "../lib/i18n";
import { DATA_LABELS } from "./TypeManager";

function AttributeField({definition,value,onChange}:{definition:AttributeDefinition;value:AttributeValue;onChange:(v:AttributeValue)=>void}){
 const {t}=useI18n(),{label}=useTypes(),id=useId(),[raw,setRaw]=useState(value===null||Array.isArray(value)?"":String(value)),[error,setError]=useState("");
 useEffect(()=>{setRaw(value===null||Array.isArray(value)?"":String(value));setError("");},[value]);
 const change=(raw:string)=>{setRaw(raw);const v=raw===""?null:definition.dataType==="number"?Number(raw):definition.dataType==="boolean"?raw==="true":raw;const err=attributeError(definition,v);setError(err??"");if(!err)onChange(v);};
 // Multiple choice: a checkbox per option; the value is the list of chosen options, [] when nothing is chosen.
 if(definition.dataType==="multi"){
  const chosen=Array.isArray(value)?value:[];
  const toggle=(option:string)=>onChange((definition.options??[]).filter(o=>o===option?!chosen.includes(o):chosen.includes(o)));
  return <div className="attribute-field"><span className="attribute-label">{label(definition)}<small>{t(DATA_LABELS.multi[0],DATA_LABELS.multi[1])}</small></span><div className="attribute-choices" role="group" aria-label={label(definition)}>{(definition.options??[]).map(option=><label key={option}><input type="checkbox" data-attribute-option={option} checked={chosen.includes(option)} onChange={()=>toggle(option)}/><span>{option}</span></label>)}{!definition.options?.length&&<small className="field-help">{t("Задайте варианты в справочнике атрибутов.","Define the options in the attribute dictionary.")}</small>}</div></div>;
 }
 return <div className="attribute-field"><label htmlFor={id}>{label(definition)}<small>{t(DATA_LABELS[definition.dataType][0],DATA_LABELS[definition.dataType][1])}</small></label>{definition.dataType==="select"||definition.dataType==="boolean"?<select id={id} value={raw} onChange={e=>change(e.target.value)}><option value="">{t("Не задано","Not set")}</option>{definition.dataType==="boolean"?<><option value="true">{t("Да","Yes")}</option><option value="false">{t("Нет","No")}</option></>:definition.options?.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input id={id} type={definition.dataType==="number"?"number":definition.dataType==="date"?"date":definition.dataType==="url"?"url":"text"} step={definition.dataType==="number"?"any":undefined} maxLength={10000} value={raw} aria-invalid={!!error} aria-describedby={error?id+"-error":undefined} onChange={e=>change(e.target.value)}/>} {error&&<small id={id+"-error"} className="form-error" role="alert">{t(error,"Enter a valid value for this data type.")}</small>}</div>;
}
export function NodeAttributes({node,onEdit,onManage,readOnly=false}:{node:GNode;onEdit?:(patch:Partial<GNode>)=>void;onManage?:()=>void;readOnly?:boolean}){
 const {registry,label}=useTypes(),{t,locale}=useI18n();
 const used=registry.attributes.filter(d=>Object.prototype.hasOwnProperty.call(node.attributes??{},d.id)),free=registry.attributes.filter(d=>!Object.prototype.hasOwnProperty.call(node.attributes??{},d.id));
 if(readOnly)return used.length?<dl className="node-attribute-values">{used.map(d=><div key={d.id}><dt>{label(d)}</dt><dd><MarkedText text={attributeText(node.attributes![d.id],locale==="en")} field="attrs"/></dd></div>)}</dl>:null;
 return <section className="node-attributes" aria-label={t("Атрибуты узла","Node attributes")}><header><b>{t("Атрибуты","Attributes")}</b>{onManage&&<button type="button" onClick={onManage}>{t("Справочник","Dictionary")}</button>}</header>{used.map(d=><div className="node-attribute-row" key={d.id}><AttributeField definition={d} value={node.attributes![d.id]} onChange={v=>onEdit?.({attributes:{...node.attributes,[d.id]:v}})}/><button type="button" aria-label={t(`Убрать атрибут ${label(d)}`,`Remove attribute ${label(d)}`)} onClick={()=>{const attributes={...node.attributes};delete attributes[d.id];onEdit?.({attributes});}}>×</button></div>)}{free.length>0&&<select className="attribute-add" aria-label={t("Добавить атрибут к узлу","Add attribute to node")} value="" onChange={e=>{if(e.target.value)onEdit?.({attributes:{...node.attributes,[e.target.value]:null}});}}><option value="">{t("+ Добавить атрибут","+ Add attribute")}</option>{free.map(d=><option key={d.id} value={d.id}>{label(d)}</option>)}</select>}{registry.attributes.length===0&&<p className="field-help">{t("Задайте название и тип данных в справочнике атрибутов.","Define an attribute name and data type in the dictionary.")}</p>}</section>;
}
