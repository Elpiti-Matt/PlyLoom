// No network or npm dependencies: exercise the actual generated bootstrap and
// publication files without sending synthetic visits to the owner's counter.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { COUNTER_ID, SITE_URL, createPagesHtml, preparePages } from './prepare-pages.mjs';

const offline = readFileSync('demo/index.html', 'utf8');
const pages = createPagesHtml(offline);
const script = pages.match(/<script id="plyloom-pages-metrika">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Pages contains the counter bootstrap');
assert.doesNotMatch(offline, /plyloom-pages-metrika|mc\.yandex\./, 'offline release has no analytics');
assert.match(pages, /worker-src blob:/, 'production workers remain allowed');
assert.match(pages, /form-action 'none'/, 'form submission stays blocked');
const offlineMeta = offline.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
const restored = pages.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, offlineMeta)
  .replace(/<script id="plyloom-pages-metrika">[\s\S]*?<\/script>\n/, '');
assert.equal(restored, offline, 'application, styles, assets and notices stay byte-identical');
assert.throws(() => createPagesHtml(pages), /offline release/);
assert.throws(() => createPagesHtml(offline.replace("connect-src 'none'", 'connect-src https:')), /Offline CSP changed/);
console.log('PASS: Pages changes only CSP and analytics; offline application bytes preserved');

function run(url, referrer = '', rejectScript = false) {
  const tags = [], window = {};
  const context = {
    window, location: new URL(url), URL,
    document: {
      referrer,
      get title() { throw new Error('Do not read the project title'); },
      createElement(name) { assert.equal(name, 'script'); return {}; },
      head: { appendChild(tag) { if (rejectScript) throw new Error('Script blocked'); tags.push(tag); } },
    },
  };
  // Graph storage must not be read to prepare a page-view event.
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('Do not read graph storage'); } });
  runInNewContext(script, context, { timeout: 1000 });
  const calls = JSON.parse(JSON.stringify((window.ym?.a ?? []).map(args => Array.from(args))));
  return { tags, calls, context };
}
for (const url of [SITE_URL, SITE_URL + 'index.html', SITE_URL + '?search=private#private-note']) {
  const result = run(url, 'https://example.org/private/document?token=secret#part');
  assert.equal(result.tags.length, 1);
  assert.equal(result.tags[0].src, 'https://mc.yandex.ru/metrika/tag.js');
  assert.equal(result.tags[0].async, true);
  assert.equal(result.tags[0].referrerPolicy, 'no-referrer');
  assert.deepEqual(result.calls, [
    [COUNTER_ID, 'init', {
      defer: true, webvisor: false, clickmap: false, trackLinks: false,
      trackHash: false, accurateTrackBounce: false, childIframe: false,
      ecommerce: false, sendTitle: false, disableYtm: true,
    }],
    [COUNTER_ID, 'hit', SITE_URL, { title: 'PlyLoom', referer: 'https://example.org/' }],
  ], 'one page view; no project title, search text or referrer path is passed');
  runInNewContext(script, result.context, { timeout: 1000 });
  assert.equal(result.tags.length, 1, 'repeated execution cannot double-count');
  assert.equal(result.context.window.ym.a.length, 2);
}
for (const url of [
  'file:///downloads/plyloom.html', 'http://localhost:4173/PlyLoom/',
  'http://elpiti-matt.github.io/PlyLoom/', 'https://someone.github.io/PlyLoom/',
  'https://elpiti-matt.github.io/AnotherProject/',
  'https://elpiti-matt.github.io/PlyLoomExtra/',
  'https://elpiti-matt.github.io/PlyLoom/preview.html',
]) {
  const result = run(url);
  assert.deepEqual(result.tags, [], `no remote script at ${url}`);
  assert.deepEqual(result.calls, [], `no counter calls at ${url}`);
}
assert.equal(run(SITE_URL).calls[1][3].referer, '', 'direct visits are supported');
assert.equal(run(SITE_URL, 'file:///private/document').calls[1][3].referer, '');
assert.equal(run(SITE_URL, 'not a URL').calls[1][3].referer, '');
assert.doesNotThrow(() => run(SITE_URL, '', true), 'blocking analytics does not stop the app');
console.log('PASS: correct counter, one page view, recording disabled, URL restrictions and failure isolation');

mkdirSync('.qa', { recursive: true });
const temp = mkdtempSync(resolve('.qa/pages-test-'));
try {
  mkdirSync(resolve(temp, 'demo'));
  mkdirSync(resolve(temp, 'dist'));
  const checksum = createHash('sha256').update(offline).digest('hex') + '  index.html\n';
  writeFileSync(resolve(temp, 'demo/index.html'), offline);
  writeFileSync(resolve(temp, 'dist/index.html'), offline);
  writeFileSync(resolve(temp, 'demo/SHA256SUMS'), checksum);
  assert.equal(preparePages(temp), pages);
  assert.equal(preparePages(temp), pages, 'repeated preparation is deterministic');
  assert.equal(readFileSync(resolve(temp, 'dist/pages/index.html'), 'utf8'), pages);
  assert.equal(readFileSync(resolve(temp, 'dist/index.html'), 'utf8'), offline);
  assert.equal(readFileSync(resolve(temp, 'demo/index.html'), 'utf8'), offline);
  assert.equal(readFileSync(resolve(temp, 'demo/SHA256SUMS'), 'utf8'), checksum);
  writeFileSync(resolve(temp, 'demo/SHA256SUMS'), 'incorrect');
  assert.throws(() => preparePages(temp), /checksum mismatch/);
  writeFileSync(resolve(temp, 'dist/index.html'), 'stale build');
  assert.throws(() => preparePages(temp), /dist and demo differ/);
} finally { rmSync(temp, { recursive: true, force: true }); }
console.log('PASS: only dist/pages is generated; offline checksum and files unchanged; stale builds rejected');
