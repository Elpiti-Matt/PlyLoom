import type { AttributeDefinition, AttributeValue, EdgeKind, GNode, Graph, NodeKind } from "../model/types";
import { gridLayout } from "../lib/graph";
import { defaultTypes } from "../lib/typeRegistry";

// A synthetic teaching project authored from scratch. No customer data or identities.
// Locale selects a complete fixture; changing the UI language never rewrites a graph.
type Text = readonly [ru: string, en: string];
type NodeRow = readonly [id: string, kind: NodeKind, name: Text, sheets: readonly string[], body: Text];
type EdgeRow = readonly [from: string, to: string, kind: EdgeKind, label: Text];
const TITLE: Text = ["Разработка: экспорт отчёта", "Software: report export"];
const SHEETS = [
  ["context", "Контекст задачи", "Problem context", "#0284c7"],
  ["requirements", "Спецификация", "Requirements", "#7c3aed"],
  ["architecture", "Архитектура", "Architecture", "#0d9488"],
  ["contracts", "Контракты и модели", "Contracts and models", "#d97706"],
  ["implementation", "Реализация", "Implementation", "#2563eb"],
  ["verification", "Проверки", "Verification", "#db2777"],
  ["docs", "Документы и фрагменты", "Documents and fragments", "#64748b"],
  ["change", "Разбор изменения", "Change review", "#b45309"],
] as const;

// Four attributes so the built-in example has something to filter by: single choice, multiple
// choice, number and date. Roles carry none at all, so "no attribute" is visible in the panel too.
type Choices = readonly [ru: readonly string[], en: readonly string[]];
const STATUS: Choices = [["Черновик", "В работе", "Готово"], ["Draft", "In progress", "Done"]];
const AREAS: Choices = [["Интерфейс", "Сервис", "Хранилище", "Документы", "Проверки"], ["UI", "Service", "Storage", "Documents", "Verification"]];
/** status: index in STATUS, −1 = attached but not set. areas: indices in AREAS, "" = nothing chosen. */
type AttrRow = readonly [id: string, status: number, areas: string, days: number, due: string];
const ATTRS: AttrRow[] = [
  ["goal.export", 2, "1", 0, ""],
  ["scope.v1", 2, "3", 0, "2026-01-16"],
  ["metric.ready", 1, "4", 2, ""],
  ["requirement.async", 2, "12", 3, "2026-02-02"],
  ["requirement.owner", 2, "1", 2, "2026-02-02"],
  ["requirement.expiry", 1, "123", 2, "2026-03-10"],
  ["requirement.retry", 0, "1", 3, ""],
  ["usecase.export", 2, "01", 4, ""],
  ["acceptance.export", 1, "4", 1, "2026-02-20"],
  ["adr.queue", 2, "1", 0, ""],
  ["diagram.context", 2, "1", 1, ""],
  ["diagram.sequence", 1, "01", 1, ""],
  ["diagram.states", 1, "1", 1, ""],
  ["contract.export", 2, "01", 2, "2026-02-16"],
  ["model.job", 2, "12", 2, ""],
  ["contract.errors", 1, "01", 1, "2026-02-16"],
  ["component.api", 1, "1", 5, "2026-03-02"],
  ["component.worker", 1, "1", 5, "2026-03-02"],
  ["component.queue", 0, "1", 3, ""],
  ["component.storage", 0, "2", 4, "2026-03-16"],
  ["implementation.cleanup", 0, "12", 2, "2026-03-16"],
  ["implementation.polling", 1, "01", 2, ""],
  ["test.lifecycle", 1, "4", 1, "2026-03-23"],
  ["test.access", 0, "4", 1, ""],
  ["test.expiry", 0, "24", 1, "2026-03-23"],
  ["test.retry", -1, "4", 1, ""],
  ["trace.matrix", 1, "34", 0, ""],
  ["doc.brief", 2, "3", 0, "2026-01-16"],
  ["doc.user-guide", 0, "03", 2, ""],
  ["doc.runbook", 0, "3", 2, ""],
  ["fragment.expiry", 1, "3", 0, ""],
  ["glossary.job", 0, "3", 0, ""],
  ["assembly.review", -1, "", 0, ""],
  ["change.expiry", 0, "13", 0, "2026-04-06"],
  ["impact.review", 1, "34", 1, "2026-04-06"],
  ["risk.stale-docs", 0, "3", 0, ""],
  ["release.checklist", 0, "4", 0, "2026-04-13"],
];

