import type { AttributeDefinition, AttributeValue, TypeRegistry } from "../model/types";

export function attributeError(def:AttributeDefinition,value:unknown):string|null {
  if(value===null)return null;
  if(def.dataType==="number")return typeof value==="number"&&Number.isFinite(value)?null:"Введите конечное число";
  if(def.dataType==="boolean")return typeof value==="boolean"?null:"Выберите да или нет";
  if(def.dataType==="multi"){
    if(!Array.isArray(value)||value.length>100)return "Нужен список вариантов, до 100 значений";
    if(new Set(value).size!==value.length)return "Варианты не должны повторяться";
    return value.every(v=>typeof v==="string"&&def.options?.includes(v))?null:"Выберите значения из справочника";
  }
  if(typeof value!=="string"||value.length>10000)return "Нужно текстовое значение до 10 000 символов";
  if(def.dataType==="date"&&value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return "Дата должна быть в формате ГГГГ-ММ-ДД";
    const d=new Date(value+"T00:00:00Z");
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)return "Некорректная дата";
  }
  if(def.dataType==="url"&&value){try{if(!["http:","https:"].includes(new URL(value).protocol))return "Нужна ссылка http или https";}catch{return "Нужна полная ссылка http или https";}}
  if(def.dataType==="select"&&!def.options?.includes(value))return "Выберите значение из справочника";
  return null;
}
export function readAttributes(raw:unknown,registry:TypeRegistry):Record<string,AttributeValue>|undefined {
  if(raw===undefined)return undefined;
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).length>200)throw new Error("Атрибуты: нужен объект, до 200 значений");
  const entries=Object.entries(raw).map(([id,value])=>{
    const def=registry.attributes.find(a=>a.id===id);
    if(!def)throw new Error(`Неизвестный атрибут «${id}»`);
    const error=attributeError(def,value);if(error)throw new Error(`Атрибут «${def.label}»: ${error}`);
    return [id,value as AttributeValue];
  });
  return Object.fromEntries(entries);
}
export function attributeText(value:AttributeValue,english=false):string {
  if(Array.isArray(value))return value.length?value.join(", "):"—";
  if(value===null||value==="")return "—";
  return typeof value==="boolean"?(value?(english?"Yes":"Да"):(english?"No":"Нет")):String(value);
}
