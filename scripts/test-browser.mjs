// Runs the DOM test files (formats, ui) in real Chromium instead of jsdom. Not part of `npm test`.
// Requires Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`.
//   npm run test:browser                       all browser-capable files
//   npm run test:browser -- ui.test.mjs        one file
//   npm run test:browser -- --grep overview    tests whose name contains the text
// Environment: PLAYWRIGHT_MODULE=<path to playwright package>, PLYLOOM_CHROME=<chromium executable>.
// The test files are used unchanged; only node:test, node:assert/strict, jsdom and node:zlib are
// replaced by tests/browser/*. core.test.mjs reads files with node:fs and stays in `npm test`.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), out = resolve(root, ".qa/browser");
const args = process.argv.slice(2), grepAt = args.indexOf("--grep"), grep = grepAt >= 0 ? args[grepAt + 1] : "";
const files = args.filter((a, i) => a.endsWith(".test.mjs") && (grepAt < 0 || i !== grepAt + 1));
const NODE_ONLY = new Set(["core.test.mjs", "background.test.mjs"]); // reads repository files through node:fs
for (const f of files.filter((f) => NODE_ONLY.has(f))) console.log(`# ${f}: Node-only, runs in npm test; skipped`);
const selected = files.length ? files.filter((f) => !NODE_ONLY.has(f)) : ["formats.test.mjs", "ui.test.mjs", "storage.test.mjs"];
if (!selected.length) process.exit(0);

let playwright;
try { playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright"); }
catch { console.error("Playwright is not installed. See the header of scripts/test-browser.mjs."); process.exit(2); }
const { chromium } = playwright.default ?? playwright;

const shim = { "node:test": "node-test.js", "node:assert/strict": "assert.js", jsdom: "jsdom.js", "node:zlib": "zlib.js" };
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PLYLOOM_CHROME ? { executablePath: process.env.PLYLOOM_CHROME } : {});
let total = 0, failed = 0;
for (const file of selected) {
  const js = resolve(out, file.replace(/\.mjs$/, ".js")), html = js.replace(/\.js$/, ".html");
  await build({
    entryPoints: [resolve(root, "tests", file)], bundle: true, format: "iife", platform: "browser", outfile: js,
    jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error",
    plugins: [{ name: "node-to-browser", setup(b) {
      b.onResolve({filter:/\?worker&inline$/},()=>({path:"worker",namespace:"fallback"}));
      b.onLoad({filter:/.*/,namespace:"fallback"},()=>({contents:"export default class { constructor(){throw new Error(\"Unit test fallback\");}}",loader:"js"}));
      b.onResolve({ filter: /^(node:test|node:assert\/strict|jsdom|node:zlib)$/ }, (a) => ({ path: resolve(root, "tests/browser", shim[a.path]) }));
      b.onResolve({ filter: /\.qa\/support\.mjs$/ }, () => ({ path: resolve(root, "tests/entry.ts") }));
    } }],
  });
  // A classic script: Chromium refuses module scripts from file:// URLs.
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="${pathToFileURL(js).href}"></script></body></html>`);
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on("pageerror", (e) => console.log(`  page error: ${String(e.message ?? e).slice(0, 300)}`));
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => globalThis.__plyloomTests?.length > 0);
  console.log(`# ${file}`);
  const results = await page.evaluate(async (grep) => {
    const out = [];
    for (const t of globalThis.__plyloomTests) {
      if (grep && !t.name.includes(grep)) continue;
      const start = performance.now();
      try {
        await Promise.race([t.fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout after 60 s")), 60000))]);
        out.push({ name: t.name, ok: true, ms: Math.round(performance.now() - start) });
      } catch (e) { out.push({ name: t.name, ok: false, error: String(e?.message ?? e) }); }
    }
    return out;
  }, grep);
  for (const [i, r] of results.entries()) {
    console.log(`${r.ok ? "ok" : "not ok"} ${i + 1} - ${r.name}${r.ok ? ` (${r.ms} ms)` : ""}`);
    if (!r.ok) console.log(r.error.split("\n").map((l) => "    " + l).join("\n"));
  }
  total += results.length; failed += results.filter((r) => !r.ok).length;
  await page.close();
}
await browser.close();
console.log(`# tests ${total}\n# pass ${total - failed}\n# fail ${failed}`);
process.exit(failed ? 1 : 0);
