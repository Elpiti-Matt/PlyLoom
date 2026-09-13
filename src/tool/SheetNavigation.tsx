import { useI18n } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import type { Graph } from "../model/types";
import { COMPOSITIONS, compositionStyle } from "./spreadLayout";

interface Props {
  graph: Graph;
  active: string;
  visible: string[];
  spread: boolean;
  /** Sheets that still hold matching nodes; null when the filter lets everything through. */
  hits: ReadonlySet<string> | null;
  count: number;
  ratio: number;
  onChoose: (id: string) => void;
  onCount: (n: number) => void;
  onRatio: (n: number) => void;
  onAdd: () => void;
}

export function SheetNavigation(p: Props) {
  const {t,name:displayName}=useI18n();

  const strip = useRef<HTMLDivElement>(null);
  // Optional narrowing of the strip itself: the search stays a condition on nodes, sheets are not filtered.
  const [onlyHits, setOnlyHits] = useState(false);
  const hits = p.hits;
  useEffect(() => { if (!hits) setOnlyHits(false); }, [hits]);
  const narrow = onlyHits && !!hits;
  const sheets = narrow ? p.graph.sheets.filter((s) => hits!.has(s.id) || s.id === p.active || p.visible.includes(s.id)) : p.graph.sheets;
  const index = sheets.findIndex((s) => s.id === p.active);
  const step = (delta: number) => {
    if (sheets.length) p.onChoose(sheets[(Math.max(0, index) + delta + sheets.length) % sheets.length].id);
  };
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
  }, [p.active]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]') || document.querySelector('[aria-modal="true"]')) return;
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div className="sheet-navigation">
      <div className="sheet-nav-row">
        <div className="sheet-paging" aria-label={t("Перелистывание")}>
          <button aria-label={t("Предыдущий лист")} title={t("Предыдущий лист · Alt+←")} disabled={sheets.length < 2} onClick={() => step(-1)}>←</button>
          <span>{index + 1}<span> / {sheets.length}</span></span>
          <button aria-label={t("Следующий лист")} title={t("Следующий лист · Alt+→")} disabled={sheets.length < 2} onClick={() => step(1)}>→</button>
        </div>
        {hits && <button type="button" className="sheet-only-hits" data-sheet-only-hits aria-pressed={narrow}
          title={t("Оставить в списке только листы с подходящими узлами. Сами листы фильтр не скрывает.", "Keep only sheets with matching nodes in the list. The filter itself never hides a sheet.")}
          onClick={() => setOnlyHits((v) => !v)}>{t("Только найденные", "Matches only")}</button>}
        <div className="sheet-tabs" ref={strip} aria-label={t("Быстрый выбор листа")}>
          {sheets.map((s) => <button key={s.id} aria-current={s.id === p.active ? "page" : undefined} className={p.visible.includes(s.id) ? "is-visible" : ""} data-sheet-hit={p.hits ? (p.hits.has(s.id) ? "" : undefined) : undefined} data-sheet-empty={p.hits && !p.hits.has(s.id) ? "" : undefined} onClick={() => p.onChoose(s.id)} title={p.hits && !p.hits.has(s.id) ? t(`${displayName(s.name)} — под фильтр ничего не подходит`, `${displayName(s.name)} — nothing matches the filter here`) : displayName(s.name)}>
            <i style={{ background: s.color }} /><span>{displayName(s.name)}</span>{p.spread && p.visible.includes(s.id) && <small>{p.visible.indexOf(s.id) + 1}</small>}
          </button>)}
        </div>
        <button className="add-node-button" onClick={p.onAdd}>＋ <span>{t("Узел")}</span></button>
      </div>
      {p.spread && <div className="composition-bar">
        <span className="composition-label">{t("Композиция")}</span>
        <div className="composition-options" role="group" aria-label={t("Количество листов в развороте")}>
          {COMPOSITIONS.map((c) => <button key={c.count} aria-label={t(`${c.count} ${c.count<5?"листа":"листов"}: ${c.label}`,`${c.count} sheets: ${t(c.label)}`)} aria-pressed={p.count === c.count} disabled={p.graph.sheets.length < c.count} title={t(c.label)} onClick={() => p.onCount(c.count)}>
            <span className="composition-icon" style={compositionStyle(c.count, 45)} aria-hidden="true">{Array.from({ length: c.count }, (_, i) => <i key={i} style={{ gridArea: "abcdef"[i] }} />)}</span>
            <span>{c.count}</span>
          </button>)}
        </div>
        <label className="composition-ratio">{t(p.count === 5 ? "Средний ряд" : p.count === 3 ? "Левый лист" : p.count === 2 ? "Левый лист" : "Верхний ряд")}
          <input type="range" aria-label={t("Пропорции разворота")} min="35" max="65" value={p.ratio} onChange={(e) => p.onRatio(+e.target.value)} />
          <span>{p.ratio}%</span>
        </label>
        <span className="mobile-spread-note">{t("На телефоне — один лист в фокусе")}</span>
      </div>}
    </div>
  );
}
