import { useTypes } from "../lib/TypeContext";
import { useI18n } from "../lib/i18n";
import { useMemo, useState } from "react";
import { type EdgeKind, type GEdge, type GNode, type Graph, type NodeKind, type Sheet } from "../model/types";
import { edgesBetweenSheets, type Index, type LintItem } from "../lib/graph";
import { Body } from "../lib/Body";
import { cn } from "../utils/cn";
import { sheetTypeId } from "../lib/typeRegistry";
import { NodeAttributes } from "./NodeAttributes";
import { TagChoices, notationLabel } from "./TypeManager";
import { type SpreadKey } from "../lib/io";

export interface Actions {
  manageAttributes:()=>void;
  updateNode: (id: string, patch: Partial<GNode>) => void;
  addMembership: (id: string, sheetId: string) => void;
  removeMembership: (id: string, sheetId: string) => void;
  deleteNode: (id: string) => void;
  updateEdge: (id: string, patch: Partial<GEdge>) => void;
  deleteEdge: (id: string) => void;
  startLink: () => void;
  goNode: (id: string, sheetId: string) => void;
  goSheet: (id: string) => void;
  updateSheet: (id: string, patch: Partial<Sheet>) => void;
  deleteSheet: (id: string) => void;
  spreadSheet: (id: string, key: SpreadKey) => void;
}

const inp = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-400";
const lbl = "mb-0.5 mt-2.5 block text-[12px] font-semibold text-slate-500";

export function NodePanel({ node, graph, idx, a, stackIds, mode }: { node: GNode; graph: Graph; idx: Index; a: Actions; stackIds: string[]; mode: string }) {
  const {t,name:displayName}=useI18n();
  const {nodeTypes,nodeType,label}=useTypes();

  const edges = idx.adj.get(node.id) ?? [];
  const groups = new Map<string, { e: GEdge; other: GNode; incoming: boolean }[]>();
  for (const e of edges) {
    const incoming = e.to === node.id;
    const other = idx.nodeById.get(incoming ? e.from : e.to);
    if (!other) continue;
    const key = other.sheets[0];
    groups.set(key, [...(groups.get(key) ?? []), { e, other, incoming }]);
  }
  const free = graph.sheets.filter((s) => !s.smartFilter && !node.sheets.includes(s.id));
  return (
    <div className="p-3 text-[12px]">
      <div className="flex items-center gap-2">

        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label(nodeType(node.kind))}</span>
      </div>
      <label htmlFor="node-name" className={lbl}>{t("Имя")}</label>
      <input id="node-name" maxLength={200} className={inp} value={displayName(node.name)} onChange={(e) => a.updateNode(node.id, { name: e.target.value })} />
      <label htmlFor="node-kind" className={lbl}>{t("Тип")}</label>
      <select id="node-kind" className={inp} value={node.kind} onChange={(e) => a.updateNode(node.id, { kind: e.target.value as NodeKind })}>
        {nodeTypes.map((k) => (
          <option key={k.id} value={k.id}>
            {label(k)}
          </option>
        ))}
      </select>

      <label className={lbl}>{t("Стоит на плоскостях: ")}{node.sheets.length}</label>
      <div className="flex flex-wrap gap-1">
        {node.sheets.map((sid, i) => {
          const s = idx.sheetById.get(sid);
          if (!s) return null;
          return (
            <span key={sid} className="flex items-center overflow-hidden rounded-full text-[11px] text-white" style={{ background: s.color }}>
              <button className="px-2 py-0.5 hover:bg-black/10" title={t(i === 0 ? "Основной лист. Клик — открыть" : "Клик — открыть")} onClick={() => a.goNode(node.id, sid)}>
                {displayName(s.name)}
                {i === 0 && " ★"}{s.smartFilter&&" ⌕"}
              </button>
              <button
                aria-label={t(`Убрать с листа ${displayName(s.name)}`,`Remove from ${displayName(s.name)}`)}
                disabled={!!s.smartFilter || (!s.smartFilter && node.sheets.filter(id=>!idx.sheetById.get(id)?.smartFilter).length===1)}
                onClick={() => a.removeMembership(node.id, sid)}
                className="px-1.5 py-0.5 hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={t(node.sheets.length === 1 ? "Убрать с последнего листа нельзя" : "Убрать с листа")}
              >
                ×
              </button>
            </span>
          );
        })}
        {free.length > 0 && (
          <select
            className="rounded-full border border-dashed border-slate-400 bg-white px-2 py-0.5 text-[11px] text-slate-600"
            value=""
            onChange={(e) => e.target.value && a.addMembership(node.id, e.target.value)}
            aria-label={t("Добавить на лист")}
          >
            <option value="">{t("+ ещё лист…")}</option>
            {free.map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s.name)}
              </option>
            ))}
          </select>
        )}
      </div>
      {node.sheets.length > 1 && (
        <p className="mt-1 text-[10.5px] text-slate-500">{t("Один узел, свои координаты на каждом листе. При экспорте в дерево останется один основной лист; рёбра сохранятся.")}</p>
      )}

      <label htmlFor="node-body" className={lbl}>{t("Тело (markdown-lite)")}</label>
      <textarea id="node-body" maxLength={1000000} className={cn(inp, "min-h-[160px] font-mono text-[14px]")} value={node.body} onChange={(e) => a.updateNode(node.id, { body: e.target.value })} />
      {node.body.trim() && (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-[11.5px] text-slate-700">
          <Body text={node.body} />
        </div>
      )}

      <NodeAttributes key={node.id} node={node} onEdit={patch=>a.updateNode(node.id,patch)} onManage={a.manageAttributes}/>
      <div className="mt-3 flex items-center justify-between">
        <label className={cn(lbl, "mt-0")}>{t("Связанные узлы: ")}{edges.length}</label>
        <button onClick={a.startLink} className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] text-white hover:bg-emerald-700">{t("+ связать с… ")}</button>
      </div>
      {Array.from(groups.entries()).map(([sid, list]) => {
        const s = idx.sheetById.get(sid);
        const inStack = mode !== "stack" || stackIds.includes(sid);
        return (
          <div key={sid} className="mt-2">
            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: s?.color }} />
              {displayName(s?.name)}
              {!inStack && <span className="text-slate-400">{t("· не в стопке")}</span>}
            </div>
            {list.map(({ e, other, incoming }) => (
              <EdgeRow key={e.id} e={e} other={other} incoming={incoming} dim={!inStack} a={a} sheetId={sid} />
            ))}
          </div>
        );
      })}

      <button onClick={() => confirm(t(`Удалить «${displayName(node.name)}» и ${edges.length} связей?`,`Delete “${displayName(node.name)}” and ${edges.length} edges?`)) && a.deleteNode(node.id)} className="mt-5 w-full rounded border border-red-300 py-1 text-[11px] text-red-700 hover:bg-red-50">{t("Удалить узел ")}</button>
    </div>
  );
}

