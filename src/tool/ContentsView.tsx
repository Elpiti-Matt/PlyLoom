import { useMemo, useState } from "react";
import type { Graph } from "../model/types";
import { edgesBetweenSheets, type Index } from "../lib/graph";
import { useI18n } from "../lib/i18n";

interface Props {graph:Graph;idx:Index;compact?:boolean;visibleNodeIds?:Set<string>|null;visibleEdgeIds?:Set<string>|null;dimHidden?:boolean;onOpenSheet:(id:string)=>void;onOpenSpread:(a:string,b:string)=>void}
export function ContentsView({graph,idx,compact=false,visibleNodeIds:vn,visibleEdgeIds:ve,dimHidden=false,onOpenSheet,onOpenSpread}:Props){
  const {t,name}=useI18n(),[list,setList]=useState(false),[focus,setFocus]=useState("");
  // Counts follow the shared visible set: a pair whose relations and shared nodes are all
  // filtered out disappears, like the objects themselves do on sheets. In dim mode the pair
  // stays faded with its full counts.
  const nodesOn=(sid:string)=>{const all=idx.bySheet.get(sid)??[];return vn?all.filter(n=>vn.has(n.id)):all;};
  const links=useMemo(()=>{
    const out:{a:string;b:string;relations:number;shared:number;muted:boolean}[]=[];
    for(let i=0;i<graph.sheets.length;i++)for(let j=i+1;j<graph.sheets.length;j++){
      const a=graph.sheets[i].id,b=graph.sheets[j].id,between=edgesBetweenSheets(graph,idx,a,b);
      const relations=ve?between.filter(e=>ve.has(e.id)).length:between.length;
      const shared=nodesOn(a).filter(n=>n.sheets.includes(b)).length;
      if(dimHidden){const all=(idx.bySheet.get(a)??[]).filter(n=>n.sheets.includes(b)).length;if(between.length||all)out.push({a,b,relations:between.length,shared:all,muted:!relations&&!shared});}
      else if(relations||shared)out.push({a,b,relations,shared,muted:false});
    }return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[graph,idx,vn,ve,dimHidden]);
  const activeFocus=idx.sheetById.has(focus)?focus:"",visibleLinks=links.filter(l=>!activeFocus||l.a===activeFocus||l.b===activeFocus);
  const n=graph.sheets.length,W=compact?390:940,CW=compact?150:190,CH=compact?90:82;
  const grid=compact||n>10,cols=compact?2:3,H=grid?Math.max(280,Math.ceil(n/cols)*148+70):610;
  const points=new Map(graph.sheets.map((s,i)=>{
    if(grid)return [s.id,{x:compact?(i%2?292:98):160+(i%3)*310,y:74+Math.floor(i/cols)*148+(compact&&i%2?28:0)}];
    const angle=-Math.PI/2+i/Math.max(n,1)*Math.PI*2;return [s.id,{x:W/2+Math.cos(angle)*340,y:H/2+Math.sin(angle)*235}];
  }));
  const sheetName=(id:string)=>name(idx.sheetById.get(id)?.name??id);
  const wrap=(text:string)=>{
    const max=compact?17:23,words=text.split(/\s+/),lines:string[]=[];let current="";
    for(const word of words){if(current&&(current+" "+word).length>max){lines.push(current);current=word;}else current+=(current?" ":"")+word;}
    if(current)lines.push(current);return lines.slice(0,2).map((line,i)=>line.length>max?line.slice(0,max-1)+"…":i===1&&lines.length>2?line.slice(0,max-1)+"…":line);
  };
  return <div className="project-overview" data-overview-layout={compact?"mobile":"desktop"}>
    <div className="project-overview-heading"><div><span className="eyebrow">{t("Карта листов","Sheet map")}</span><h2>{name(graph.title)}</h2><p>{graph.sheets.length} {t("листов","sheets")} · {graph.nodes.length} {t("узлов","nodes")} · {graph.edges.length} {t("связей","relations")}</p></div><div className="overview-switch" role="group" aria-label={t("Вид оглавления","Contents view")}><button aria-pressed={!list} onClick={()=>setList(false)}>{t("Схема","Diagram")}</button><button aria-pressed={list} onClick={()=>setList(true)}>{t("Список","List")}</button></div></div>
    <div className="overview-controls"><label htmlFor="overview-focus">{t("Выделить связи листа","Focus on a sheet's connections")}</label><select id="overview-focus" value={activeFocus} onChange={e=>setFocus(e.target.value)}><option value="">{t("Все листы","All sheets")}</option>{graph.sheets.map(s=><option key={s.id} value={s.id}>{name(s.name)}</option>)}</select></div>
    <div className="overview-legend"><span><i className="relation-line"/>{t("Связи разных узлов","Relations between nodes")}</span><span><i className="identity-line"/>{t("Общие узлы · один ID","Shared nodes · same ID")}</span></div>
    <p className="overview-hint">{t("Карточка открывает лист. Число на линии открывает два листа рядом. В плотной схеме выделите один лист выше.","A card opens its sheet. A number on a line opens both sheets side by side. Focus on one sheet above to read a dense diagram.")}</p>
    {list?<ul className="overview-sheet-list">{graph.sheets.map(s=><li key={s.id}><button onClick={()=>onOpenSheet(s.id)}><i style={{background:s.color}}/><b>{name(s.name)}</b><span>{idx.bySheet.get(s.id)?.length??0} {t("узлов","nodes")}</span></button></li>)}</ul>:<svg className="sheet-overview-svg" viewBox={`0 0 ${W} ${H}`} style={{aspectRatio:`${W} / ${H}`}} aria-label={t("Оглавление карты","Project contents")}>
      {visibleLinks.map((link,i)=>{
        const a=points.get(link.a)!,b=points.get(link.b)!,sameColumn=a.x===b.x;
        const ax=a.x+(sameColumn?(a.x<W/2?-CW/2:CW/2):a.x<b.x?CW/2:-CW/2),bx=b.x+(sameColumn?(b.x<W/2?-CW/2:CW/2):b.x<a.x?CW/2:-CW/2);
        const mx=sameColumn?(a.x<W/2?12:W-12):(ax+bx)/2,my=(a.y+b.y)/2;
        const path=`M ${ax} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${bx} ${b.y}`;
        const badgeX=sameColumn?mx+(a.x<W/2?8:-8):mx,badgeY=my+(compact?(i%3-1)*13:0);
        return <g key={`${link.a}/${link.b}`} data-overview-connection="true" data-filter-muted={link.muted?"":undefined} className="overview-connection" role="button" tabIndex={0} aria-label={`${sheetName(link.a)} / ${sheetName(link.b)}: ${link.relations} ${t("связей","relations")}, ${link.shared} ${t("общих узлов","shared nodes")}`} onClick={()=>onOpenSpread(link.a,link.b)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpenSpread(link.a,link.b);}}}>
          <title>{sheetName(link.a)} / {sheetName(link.b)}</title><path d={path} fill="none" stroke="transparent" strokeWidth={22}/>
          {link.relations>0&&<path d={path} fill="none" stroke="#8b6bae" strokeWidth={activeFocus?2.2:1.5} strokeDasharray="5 4" opacity={activeFocus?.9:.55}/>}
          {link.shared>0&&<path d={path} transform={link.relations?'translate(3 0)':undefined} fill="none" stroke="#b78425" strokeWidth={2} opacity={.85}/>}
          <rect x={badgeX-18} y={badgeY-17} width={36} height={34} rx={13} fill="#fff" stroke={link.shared?"#b78425":"#a08ab7"}/><text x={badgeX} y={badgeY+4} textAnchor="middle" fontSize={11} fill="#493665">{link.relations}{link.shared?`·${link.shared}`:""}</text>
        </g>;
      })}
      {graph.sheets.map(s=>{
        const p=points.get(s.id)!,shown=nodesOn(s.id),count=shown.length,shared=shown.filter(n=>n.sheets.length>1).length;
        const dim=activeFocus&&s.id!==activeFocus&&!visibleLinks.some(l=>l.a===s.id||l.b===s.id);
        return <g key={s.id} data-overview-sheet={s.id} role="button" tabIndex={0} aria-label={name(s.name)} className="overview-sheet-card" opacity={dim?.4:1} onClick={()=>onOpenSheet(s.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpenSheet(s.id);}}}><title>{name(s.name)}</title><rect x={p.x-CW/2} y={p.y-CH/2} width={CW} height={CH} rx={12} fill="#fff" stroke={s.color} strokeWidth={activeFocus===s.id?3:1.5}/><rect x={p.x-CW/2+12} y={p.y-CH/2+12} width={7} height={7} rx={2} fill={s.color}/>{wrap(name(s.name)).map((line,i)=><text key={i} x={p.x-CW/2+26} y={p.y-CH/2+20+i*16} fontSize={12} fontWeight={600} fill="#17263c">{line}</text>)}<text x={p.x-CW/2+13} y={p.y+CH/2-24} fontSize={11} fill="#556579">{count} {t("узлов","nodes")}</text><text x={p.x-CW/2+13} y={p.y+CH/2-9} fontSize={compact?9:10} fill="#846320">{shared} {t("общих узлов","shared nodes")}</text></g>;
      })}
    </svg>}
    <div className="overview-pairs"><h3>{t("Связи листов","Sheet connections")}</h3><p className="field-help">{t("На линии: число связей · число общих узлов. В списке ниже — те же пары с полными названиями.","Line badges show relations · shared nodes. The same pairs are listed below with full names.")}</p>{visibleLinks.length?visibleLinks.map(l=><button key={`${l.a}/${l.b}`} data-filter-muted={l.muted?"":undefined} onClick={()=>onOpenSpread(l.a,l.b)}><span>{sheetName(l.a)} <b>↔</b> {sheetName(l.b)}</span><small>{l.relations} {t("связей","relations")} · {l.shared} {t("общих узлов","shared nodes")}</small></button>):<p>{t("Пока нет связей между листами. Создайте связь между узлами разных листов или разместите один узел на нескольких листах.","No connections between sheets yet. Connect nodes on different sheets or place one shared node on multiple sheets.")}</p>}</div>
  </div>;
}
