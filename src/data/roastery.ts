import type { AttributeDefinition, AttributeValue, Graph, GNode, NodeKind, Sheet } from "../model/types";
import { gridLayout } from "../lib/graph";
import { defaultTypes } from "../lib/typeRegistry";

// Two attributes on the map that opens first, so the filter has something to work on right away.
// They say the same thing as the map itself: what is an assumption and what it would touch.
const BASIS = ["Допущение", "Нужна проверка", "Из первичного документа"];
const TOUCHES = ["Качество", "Деньги", "Сроки", "Безопасность", "Люди"];
/** id, index in BASIS (−1 = attached but not set), indices in TOUCHES. Nodes left out carry nothing. */
const attrRows: [string, number, string][] = [
  ["blend", 0, "01"], ["recipe", 1, "0"], ["taste", 0, "0"], ["pack", 1, "03"], ["shelf", 0, "03"], ["launch", 1, "01"],
  ["brazil", 2, "01"], ["ethiopia", 2, "01"], ["quote", 2, "1"], ["minimum", 2, "12"], ["backup", 0, "12"], ["delivery", 0, "2"],
  ["cost", 0, "1"], ["loss", 1, "01"], ["margin", 0, "1"], ["cash", 0, "1"], ["price", 0, "1"], ["fixed", 0, "1"],
  ["label", 1, "03"], ["market", 1, "3"], ["trace", 1, "03"], ["documents", 2, "3"], ["food", 1, "34"], ["claim", 1, "03"],
  ["roaster", 2, "0"], ["ventilation", 1, "3"], ["power", 0, "2"], ["scales", 2, "0"], ["sealer", 2, "0"], ["service", 1, "02"],
  ["roaster_role", 1, "4"], ["sales_role", 1, "4"], ["label_role", 1, "34"], ["training", 1, "04"], ["backup_role", 0, "24"],
  ["weigh", 1, "0"], ["roast", 1, "0"], ["cool", 1, "0"], ["cup", 1, "0"], ["seal", 1, "03"], ["log", -1, "0"],
];
const attributeTypes: AttributeDefinition[] = [
  { id: "basis", label: "Основание", labelEn: "Basis", description: "На чём держится карточка: допущение, вопрос к проверке или первичный документ.", dataType: "select", options: [...BASIS] },
  { id: "touches", label: "Затрагивает", labelEn: "Touches", description: "Каких сторон дела касается карточка; сторон может быть несколько.", dataType: "multi", options: [...TOUCHES] },
];
const attributesFor = (id: string): Record<string, AttributeValue> | undefined => {
  const row = attrRows.find((r) => r[0] === id);
  return row ? { basis: row[1] < 0 ? null : BASIS[row[1]], touches: [...row[2]].map((i) => TOUCHES[+i]) } : undefined;
};

const sheets: Sheet[] = [
  ["product", "Продукт", "#0284c7"], ["suppliers", "Поставщики", "#7c3aed"],
  ["money", "Деньги", "#d97706"], ["rules", "Требования", "#db2777"],
  ["equipment", "Оборудование", "#0d9488"], ["people", "Люди", "#4f46e5"],
  ["roasting", "Обжарка", "#475569"],
].map(([id, name, color]) => ({ id, name, color, notation: "свободная", limit: 15,
  description: "Учебная карта вымышленной обжарки. Данные — допущения, а требования — вопросы для проверки." }));