const NODES: NodeRow[] = [
  ["goal.export", "hypothesis", ["Цель: получить отчёт без ожидания", "Goal: request a report without waiting"], ["context"],
    ["Пользователь заказывает отчёт, продолжает работу и позже скачивает файл. Это учебная гипотеза: интервью и измерения не проводились.", "A user requests a report, continues working and downloads the file later. This is a teaching hypothesis: no interviews or measurements have been conducted."]],
  ["role.analyst", "person", ["Роль: аналитик", "Role: analyst"], ["context"],
    ["Уточняет границы задачи и критерии приёмки. Абстрактная роль без человека, работодателя или заказчика за ней.", "Clarifies scope and acceptance criteria. An abstract role with no person, employer or customer behind it."]],
  ["role.developer", "person", ["Роль: разработчик", "Role: developer"], ["context"],
    ["Сопоставляет требования с контрактом и компонентами. Технические решения придуманы для примера.", "Maps requirements to the contract and components. Technical decisions were invented for this example."]],
  ["role.tester", "person", ["Роль: тестировщик", "Role: tester"], ["context"],
    ["Проверяет поведение по критериям. Карточки тестов обозначают план проверок, а не выполненные испытания сервиса.", "Checks behavior against criteria. Test cards describe a test plan, not completed tests of a service."]],
  ["scope.v1", "decision", ["Границы учебного релиза", "Teaching release scope"], ["context", "requirements"],
    ["Один формат отчёта, один владелец задачи, опрос статуса. Рассылка и расписания остаются за границами примера.", "One report format, one job owner and status polling. Email delivery and schedules are outside the example."]],
  ["metric.ready", "metric", ["Метрика: время до готового файла", "Metric: time until the file is ready"], ["context", "verification"],
    ["Измерять от принятия запроса до Ready. Цель пока не выбрана, результатов производительности нет.", "Measure from request acceptance to Ready. No target has been chosen and no performance results are available."]],
  ["requirement.async", "rule", ["REQ-01: фоновая подготовка", "REQ-01: background generation"], ["requirements", "architecture"],
    ["Запрос создаёт задачу и возвращает её ID. Отдельный запрос сообщает готовность файла. Принятие запроса ещё не означает Ready.", "A request creates a job and returns its ID. A separate request reports file readiness. Accepting a request does not mean Ready."]],
  ["requirement.owner", "rule", ["REQ-02: доступ владельца", "REQ-02: owner access"], ["requirements", "contracts"],
    ["Статус и файл доступны владельцу задачи. В учебном контракте чужая и неизвестная задача дают одинаковый ответ NotFound.", "The job owner can access its status and file. In this teaching contract, another user's job and an unknown job both return NotFound."]],
  ["requirement.expiry", "rule", ["REQ-03: срок доступности файла", "REQ-03: file availability period"], ["requirements", "implementation", "verification", "change"],
    ["Базовая версия: файл доступен 24 часа после Ready. В момент expiresAt скачивание запрещается, даже если очистка ещё не завершилась. 24 часа — произвольное условие учебной задачи.", "Baseline: a file is available for 24 hours after Ready. Downloads are denied at expiresAt even if cleanup is pending. The 24-hour period is an arbitrary teaching assumption."]],
  ["requirement.retry", "rule", ["REQ-04: безопасный повтор", "REQ-04: safe retry"], ["requirements", "contracts", "implementation"],
    ["Те же ключ и параметры возвращают тот же jobId в окне дедупликации. Другие параметры с тем же ключом дают Conflict. Окно дедупликации задаётся отдельно от срока файла.", "The same key and parameters return the same jobId within a deduplication window. Different parameters with the same key return Conflict. This window is separate from file retention."]],
  ["usecase.export", "process", ["UC-01: заказать и скачать", "UC-01: request and download"], ["context", "requirements"],
    ["1. Задать параметры.\n2. Получить jobId.\n3. Проверять статус.\n4. При Ready скачать.\n5. При Failed показать ошибку; при Expired предложить новый запрос.", "1. Select parameters.\n2. Receive jobId.\n3. Poll status.\n4. Download when Ready.\n5. Show an error for Failed; offer a new request for Expired."]],
  ["acceptance.export", "rule", ["AC-01: критерии приёмки", "AC-01: acceptance criteria"], ["requirements", "verification"],
    ["Принятый запрос возвращает jobId. API и интерфейс согласованы по статусам. Владелец скачивает Ready-файл до expiresAt, после срока доступ закрыт.", "An accepted request returns jobId. API and UI agree on status. The owner can download a Ready file before expiresAt; access ends at expiry."]],
  ["adr.queue", "decision", ["ADR-01: очередь и обработчик", "ADR-01: queue and worker"], ["architecture"],
    ["Вынести генерацию в обработчик очереди. Альтернатива — держать HTTP-запрос открытым. Цена решения: состояния задачи, повторная доставка и очистка.", "Move generation to a queue worker. The alternative is keeping the HTTP request open. Costs include job states, redelivery and cleanup."]],
  ["diagram.context", "note", ["Диаграмма: компоненты", "Diagram: components"], ["architecture"],
    ["Интерфейс → API → очередь → обработчик → хранилище. Исходник Mermaid: examples/software/artifacts.md. Карточка описывает диаграмму; PlyLoom не выполняет эту систему.", "UI → API → queue → worker → storage. Mermaid source: examples/software/artifacts.md. This card describes a diagram; PlyLoom does not execute this system."]],
  ["diagram.sequence", "note", ["Диаграмма: последовательность", "Diagram: sequence"], ["architecture"],
    ["API фиксирует задачу и возвращает Accepted; обработчик создаёт файл; пользователь узнаёт Ready через опрос. Диаграмма и её допущения: examples/software/artifacts.md.", "The API records a job and returns Accepted; a worker creates a file; polling reports Ready. Diagram and assumptions: examples/software/artifacts.md."]],
  ["diagram.states", "note", ["Диаграмма: состояния задачи", "Diagram: job states"], ["architecture", "contracts"],
    ["Queued → Running → Ready → Expired. Из Running возможен Failed. Повтор доставки не создаёт второй результат завершённой задачи. Это учебная модель без встроенного UML-валидатора.", "Queued → Running → Ready → Expired. Running may also become Failed. Redelivery does not create another result for a completed job. This is a teaching model without a built-in UML validator."]],
  ["contract.export", "note", ["API-01: контракт экспорта", "API-01: export contract"], ["contracts", "implementation", "verification", "docs"],
    ["| Операция | Результат |\n|---|---|\n| POST /exports | Accepted и jobId |\n| GET /exports/{id} | state, expiresAt при Ready |\n| GET /exports/{id}/file | файл или ошибка |\n\nОдин артефакт на четырёх листах. Это описание учебного API, а не действующие адреса.", "| Operation | Result |\n|---|---|\n| POST /exports | Accepted and jobId |\n| GET /exports/{id} | state, expiresAt when Ready |\n| GET /exports/{id}/file | file or error |\n\nOne artifact on four sheets. This describes a teaching API, not live endpoints."]],
  ["model.job", "entity", ["Модель: задача экспорта", "Model: export job"], ["requirements", "architecture", "contracts", "implementation"],
    ["Поля: id, ownerId, state, createdAt, readyAt, expiresAt, resultRef. Это сущность предметной модели. Карточка диаграммы состояний ссылается на неё и имеет собственный ID.", "Fields: id, ownerId, state, createdAt, readyAt, expiresAt, resultRef. This is a domain entity. The state diagram references it and has its own ID."]],
  ["contract.errors", "note", ["API-02: ответы об ошибках", "API-02: error responses"], ["contracts", "verification"],
    ["NotFound — неизвестная или чужая задача; NotReady — файл ещё не готов; Expired — срок прошёл; Conflict — параметры не совпали с ключом. Это именованные ошибки учебного контракта.", "NotFound: unknown job or different owner; NotReady: no file yet; Expired: availability ended; Conflict: parameters differ for a key. Named errors in the teaching contract."]],
  ["component.api", "entity", ["Компонент: API", "Component: API"], ["architecture", "implementation"],
    ["Проверяет владельца, принимает запрос, выдаёт статус. Проверка expiresAt выполняется при скачивании, независимо от фоновой очистки.", "Checks ownership, accepts requests and returns status. Download authorization checks expiresAt independently of background cleanup."]],
  ["component.worker", "entity", ["Компонент: обработчик", "Component: worker"], ["architecture", "implementation"],
    ["Создаёт файл, фиксирует Ready, readyAt и expiresAt. Перед повторной обработкой проверяет сохранённое состояние.", "Creates a file and records Ready, readyAt and expiresAt. Checks persisted state before reprocessing."]],
  ["component.queue", "entity", ["Компонент: очередь", "Component: queue"], ["architecture"],
    ["В учебном сценарии допускается повторная доставка. Конкретный продукт и провайдер не выбраны.", "Redelivery is possible in this teaching scenario. No product or provider has been selected."]],
  ["component.storage", "entity", ["Компонент: хранилище файлов", "Component: file storage"], ["architecture", "implementation"],
    ["Хранит результат по resultRef. Публичного доступа нет. Провайдер, адреса и рабочие данные отсутствуют.", "Stores a result by resultRef with no public access. There is no provider, address or production data."]],
  ["implementation.cleanup", "process", ["DEV-01: очистка результатов", "DEV-01: result cleanup"], ["implementation"],
    ["Удаляет просроченные файлы, повтор безопасен. API отзывает доступ в expiresAt, очистка освобождает место.", "Removes expired files and can safely repeat. The API revokes access at expiresAt; cleanup releases storage."]],
  ["implementation.polling", "process", ["DEV-02: опрос статуса", "DEV-02: status polling"], ["implementation"],
    ["Останавливает опрос в Ready, Failed или Expired. После сетевой ошибки предлагает повтор. Рабочего приложения за карточкой нет.", "Stops polling at Ready, Failed or Expired. Offers retry after a network error. This card does not represent an existing application."]],
  ["test.lifecycle", "note", ["TEST-01: основной путь", "TEST-01: happy path"], ["verification"],
    ["Создать задачу, дождаться Ready, скачать владельцем. Сверить статусы API и интерфейса. Статус: план проверки, не выполнен.", "Create a job, wait for Ready and download as its owner. Compare API and UI status. Status: planned, not executed."]],
  ["test.access", "note", ["TEST-02: чужая задача", "TEST-02: another user's job"], ["verification"],
    ["Запросить статус и файл с другой учебной учётной записью; ожидать NotFound в обоих случаях. Статус: план проверки, не выполнен.", "Request status and file as a different test identity; expect NotFound in both cases. Status: planned, not executed."]],
  ["test.expiry", "note", ["TEST-03: граница срока", "TEST-03: expiry boundary"], ["verification", "change"],
    ["Проверить скачивание до expiresAt и ровно в expiresAt, включая задержку очистки. Использовать управляемые часы. Статус: план проверки, не выполнен.", "Test downloads before and exactly at expiresAt, including delayed cleanup. Use a controllable clock. Status: planned, not executed."]],
  ["test.retry", "note", ["TEST-04: повтор и конфликт", "TEST-04: retry and conflict"], ["verification"],
    ["Те же ключ и параметры дают тот же jobId; другие параметры дают Conflict; повтор доставки не меняет готовый результат. Статус: план проверки, не выполнен.", "The same key and parameters return the same jobId; different parameters return Conflict; redelivery leaves a completed result intact. Status: planned, not executed."]],
  ["trace.matrix", "note", ["Матрица: требование → проверка", "Matrix: requirement → test"], ["verification", "docs"],
    ["REQ-01 → TEST-01; REQ-02 → TEST-02; REQ-03 → TEST-03; REQ-04 → TEST-04. Матрица задана вручную; связь с тестом не означает, что он пройден.", "REQ-01 → TEST-01; REQ-02 → TEST-02; REQ-03 → TEST-03; REQ-04 → TEST-04. This matrix is authored manually; a test link does not mean it passed."]],
  ["doc.brief", "note", ["Документ: постановка задачи", "Document: feature brief"], ["context", "docs"],
    ["Состав: цель, границы, UC-01, AC-01, API-01. Документ ссылается на артефакты. Положение карточек не задаёт порядок публикации.", "Contents: goal, scope, UC-01, AC-01 and API-01. The document references artifacts. Card positions do not define publication order."]],
  ["doc.user-guide", "note", ["Документ: инструкция пользователя", "Document: user guide"], ["docs"],
    ["Объясняет заказ и скачивание. Переиспользует fragment.expiry. В этом демо включение обозначено связью; автоматической сборки документа нет.", "Explains requesting and downloading. Reuses fragment.expiry. In this demo, inclusion is represented by a link; documents are not assembled automatically."]],
  ["doc.runbook", "note", ["Документ: инструкция сопровождения", "Document: runbook"], ["docs"],
    ["Описывает проверку очереди и очистку. Ссылается на тот же fragment.expiry, что и инструкция пользователя. Рабочих адресов и имён хостов нет.", "Describes queue checks and cleanup. References the same fragment.expiry as the user guide. No production addresses or hostnames are included."]],
  ["fragment.expiry", "note", ["Фрагмент: доступность результата", "Fragment: result availability"], ["docs", "change"],
    ["Готовый файл доступен 24 часа после завершения задачи. После истечения срока создайте новый запрос.\n\nОдин фрагмент для двух документов. В карте хранится один текст; сборка публикаций — отдельная предлагаемая функция.", "A completed file is available for 24 hours after the job finishes. Submit a new request after it expires.\n\nOne fragment for two documents. The map stores one text; assembling publications is a separate proposed feature."]],
  ["glossary.job", "note", ["Словарь: задача и результат", "Glossary: job and result"], ["contracts", "docs"],
    ["Задача — запись о подготовке отчёта. Результат — файл. Их жизненные циклы различаются. Это заметка, не расширение встроенных типов PlyLoom.", "A job records report generation. A result is a file. Their lifecycles differ. This is a note, not an extension of PlyLoom's built-in types."]],
  ["assembly.review", "note", ["Сборка: пакет для обсуждения", "Assembly: review packet"], ["docs"],
    ["Порядок: 1) постановка; 2) UC-01; 3) API-01; 4) fragment.expiry; 5) матрица проверок. Это рецепт в заметке, не работающий CCMS-экспортёр.", "Order: 1) feature brief; 2) UC-01; 3) API-01; 4) fragment.expiry; 5) test matrix. This is a recipe in a note, not a working CCMS exporter."]],
  ["change.expiry", "decision", ["CHG-01: предложено 2 часа", "CHG-01: proposed two-hour expiry"], ["change"],
    ["Предложение: уменьшить срок новых файлов с 24 до 2 часов. Пока не принято. Судьбу старых файлов решить отдельно. Код и документы автоматически не меняются.", "Proposal: reduce availability of new files from 24 to 2 hours. Not yet accepted. Decide separately how existing files are treated. Code and documents do not change automatically."]],
  ["impact.review", "process", ["Разбор: что затронет изменение", "Review: what does the change affect?"], ["change"],
    ["От CHG-01 пройти к REQ-03, затем к вычислению expiresAt, проверке скачивания, очистке, TEST-03 и fragment.expiry. Проверить две инструкции. Связь указывает кандидата на пересмотр, не доказывает влияние.", "Follow CHG-01 to REQ-03, then review expiresAt calculation, download authorization, cleanup, TEST-03 and fragment.expiry. Check both guides. A link identifies a review candidate, not proven impact."]],
  ["risk.stale-docs", "risk", ["Риск: текст отстал от поведения", "Risk: documentation lags behind behavior"], ["change"],
    ["Копии абзаца могут разойтись. Общий фрагмент уменьшает дублирование, но документы всё равно нужно проверить и опубликовать повторно.", "Copies of a paragraph may diverge. A shared fragment reduces duplication, but documents still need review and republication."]],
  ["release.checklist", "rule", ["Проверка перед учебным релизом", "Teaching release checklist"], ["change"],
    ["Решить судьбу CHG-01 и старых файлов; проверить контракт; выполнить тесты; пересобрать документы; зафиксировать версии. Карточка не означает выполнения этих действий.", "Decide on CHG-01 and existing files; review the contract; run tests; rebuild documents; record versions. A card does not imply these actions were completed."]],
];

