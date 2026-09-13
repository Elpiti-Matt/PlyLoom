import { useMemo } from "react";
import type { AttributeDefinition, Graph, TypeRegistry } from "../model/types";
import { useI18n } from "../lib/i18n";
import { useTypes } from "../lib/TypeContext";
import { EMPTY_SEARCH, conditionActive, filterFacets, type AttributeCondition, type AttributeFacet, type FilterMode, type NodeFilter, type SearchField } from "../lib/nodeFilter";

export interface FilterSummary { shown: number; total: number; hiddenEdges: number; pinned: number; scope?: { label: string; shown: number; total: number } }
interface Props {
  graph: Graph; filter: NodeFilter; setFilter: (f: NodeFilter) => void; active: number;
  mode: FilterMode; setMode: (m: FilterMode) => void; open: boolean; setOpen: (open: boolean) => void;
  summary: FilterSummary; onReset: () => void; onManageAttributes: () => void;
  /** Enter in the search line goes to the next matching node; the panel only asks for it. */
  onFindNext: () => void; recent: string[]; onClearRecent: () => void; onViews: () => void;
}

/** One switch for what happens to filtered-out objects. Shared by the status bar and the panel. */
function ModeSwitch({ mode, setMode }: { mode: FilterMode; setMode: (m: FilterMode) => void }) {
  const { t } = useI18n();
  return <div className="filter-mode" role="group" aria-label={t("Что делать с отфильтрованным", "What to do with filtered-out objects")}>
    <span aria-hidden="true">{t("Остальное:", "The rest:")}</span>
    <button type="button" data-filter-mode="hide" aria-pressed={mode === "hide"} title={t("Не рисовать объекты вне фильтра. Быстро на больших картах.", "Do not draw objects outside the filter. Fast on large maps.")} onClick={() => setMode("hide")}>{t("Скрывать", "Hide")}</button>
    <button type="button" data-filter-mode="dim" aria-pressed={mode === "dim"} title={t("Рисовать объекты вне фильтра бледными на своих местах. Удобно на небольших картах.", "Draw objects outside the filter faded in place. Handy on small maps.")} onClick={() => setMode("dim")}>{t("Приглушать", "Dim")}</button>
  </div>;
}

/** Areas the search line can look in; the sheet area covers a sheet name and its tags. */
const SEARCH_AREAS: [SearchField, string, string, string, string][] = [
  ["name", "имя", "name", "Имя узла", "Node name"],
  ["body", "тело", "body", "Текст внутри карточки", "The text inside the card"],
  ["tags", "теги", "tags", "Теги узла (приходят из импорта)", "Node tags (they come from imports)"],
  ["sheet", "лист", "sheet", "Узел лежит на листе с подходящим названием или тегом", "The node sits on a sheet whose name or tag matches"],
  ["attrs", "атрибуты", "attributes", "Значения атрибутов узла; для точных границ есть условия ниже", "The attribute values of the node; the conditions below give exact bounds"],
];

/** Main phrase plus details; on narrow screens the status bar shows only the main phrase. */
function summaryParts(s: FilterSummary, mode: FilterMode, t: (ru: string, en?: string) => string) {
  const dim = mode === "dim", extra: string[] = [];
  const main = dim ? t(`Фильтр: подходят ${s.shown} из ${s.total} узлов, остальные приглушены`, `Filter: ${s.shown} of ${s.total} nodes match, the rest are dimmed`)
    : t(`Фильтр: показано ${s.shown} из ${s.total} узлов`, `Filter: showing ${s.shown} of ${s.total} nodes`);
  if (s.hiddenEdges > 0) extra.push(dim ? t(`приглушено связей: ${s.hiddenEdges}`, `relations dimmed: ${s.hiddenEdges}`) : t(`скрыто связей: ${s.hiddenEdges}`, `relations hidden: ${s.hiddenEdges}`));
  if (s.scope) extra.push(`${s.scope.label}: ${s.scope.shown}/${s.scope.total}`);
  if (s.pinned > 0) extra.push(t(`вне фильтра оставлено: ${s.pinned}`, `kept outside the filter: ${s.pinned}`));
  return <>{main}{extra.length > 0 && <small className="filter-extra">{extra.map(x => " · " + x).join("")}</small>}</>;
}