type Row = [string, string, NodeKind, string, string, string[]?];
const rows: Row[] = [
  ["blend", "Эспрессо-смесь «Утро»", "entity", "product", "Рецепт для тестовой партии: 70 % Бразилии и 30 % Эфиопии. Один объект на трёх листах; изменение тела видно во всех его появлениях.", ["suppliers", "money"]],
  ["recipe", "Рецепт и версии", "rule", "product", "Хранить номер версии, состав и дату дегустации. Замена зерна создаёт новую версию рецепта, а не переписывает историю."],
  ["taste", "Шоколад и орех", "hypothesis", "product", "Пока это гипотеза о вкусе. Проверить слепой дегустацией; не превращать рекламную формулировку в установленный факт."],
  ["pack", "Пакет 250 г", "entity", "product", "Вариант упаковки с клапаном. Удобство открытия и сохранность кофе нужно проверить на пробной партии."],
  ["shelf", "Срок годности", "hypothesis", "product", "Нельзя вывести из чужой этикетки. Нужны обоснование, условия хранения и применимые к рынку правила.", ["rules"]],
  ["launch", "Первая тестовая партия", "decision", "product", "Выпускать после дегустации и проверки упаковки. Критерий успеха — повторный заказ, а не только первая продажа."],
  ["brazil", "Зелёное зерно: Бразилия", "entity", "suppliers", "Учебное предложение A: цена 600 условных единиц за килограмм. Цена вымышлена, не является рыночной котировкой."],
  ["ethiopia", "Зелёное зерно: Эфиопия", "entity", "suppliers", "Учебное предложение B: 900 условных единиц за килограмм. Меняется отдельным источником — прайсом."],
  ["quote", "Прайс поставщика v1", "note", "suppliers", "Источник: вымышленный прайс для демо.\n\n| Зерно | Цена, у.е./кг |\n|---|---|\n| Бразилия | 600 |\n| Эфиопия | 900 |"],
  ["minimum", "Минимальная партия", "rule", "suppliers", "Условие тестового предложения: один мешок каждого сорта. Проверить условия поставщика до расчёта оборотных средств."],
  ["backup", "Резервный поставщик", "risk", "suppliers", "Наличие похожего зерна не гарантирует тот же вкус. Смена поставщика требует пробной обжарки и проверки документов."],
  ["delivery", "Срок доставки", "hypothesis", "suppliers", "Для планирования предполагаем две недели. Задержка расходует запас, а ускоренная доставка меняет себестоимость."],
  ["cost", "Себестоимость смеси", "metric", "money", "Учебный расчёт: 0,7 × 600 + 0,3 × 900 = 690 у.е./кг зелёного зерна. Потери массы, упаковка, труд и доставка здесь ещё не включены."],
  ["loss", "Потеря массы", "metric", "money", "Для расчёта принята гипотеза 15 %. Тогда зерно на килограмм готового кофе: 690 / 0,85 ≈ 812 у.е. Проверить взвешиванием.", ["roasting"]],
  ["margin", "Маржа после переменных затрат", "metric", "money", "Цена минус зерно, упаковка, сдельный труд и доставка заказа. Это не прибыль бизнеса: аренда и оборудование считаются отдельно.", ["roasting"]],
  ["cash", "Деньги в запасах", "risk", "money", "Минимальная партия может потребовать денег раньше, чем появится спрос. Сравнить сценарии продаж, срока поставки и срока хранения."],
  ["price", "Тестовая цена", "hypothesis", "money", "Сначала проверить готовность покупателей повторять заказ. Число в модели — допущение, пока нет наблюдений."],
  ["fixed", "Постоянные расходы", "metric", "money", "Отдельно учитывать аренду, обслуживание, оклад и амортизацию. Маржа одного пакета не отвечает на вопрос об окупаемости."],
  ["label", "Макет этикетки", "entity", "rules", "Учебный макет явно называет страны происхождения. Само подорожание зерна не меняет этикетку; смена состава или происхождения запускает проверку макета."],
  ["market", "Рынок и применимые правила", "note", "rules", "Открытый вопрос: где продаётся продукт? Сначала определить рынок, затем найти действующие официальные требования к пищевой продукции и информации на упаковке."],
  ["trace", "Прослеживаемость партии", "rule", "rules", "Связать входящую партию, рецепт, дату обжарки и готовую упаковку. Это проектное правило демо, не цитата из закона."],
  ["documents", "Документы поставщика", "note", "rules", "Список нужных документов должен быть подтверждён для выбранного рынка. В этой карте такого подтверждения пока нет."],
  ["food", "Проверка помещения", "process", "rules", "До аренды проверить пригодность помещения и действующие требования. Вопросы про вентиляцию, электричество и пищевое производство передать профильным специалистам."],
  ["claim", "Проверить обещания на упаковке", "process", "rules", "Сопоставить макет с фактической смесью. Связь с рецептом нужна и без формального требования указывать страну."],
  ["roaster", "Ростер", "entity", "equipment", "Выбор после теста партии и оценки производительности. Паспортная ёмкость не равна стабильному выпуску за смену."],
  ["ventilation", "Вентиляция", "entity", "equipment", "Проверить требования конкретного ростера и помещения. В демо нет инженерного расчёта."],
  ["power", "Электропитание", "risk", "equipment", "Сверить доступную мощность с оборудованием до подписания аренды."],
  ["scales", "Весы", "entity", "equipment", "Входное и выходное взвешивание дают фактическую потерю массы. Предусмотреть проверку точности."],
  ["sealer", "Запайщик", "entity", "equipment", "Тест герметичности на выбранном пакете. Скорость запайки может ограничить всю линию."],
  ["service", "План обслуживания", "rule", "equipment", "Опираться на документацию изготовителя. Хранить историю обслуживания отдельно от текущего плана."],
  ["roaster_role", "Обжарщик", "person", "people", "Ведёт профиль и записи о партиях; останавливает выпуск при отклонениях."],
  ["sales_role", "Продажи", "person", "people", "Собирает обратную связь и повторные заказы. Не меняет обещание вкуса без согласования."],
  ["label_role", "Ответственный за этикетку", "person", "people", "Проверяет макет при изменении рецепта и рынка. Ответственность должна иметь имя, а не только роль."],
  ["training", "Обучение смены", "process", "people", "Передача навыка включает журнал партии и совместную дегустацию."],
  ["backup_role", "Замена на смене", "risk", "people", "Один человек с нужным навыком — риск остановки. Проверить, кто способен его заменить."],
  ["feedback", "Журнал обратной связи", "note", "people", "Записывать номер партии вместе с отзывом: иначе нельзя связать проблему с рецептом и процессом."],
  ["weigh", "Взвесить зерно", "process", "roasting", "Записать массы компонентов и идентификаторы входящих партий."],
  ["roast", "Обжарить", "process", "roasting", "Записать фактический профиль. Точки времени и температуры не являются инструкцией по безопасной эксплуатации."],
  ["cool", "Остудить", "process", "roasting", "Следовать инструкции оборудования; проверить воспроизводимость охлаждения."],
  ["cup", "Оценить чашку", "decision", "roasting", "Партия проходит дегустацию? Если нет, записать причину и решение о партии."],
  ["seal", "Упаковать и промаркировать", "process", "roasting", "Проверить массу, шов, версию этикетки и связь с журналом партии."],
  ["log", "Журнал партии", "note", "roasting", "Источник фактических наблюдений. В демо записи ещё нет: это место для будущего первичного документа."],
];