const EDGES: EdgeRow[] = [
  ["goal.export", "usecase.export", "ref", ["раскрывается в", "described by"]],
  ["scope.v1", "goal.export", "ref", ["ограничивает", "scopes"]],
  ["metric.ready", "goal.export", "ref", ["проверяет гипотезу", "assesses hypothesis"]],
  ["role.analyst", "doc.brief", "ref", ["готовит", "authors"]],
  ["role.analyst", "acceptance.export", "ref", ["уточняет", "clarifies"]],
  ["role.developer", "adr.queue", "ref", ["обосновывает", "justifies"]],
  ["role.tester", "trace.matrix", "ref", ["проверяет покрытие", "reviews coverage"]],
  ["doc.brief", "goal.export", "ref", ["ссылается на цель", "references goal"]],
  ["doc.brief", "scope.v1", "ref", ["ссылается на границы", "references scope"]],
  ["doc.brief", "usecase.export", "ref", ["ссылается на сценарий", "references use case"]],
  ["doc.brief", "acceptance.export", "ref", ["ссылается на критерии", "references criteria"]],
  ["doc.brief", "contract.export", "ref", ["ссылается на контракт", "references contract"]],
  ["usecase.export", "requirement.async", "depends", ["требует фоновой задачи", "requires background job"]],
  ["usecase.export", "requirement.owner", "depends", ["ограничен владельцем", "restricted to owner"]],
  ["usecase.export", "requirement.expiry", "depends", ["ограничен сроком", "limited by expiry"]],
  ["usecase.export", "requirement.retry", "depends", ["учитывает повторы", "handles retries"]],
  ["acceptance.export", "usecase.export", "ref", ["проверяет сценарий", "checks use case"]],
  ["adr.queue", "requirement.async", "ref", ["реализует требование", "addresses requirement"]],
  ["adr.queue", "component.queue", "ref", ["выбирает подход", "selects approach"]],
  ["adr.queue", "component.worker", "ref", ["распределяет работу", "assigns work"]],
  ["diagram.context", "component.api", "ref", ["показывает", "depicts"]],
  ["diagram.context", "component.worker", "ref", ["показывает", "depicts"]],
  ["diagram.sequence", "usecase.export", "ref", ["детализирует", "details"]],
  ["diagram.sequence", "contract.export", "ref", ["использует операции", "uses operations"]],
  ["diagram.states", "model.job", "ref", ["описывает состояния", "describes states"]],
  ["component.api", "component.queue", "flow", ["ставит задачу", "enqueues job"]],
  ["component.queue", "component.worker", "flow", ["доставляет задачу", "delivers job"]],
  ["component.worker", "component.storage", "flow", ["сохраняет результат", "stores result"]],
  ["component.api", "contract.export", "ref", ["реализует контракт", "implements contract"]],
  ["component.api", "requirement.owner", "ref", ["проверяет доступ", "checks access"]],
  ["component.api", "requirement.expiry", "ref", ["проверяет expiresAt", "checks expiresAt"]],
  ["component.worker", "requirement.expiry", "ref", ["вычисляет expiresAt", "calculates expiresAt"]],
  ["component.worker", "requirement.retry", "ref", ["учитывает повтор", "handles redelivery"]],
  ["component.worker", "model.job", "ref", ["обновляет состояние", "updates state"]],
  ["contract.export", "model.job", "ref", ["возвращает поля", "returns fields"]],
  ["contract.export", "contract.errors", "ref", ["определяет ошибки", "defines errors"]],
  ["contract.export", "requirement.retry", "ref", ["задаёт повтор запроса", "specifies retry"]],
  ["contract.errors", "requirement.owner", "ref", ["уточняет отказ", "specifies denial"]],
  ["implementation.cleanup", "requirement.expiry", "ref", ["следует сроку", "follows expiry"]],
  ["implementation.cleanup", "component.storage", "ref", ["удаляет файлы", "removes files"]],
  ["implementation.polling", "contract.export", "ref", ["вызывает статус", "polls status"]],
  ["implementation.polling", "diagram.states", "ref", ["учитывает состояния", "handles states"]],
  ["test.lifecycle", "requirement.async", "ref", ["проверяет", "tests"]],
  ["test.lifecycle", "acceptance.export", "ref", ["уточняет шаги", "details steps"]],
  ["test.access", "requirement.owner", "ref", ["проверяет", "tests"]],
  ["test.access", "contract.errors", "ref", ["ожидает NotFound", "expects NotFound"]],
  ["test.expiry", "requirement.expiry", "ref", ["проверяет границу", "tests boundary"]],
  ["test.expiry", "implementation.cleanup", "ref", ["учитывает задержку", "covers delayed cleanup"]],
  ["test.retry", "requirement.retry", "ref", ["проверяет", "tests"]],
  ["test.retry", "component.worker", "ref", ["проверяет повтор доставки", "tests redelivery"]],
  ["trace.matrix", "test.lifecycle", "ref", ["REQ-01 → TEST-01", "REQ-01 → TEST-01"]],
  ["trace.matrix", "test.access", "ref", ["REQ-02 → TEST-02", "REQ-02 → TEST-02"]],
  ["trace.matrix", "test.expiry", "ref", ["REQ-03 → TEST-03", "REQ-03 → TEST-03"]],
  ["trace.matrix", "test.retry", "ref", ["REQ-04 → TEST-04", "REQ-04 → TEST-04"]],
  ["metric.ready", "test.lifecycle", "ref", ["наблюдается в сценарии", "observed in scenario"]],
  ["doc.user-guide", "usecase.export", "ref", ["объясняет", "explains"]],
  ["doc.user-guide", "fragment.expiry", "ref", ["включает фрагмент", "includes fragment"]],
  ["doc.runbook", "fragment.expiry", "ref", ["включает тот же фрагмент", "includes same fragment"]],
  ["doc.runbook", "implementation.cleanup", "ref", ["описывает сопровождение", "describes operation"]],
  ["fragment.expiry", "requirement.expiry", "ref", ["излагает правило", "explains rule"]],
  ["glossary.job", "model.job", "ref", ["определяет термин", "defines term"]],
  ["assembly.review", "doc.brief", "ref", ["1 · постановка", "1 · brief"]],
  ["assembly.review", "usecase.export", "ref", ["2 · сценарий", "2 · use case"]],
  ["assembly.review", "contract.export", "ref", ["3 · контракт", "3 · contract"]],
  ["assembly.review", "fragment.expiry", "ref", ["4 · общий фрагмент", "4 · shared fragment"]],
  ["assembly.review", "trace.matrix", "ref", ["5 · проверки", "5 · tests"]],
  ["change.expiry", "requirement.expiry", "contradicts", ["предлагает изменить 24 → 2", "proposes 24 → 2"]],
  ["impact.review", "change.expiry", "ref", ["разбирает предложение", "reviews proposal"]],
  ["impact.review", "test.expiry", "ref", ["кандидат на пересмотр", "review candidate"]],
  ["impact.review", "fragment.expiry", "ref", ["кандидат на пересмотр", "review candidate"]],
  ["risk.stale-docs", "fragment.expiry", "ref", ["требует проверки текста", "requires text review"]],
  ["risk.stale-docs", "doc.user-guide", "ref", ["затрагивает публикацию", "affects publication"]],
  ["risk.stale-docs", "doc.runbook", "ref", ["затрагивает публикацию", "affects publication"]],
  ["release.checklist", "impact.review", "depends", ["требует разбора", "requires review"]],
  ["release.checklist", "assembly.review", "ref", ["проверяет пакет", "checks packet"]],
];

