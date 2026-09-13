import { useTypes } from "../lib/TypeContext";
import { memo, useId } from "react";
import { CARD_W, type GNode, type BuiltinNodeKind, type NodeAppearance } from "../model/types";
import { NodeAttributes } from "./NodeAttributes";
import { NotationShape } from "./NotationShape";
import { Body, firstLine, MarkedText } from "../lib/Body";
import { cn } from "../utils/cn";
import { useI18n } from "../lib/i18n";

const HYBRID: Record<BuiltinNodeKind, string> = {
  entity: "bg-white border-2 border-slate-800 rounded-md",
  process: "bg-white border border-slate-400 rounded-[22px]",
  decision: "bg-amber-50 border-4 border-double border-amber-500 rounded-md",
  hypothesis: "bg-white border-2 border-dashed border-slate-500 rounded-full px-5",
  metric: "bg-slate-900 text-slate-100 font-mono border border-slate-700 rounded-md",
  rule: "bg-white border border-slate-500 rounded-none",
  risk: "bg-red-50 border border-red-200 border-l-[6px] border-l-red-600 rounded-md",
  person: "bg-pink-50 border border-pink-300 rounded-full px-5",
  note: "bg-yellow-200 border border-yellow-300 shadow-md -rotate-[1.5deg]",
};

interface Props {
  node: GNode;
  appearance?:NodeAppearance;
  onManageAttributes?:()=>void;
  color: string; // цвет листа
  hybrid: boolean;
  showBody: boolean;
  selected: boolean;
  linkTarget?: boolean;
  extraSheets?: number; // на скольких ещё листах стоит
  ghost?: boolean; // стаб
  ghostSheet?: string;
  style?: React.CSSProperties;
  measureRef?: (el: HTMLDivElement | null) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: () => void;
  onActivate?: () => void;
  excluded?: boolean;
  /** Outside the filter in dim mode: drawn faded, still interactive. */
  muted?: boolean;
  simplified?: boolean;
  simplifiedHeight?: number;
  expanded?: boolean;
  onToggle?:()=>void;
  onEdit?:(patch:Partial<GNode>)=>void;
}

