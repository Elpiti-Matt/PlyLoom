# Репозиторий, демо и релизы PlyLoom

Актуально для **0.8.0**, 13 сентября 2026 года. Репозиторий — [Elpiti-Matt/PlyLoom](https://github.com/Elpiti-Matt/PlyLoom), основная ветка — `main`.

| Часть | Источник и действие |
| --- | --- |
| Исходники | Содержимое `PlyLoom/` из архива в корень рабочей копии, ветка и PR в main |
| Проверка | **Checks**: npm ci, npm test, npm run build; по push, PR и вручную |
| Веб-демо | **Publish demo to GitHub Pages**: ручной запуск на main, сборка и публикация dist |
| Автономный файл | `demo/index.html`, создаётся той же сборкой, что и `dist/index.html`; SHA256 — рядом |
| Скачиваемый релиз | Необязательный prerelease `v0.8.0`, HTML прикрепляется отдельно |
| Документация | README, FEATURES с SVG/GIF, FORMAT, QA-MANUAL, PERFORMANCE |

## Pages

После объединения обновления откройте **Actions → Publish demo to GitHub Pages → Run workflow**, выберите **main**, запустите и дождитесь зелёного результата. `pages.yml` не публикует по push. Если Pages требует настройки, проверьте **Settings → Pages → Source → GitHub Actions**; действующие настройки не нужно пересоздавать без причины. [Официальный порядок](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

После публикации проверьте фактический сайт и сценарии [QA-MANUAL](QA-MANUAL.md). Локальные тесты и сборка не подтверждают успешную публикацию.

## Состав и настройки

Архив не содержит `.git`, `node_modules`, `dist` и временные файлы проверок. История и настройки аккаунта остаются в существующем репозитории. Закрытые правила веток, права, секреты и административные параметры Pages не проверены. `REPOSITORY.json` задаёт локальные ссылки. Состояние внешнего репозитория в этой поставке не проверялось.

`python scripts/configure_repo.py Elpiti-Matt --repo PlyLoom` обновляет локальные ссылки и ничего не публикует. `scripts/github_stats.py Elpiti-Matt/PlyLoom` читает скачивания release assets; бейдж считает файлы релизов, а не пользователей. Эти скрипты не входят в автономный HTML.

## Лицензия и материалы

`LICENSE` и package.json указывают MIT. Сторонние notices включены в HTML и `THIRD_PARTY_NOTICES.txt`. [LICENSING](LICENSING.ru.md) и DEPENDENCY-LICENSES.json — датированные результаты предыдущего аудита. Черновики статей отсутствуют в репозитории; рабочие материалы поставки хранятся отдельно.

Из этой рабочей копии не выполнялись commit, push, PR, release или публикация сайта.


## Однозначный источник демо

`npm run build` создаёт `dist/index.html`, копирует те же байты в `demo/index.html` и обновляет `demo/SHA256SUMS`. Коммитите исходники и оба demo-файла вместе после `npm test`, сборки и `npm run test:release -- --static`. Не подменяйте демо проверочным HTML с кнопкой тестовых данных. `test:release` проверяет равенство dist/demo и SHA256.

Checks сохраняет автономный файл как артефакт. Опциональный ввод `browser` при ручном запуске включает Playwright, проверку настоящего HTML на 1440/390 px и perf-bench; переменная репозитория `PLYLOOM_BROWSER_CHECKS=true` включает эту задачу также по push/PR. Ошибки команд не скрываются, логи и снимки сохраняются отдельным артефактом. Pages публикуется отдельно и вручную; успешная локальная сборка не означает публикацию.