export const SOFTWARE_NAMES_EN: Record<string, string> = Object.fromEntries([
  TITLE, ...SHEETS.map(([, ru, en]) => [ru, en]), ...NODES.map(([, , name]) => name),
]);

export function makeSoftwareDemo(locale: "ru" | "en" = "ru"): Graph {
  const pick = (text: Text) => text[locale === "en" ? 1 : 0];
  const description = pick([
    "Полностью синтетический учебный проект: асинхронный экспорт отчёта. Без реальных людей, компаний, ведомств, адресов и рабочих данных. Диаграммы и тесты описывают предполагаемый сервис; сборка документов показана как концепция.",
    "A wholly synthetic teaching project: asynchronous report export. No real people, companies, authorities, addresses or production data. Diagrams and tests describe a proposed service; document assembly is shown as a concept.",
  ]);
  const options = (c: Choices) => [...(locale === "en" ? c[1] : c[0])];
  const attributes: AttributeDefinition[] = [
    { id: "status", label: "Состояние", labelEn: "Status", description: pick(["Как далеко продвинулась карточка. Учебные значения.", "How far the card has got. Teaching values."]), dataType: "select", options: options(STATUS) },
    { id: "areas", label: "Области", labelEn: "Areas", description: pick(["Каких частей примера касается карточка; вариантов может быть несколько.", "Which parts of the example the card touches; several options are allowed."]), dataType: "multi", options: options(AREAS) },
    { id: "days", label: "Оценка, дней", labelEn: "Estimate, days", description: pick(["Условная оценка, придумана для примера.", "A made-up estimate for the example."]), dataType: "number" },
    { id: "due", label: "Контрольная дата", labelEn: "Checkpoint", description: pick(["Учебная дата: ни к каким реальным срокам не привязана.", "A teaching date: not tied to any real deadline."]), dataType: "date" },
  ];
  const rows = new Map(ATTRS.map((row) => [row[0], row]));
  const valuesFor = (id: string): Record<string, AttributeValue> | undefined => {
    const row = rows.get(id);
    if (!row) return undefined;
    const [, status, areas, days, due] = row;
    return {
      status: status < 0 ? null : options(STATUS)[status],
      areas: [...areas].map((i) => options(AREAS)[+i]),
      ...(days ? { days } : {}), ...(due ? { due } : {}),
    };
  };
  const totals = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const [, , , sheets] of NODES) for (const id of sheets) totals.set(id, (totals.get(id) ?? 0) + 1);
  const nodes: GNode[] = NODES.map(([id, kind, name, sheets, body]) => {
    const values = valuesFor(id);
    return {
      id, kind, name: pick(name), sheets: [...sheets], body: pick(body), tags: ["synthetic", "software-example"],
      pos: Object.fromEntries(sheets.map((sheet) => {
        const index = counters.get(sheet) ?? 0;
        counters.set(sheet, index + 1);
        return [sheet, gridLayout(totals.get(sheet)!, index, id + sheet)];
      })),
      ...(values ? { attributes: values } : {}),
    };
  });
  return {
    version: 3, title: pick(TITLE), description, types: { ...defaultTypes(), attributes },
    sheets: SHEETS.map(([id, ru, en, color]) => ({ id, name: locale === "en" ? en : ru, color, notation: "свободная", limit: 15, description })),
    nodes,
    edges: EDGES.map(([from, to, kind, label], index) => ({ id: `software-edge-${index + 1}`, from, to, kind, label: pick(label) })),
  };
}
