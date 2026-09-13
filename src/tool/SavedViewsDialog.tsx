import { useState } from "react";
import type { Sheet } from "../model/types";
import type { SavedView } from "../lib/savedViews";
import { useI18n } from "../lib/i18n";
import { Modal } from "./Modal";

export function SavedViewsDialog(p: {
  views: SavedView[]; smartSheet?: Sheet; onClose: () => void;
  onApply: (v: SavedView) => void; onSave: (name: string) => void;
  onRename: (id: string, name: string) => void; onUpdate: (id: string) => void;
  onDelete: (id: string) => void; onSmart: (name: string) => void; onUpdateSmart: () => void;
}) {
  const {t} = useI18n(), [name,setName] = useState("");
  return <Modal title={t("Сохранённые виды", "Saved views")} onClose={p.onClose}>
    <p className="modal-intro">{t("Сохраните текущий фильтр, режим и набор листов. Вид хранится внутри .plyloom и каждый раз находит актуальные узлы.", "Save the current filter, display mode and sheets. A view travels inside .plyloom and finds the current matching nodes each time.")}</p>
    <div className="saved-view-form"><label htmlFor="saved-view-name">{t("Название", "Name")}</label><input id="saved-view-name" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
      <button disabled={!name.trim()} data-action="save-view" onClick={()=>{p.onSave(name.trim());setName("");}}>{t("Сохранить вид", "Save view")}</button>
      <button disabled={!name.trim()} data-action="create-smart-sheet" onClick={()=>p.onSmart(name.trim())}>{t("Создать умный лист", "Create smart sheet")}</button>
      <small>{t("Умный лист собирает узлы со всех обычных листов по условиям фильтра. Типы связей не меняют его состав. Исходные появления сохраняются.", "A smart sheet collects nodes from all ordinary sheets using the node filter. Relation types do not affect membership. Original appearances remain.")}</small>
      {p.smartSheet&&<button data-action="update-smart-sheet" onClick={p.onUpdateSmart}>{t(`Заменить запрос листа «${p.smartSheet.name}» текущим фильтром`, `Replace the query of “${p.smartSheet.name}” with the current filter`)}</button>}
    </div>
    <div className="saved-view-list">{p.views.map(v=><form className="saved-view-row" key={v.id} onSubmit={e=>{e.preventDefault();const value=String(new FormData(e.currentTarget).get("name")??"").trim();if(value)p.onRename(v.id,value);}}>
      <input name="name" maxLength={80} required defaultValue={v.name} aria-label={t(`Название вида ${v.name}`, `Name of view ${v.name}`)}/>
      <button type="submit">{t("Переименовать", "Rename")}</button>
      <button type="button" data-apply-view={v.id} onClick={()=>p.onApply(v)}>{t("Открыть", "Open")}</button>
      <button type="button" data-update-view={v.id} onClick={()=>p.onUpdate(v.id)}>{t("Записать текущий", "Replace with current")}</button>
      <button type="button" data-delete-view={v.id} onClick={()=>p.onDelete(v.id)}>{t("Удалить", "Delete")}</button>
    </form>)}</div>
    <footer><button onClick={p.onClose}>{t("Закрыть", "Close")}</button></footer>
  </Modal>;
}
