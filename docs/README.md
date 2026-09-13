# Документация PlyLoom

Текущая версия: **0.8.0**, 13 сентября 2026 года. Репозиторий: [Elpiti-Matt/PlyLoom](https://github.com/Elpiti-Matt/PlyLoom).

| Задача | Документ |
| --- | --- |
| Узнать доступные возможности | [README RU](../README.ru.md), [README EN](../README.md) |
| Посмотреть картинки и инструкции по функциям | [FEATURES](FEATURES.ru.md): обзор листов, связи, атрибуты, фильтры и ИИ |
| Продолжить разработку | [FORMAT](FORMAT.md), [QA](QA-MANUAL.md), [история интерфейса 0.7](WORKSPACE-0.7.ru.md) |
| Формат проекта и импорт | [FORMAT](FORMAT.md) |
| Режимы и интерфейс | [REDESIGN](REDESIGN.ru.md), [LAYOUT](LAYOUT.ru.md) |
| Производительность отрисовки | [PERFORMANCE](PERFORMANCE.ru.md) |
| Как проверять | `npm test`, `npm run test:browser`, [ручная приёмка](QA-MANUAL.md), [замеры отрисовки](PERFORMANCE.ru.md) |
| Ручная приёмка | [QA-MANUAL](QA-MANUAL.md) |
| Pages и скачиваемые релизы | [PUBLISHING](PUBLISHING.ru.md) |
| Будущие возможности и ограничения | [EXTENSIONS](EXTENSIONS.ru.md), [CROSS-NOTATION](CROSS-NOTATION.ru.md) |

[AI-промпт RU](AI-PROMPT.ru.txt) / [EN](AI-PROMPT.en.txt) и [пример RU](../data/ai-example-ru.json) / [EN](../data/ai-example-en.json) используют **v3**: словари, один тип и теги листов, атрибуты всех семи типов и общий узел. Они генерируются из встроенной справки командой `npm run ai:docs`; тест проверяет совпадение. Старые учебные JSON v2 продолжают открываться как совместимые входные файлы.

SVG и GIF — оригинальные учебные иллюстрации, не снимки браузера. [Исходники и пересборка картинок](images/README.md). Автономный HTML содержит свои встроенные иллюстрации и не обращается к картинкам в репозитории по сети.

`LICENSING.ru.md` и `DEPENDENCY-LICENSES.json` содержат датированный аудит 6 сентября; `LAYOUT-METRICS.json` и `metrics.json` — результаты соответствующих скриптов на учебных данных, не UX-исследование. CHANGELOG сохраняет историю. Черновики статей в комплект репозитория не входят.

Изменения 0.8.0: IndexedDB, сохранённые виды, умные листы, крупные сцены и фоновые задачи — в FEATURES и FORMAT. Актуальные ограничения проверки — в QA-MANUAL. REDESIGN и WORKSPACE-0.7 сохраняют историю решения интерфейса 0.7.1.
