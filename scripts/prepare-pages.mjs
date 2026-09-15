// Derive the hosted page from the verified offline release. Never edit demo/.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const COUNTER_ID = 112587397;
export const SITE_URL = 'https://elpiti-matt.github.io/PlyLoom/';
const MARKER = 'plyloom-pages-metrika';
// Regional collection endpoints from Yandex's CSP documentation. Session
// recording, frames and WebSocket transports are not enabled for this counter.
const collectors = [
  'ru', 'az', 'by', 'co.il', 'com', 'com.am', 'com.ge', 'com.tr', 'ee',
  'fr', 'kg', 'kz', 'lt', 'lv', 'md', 'tj', 'tm', 'uz',
].map(suffix => `https://mc.yandex.${suffix}`);

function startMetrika(counterId, siteUrl) {
  try {
    const site = new URL(siteUrl);
    // Also excludes forks, previews, localhost and a saved copy opened as file:.
    if (location.origin !== site.origin ||
        ![site.pathname, site.pathname + 'index.html'].includes(location.pathname)) return;
    if (window.__plyloomPagesMetrikaStarted) return;
    window.__plyloomPagesMetrikaStarted = true;

    window.ym = window.ym || function () {
      (window.ym.a = window.ym.a || []).push(arguments);
    };
    window.ym.l = Date.now();
    window.ym(counterId, 'init', {
      defer: true,
      webvisor: false,
      clickmap: false,
      trackLinks: false,
      trackHash: false,
      accurateTrackBounce: false,
      childIframe: false,
      ecommerce: false,
      sendTitle: false,
      disableYtm: true,
    });
    let referer = '';
    try {
      const from = new URL(document.referrer);
      if (['https:', 'http:'].includes(from.protocol)) referer = from.origin + '/';
    } catch { /* Direct visit, or an unavailable referrer. */ }
    // One explicit page view, with a fixed URL/title and only the source origin.
    // No graph data, search text, URL query, hash or custom events are passed.
    window.ym(counterId, 'hit', siteUrl, { title: 'PlyLoom', referer });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://mc.yandex.ru/metrika/tag.js';
    tag.referrerPolicy = 'no-referrer';
    document.head.appendChild(tag);
  } catch { /* Optional analytics must not prevent the application from opening. */ }
}

export function createPagesHtml(offlineHtml) {
  if (offlineHtml.includes(`id="${MARKER}"`)) throw new Error('Expected an offline release, not a Pages build');
  const matches = [...offlineHtml.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)];
  if (matches.length !== 1) throw new Error('Expected exactly one release CSP');
  const [meta, policy] = matches[0];
  const directives = new Map(policy.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, ...values] = s.split(/\s+/);
    return [name, values.join(' ')];
  }));
  for (const [name, expected] of Object.entries({
    'default-src': "'none'", 'script-src': "'unsafe-inline'",
    'img-src': 'data:', 'connect-src': "'none'", 'worker-src': 'blob:',
  })) {
    if (directives.get(name) !== expected) throw new Error(`Offline CSP changed: review ${name} before publishing`);
  }
  directives.set('script-src', "'unsafe-inline' " + collectors.join(' ') + ' https://yastatic.net');
  directives.set('img-src', 'data: ' + collectors.join(' ') + ' https://yastatic.net');
  directives.set('connect-src', collectors.join(' ') + ' https://yastatic.net');
  const pagesPolicy = [...directives].map(([name, value]) => `${name} ${value}`).join('; ');
  const boot = `(${startMetrika.toString()})(${COUNTER_ID}, ${JSON.stringify(SITE_URL)});`;
  if (offlineHtml.split('</head>').length !== 2) throw new Error('Expected exactly one closing head tag');
  return offlineHtml
    .replace(meta, `<meta http-equiv="Content-Security-Policy" content="${pagesPolicy}">`)
    .replace('</head>', `<script id="${MARKER}">${boot}</script>\n</head>`);
}

export function preparePages(root = process.cwd()) {
  const offline = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  if (readFileSync(resolve(root, 'dist/index.html'), 'utf8') !== offline) {
    throw new Error('dist and demo differ; run npm run build first');
  }
  const checksum = readFileSync(resolve(root, 'demo/SHA256SUMS'), 'utf8');
  const expected = createHash('sha256').update(offline).digest('hex') + '  index.html\n';
  if (checksum !== expected) throw new Error('Offline checksum mismatch; run npm run build first');
  const pages = createPagesHtml(offline);
  const directory = resolve(root, 'dist/pages');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'index.html'), pages);
  console.log(`Pages: dist/pages/index.html; Metrika ${COUNTER_ID}; offline release unchanged`);
  return pages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) preparePages();
