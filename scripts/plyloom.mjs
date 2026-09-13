import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [command, input, output, sheetId, keyArg] = process.argv.slice(2);
if (!input || !["inspect", "spread", "canvas", "diff"].includes(command) || (command !== "inspect" && !output) || (command === "spread" && (!sheetId || !keyArg))) {
  console.error("Usage: node scripts/plyloom.mjs inspect INPUT | spread INPUT OUTPUT SHEET_ID type|tag|attr:ID | canvas INPUT OUTPUT | diff BASE NEXT");
  process.exit(1);
}
mkdirSync(".qa", { recursive: true });
await build({ stdin: { contents: 'export * from "./src/lib/graph"; export * from "./src/lib/io";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", outfile: ".qa/cli.mjs" });
const lib = await import(pathToFileURL(resolve(".qa/cli.mjs")).href);
const read = (path) => {
  const result = lib.loadGraph(JSON.parse(readFileSync(path, "utf8")));
  if (!result.graph) throw new Error(result.errors.join("\n"));
  return result.graph;
};
try {
  const graph = read(input);
  let result;
  if (command === "inspect") {
    result = { nodes: graph.nodes.length, edges: graph.edges.length, sheets: graph.sheets.length,
      memberships: graph.nodes.reduce((s, n) => s + n.sheets.length, 0), lint: lib.lint(graph, lib.buildIndex(graph)) };
  } else if (command === "spread") {
    const key = keyArg.startsWith("attr:") ? { by: "attribute", id: keyArg.slice(5) } : keyArg === "tag" ? { by: "tag" } : { by: "type" };
    result = lib.spreadSheet(graph, sheetId, key);
  }
  else if (command === "canvas") result = lib.toCanvas(graph);
  else {
    const next = read(output);
    const oldNodes = new Map(graph.nodes.map((n) => [n.id, n])), newNodes = new Map(next.nodes.map((n) => [n.id, n]));
    const oldEdges = new Map(graph.edges.map((e) => [e.id, e])), newEdges = new Map(next.edges.map((e) => [e.id, e]));
    const changedNodes = [...new Set([...oldNodes.keys(), ...newNodes.keys()])].filter((id) => JSON.stringify(oldNodes.get(id)) !== JSON.stringify(newNodes.get(id))).sort();
    const changedEdges = [...new Set([...oldEdges.keys(), ...newEdges.keys()])].filter((id) => JSON.stringify(oldEdges.get(id)) !== JSON.stringify(newEdges.get(id))).sort();
    const touched = new Set(changedNodes);
    for (const id of changedEdges) for (const edge of [oldEdges.get(id), newEdges.get(id)]) if (edge) { touched.add(edge.from); touched.add(edge.to); }
    const affectedSheets = new Set();
    for (const id of touched) for (const node of [oldNodes.get(id), newNodes.get(id)]) node?.sheets.forEach((s) => affectedSheets.add(s));
    const oldSheets = new Map(graph.sheets.map((s) => [s.id, s])), newSheets = new Map(next.sheets.map((s) => [s.id, s]));
    for (const id of new Set([...oldSheets.keys(), ...newSheets.keys()])) if (JSON.stringify(oldSheets.get(id)) !== JSON.stringify(newSheets.get(id))) affectedSheets.add(id);
    result = { changedNodes, changedEdges, affectedSheets: [...affectedSheets].sort(), meaning: "Structural diff; affected does not imply incorrect." };
  }
  const text = JSON.stringify(result, null, 2) + "\n";
  if (command === "spread" || command === "canvas") writeFileSync(output, text);
  else process.stdout.write(text);
} catch (error) { console.error(error.message); process.exitCode = 1; }
