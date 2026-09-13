import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

for (const dir of [".qa", "data", "docs"]) mkdirSync(dir, { recursive: true });
await build({
  stdin: { contents: 'export * from "./src/lib/generation"; export {loadGraph} from "./src/lib/graph";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", outfile: ".qa/ai.mjs",
});
const { generationExample, generationPrompt, loadGraph } = await import(pathToFileURL(resolve(".qa/ai.mjs")).href);
const files = ["ru", "en"].flatMap(locale => {
  const graph = generationExample(locale), result = loadGraph(graph);
  if (result.errors.length || !result.graph) throw new Error(`Invalid ${locale} AI example: ${result.errors.join("; ")}`);
  return [
    [`data/ai-example-${locale}.json`, JSON.stringify(graph, null, 2) + "\n"],
    [`docs/AI-PROMPT.${locale}.txt`, generationPrompt(locale) + "\n"],
  ];
});
for (const [path, text] of files) writeFileSync(path, text);
console.log("Updated both AI v3 prompts and examples from the application source.");
