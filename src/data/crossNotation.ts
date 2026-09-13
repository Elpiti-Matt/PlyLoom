import type { Graph, GNode, NodeKind } from "../model/types";
import type { Locale } from "../lib/i18n";

/** Fictional traceability example in today's PlyLoom v2 format, not a BPMN/XMI export. */
export function makeCrossNotation(locale:Locale="ru"):Graph {
  const en=locale==="en";
  const sheets=[
    ["process","Процесс оплаты · BPMN","Payment process · BPMN","#8467ad"],
    ["architecture","Архитектура · C4","Architecture · C4","#4d8aa8"],
    ["states","Состояния · UML","States · UML","#60a098"],
    ["classes","Модель данных · UML","Data model · UML","#859758"],
    ["requirements","Требования и тесты","Requirements and tests","#ac8150"],
    ["risks","Карта рисков","Risk map","#b87177"],
  ];
  const rows:[string,string,string,NodeKind,string[],string,string,string][]=[
    ["activity.accept","Принять заказ","Accept order","process",["process"],"bpmn:Task","Задача процесса. Принимает заявку, но ещё не подтверждает оплату.","A process task. Accepts an order without declaring it paid."],
    ["activity.pay","Запросить оплату","Request payment","process",["process"],"bpmn:Task","Задача процесса, реализуемая приложением Payment API. Это отдельная сущность, а не тот же ID, что у сервиса.","Process activity implemented by Payment API. Its ID is distinct from the application's ID."],
    ["activity.ship","Передать на отгрузку","Release for shipping","process",["process"],"bpmn:Task","Старая схема отправляет заказ после ответа на запрос. После смены провайдера проверить условие подтверждения.","The old process releases an order after the request returns. Review the confirmation condition when the provider changes."],
    ["service.payment","Payment API","Payment API","entity",["architecture","requirements"],"c4:Container","Приложение на Python; вызывает провайдера по HTTPS. После перехода на асинхронное подтверждение нужен приём событий и защита от повторной обработки.","Python application; calls the provider over HTTPS. Asynchronous confirmation needs an event receiver and duplicate-event protection."],
    ["system.provider","Платёжный провайдер","Payment provider","entity",["architecture"],"c4:SoftwareSystem","Изменение учебного примера: подтверждение через событие, до 15 минут. Принятие запроса не означает успешную оплату.","Fictional change: confirmation arrives as an event within 15 minutes. An accepted request is not a successful payment."],
    ["class.payment","Payment","Payment","entity",["classes","states"],"uml:Class","Один классификатор представлен в диаграмме классов и как контекст машины состояний. Поля id, status, providerEventId. Состояние Paid — другая сущность.","One classifier appears in the class view and as the state machine context. Fields: id, status, providerEventId. Paid is a separate state entity."],
    ["state.created","Created","Created","entity",["states"],"uml:State","Заказ создан. Старая машина состояний не описывает ожидание ответа провайдера.","Created. The old state machine does not represent waiting for provider confirmation."],
    ["state.paid","Paid","Paid","entity",["states"],"uml:State","Переходить сюда только по подтверждённому результату провайдера, не по ответу 202 Accepted.","Enter this state only after confirmed success, not upon 202 Accepted."],
    ["req.confirmed","REQ-17 · отгрузка после подтверждения","REQ-17 · ship only after confirmation","rule",["requirements","process","risks"],"requirement:Functional","Сформулированное правило связывает процесс, архитектуру и тест. Появления имеют один ID; задачи, сервис и тест имеют собственные ID.","This requirement connects the process, architecture and test. Its appearances share an ID; the activity, service and test keep their own IDs."],
    ["req.once","REQ-18 · эффект события ровно один раз","REQ-18 · apply an event once","rule",["requirements","risks"],"requirement:Functional","Повтор события не должен повторно отгружать заказ. Доставка события может повторяться; требование относится к эффекту обработки.","A repeated event must not release the order twice. Delivery may repeat; the requirement concerns the processing effect."],
    ["test.duplicate","Тест повторного события","Duplicate-event test","process",["requirements"],"test:Case","Отправить одно событие дважды, затем позднее подтверждение после тайм-аута. Проверить итоговый статус и количество отгрузок.","Send the same event twice, then a late confirmation after timeout. Check the final status and number of releases."],
    ["risk.unpaid","Отгрузка неоплаченного заказа","Shipping an unpaid order","risk",["risks"],"risk:Scenario","Причина: синхронную модель ответа применили к асинхронному контракту. Меры: проверка подтверждения и тест позднего ответа.","Cause: synchronous response assumptions applied to an asynchronous contract. Controls: verify confirmation and test late responses."],
    ["risk.duplicate","Повторная отгрузка","Duplicate shipment","risk",["risks"],"risk:Scenario","Повторное событие повторяет бизнес-эффект. Меры: ключ идемпотентности, атомарная обработка и тест повтора.","A repeated event repeats a business effect. Controls: idempotency key, atomic handling and duplicate-event test."],
  ];
  const nodes:GNode[]=rows.map(([id,ru,english,kind,members,tag,bodyRu,bodyEn])=>({id,name:en?english:ru,kind,sheets:members,tags:[tag],pos:{},body:(en?bodyEn:bodyRu)+(en?"\n\nSource: fictional PlyLoom teaching scenario. This is a traceability map, not an executable model.":"\n\nИсточник: вымышленный учебный сценарий PlyLoom. Это карта трассировки, а не исполняемая модель.")}));
  for(const [sid] of sheets)nodes.filter(n=>n.sheets.includes(sid)).forEach((n,i)=>{n.pos[sid]={x:i%3*300,y:Math.floor(i/3)*160};});
  const relations:[string,string,"flow"|"depends"|"supports"|"ref",string,string][]=[
    ["activity.accept","activity.pay","flow","затем","then"],["activity.pay","activity.ship","flow","старое условие: ответ API","old condition: API response"],
    ["service.payment","activity.pay","supports","реализует задачу","implements activity"],["service.payment","system.provider","depends","HTTPS / контракт подтверждения","HTTPS / confirmation contract"],
    ["service.payment","class.payment","ref","использует модель","uses data model"],["state.created","state.paid","flow","старое условие: ответ API","old condition: API response"],
    ["class.payment","state.created","ref","контекст машины состояний","state machine context"],["class.payment","state.paid","ref","контекст машины состояний","state machine context"],
    ["activity.ship","req.confirmed","depends","ограничена требованием","constrained by requirement"],["service.payment","req.confirmed","supports","должен обеспечивать","must satisfy"],
    ["req.once","risk.duplicate","ref","мера против риска","control for risk"],["req.confirmed","risk.unpaid","ref","мера против риска","control for risk"],
    ["test.duplicate","req.once","supports","проверяет","verifies"],["test.duplicate","req.confirmed","supports","проверяет поздний ответ","verifies late response"],
    ["req.confirmed","system.provider","depends","зависит от контракта","depends on contract"],["class.payment","req.once","depends","нужен ключ события","needs event key"],
  ];
  return {version:2,title:en?"One payment, six models":"Одна оплата — шесть моделей",description:en?"Teaching case: asynchronous confirmation reveals stale assumptions across separate diagrams. Tags retain original model roles; the current renderer uses PlyLoom cards.":"Учебный пример: асинхронное подтверждение обнаруживает устаревшие допущения в отдельных диаграммах. Теги сохраняют роль в исходной модели; текущий рендерер использует карточки PlyLoom.",sheets:sheets.map(([id,ru,english,color])=>({id,name:en?english:ru,color,limit:15,notation:"free"})),nodes,edges:relations.map(([from,to,kind,ru,english],i)=>({id:`trace.${i+1}`,from,to,kind,label:en?english:ru}))};
}