export function FilterPanel(p: Props) {
  const { t } = useI18n(), { registry, nodeTypes, edgeTypes, label } = useTypes();
  if (!p.open) {
    if (!p.active) return null;
    return <div className="filter-status" role="status" data-filter-status>
      <span>{summaryParts(p.summary, p.mode, t)}</span>
      <ModeSwitch mode={p.mode} setMode={p.setMode} />
      <button type="button" className="filter-status-adjust" onClick={() => p.setOpen(true)}>{t("Настроить", "Adjust")}</button>
      <button type="button" className="filter-status-reset" onClick={p.onReset}>{t("Показать всё", "Show all")}</button>
    </div>;
  }
  return <Panel {...p} registry={registry} nodeTypes={nodeTypes} edgeTypes={edgeTypes} label={label} />;
}

type TypeDef = { id: string; label: string; labelEn?: string; description?: string };
function Panel(p: Props & { registry: TypeRegistry; nodeTypes: TypeDef[]; edgeTypes: TypeDef[]; label: (k: { label: string; labelEn?: string }) => string }) {
  const { t } = useI18n(), f = p.filter, label = p.label;
  const search = f.search ?? EMPTY_SEARCH;
  const facets = useMemo(() => filterFacets(p.graph.nodes, p.graph.edges, p.registry), [p.graph.nodes, p.graph.edges, p.registry]);
  const set = (patch: Partial<NodeFilter>) => p.setFilter({ ...f, ...patch });
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  // Only types that occur in the project (plus ones hidden earlier) are worth a checkbox.
  const usedNodes = p.nodeTypes.filter(k => facets.nodeTypes.has(k.id) || f.hiddenNodeTypes.includes(k.id));
  const usedEdges = p.edgeTypes.filter(k => facets.edgeTypes.has(k.id) || f.hiddenEdgeTypes.includes(k.id));
  const setCondition = (id: string, c: AttributeCondition | null) => {
    const attributes = { ...f.attributes };
    if (c) attributes[id] = c; else delete attributes[id];
    set({ attributes });
  };
  const conditions = p.registry.attributes.filter(d => Object.prototype.hasOwnProperty.call(f.attributes, d.id));
  const free = p.registry.attributes.filter(d => !Object.prototype.hasOwnProperty.call(f.attributes, d.id));
  return <section className="filter-panel" aria-label={t("Фильтр", "Filter")} data-filter-panel>
    <header className="filter-panel-head">
      <b>{t("Фильтр", "Filter")}</b>
      <button type="button" data-action="saved-views" onClick={p.onViews}>{t("Сохранённые виды", "Saved views")}</button>
      <span className="filter-panel-summary" role="status" {...(p.active ? { "data-filter-status": "" } : {})}>{p.active ? summaryParts(p.summary, p.mode, t) : t(`Показаны все ${p.summary.total} узлов`, `All ${p.summary.total} nodes shown`)}</span>
      <ModeSwitch mode={p.mode} setMode={p.setMode} />
      <button type="button" className="filter-status-reset" disabled={!p.active} onClick={p.onReset}>{t("Показать всё", "Show all")}</button>
      <button type="button" aria-label={t("Свернуть фильтр", "Collapse filter")} onClick={() => p.setOpen(false)}>{t("Свернуть", "Collapse")}</button>
    </header>
    <div className="filter-panel-body">
      <section className="filter-search">
        <h3>{t("Поиск", "Search")}</h3>
        <input type="search" maxLength={4096} data-filter-search list="filter-search-recent" aria-label={t("Искать по тексту", "Search by text")}
          title={t("Несколько слов — найтись должны все. Enter — перейти к следующему совпадению.", "Several words — all of them must be found. Enter goes to the next match.")}
          placeholder={t("имя, тело, тег, лист, атрибут…", "name, body, tag, sheet, attribute…")} value={search.text}
          onChange={e => set({ search: { ...search, text: e.target.value } })}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); p.onFindNext(); } }} />
        {p.recent.length>0&&<button type="button" className="filter-clear-history" onClick={p.onClearRecent}>{t("Очистить историю поиска", "Clear search history")}</button>}
        <datalist id="filter-search-recent">{p.recent.map(q => <option key={q} value={q} />)}</datalist>
        <div className="filter-checks" data-filter-group="search">{SEARCH_AREAS.map(([id, ru, en, hint, hintEn]) => <label className="check-row" key={id} title={t(hint, hintEn)}><input type="checkbox" data-filter-field={id} checked={search.fields.includes(id)} onChange={() => set({ search: { ...search, fields: search.fields.includes(id) ? search.fields.filter(x => x !== id) : [...search.fields, id] } })} /><span>{t(ru, en)}</span></label>)}</div>
        {!!search.text.trim() && !search.fields.length && <p className="filter-help">{t("Выберите хотя бы одну область поиска.", "Choose at least one area to search in.")}</p>}
        {search.text.trim().split(/\s+/).filter(Boolean).length > 1 && !!search.fields.length && <p className="filter-help">{t("Найтись должны все слова, каждое — в любой из отмеченных областей.", "Every word must be found, each in any of the checked areas.")}</p>}
      </section>
      <section>
        <h3>{t("Типы узлов", "Node types")}</h3>
        <div className="filter-bulk-actions" data-filter-actions="nodes"><button type="button" aria-label={t("Выбрать все типы узлов", "Select all node types")} onClick={() => set({ hiddenNodeTypes: [] })}>{t("Выбрать все", "Select all")}</button><button type="button" aria-label={t("Выключить все типы узлов", "Turn off all node types")} onClick={() => set({ hiddenNodeTypes: usedNodes.map(k => k.id) })}>{t("Выключить все", "Turn off all")}</button></div>
        <div className="filter-checks" data-filter-group="nodes">{usedNodes.map(k => <label className="check-row" key={k.id} title={k.description}><input type="checkbox" data-filter-type={k.id} checked={!f.hiddenNodeTypes.includes(k.id)} onChange={() => set({ hiddenNodeTypes: toggle(f.hiddenNodeTypes, k.id) })} /><span>{label(k)}</span><small>{facets.nodeTypes.get(k.id) ?? 0}</small></label>)}</div>
        {!usedNodes.length && <p className="filter-help">{t("В проекте пока нет узлов.", "The project has no nodes yet.")}</p>}
      </section>
      <section>
        <h3>{t("Типы связей", "Relation types")}</h3>
        <div className="filter-bulk-actions" data-filter-actions="edges"><button type="button" aria-label={t("Выбрать все типы связей", "Select all relation types")} onClick={() => set({ hiddenEdgeTypes: [] })}>{t("Выбрать все", "Select all")}</button><button type="button" aria-label={t("Выключить все типы связей", "Turn off all relation types")} onClick={() => set({ hiddenEdgeTypes: usedEdges.map(k => k.id) })}>{t("Выключить все", "Turn off all")}</button></div>
        <div className="filter-checks" data-filter-group="edges">{usedEdges.map(k => <label className="check-row" key={k.id} title={k.description}><input type="checkbox" data-filter-edge-type={k.id} checked={!f.hiddenEdgeTypes.includes(k.id)} onChange={() => set({ hiddenEdgeTypes: toggle(f.hiddenEdgeTypes, k.id) })} /><span>{label(k)}</span><small>{facets.edgeTypes.get(k.id) ?? 0}</small></label>)}</div>
        {!usedEdges.length && <p className="filter-help">{t("В проекте пока нет связей.", "The project has no relations yet.")}</p>}
      </section>
      <section className="filter-attributes">
        <h3>{t("Атрибуты", "Attributes")}</h3>
        {conditions.map(d => <ConditionEditor key={d.id} def={d} c={f.attributes[d.id]} facet={facets.attributes.get(d.id)!} label={label(d)} onChange={c => setCondition(d.id, c)} onRemove={() => setCondition(d.id, null)} />)}
        {free.length > 0 && <select className="filter-add" data-filter-add-attribute aria-label={t("Добавить условие по атрибуту", "Add an attribute condition")} value="" onChange={e => { if (e.target.value) setCondition(e.target.value, {}); }}><option value="">{t("+ Условие по атрибуту", "+ Attribute condition")}</option>{free.map(d => <option key={d.id} value={d.id}>{label(d)}</option>)}</select>}
        {!p.registry.attributes.length && <><p className="filter-help">{t("В проекте нет атрибутов. Их задают в справочнике, затем заполняют у узлов.", "The project has no attributes. Define them in the dictionary, then fill them in on nodes.")}</p><button type="button" className="filter-add" onClick={p.onManageAttributes}>{t("Открыть справочник атрибутов", "Open the attribute dictionary")}</button></>}
      </section>
      <p className="filter-help filter-rules">{t("Разные условия действуют вместе (И), отметки внутри одного условия — любая из них (ИЛИ); у множественного выбора это можно поменять на «все выбранные». Фильтр меняет только экран: файл проекта и экспорт остаются полными. Узел, который вы создаёте, открываете или меняете, остаётся на экране, пока фильтр не изменится.", "Different conditions apply together (AND); checks inside one condition mean any of them (OR), and a multiple-choice condition can require all of them instead. The filter changes only the screen: the project file and exports stay complete. A node you create, open or edit stays on screen until the filter changes.")}</p>
    </div>
  </section>;
}

