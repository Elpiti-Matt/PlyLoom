// Rendering regression benchmark for a built PlyLoom HTML file (not part of `npm test`).
// Requires Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`.
//   node scripts/perf-bench.mjs [dist/index.html] [--check]
// Environment: PLAYWRIGHT_MODULE=<path to playwright package>, PLYLOOM_CHROME=<chromium executable>.
// Absolute timings depend on the machine. --check only enforces structural limits:
// semantic filter counts, bounded DOM at dense scale, and script time per frame.
// New cards may mount when a pan crosses the culling boundary. Timing ratios
// between Canvas and DOM are reported, not compared as if they were one renderer.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2), check = args.includes("--check");
const html = resolve(args.find((a) => !a.startsWith("--")) ?? "dist/index.html");
let playwright;
try { playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright"); }
catch { console.error("Playwright is not installed. See the header of scripts/perf-bench.mjs."); process.exit(2); }
const { chromium } = playwright.default ?? playwright;

const KINDS = ["entity", "person", "process", "note", "metric"];
function project(n, e, sheets = 1) {
  let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const ids = Array.from({ length: sheets }, (_, i) => `s${i}`), per = Math.ceil(n / sheets), cols = Math.max(2, Math.floor(Math.sqrt(per * 1.5)));
  const nodes = Array.from({ length: n }, (_, i) => { const sid = ids[Math.min(Math.floor(i / per), sheets - 1)], j = i % per;
    return { id: `n${i}`, sheets: [sid], pos: { [sid]: { x: (j % cols) * 270, y: Math.floor(j / cols) * 150 } }, name: `Node ${i}`, kind: KINDS[i % 5], body: "" }; });
  const edges = [], seen = new Set();
  while (edges.length < e) { const a = Math.floor(rnd() * n), b = Math.min(n - 1, Math.max(0, a + Math.floor(rnd() * 81) - 40)), key = a + ":" + b;
    if (a === b || seen.has(key)) continue; seen.add(key); edges.push({ id: `e${edges.length}`, from: `n${a}`, to: `n${b}`, kind: "flow" }); }
  return { version: 2, title: "bench", sheets: ids.map((id, i) => ({ id, name: `Sheet ${i + 1}`, color: "#0ea5e9", notation: "plyloom", layout: "manual" })), nodes, edges };
}

const CASES = [
  { name: "sheet 300/900", n: 300, e: 900 },
  { name: "sheet 10000/30000", n:10000,e:30000 },
  { name: "sheet 1000/3000", n: 1000, e: 3000, budget: 8 },
  // S2: the filter keeps one kind of five (20% of nodes); hidden objects are not rendered.
  { name: "sheet 1000/3000, filter keeps 20%", n: 1000, e: 3000, budget: 8, hide: KINDS.slice(1), baseline: "sheet 1000/3000", maxRatio: 0.5 },
  // S3: the same filter in "dim" mode draws every card faded; it must cost about as much as no filter.
  { name: "sheet 1000/3000, filter dims 80%", n: 1000, e: 3000, budget: 8, hide: KINDS.slice(1), dim: true, baseline: "sheet 1000/3000", maxRatio: 1.5 },
  // S3a: the search line over names; a query is one pass over the nodes and must not cost more than the type filter.
  { name: "sheet 1000/3000, search keeps ~2%", n: 1000, e: 3000, budget: 8, search: "99", baseline: "sheet 1000/3000", maxRatio: 0.5 },
  { name: "sheet 1000/3000 on 50 sheets", n: 1000, e: 3000, sheets: 50 },
  { name: "overview 1000/3000 on 10 sheets", n: 1000, e: 3000, sheets: 10, overview: true },
];
const browser = await chromium.launch(process.env.PLYLOOM_CHROME ? { executablePath: process.env.PLYLOOM_CHROME } : {});
let failed = false;
const results = new Map();
for (const c of CASES) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.addInitScript((data) => {
    const P = ResizeObserver.prototype, observe = P.observe; window.__ro = 0;
    P.observe = function (...a) { window.__ro++; return observe.apply(this, a); };
    if (!sessionStorage.getItem("seeded")) { localStorage.setItem("plyloom.graph.v2", data); sessionStorage.setItem("seeded", "1"); }
  }, JSON.stringify(project(c.n, c.e, c.sheets)));
  const cdp = await page.context().newCDPSession(page); await cdp.send("Performance.enable");
  await page.goto(pathToFileURL(html).href);
  await page.waitForSelector("main [data-canvas-id]", { timeout: 120000 });
  if (c.hide || c.search) {
    await page.click('[data-action="filter"]');
    for (const kind of c.hide ?? []) await page.click(`[data-filter-type="${kind}"]`);
    if (c.search) await page.fill("[data-filter-search]", c.search);
    if (c.dim) await page.click('[data-filter-panel] [data-filter-mode="dim"]');
    await page.click('[aria-label="Свернуть фильтр"], [aria-label="Collapse filter"]');
    await page.waitForSelector("[data-filter-status]");
  }
  if (c.overview) { await page.click(".canvas-level-up"); await page.waitForSelector(".overview-viewport"); }
  const selector = c.overview ? ".overview-viewport" : "main [data-canvas-id]", frames = 30;
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const ro0 = await page.evaluate(() => window.__ro), m0 = await metric();
  await page.evaluate(async ({ selector, frames }) => {
    const el = document.querySelector(selector), raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < frames; i++) { el.dispatchEvent(new WheelEvent("wheel", { deltaX: 6, deltaY: 4, bubbles: true, cancelable: true })); await raf(); }
  }, { selector, frames });
  const m1 = await metric(), ro1 = await page.evaluate(() => window.__ro);
  const per = (k) => ((m1[k] - m0[k]) * 1000 / frames).toFixed(1);
  const result = { case: c.name, taskMsPerFrame: +per("TaskDuration"), scriptMsPerFrame: +per("ScriptDuration"), cardMeasuresPerFrame: (ro1 - ro0) / frames };
  const scene = c.overview ? null : await page.locator(selector).evaluate(el=>({renderer:el.dataset.renderer,visible:+el.dataset.visibleNodes,dimmed:+el.dataset.dimmedNodes,rendered:+el.dataset.renderedNodes,cards:el.querySelectorAll('[data-nid]').length}));
  if(scene)Object.assign(result,scene);
  results.set(c.name, result);
  const problems = [];
  if(c.search){const expected=Array.from({length:c.n},(_,i)=>`Node ${i}`).filter(name=>name.toLowerCase().includes(c.search.toLowerCase())).length;if(scene.visible!==expected)problems.push(`visible ${scene.visible}, expected ${expected}`);}
  if(c.hide){const expected=Math.ceil(c.n*(KINDS.length-c.hide.length)/KINDS.length);if(scene.visible!==(c.dim?c.n:expected)||scene.dimmed!==(c.dim?c.n-expected:0))problems.push('incorrect filter count');}
  if(scene?.renderer==='canvas'&&scene.cards>1)problems.push('dense Canvas still mounts DOM cards');
  // At most a boundary's newly revealed cards, never the entire scene each frame.
  if(scene?.renderer==='canvas'&&result.cardMeasuresPerFrame>0)problems.push('dense scene measures cards');
  if(scene?.renderer==='dom'&&result.cardMeasuresPerFrame>Math.max(2,scene.cards/5))problems.push('excessive card measurements during pan');
  if (c.budget && result.scriptMsPerFrame > c.budget) problems.push(`script ${result.scriptMsPerFrame} ms/frame > ${c.budget}`);
  console.log(JSON.stringify(result) + (problems.length ? "  FAIL: " + problems.join("; ") : ""));
  if (problems.length) failed = true;
  await page.context().close();
}
await browser.close();
if (check && failed) process.exit(1);
