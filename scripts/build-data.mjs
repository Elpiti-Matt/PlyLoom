import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
mkdirSync(".qa", { recursive: true }); mkdirSync("data", { recursive: true });
await build({ stdin: { contents: 'export * from "./src/data/roastery"; export * from "./src/data/software"; export * from "./src/data/crossNotation"; export * from "./src/lib/graph"; export * from "./src/lib/io"; export * from "./src/lib/notation";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", outfile: ".qa/data.mjs" });
const lib = await import(pathToFileURL(resolve(".qa/data.mjs")).href);
const write=(path,data)=>writeFileSync(path,JSON.stringify(data,null,2)+"\n");
const graphs={roastery:lib.makeRoastery(),"software-ru":lib.makeSoftwareDemo("ru"),"software-en":lib.makeSoftwareDemo("en"),"cross-notation-ru":lib.makeCrossNotation("ru"),"cross-notation-en":lib.makeCrossNotation("en")};
const metrics={};
for(const [name,g] of Object.entries(graphs)){
  write(`data/${name}.json`,g);
  const idx=lib.buildIndex(g),tree=lib.flatten(g);
  metrics[name]={nodes:g.nodes.length,edges:g.edges.length,sheets:g.sheets.length,
    memberships:g.nodes.reduce((sum,n)=>sum+n.sheets.length,0),multiMemberNodes:g.nodes.filter((n)=>n.sheets.length>1).length,
    droppedByTree:tree.droppedMemberships,
    nodesPerSheet:Object.fromEntries(g.sheets.map((s)=>[s.id,idx.bySheet.get(s.id).length])),
    lint:lib.lint(g,idx).reduce((counts,it)=>({...counts,[it.level]:counts[it.level]+1}),{error:0,warn:0,info:0})};
}
// Retain the old download path with the new synthetic content.
write("data/depot.json",graphs["software-ru"]);
const g=graphs.roastery;
write("data/roastery.canvas",lib.toCanvas(g));
write("data/broken.json",{...g,edges:[...g.edges,{id:"intentionally-broken",from:"blend",to:"missing-node",kind:"ref"}]});
const quote=(s)=>'"'+String(s??"").replaceAll('"','""')+'"';
writeFileSync("data/nodes.csv","id,name,kind,sheets,body\r\n"+g.nodes.map((n)=>[n.id,n.name,n.kind,n.sheets.join("|"),n.body].map(quote).join(",")).join("\r\n")+"\r\n");
writeFileSync("data/edges.csv","id,from,to,kind,label\r\n"+g.edges.map((e)=>[e.id,e.from,e.to,e.kind,e.label].map(quote).join(",")).join("\r\n")+"\r\n");
write("docs/metrics.json",metrics);
console.log(JSON.stringify(metrics,null,2));
