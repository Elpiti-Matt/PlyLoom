import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { resolveSmartSheets } from "./lib/savedViews";
import type { Graph } from "./model/types";
import { clearAutosave, inIdle, readAutosave, writeAutosave } from "./lib/storage";
import { makeRoastery as makeDemo } from "./data/roastery";
import { Tool } from "./tool/Tool";
import { LocaleProvider, storedLocale, translate, useI18n } from "./lib/i18n";
import { TypeProvider } from "./lib/TypeContext";

class Boundary extends Component<{ children: ReactNode; graphRef: React.MutableRefObject<Graph | null> }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    const g = this.props.graphRef.current;
    const t=(s:string)=>translate(s,storedLocale());
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700">
        <div className="text-lg font-semibold">{t("Что-то сломалось")}</div>
        <div className="max-w-md text-slate-500">{this.state.err.message}</div>
        <div className="flex gap-2">
          {g && (
            <button
              className="rounded border border-slate-300 px-3 py-1"
              onClick={() => {
                const blob = new Blob([JSON.stringify(g, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                const url = URL.createObjectURL(blob);
                a.href = url;
                a.download = "plyloom-recovery.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {t("Скачать данные")}
            </button>
          )}
          <button
            className="rounded bg-slate-900 px-3 py-1 text-white"
            onClick={async () => {
              try { await clearAutosave(); location.reload(); }
              catch { this.setState({err:new Error(t("Не удалось сбросить сохранение. Сначала скачайте данные."))}); }
            }}
          >
            {t("Сбросить и перезагрузить")}
          </button>
        </div>
      </div>
    );
  }
}

export default function App() { return <LocaleProvider><AppContent/></LocaleProvider>; }
function AppContent() {
  const {t}=useI18n();
  const [graph, setGraphState] = useState<Graph>(() => makeDemo());
  const [status, setStatus] = useState("Локальная карта");
  const past = useRef<Graph[]>([]), future = useRef<Graph[]>([]), lastEdit = useRef(0);
  const [ready, setReady] = useState(false);
  const [storedWarning, setStoredWarning] = useState<string | null>(null);
  const recovery = useRef<string | null>(null);
  const ref = useRef<Graph | null>(graph);
  ref.current = graph;
  const cancelIdle = useRef<(() => void) | null>(null);
  const dirty = useRef(false), writing = useRef(false), mounted = useRef(true);
  const storageBlocked = useRef(false);

  const persist = useCallback(async () => {
    cancelIdle.current?.(); cancelIdle.current = null;
    if (!dirty.current || !ref.current || writing.current) return;
    if (storageBlocked.current) { if (mounted.current) setStatus("работа только в памяти"); return; }
    writing.current = true;
    let success = false;
    const snapshot = ref.current;
    try {
      const storage = await writeAutosave(snapshot, recovery.current);
      recovery.current = null;
      if (ref.current === snapshot) dirty.current = false;
      success = true;
      if (mounted.current && !dirty.current) setStatus(storage === "indexeddb" ? "сохранено" : "сохранено в localStorage");
    } catch {
      if (mounted.current) setStatus("работа только в памяти");
    } finally {
      writing.current = false;
      if (success && dirty.current) cancelIdle.current = inIdle(() => { void persist(); });
    }
  }, []);

  useEffect(() => {
    let active = true; mounted.current = true;
    void readAutosave().then(result => {
      if (!active) return;
      if (result.graph) { ref.current = result.graph; setGraphState(result.graph); }
      recovery.current = result.warning; setStoredWarning(result.warning); setReady(true);
      storageBlocked.current = !!result.blocked;
      if (result.blocked) setStatus("работа только в памяти");
      if (result.migrate) { dirty.current = true; cancelIdle.current = inIdle(() => { void persist(); }); }
    });
    return () => { active = false; mounted.current = false; cancelIdle.current?.(); void persist(); };
  }, [persist]);

  const apply = useCallback((next: Graph) => {
    ref.current = next; setGraphState(next); dirty.current = true; setStatus("сохранение…");
    if (!cancelIdle.current) cancelIdle.current = inIdle(() => { void persist(); });
  }, [persist]);
  const setGraph = useCallback((f: (g: Graph) => Graph) => {
    const current = ref.current!;
    const next = resolveSmartSheets(f(current));
    if (next === current) return;
    if (Date.now() - lastEdit.current > 600 || !past.current.length) past.current = [...past.current.slice(-29), current];
    lastEdit.current = Date.now(); future.current = []; apply(next);
  }, [apply]);
  const replaceGraph = useCallback((g: Graph) => { lastEdit.current = 0; setGraph(() => g); lastEdit.current = 0; }, [setGraph]);
  const undo = () => {
    const previous = past.current.pop(); if (!previous) return;
    future.current.push(ref.current!); lastEdit.current = 0; apply(previous);
  };
  const redo = () => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(ref.current!); lastEdit.current = 0; apply(next);
  };
  useEffect(() => {
    const flush = () => persist();
    const onVis = () => document.visibilityState === "hidden" && persist();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { void persist(); event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persist]);

  if (!ready) return <div role="status" className="storage-loading">{t("Открытие локальной карты…", "Opening local map…")}</div>;
  return (
    <Boundary graphRef={ref}>
      {storedWarning && <div role="alert" className="recovery-warning">
        {t("Прежнее сохранение не удалось прочитать. Скачайте его перед редактированием новой карты.")}
        <button onClick={() => { const url = URL.createObjectURL(new Blob([storedWarning], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "plyloom-original-recovery.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{t("Скачать прежнее сохранение")}</button>
        <button onClick={() => setStoredWarning(null)}>{t("Закрыть")}</button>
      </div>}
      <TypeProvider graph={graph}><Tool graph={graph} setGraph={setGraph} replaceGraph={replaceGraph} demo={makeDemo} saveStatus={status} undo={undo} redo={redo} canUndo={past.current.length > 0} canRedo={future.current.length > 0} /></TypeProvider>
    </Boundary>
  );
}
