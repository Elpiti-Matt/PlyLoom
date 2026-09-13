import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UI_EN, DEMO_EN } from "./translations";
export type Locale = "ru" | "en";
const KEY="plyloom.language",LEGACY_KEY="atlas.language";
function translateDiagnostic(text:string):string {
  const named=(s:string)=>Object.prototype.hasOwnProperty.call(DEMO_EN,s)?DEMO_EN[s]:s;
  const patterns:[RegExp,(...s:string[])=>string][]=[
    [/^Лист «(.+)»: (\d+) узлов — заметно больше остальных; читать помогут фильтр и поиск$/,(_,n,c)=>`Sheet “${named(n)}”: ${c} nodes, well above the rest; the filter and the search help read it`],
    [/^Лист «(.+)» пуст$/,(_,n)=>`Sheet “${named(n)}” is empty`],
    [/^Лист «(.+)» ни с чем не связан$/,(_,n)=>`Sheet “${named(n)}” has no connections`],
    [/^«(.+)» ни с чем не связан$/,(_,n)=>`“${named(n)}” has no connections`],
    [/^«(.+)» — хаб: (\d+) связей$/,(_,n,c)=>`“${named(n)}” is a hub: ${c} edges`],
    [/^«(.+)» без тела$/,(_,n)=>`“${named(n)}” has no body`],
    [/^«(.+)» — слишком длинное имя$/,(_,n)=>`“${named(n)}” has a long name`],
    [/^«(.+)» числится на листе «(.+)», но ни с чем там не связан$/,(_,n,s)=>`“${named(n)}” appears on “${named(s)}” with no local connections`],
    [/^«(.+)»: (\d+) соседей на листе «(.+)» — вероятно, ему туда же$/,(_,n,c,s)=>`“${named(n)}” has ${c} neighbors on “${named(s)}”; consider adding it there`],
    [/^«(.+)» стоит на (\d+) листах из (\d+) — возможно, это тема, а не узел$/,(_,n,c,total)=>`“${named(n)}” appears on ${c} of ${total} sheets; it may be a topic rather than a node`],
    [/^Противоречие: «(.+)» ↔ «(.+)»$/,(_,a,b)=>`Contradiction: “${named(a)}” ↔ “${named(b)}”`],
    [/^Ребро (.+) ссылается на отсутствующий узел$/,(_,n)=>`Edge ${n} refers to a missing node`],
    [/^CSV, строка (\d+): число столбцов не совпадает с заголовком$/,(_,n)=>`CSV row ${n}: column count differs from the header`],
    [/^Лист «(.+)»: неизвестный режим расположения$/,(_,n)=>`Sheet “${n}”: unknown layout mode`],
    [/^flatPositions: некорректная позиция «(.+)»$/,(_,n)=>`flatPositions: invalid or orphaned position “${n}”`],
    [/^flatPositions: нужен объект координат$/,()=>"flatPositions: expected a coordinate object"],
  ];
  for(const [pattern,format] of patterns){const match=text.match(pattern);if(match)return format(...match);}
  // Loader diagnostics are translated at their display boundary; node bodies never pass here.
  const parts:Record<string,string>={"нет id":"missing or invalid id","дубликат id":"duplicate id","название длиннее 80 символов":"name exceeds 80 characters","членства должны быть строками":"memberships must be strings","некорректные координаты на листе":"invalid coordinates on sheet","неизвестный лист":"unknown sheet","ни одного существующего листа, перенесён на":"no existing sheet; fallback assigned to","неизвестный тип":"unknown type","имя длиннее 200 символов":"name exceeds 200 characters","тело больше 1 млн символов":"body exceeds 1 million characters","некорректная таблица":"invalid table","больше 20 тегов":"more than 20 tags","нет from/to":"missing from/to","некорректный или повторяющийся id":"invalid or duplicate id","подпись длиннее 120 символов":"label exceeds 120 characters","висячий конец, пропущено":"missing endpoint; edge skipped"};
  let result=text;
  for(const [ru,en] of Object.entries(parts))result=result.replace(ru,en);
  if(result!==text)result=result.replace(/^Узел /,"Node ").replace(/^Лист /,"Sheet ").replace(/^Ребро /,"Edge ");
  return result;
}
export function storedLocale():Locale { try{return (localStorage.getItem(KEY)??localStorage.getItem(LEGACY_KEY))==="en"?"en":"ru";}catch{return "ru";} }
export function translate(text:string,locale:Locale,english?:string):string {
  if(locale==="ru")return text;
  if(english!==undefined)return english;
  const key=text.trim();
  if(Object.prototype.hasOwnProperty.call(UI_EN,key))return text.replace(key,()=>UI_EN[key]);
  return translateDiagnostic(text);
}
interface I18n {
  locale:Locale; setLocale:(l:Locale)=>void;
  t:(ru:string,en?:string)=>string;
  name:(text:string|undefined)=>string;
}
const Context=createContext<I18n>({locale:"ru",setLocale:()=>{},t:(s)=>s,name:(s)=>s??""});
export function LocaleProvider({children}:{children:ReactNode}) {
  const [locale,setLocale]=useState<Locale>(storedLocale);
  useEffect(()=>{document.documentElement.lang=locale;try{localStorage.setItem(KEY,locale);}catch{/* preference storage is optional */}},[locale]);
  const t=useCallback((ru:string,en?:string)=>translate(ru,locale,en),[locale]);
  const name=useCallback((text:string|undefined)=>locale==="en"&&Object.prototype.hasOwnProperty.call(DEMO_EN,text??"")?DEMO_EN[text??""]:text??"",[locale]);
  const value=useMemo(()=>({locale,setLocale,t,name}),[locale,t,name]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(){return useContext(Context);}