function EdgeRow({ e, other, incoming, dim, a, sheetId }: { e: GEdge; other: GNode; incoming: boolean; dim: boolean; a: Actions; sheetId: string }) {
  const {t,name:displayName}=useI18n();
  const {edgeTypes,edgeType,label}=useTypes();

  const [open, setOpen] = useState(false);
  const ek = edgeType(e.kind);
  return (
    <div className={cn("mt-1 rounded border border-slate-200 bg-white", dim && "opacity-60")}>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <span className="w-[68px] shrink-0 truncate text-[10px]" style={{ color: ek.color }} title={label(ek)}>
          {incoming ? "← " : ""}
          {label(ek)}
        </span>
        <button className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => a.goNode(other.id, sheetId)} title={displayName(other.name)}>
          {displayName(other.name)}
        </button>
        <button onClick={() => setOpen(!open)} className="px-1 text-slate-400 hover:text-slate-700" aria-label={t("Редактировать связь")} aria-expanded={open}>
          ✎
        </button>
      </div>
      {open && (
        <div className="flex items-center gap-1 border-t border-slate-100 px-1.5 py-1">
          <select aria-label={t("Тип связи")} className={cn(inp, "w-auto")} value={e.kind ?? "flow"} onChange={(ev) => a.updateEdge(e.id, { kind: ev.target.value as EdgeKind })}>
            {edgeTypes.map((k) => (
              <option key={k.id} value={k.id}>
                {label(k)}
              </option>
            ))}
          </select>
          <input aria-label={t("Подпись связи")} maxLength={120} className={inp} placeholder={t("подпись")} value={e.label ?? ""} onChange={(ev) => a.updateEdge(e.id, { label: ev.target.value })} />
          <button onClick={() => a.deleteEdge(e.id)} className="px-1 text-red-600" aria-label={t("Удалить связь")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export function SheetPanel({ sheet, graph, idx, a }: { sheet: Sheet; graph: Graph; idx: Index; a: Actions }) {
  const {t,name:displayName}=useI18n();
  const {sheetTypes,registry,label}=useTypes();

  const [spread, setSpread] = useState("type"),[nodePage,setNodePage]=useState({sid:sheet.id,count:200});
  const nodeCount=nodePage.sid===sheet.id?nodePage.count:200;
  const list = idx.bySheet.get(sheet.id) ?? [];
  const shared = list.filter((n) => n.sheets.length > 1).length;
  // Every other sheet × every relation: computed once per graph version, not on every render.
  const others = useMemo(() => graph.sheets.filter((s) => s.id !== sheet.id).map((s) => ({ s, c: edgesBetweenSheets(graph, idx, sheet.id, s.id).length, common: list.filter((n) => n.sheets.includes(s.id)).length })), [graph, idx, sheet.id, list]);
  return (
    <div className="p-3 text-[12px]">
      <label htmlFor="sheet-name" className={lbl}>{t("Название")}</label>
      <input id="sheet-name" maxLength={80} className={inp} value={displayName(sheet.name)} onChange={(e) => a.updateSheet(sheet.id, { name: e.target.value })} />
      <label htmlFor="sheet-notation" className={lbl}>{t("Тип листа","Sheet type")}</label>
      <select id="sheet-notation" className={inp} value={sheetTypeId(sheet,registry)} onChange={(e) => a.updateSheet(sheet.id, { typeId: e.target.value })}>
        {sheetTypes.map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}
      </select>
      <fieldset className="sheet-tag-field"><legend>{t("Теги листа","Sheet tags")}</legend><TagChoices tags={registry.tags} value={sheet.tags??[]} onChange={tags=>a.updateSheet(sheet.id,{tags})}/></fieldset>
      <p className="field-help">{t("Нотация","Notation")}: {notationLabel(sheet.notation)}</p>
      <label htmlFor="sheet-color" className={lbl}>{t("Цвет")}</label>
      <input id="sheet-color" type="color" className="h-[26px] w-12 cursor-pointer rounded border border-slate-300" value={sheet.color} onChange={(e) => a.updateSheet(sheet.id, { color: e.target.value })} />
      <label htmlFor="sheet-description" className={lbl}>{t("Описание")}</label>
      <textarea id="sheet-description" maxLength={2000} className={cn(inp, "min-h-[60px]")} value={sheet.description ?? ""} onChange={(e) => a.updateSheet(sheet.id, { description: e.target.value })} />

      <div className="mt-2.5 text-[11px] text-slate-600">
        {list.length}{t(" узлов · общих с другими листами: ")}{shared}
      </div>

      <label htmlFor="sheet-spread" className={lbl}>{t("Разложить лист по признаку","Lay the sheet out by a key")}</label>
      <div className="flex gap-2">
        <select id="sheet-spread" className={inp} value={spread} onChange={(e) => setSpread(e.target.value)}>
          <option value="type">{t("Тип узла","Node type")}</option>
          <option value="tag">{t("Теги узлов","Node tags")}</option>
          {registry.attributes.map((x) => <option key={x.id} value={`attr:${x.id}`}>{label(x)}</option>)}
        </select>
        <button data-action="spread-sheet" className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[12px] hover:bg-slate-50"
          onClick={() => a.spreadSheet(sheet.id, spread.startsWith("attr:") ? { by: "attribute", id: spread.slice(5) } : spread === "tag" ? { by: "tag" } : { by: "type" })}>
          {t("Разложить","Lay out")}
        </button>
      </div>
      <p className="field-help">{t("На каждое значение — свой лист; узел с несколькими значениями встанет на несколько листов. Размер листа сам по себе не повод его делить: для чтения больших листов есть фильтр и поиск.","One sheet per value; a node with several values stands on several sheets. Size alone is not a reason to divide a sheet \u2014 the filter and the search are there for reading large ones.")}</p>

      {sheet.smartFilter&&<div className="smart-sheet-note"><p>{t("Умный лист: состав обновляется по условиям узлов. Запрос можно заменить через Фильтр → Сохранённые виды.","Smart sheet: membership follows node conditions. Replace its query through Filter → Saved views.")}</p><button onClick={()=>a.updateSheet(sheet.id,{smartFilter:undefined})}>{t("Сделать обычным листом","Make an ordinary sheet")}</button></div>}
      <label className={lbl}>{t("Узлы этого листа")}</label>
      <ul className="reader-list">{list.slice(0,nodeCount).map((n) => <li key={n.id}><button onClick={() => a.goNode(n.id, sheet.id)}>{displayName(n.name)}</button></li>)}</ul>
      {list.length>nodeCount&&<button className="list-more" onClick={()=>setNodePage({sid:sheet.id,count:nodeCount+200})}>{t(`Показать ещё (${nodeCount} из ${list.length})`,`Show more (${nodeCount} of ${list.length})`)}</button>}
      <label className={lbl}>{t("Связи с другими листами")}</label>
      {others.map(({ s, c, common }) => (
        <div key={s.id} className="flex items-center gap-1.5 py-0.5 text-[11px]">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span className="flex-1">{displayName(s.name)}</span>
          <span className="tabular-nums text-slate-500">
            {c}{t(" связей · ")}{common}{t(" общих ")}</span>
        </div>
      ))}
      <button
        disabled={list.length > 0 || graph.sheets.length < 2 || (!sheet.smartFilter&&graph.sheets.filter(s=>!s.smartFilter).length<2)}
        onClick={() => a.deleteSheet(sheet.id)}
        className="mt-5 w-full rounded border border-red-300 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        title={t(list.length > 0 ? "Удалять можно только пустой лист" : "")}
      >{t("Удалить лист ")}</button>
    </div>
  );
}

export function LintPanel({ items, graph, onGo }: { items: LintItem[]; graph: Graph; onGo: (it: LintItem) => void }) {
  const {t}=useI18n();

  const [copied, setCopied] = useState(false),[shown,setShown]=useState(200);
  const [copyError, setCopyError] = useState(false);
  const sym = { error: "✖", warn: "▲", info: "·" } as const;
  const col = { error: "text-red-600", warn: "text-amber-600", info: "text-slate-400" } as const;
  const c = (l: LintItem["level"]) => items.filter((i) => i.level === l).length;
  return (
    <div className="p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-600">
          <span className="text-red-600">✖ {c("error")}</span> · <span className="text-amber-600">▲ {c("warn")}</span> · <span className="text-slate-500">· {c("info")}</span>
        </div>
        <button
          onClick={() => {
            const report = [`PlyLoom — ${graph.title}`, ...items.map((it)=>`[${it.level}] ${it.code}: ${t(it.text)}`)].join("\n");
            const fallback = () => {
              setCopyError(true);
              const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
              const link = document.createElement("a"); link.href = url; link.download = "plyloom-lint.txt"; link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            if (!navigator.clipboard) return fallback();
            navigator.clipboard.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(fallback);
          }}
          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-slate-100"
        >
          {t(copied ? "скопировано" : "копировать отчёт")}
        </button>
      </div>
      {copyError && <p role="status" className="text-sm">{t("Буфер обмена недоступен; отчёт скачан файлом.")}</p>}
      <p className="mt-2 text-[12px] text-slate-500">{t("Правила ")}<b>membership-candidate</b>, <b>orphan-membership</b>{t(" и ")}<b>over-membership</b>{t(" дают эвристические подсказки: узлу пора на второй лист или, наоборот, он стал листом сам. ")}</p>
      <ul className="mt-2 space-y-1">
        {items.slice(0,shown).map((it, i) => (
          <li key={i}>
            <button onClick={() => onGo(it)} className="flex w-full items-start gap-1.5 rounded px-1 py-1 text-left hover:bg-slate-100">
              <span className={cn("w-3 shrink-0", col[it.level])}>{sym[it.level]}</span>
              <span className="min-w-0 flex-1">
                <span className="mr-1 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">{it.code}</span>
                <span className="text-[11.5px] text-slate-700">{t(it.text)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {items.length>shown&&<button className="list-more" onClick={()=>setShown(n=>n+200)}>{t(`Показать ещё (${shown} из ${items.length})`,`Show more (${shown} of ${items.length})`)}</button>}
    </div>
  );
}
