import { useTypes } from "../lib/TypeContext";
import { useI18n } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { type Graph, type NodeKind } from "../model/types";

export function AddNodeDialog({ graph, sheetId, onClose, onCreate }: { graph: Graph; sheetId: string; onClose: () => void; onCreate: (name: string, kind: NodeKind, sid: string, body: string) => void }) {
  const {t,name:displayName}=useI18n();
  const {nodeTypes,label}=useTypes();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<NodeKind>("entity");
  const [sid, setSid] = useState(sheetId);
  const [body, setBody] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const list = [...ref.current!.querySelectorAll<HTMLElement>('input, select, textarea, button:not([disabled])')];
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="node-dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="node-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="add-node-title">
      <div className="node-dialog-heading"><div><p>{t("ДОБАВИТЬ В КАРТУ")}</p><h2 id="add-node-title">{t("Новый узел")}</h2></div><button onClick={onClose} aria-label={t("Закрыть добавление узла")}>×</button></div>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && graph.sheets.some((s) => s.id === sid)) onCreate(name.trim(), kind, sid, body); }}>
        <label htmlFor="add-node-name">{t("Название")}</label><input id="add-node-name" value={name} placeholder={t("Например, сезонная смесь")} maxLength={200} required onChange={(e) => setName(e.target.value)} />
        <div className="node-dialog-columns"><div><label htmlFor="add-node-kind">{t("Тип")}</label><select id="add-node-kind" value={kind} onChange={(e) => setKind(e.target.value as NodeKind)}>{nodeTypes.map((k) => <option key={k.id} value={k.id}>{label(k)} · {k.notation??"PlyLoom"}</option>)}</select></div>
        <div><label htmlFor="add-node-sheet">{t("На лист")}</label><select id="add-node-sheet" value={sid} onChange={(e) => setSid(e.target.value)}>{graph.sheets.map((s) => <option key={s.id} value={s.id}>{displayName(s.name)}</option>)}</select></div></div>
        <label htmlFor="add-node-body">{t("Заметка ")}<span>{t("· необязательно")}</span></label><textarea id="add-node-body" value={body} rows={3} onChange={(e) => setBody(e.target.value)} placeholder={t("Что нужно знать об этой сущности?")} />
        <p className="node-dialog-hint">{t("Позже этот же узел можно поместить на другие листы. Его содержание останется общим.")}</p>
        <div className="node-dialog-actions"><button type="button" onClick={onClose}>{t("Отмена")}</button><button className="primary-button" type="submit" disabled={!name.trim()}>{t("Создать узел")}</button></div>
      </form>
    </div>
  </div>;
}