export const NodeCard = memo(function NodeCard({
  node,
  appearance,
  onManageAttributes,
  color,
  hybrid,
  showBody,
  selected,
  linkTarget,
  extraSheets = 0,
  ghost,
  ghostSheet,
  style,
  measureRef,
  onPointerDown,
  onDoubleClick,
  onClick,
  onActivate,
  excluded,
  muted=false,
  simplified=false,
  simplifiedHeight,
  expanded=false,
  onToggle,
  onEdit,
}: Props) {
  const {t,name}=useI18n();
  const editorId=useId();
  const {nodeType}=useTypes();
  const k = nodeType(node.kind);
  const snippet = firstLine(node.body);
  const a=appearance;
  const toggle=onToggle&&<button className="node-expand-button" aria-expanded={expanded} aria-controls={editorId} aria-label={expanded?t(`Свернуть тело ${name(node.name)}`,`Collapse body of ${name(node.name)}`):t(`Раскрыть тело ${name(node.name)}`,`Expand body of ${name(node.name)}`)} title={t("Текст и атрибуты","Text and attributes")} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onToggle();}}>{expanded?"−":"+"}</button>;
  if(simplified)return <div data-nid={node.id} data-detail="low" data-filter-muted={muted?"":undefined} className="node-simple" role="group" tabIndex={0} aria-label={name(node.name)} title={name(node.name)} onPointerDown={onPointerDown} onClick={onClick} onDoubleClick={onDoubleClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onActivate?.();}}} style={{width:appearance?.width??CARD_W,height:simplifiedHeight??64,borderColor:selected?"#6c45a0":color,...style}}><span>{name(node.name)}</span></div>;
  return (
    <div
      ref={measureRef}
      data-nid={node.id}
      data-filter-muted={muted?"":undefined}
      role="group"
      tabIndex={0}
      aria-label={`${ghost ? t("Перейти: ","Go to: ") : ""}${name(node.name)}${excluded ? t(", вне выбранной нотации",", excluded by notation") : ""}`}
      onKeyDown={(e) => { if (e.target===e.currentTarget&&(e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); onActivate?.(); } }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      title={name(node.name)}
      className={cn(
        "absolute select-none text-[14px] px-3 py-2 transition-[opacity,box-shadow] duration-150 cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-blue-600",
        !a && hybrid && k.base === "metric" ? "text-slate-100" : "text-slate-800",
        a ? "notation-node" : hybrid ? HYBRID[k.base] : "bg-white border border-slate-300 rounded-md",
        ghost && "opacity-70 border-dashed cursor-pointer",
        excluded && "opacity-50",
        selected && "ring-2 ring-blue-500 ring-offset-2 shadow-lg",
        linkTarget && "ring-2 ring-emerald-500 ring-offset-1 cursor-crosshair",
        expanded && "node-card-expanded",
      )}
      style={{ width: a?.width??CARD_W, ...(a?{minHeight:a.height,padding:0,border:0,background:"transparent"}:{}), ...(node.kind!==k.base||k.color!=="#475569"?{borderColor:k.color}:{}), ...style }}
    >
      {a?<div className={"notation-node-face"+(a.shape==="group"?" is-group":"")} style={{height:a.height,transform:a.rotation?`rotate(${a.rotation}deg)`:undefined,color:a.fontColor,fontSize:a.fontSize??14}}>
        <NotationShape appearance={a}/><div className="notation-node-label" style={{fontWeight:a.bold?700:400,textAlign:a.align??"center",...(a.shape==="diamond"?{inset:"25% 22%"}:{}),...(a.marker?{top:a.height+5,bottom:"auto",overflow:"visible"}:{}),...(a.shape==="group"?{inset:"6px auto auto 10px",maxWidth:a.width-30,textAlign:"left"}:{}),...(a.sourceType==="canvas:text"?{inset:12,textAlign:"left"}: {})}}>{a.sourceType==="canvas:text"?<Body text={node.body||node.name}/>:<MarkedText text={name(node.name)} field="name"/>}</div>
        <div className="notation-node-tools">{extraSheets>0&&<span className="appearance-count" title={t("Дополнительные появления","Other appearances")}>+{extraSheets}</span>}{toggle}</div>
      </div>:<>
      {!hybrid && <div className="absolute left-0 right-0 top-0 h-1.5 rounded-t-md" style={{ background: color }} />}
      {hybrid && k.base === "rule" && (
        <span
          aria-hidden
          className="absolute right-0 top-0 h-0 w-0 border-l-[10px] border-b-[10px] border-l-transparent border-b-slate-500"
          style={{ borderTopRightRadius: 0 }}
        />
      )}
      <div className={cn("flex items-start gap-1.5", !hybrid && "mt-1")}>
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold leading-5 break-words", excluded && "line-through")}><MarkedText text={name(node.name)} field="name"/></div>
          {ghost ? (
            <div className="mt-0.5 text-[10px] text-slate-500 truncate">лист: {ghostSheet}</div>
          ) : expanded ? null : showBody ? (
            node.body.trim() && (
              <div className={cn("mt-1 text-[11px]", k.base === "metric" ? "text-slate-300" : "text-slate-600")}>
                <Body text={node.body} compact />
              </div>
            )
          ) : (
            snippet && (
              <div className={cn("node-snippet mt-0.5 text-[11px] leading-[14px] line-clamp-2", k.base === "metric" ? "text-slate-400" : "text-slate-500")}><MarkedText text={snippet} field="body"/></div>
            )
          )}
        </div>
        <span className="shrink-0 mt-0.5 flex items-center gap-0.5">
          {extraSheets > 0 && (
            <span
              className="rounded-full border border-violet-500 bg-white px-1 text-[9px] leading-[12px] font-semibold text-violet-700"
              title={t(`Стоит ещё на ${extraSheets} лист.`,`Also appears on ${extraSheets} sheets`)}
            >
              +{extraSheets}
            </span>
          )}
          <span className="h-2 w-2 rounded-full ring-1 ring-white" style={{ background: color }} />
          {toggle}
        </span>
      </div>
      </>}
      {showBody&&!expanded&&<NodeAttributes node={node} readOnly/>}
      {expanded&&onEdit&&<div id={editorId} className="node-inline-editor" onPointerDown={(e)=>e.stopPropagation()} onDoubleClick={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()} onKeyDown={(e)=>e.stopPropagation()}>
        <label htmlFor={editorId+"-name"}>{t("Название")}</label><input id={editorId+"-name"} data-node-name-editor={node.id} maxLength={200} value={name(node.name)} onChange={(e)=>onEdit({name:e.target.value})}/>
        <label htmlFor={editorId+"-body"}>{t("Тело","Body")}</label><textarea id={editorId+"-body"} data-node-body-editor={node.id} maxLength={1000000} value={node.body} rows={5} placeholder={t("Текст, заметка, таблица Markdown…","Text, notes, a Markdown table…")} onChange={(e)=>onEdit({body:e.target.value})}/>
        <NodeAttributes node={node} onEdit={onEdit} onManage={onManageAttributes}/>
        <small>{t("Сохраняется сразу · общее для всех слоёв","Saved as you type · shared across all layers")}</small>
      </div>}
    </div>
  );
});
