import { useI18n } from "../lib/i18n";
import { Modal } from "./Modal";
interface Props {hybrid:boolean;setHybrid:(v:boolean)=>void;body:boolean;setBody:(v:boolean)=>void;external:boolean;setExternal:(v:boolean)=>void;onFilter:()=>void;onClose:()=>void}
export function VisibilityDialog(p:Props){
  const {t}=useI18n();
  return <Modal title={t("Показ на экране","Display settings")} onClose={p.onClose} wide>
    <p className="modal-intro">{t("Эти настройки меняют вид схемы. Они не удаляют данные и не меняют экспорт .plyloom или draw.io.","These settings change the view. They do not delete data or change .plyloom or draw.io exports.")}</p>
    <div className="visibility-grid"><section><h3>{t("На листах и в развороте","Sheets and spreads")}</h3>
      <label className="check-row"><input type="checkbox" checked={p.hybrid} onChange={e=>p.setHybrid(e.target.checked)}/>{t("Форма карточек PlyLoom по типу","PlyLoom card shapes by type")}</label><p className="field-help">{t("Выключите, чтобы карточки PlyLoom имели одинаковую форму. Фигуры нотаций сохраняют свою геометрию.","Turn off for uniform PlyLoom cards. Notation shapes keep their geometry.")}</p>
      <label className="check-row"><input type="checkbox" checked={p.body} onChange={e=>p.setBody(e.target.checked)}/>{t("Описания и атрибуты узлов","Node descriptions and attributes")}</label>
      <label className="check-row"><input type="checkbox" checked={p.external} onChange={e=>p.setExternal(e.target.checked)}/>{t("Карточки со ссылками за границей листа","Reference cards outside the sheet")}</label><p className="field-help">{t("Это узлы с других листов, связанные с текущим. Нажатие открывает исходный лист. Выключение убирает эти карточки с одиночного листа; в развороте — карточки узлов с неоткрытых листов. Линии между открытыми листами настраиваются в самом развороте.","These are related nodes from other sheets. Click to open their source sheet. Turning this off hides these cards on a single sheet, and references to unopened sheets in a spread. Lines between open sheets have separate controls in the spread.")}</p>
      <p className="field-help identity-help">{t("Золотая линия «один ID» означает один общий узел на разных листах. Фиолетовая — связь между разными узлами. Их видимость отдельно настраивается в обзоре листов, развороте и стопке.","A gold 'same ID' line marks one shared node on different sheets. Purple connects distinct nodes. The sheet overview, Spread and Stack have separate visibility controls for these lines.")}</p>
    </section><section><h3>{t("Фильтр","Filter")}</h3><p className="field-help">{t("Скрыть или приглушить узлы и связи по типам, тегам и атрибутам можно в панели «Фильтр» над картой. Там же переключатель «Скрывать / Приглушать».","Hide or dim nodes and relations by type, tag and attribute in the Filter panel above the map. It also has the Hide / Dim switch.")}</p><button type="button" data-open-filter onClick={p.onFilter}>{t("Открыть фильтр","Open filter")}</button>
    </section></div><footer><button className="primary" onClick={p.onClose}>{t("Готово","Done")}</button></footer>
  </Modal>;
}
