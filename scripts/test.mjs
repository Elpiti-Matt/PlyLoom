import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync(".qa", { recursive: true });
await build({ entryPoints: ["tests/entry.ts"], bundle: true, packages: "external", platform: "node", format: "esm", outfile: ".qa/support.mjs", plugins:[{name:"worker-fallback",setup(b){b.onResolve({filter:/\?worker&inline$/},()=>({path:"worker",namespace:"fallback"}));b.onLoad({filter:/.*/,namespace:"fallback"},()=>({contents:"export default class { constructor(){ throw new Error(\"Unit test fallback\"); } }",loader:"js"}));}}] });
await build({entryPoints:["src/lib/background.worker.ts"],bundle:true,platform:"browser",format:"iife",outfile:".qa/background.js"});
const result = spawnSync(process.execPath, ["--test", "tests/core.test.mjs", "tests/formats.test.mjs", "tests/ui.test.mjs", "tests/storage.test.mjs", "tests/background.test.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
