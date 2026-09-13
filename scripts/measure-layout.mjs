// Reproducible geometry check, not a browser benchmark or usability study.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
mkdirSync(".qa",{recursive:true});
await build({stdin:{contents:`export {makeRoastery} from './src/data/roastery'; export {buildIndex,forceLayout} from './src/lib/graph'; export {responsivePositions} from './src/lib/spreadGraph'; export {viewLayoutRequest} from './src/lib/layoutViews'; export {optimizeLayout} from './src/lib/optimizeLayout';`,resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",outfile:".qa/layout-support.mjs"});
const {makeRoastery,buildIndex,forceLayout,responsivePositions,viewLayoutRequest,optimizeLayout}=await import(pathToFileURL(resolve(".qa/layout-support.mjs")));
const graph=makeRoastery(),idx=buildIndex(graph),sizes=new Map(),sid=graph.sheets[0].id;
const snapshots={
  sheet:{external:true,panes:[{sid,width:900,height:500,positions:new Map(idx.bySheet.get(sid).map(n=>[n.id,n.pos[sid]]))}]},
  spread:{external:true,panes:graph.sheets.slice(0,6).map((s,i)=>({sid:s.id,width:600,height:400,frame:{x:i%3*600,y:Math.floor(i/3)*400,w:600,h:400},positions:responsivePositions(idx.bySheet.get(s.id),sizes,600,400)}))},
  flat:{flat:true,external:false,panes:[{sid:"__flat",width:1000,height:600,positions:forceLayout(graph)}]},
};
const report={dataset:"roastery",nodes:graph.nodes.length,edges:graph.edges.length,card:{width:208,height:64},method:"Eight straight segments per rendered cubic; fitted spread geometry. Fixed collapsed-card sizes, not browser measurements. Counts are drawing estimates, not human task results.",cases:{}};
for(const [name,snapshot] of Object.entries(snapshots)){
  const result=optimizeLayout(viewLayoutRequest(graph,sizes,snapshot));
  report.cases[name]={before:result.before,after:result.after,candidates:result.evaluated};
}
writeFileSync("docs/LAYOUT-METRICS.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
