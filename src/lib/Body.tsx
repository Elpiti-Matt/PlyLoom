import { useI18n } from "./i18n";
import { createContext, useContext, useMemo, memo, type ReactNode } from "react";
import type { NodeSearch, SearchField } from "./nodeFilter";

const SearchContext = createContext<NodeSearch | undefined>(undefined);
export const SearchHighlightProvider = SearchContext.Provider;
/** Literal matching only. Text remains React text; search never produces HTML. */
export function MarkedText({text, field}: {text: string; field: SearchField}) {
  const search = useContext(SearchContext);
  const pattern = useMemo(() => {
    const words = [...new Set((search?.text ?? "").trim().split(/\s+/).filter(Boolean))].sort((a,b) => b.length-a.length);
    return words.length ? new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu") : null;
  }, [search?.text]);
  if (!pattern || !search?.fields.includes(field)) return <>{text}</>;
  const parts: ReactNode[] = []; let start = 0;
  for (const hit of text.matchAll(pattern)) {
    parts.push(text.slice(start, hit.index), <mark className="search-match" key={hit.index}>{hit[0]}</mark>);
    start = hit.index + hit[0].length;
  }
  parts.push(text.slice(start)); return <>{parts}</>;
}

/** Разрешаем только data:/blob: и относительные пути — сетевых запросов из тела не делаем. */
export function safeSrc(url: string) {
  const u = url.trim();
  // Relative paths and backslashes can resolve to remote hosts when hosted.
  // Only self-contained raster images are accepted; SVG can contain references.
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(u) ? u : null;
}

function inline(s: string, key: number): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            <MarkedText text={p.slice(2, -2)} field="body"/>
          </strong>
        ) : (
          <MarkedText key={i} text={p} field="body"/>
        ),
      )}
    </span>
  );
}

export function firstLine(body: string) {
  const l = body
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("![") && !s.startsWith("|"));
  return (l ?? "").replace(/\*\*/g, "");
}

export const Body = memo(function Body({ text, compact = false }: { text: string; compact?: boolean }) {
  const {t}=useI18n();
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length} className={compact ? "leading-snug" : "leading-relaxed"}>
          {inline(para.join(" "), 0)}
        </p>,
      );
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-4 space-y-0.5">
          {list.map((l, i) => (
            <li key={i}>{inline(l, i)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
    if (table.length) {
      const [head, ...rows] = table;
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto">
          <table className="text-[0.92em] border-collapse w-full">
            <thead>
              <tr>
                {head.map((c, i) => (
                  <th key={i} className="text-left font-semibold border-b border-slate-300 py-0.5 pr-2 align-top">
                    {inline(c, i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, i) => (
                    <td key={i} className="border-b border-slate-200/70 py-0.5 pr-2 align-top">
                      {inline(c, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      table = [];
    }
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      flush();
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(l);
    if (img) {
      flush();
      const src = safeSrc(img[2]);
      blocks.push(
        src ? (
          <img key={blocks.length} src={src} alt={img[1]} className="rounded-md max-h-48 w-auto border border-slate-200" loading="lazy" />
        ) : (
          <div key={blocks.length} className="text-[11px] text-slate-500 border border-dashed border-slate-300 rounded px-2 py-1">
            {t("Картинка не загружена. Вставьте PNG, JPEG, GIF или WebP как data URI.","Image not loaded. Embed PNG, JPEG, GIF or WebP as a data URI.")}
          </div>
        ),
      );
      continue;
    }
    if (l.startsWith("|")) {
      if (/^\|[\s:-|]+\|$/.test(l)) continue; // разделитель
      if (para.length || list.length) flush();
      table.push(
        l
          .slice(1, l.endsWith("|") ? -1 : undefined)
          .split("|")
          .map((c) => c.trim()),
      );
      continue;
    }
    if (l.startsWith("- ")) {
      if (para.length || table.length) flush();
      list.push(l.slice(2));
      continue;
    }
    if (list.length || table.length) flush();
    para.push(l);
  }
  flush();
  return <div className={compact ? "space-y-1" : "space-y-2"}>{blocks}</div>;
});
