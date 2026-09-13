import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { HELP_MEDIA } from "../data/helpMedia";

export function HelpMedia({topic}:{topic:"lines"|"editing"|"ai"}) {
  const {locale,t}=useI18n();const [playing,setPlaying]=useState(false);
  useEffect(()=>{setPlaying(false);},[locale,topic]);
  useEffect(()=>{if(!playing)return;const timer=setTimeout(()=>setPlaying(false),8800);return()=>clearTimeout(timer);},[playing]);
  const media=HELP_MEDIA[locale][topic];
  const title=topic==="lines"?t("Три вида линий и чистый разворот","Three line types and a clean spread"):topic==="editing"?t("Как править общую ноду","Editing a shared node"):t("От материалов к готовому JSON","From source material to importable JSON");
  const explanation=topic==="lines"?t("Золото — один ID. Пунктир — другой лист. Внутри слоя линия имеет стиль типа связи. Кнопка «Боковые переходы» скрывает внешние карточки.","Gold means the same ID. Dashes mean another sheet. Lines within a sheet use the relation type style. Side references toggles the external cards."):topic==="editing"?t("Нажмите «▾» в текущем интерфейсе, измените название или тело, проверьте второе появление. «▴» сворачивает редактор.","Press ▾ in the current interface, edit the name or body, and check the other appearance. ▴ collapses the editor."):t("Скопируйте стандарт → добавьте материалы в запрос ИИ → сохраните ответ как .json → загрузите и проверьте листы.","Copy the standard → add source materials to your AI prompt → save the response as .json → import and review the sheets.");
  return <figure className="help-media"><div className="help-media-title"><b>{title}</b><span>{t("Учебная иллюстрация","Illustrated walkthrough")}</span></div><img src={playing?media.gif:media.poster} alt={explanation} width={960} height={540}/><figcaption><p>{explanation}</p><p className="field-help">{t("Иллюстрация принципа из версии 0.6. Расположение команд в 0.7 изменилось: Проект, Типы, Показ, Фильтр, Справка.","Concept illustration from v0.6. Commands in v0.7 are organized under Project, Types, Display, Filter and Help.")}</p><div><button aria-pressed={playing} onClick={()=>setPlaying(!playing)}>{playing?t("■ Остановить","■ Stop"):t("▶ Смотреть мини-GIF · 9 с","▶ Play mini-GIF · 9 s")}</button><a href={media.gif} download={`plyloom-${topic}-${locale}.gif`}>{t("Скачать GIF","Download GIF")}</a><a href={media.poster} download={`plyloom-${topic}-${locale}.png`}>{t("Кадр PNG","PNG still")}</a></div></figcaption></figure>;
}
