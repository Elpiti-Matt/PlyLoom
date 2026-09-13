import type { Mode } from "../model/types";
import { useI18n } from "../lib/i18n";

interface Props {
  mode:Mode;panels:boolean;onMode:(mode:Mode)=>void;saveStatus:string;canUndo:boolean;canRedo:boolean;undo:()=>void;redo:()=>void;
  onProject:()=>void;onOpen:()=>void;onSave:()=>void;onDrawioImport:()=>void;onCanvasImport:()=>void;onBpmnImport:()=>void;onDrawioExport:()=>void;onCsv:()=>void;onCanvas:()=>void;onTree:()=>void;onDemo:(software:boolean)=>void;
  onTypes:()=>void;onVisibility:()=>void;onFilter:()=>void;filterOpen:boolean;filterCount:number;onSheet:()=>void;onNode:()=>void;onRelation:()=>void;canRelate:boolean;onSheets:()=>void;onProperties:()=>void;onCheck:()=>void;issues:number;
}
export function WorkspaceToolbar(p:Props){
  const {t}=useI18n();
  const modes:[Mode,string,string][]=[["sheet","Листы","Sheets"],["spread","Разворот","Spread"],["stack","Стопка","Stack"],["contents","Оглавление","Contents"],["flat","Все на один лист","All-to-1"]];
  const closeMenu=(e:React.MouseEvent<HTMLElement>)=>{if((e.target as HTMLElement).closest("button"))e.currentTarget.closest("details")?.removeAttribute("open");};
  return <header className="workspace-toolbar" onKeyDown={e=>{if(e.key==="Escape")e.currentTarget.querySelectorAll('details[open]').forEach(el=>el.removeAttribute('open'));}}>
    <div className="workspace-command-row">
      <details className="workspace-menu"><summary>{t("Проект","Project")} <span>▾</span></summary><div className="workspace-menu-popover" onClick={closeMenu}>
        <button onClick={p.onProject}>{t("Новый пустой проект","New empty project")}</button>
        <div className="menu-section">{t("Файл проекта · все листы и словари","Project file · all sheets and types")}</div>
        <button onClick={p.onOpen}>{t("Открыть .plyloom…","Open .plyloom…")}<small>{t("Заменяет текущий проект; также читает старый JSON","Replaces the project; legacy JSON also supported")}</small></button>
        <button onClick={p.onSave}>{t("Скачать .plyloom","Download .plyloom")}<small>{t("Основной формат для продолжения работы","Native format for continuing your work")}</small></button>
        <div className="menu-section">{t("Импорт диаграмм","Import diagrams")}</div>
        <button onClick={p.onDrawioImport}>{t("Добавить листы из .drawio…","Add sheets from .drawio…")}<small>{t("Добавляет в текущий проект после предпросмотра","Appends to the project after preview")}</small></button>
        <button onClick={p.onCanvasImport}>{t("Добавить Obsidian Canvas…","Add Obsidian Canvas…")}</button>
        <button onClick={p.onBpmnImport}>{t("Добавить BPMN…","Add BPMN…")}<small>{t("Базовые элементы и расположение из BPMN DI","Basic elements and layout from BPMN DI")}</small></button>
        <button onClick={p.onDrawioExport}>{t("Экспортировать .drawio…","Export .drawio…")}</button>
        <details className="secondary-menu"><summary>{t("Другие форматы и примеры","Other formats and examples")}</summary><button onClick={p.onCsv}>{t("Открыть CSV…","Open CSV…")}</button><button onClick={p.onCanvas}>{t("Экспорт Canvas (Obsidian)","Export Canvas (Obsidian)")}</button><button onClick={p.onTree}>{t("Экспорт дерева JSON v1","Export JSON v1 tree")}</button><button onClick={()=>p.onDemo(true)}>{t("Пример: разработка","Example: software")}</button><button onClick={()=>p.onDemo(false)}>{t("Пример: кофе","Example: coffee")}</button></details>
      </div></details>
      <button onClick={p.onTypes}>{t("Типы","Types")}</button><button data-action="visibility" onClick={p.onVisibility}>{t("Показ","Display")}</button><button data-action="filter" aria-pressed={p.filterOpen} title={t("Фильтр по типам, тегам и атрибутам","Filter by types, tags and attributes")+(p.filterCount?t(` · условий: ${p.filterCount}`,` · conditions: ${p.filterCount}`):"")} onClick={p.onFilter}>{t("Фильтр","Filter")}{p.filterCount>0&&<span className="toolbar-count" aria-label={t(`условий: ${p.filterCount}`,`conditions: ${p.filterCount}`)}>{p.filterCount}</span>}</button>
      <details className="workspace-menu"><summary>{t("Справка","Help")} <span>▾</span></summary><div className="workspace-menu-popover help-menu" onClick={closeMenu}><button onClick={()=>p.onMode("faq")}>{t("Как работать с PlyLoom","Using PlyLoom")}</button><button onClick={()=>p.onMode("generate")}>{t("Подготовить проект с ИИ","Prepare a project with AI")}</button><button onClick={p.onCheck}>{t("Проверить проект","Check project")} · {p.issues}</button></div></details>
      <div className="workspace-history"><button disabled={!p.canUndo} onClick={p.undo} aria-label={t("Отменить изменение","Undo change")} title={t("Отменить изменение","Undo change")}>↶</button><button disabled={!p.canRedo} onClick={p.redo} aria-label={t("Повторить изменение","Redo change")} title={t("Повторить изменение","Redo change")}>↷</button></div>
      <span className="workspace-save" role="status" title={t("Автосохранение в этом браузере. Для переноса и резервной копии скачайте .plyloom.","Autosaved in this browser. Download .plyloom to transfer or back up your project.")}>{t(p.saveStatus)} <small>{t("в браузере","in browser")}</small></span>
    </div>
    <div className="workspace-view-row"><div className="workspace-view-tabs" role="group" aria-label={t("Режим","View")}>
      {modes.map(([id,ru,en])=><button key={id} aria-pressed={p.mode===id||(id==="sheet"&&p.mode==="board")} title={id==="sheet"?t("Редактирование листа и общий обзор проекта","Edit a sheet or explore the project overview"):id==="spread"?t("Сравнение выбранных листов рядом","Compare selected sheets side by side"):undefined} onClick={()=>p.onMode(id==="sheet"&&p.mode==="board"?"board":id)}>{t(ru,en)}</button>)}
    </div><div className="workspace-create"><button onClick={p.onSheet}>{t("+ Лист","+ Sheet")}</button><button className="primary-button" onClick={p.onNode}>{t("+ Узел","+ Node")}</button><button disabled={!p.canRelate} title={!p.canRelate?t("Добавьте хотя бы два узла","Add at least two nodes"):t("Соединить узлы с любых листов","Connect nodes from any sheets")} onClick={p.onRelation}>{t("+ Связь","+ Relation")}</button></div></div>
    {p.panels&&<div className="workspace-mobile-panels"><button onClick={p.onSheets}>{t("Список листов","Sheet list")}</button><button onClick={p.onProperties}>{t("Свойства и связи","Properties and relations")}</button></div>}
  </header>;
}