function ConditionEditor({ def, c, facet, label, onChange, onRemove }: { def: AttributeDefinition; c: AttributeCondition; facet: AttributeFacet; label: string; onChange: (c: AttributeCondition) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const patch = (x: Partial<AttributeCondition>) => onChange({ ...c, ...x });
  const values = c.values ?? [], toggle = (v: string) => patch({ values: values.includes(v) ? values.filter(x => x !== v) : [...values, v] });
  const range = def.dataType === "number" || def.dataType === "date";
  const choices = def.dataType === "boolean" ? [["true", t("Да", "Yes")], ["false", t("Нет", "No")]] : def.dataType === "select" || def.dataType === "multi" ? (def.options ?? []).map(o => [o, o]) : null;
  return <div className="filter-condition" data-filter-attribute={def.id} role="group" aria-label={label}>
    <div className="filter-condition-head"><b>{label}</b>{!conditionActive(def, c) && <small>{t("не задано — не фильтрует", "empty — does not filter")}</small>}<button type="button" aria-label={t(`Убрать условие ${label}`, `Remove condition ${label}`)} onClick={onRemove}>×</button></div>
    {range && <div className="filter-range">
      <label>{def.dataType === "date" ? t("с", "from") : t("от", "min")}<input type={def.dataType === "date" ? "date" : "number"} step={def.dataType === "number" ? "any" : undefined} data-filter-min value={c.min ?? ""} onChange={e => patch({ min: e.target.value })} /></label>
      <label>{def.dataType === "date" ? t("по", "to") : t("до", "max")}<input type={def.dataType === "date" ? "date" : "number"} step={def.dataType === "number" ? "any" : undefined} data-filter-max value={c.max ?? ""} onChange={e => patch({ max: e.target.value })} /></label>
    </div>}
    {(def.dataType === "text" || def.dataType === "url") && <input type="search" data-filter-text aria-label={t(`${label}: содержит`, `${label}: contains`)} placeholder={t("содержит…", "contains…")} value={c.text ?? ""} onChange={e => patch({ text: e.target.value })} />}
    {def.dataType === "multi" && <div className="filter-match" role="group" aria-label={t("Как сравнивать отметки", "How to match the checks")}>
      <button type="button" data-filter-all="any" aria-pressed={!c.all} title={t("Узел подходит, если у него есть хотя бы один отмеченный вариант", "The node matches when it has at least one checked option")} onClick={() => patch({ all: false })}>{t("любой из", "any of")}</button>
      <button type="button" data-filter-all="all" aria-pressed={!!c.all} title={t("Узел подходит, если у него есть все отмеченные варианты", "The node matches when it has every checked option")} onClick={() => patch({ all: true })}>{t("все выбранные", "all selected")}</button>
    </div>}
    {choices && <div className="filter-checks">{choices.map(([v, text]) => <label className="check-row" key={v}><input type="checkbox" data-filter-value={v} checked={values.includes(v)} onChange={() => toggle(v)} /><span>{text}</span><small>{facet.values.get(v) ?? 0}</small></label>)}</div>}
    <div className="filter-checks filter-special">
      <label className="check-row" title={t("Атрибут есть, значение пустое", "The attribute is present with an empty value")}><input type="checkbox" data-filter-unset checked={!!c.unset} onChange={e => patch({ unset: e.target.checked })} /><span>{t("не заполнено", "empty")}</span><small>{facet.unset}</small></label>
      <label className="check-row" title={t("У узла нет этого атрибута", "The node does not have this attribute")}><input type="checkbox" data-filter-missing checked={!!c.missing} onChange={e => patch({ missing: e.target.checked })} /><span>{t("нет атрибута", "no attribute")}</span><small>{facet.missing}</small></label>
    </div>
  </div>;
}