export function makeRoastery(): Graph {
  const nodes: GNode[] = rows.map(([id, name, kind, home, body, other = []]) => {
    const values = attributesFor(id);
    return { id, name, kind, sheets: [home, ...other],
      body: body + "\n\nИсточник: учебный сценарий PlyLoom; не проверенные сведения о реальном бизнесе.", pos: {},
      ...(values ? { attributes: values } : {}) };
  });
  for (const s of sheets) {
    const local = nodes.filter((n) => n.sheets.includes(s.id));
    local.forEach((n, i) => { n.pos[s.id] = gridLayout(local.length, i, n.id); });
  }
  const links: [string, string, "flow" | "depends" | "supports" | "ref"][] = [
    ["blend", "recipe", "depends"], ["blend", "brazil", "depends"], ["blend", "ethiopia", "depends"], ["blend", "cost", "ref"],
    ["recipe", "taste", "ref"], ["pack", "shelf", "depends"], ["launch", "cup", "depends"], ["launch", "pack", "depends"],
    ["brazil", "quote", "ref"], ["ethiopia", "quote", "ref"], ["minimum", "cash", "ref"], ["backup", "recipe", "depends"], ["delivery", "cash", "ref"],
    ["cost", "loss", "depends"], ["margin", "cost", "depends"], ["margin", "price", "depends"], ["fixed", "roaster", "depends"], ["price", "feedback", "depends"],
    ["label", "recipe", "depends"], ["label", "market", "depends"], ["label", "claim", "depends"], ["claim", "taste", "ref"], ["trace", "log", "depends"], ["documents", "brazil", "ref"], ["food", "ventilation", "depends"],
    ["roaster", "ventilation", "depends"], ["roaster", "power", "depends"], ["roaster", "service", "depends"], ["scales", "loss", "supports"], ["sealer", "pack", "depends"],
    ["roaster_role", "roast", "ref"], ["sales_role", "feedback", "ref"], ["label_role", "label", "ref"], ["training", "roaster_role", "ref"], ["backup_role", "training", "depends"],
    ["weigh", "roast", "flow"], ["roast", "cool", "flow"], ["cool", "cup", "flow"], ["cup", "seal", "flow"], ["seal", "log", "flow"], ["weigh", "scales", "depends"], ["seal", "label", "depends"], ["log", "recipe", "ref"],
  ];
  return { version: 3, title: "Маленькая обжарка", description: "42 учебных узла. Все числа — допущения. Начните со смеси «Утро» и её трёх листов.",
    types: { ...defaultTypes(), attributes: attributeTypes },
    sheets: sheets.map((s) => ({ ...s })), nodes, edges: links.map(([from, to, kind], i) => ({ id: `coffee-edge-${i}`, from, to, kind })) };
}
