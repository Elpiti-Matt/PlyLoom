import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FILTER, activeConditions, attributeError, attributeText, compileNodeFilter, filterFacets, matchNode, readAttributes, visibleEdges, visibleNodes, typesFor } from "../.qa/support.mjs";
import { makeRoastery, makeDemo, makeSoftwareDemo, loadGraph, buildIndex, flatten, stubsForSheet, edgesBetweenSheets, lint, parseCSV, csvGraph, toCanvas, spreadSheet, safeSrc, notationLoss, forceLayout, sheetTypeId, emptyProject, overviewPositions, moveOverviewSheet, moveOverviewNode, fitOverview, serializeProject } from "../.qa/support.mjs";

test("all demo datasets and languages retain every node, edge and membership", () => {
  for (const g of [makeRoastery(), makeDemo(), makeSoftwareDemo("en")]) {
    const result = loadGraph(JSON.parse(JSON.stringify(g)));
    assert.equal(result.errors.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(result.graph)), JSON.parse(JSON.stringify({...g,sheets:g.sheets.map(s=>({...s,typeId:sheetTypeId(s),tags:[]}))})));
  }
});
test("both built-in examples ship attributes to filter by, including a multiple choice and empty states", () => {
  for (const [g, count] of [[makeRoastery(), 2], [makeSoftwareDemo("en"), 4]]) {
    assert.equal(g.version, 3, "dictionaries need version 3");
    const defs = g.types.attributes;
    assert.equal(defs.length, count);
    assert.ok(defs.some(d => d.dataType === "multi" && d.options.length > 2), "one multiple choice with options");
    assert.ok(defs.some(d => d.dataType === "select"), "and one single choice");
    const values = g.nodes.map(n => n.attributes);
    assert.ok(values.some(v => v === undefined), "some cards carry no attributes at all");
    assert.ok(values.some(v => v && Object.values(v).some(x => x === null)), "and some a value left unset");
    for (const n of g.nodes) for (const [id, value] of Object.entries(n.attributes ?? {})) {
      const def = defs.find(d => d.id === id);
      assert.ok(def, `${n.id}: unknown attribute ${id}`);
      assert.equal(attributeError(def, value), null, `${n.id}.${id}`);
    }
  }
  const en = makeSoftwareDemo("en"), ru = makeSoftwareDemo("ru");
  const options = (g) => g.types.attributes.find(d => d.dataType === "multi").options;
  assert.notDeepEqual(options(en), options(ru), "choices are authored in both languages");
  assert.ok(en.nodes.every(n => !n.attributes?.areas || n.attributes.areas.every(v => options(en).includes(v))), "and the values follow the language");
});
test("legacy and generic graphs receive deterministic coordinates and edge IDs", () => {
  const raw = { nodes: [{id:"a", name:"A"}, {id:"b", name:"B"}], edges: [{from:"a",to:"b"}] };
  const a = loadGraph(raw), b = loadGraph(raw);
  assert.deepEqual(a,b); assert.notDeepEqual(a.graph.nodes[0].pos, a.graph.nodes[1].pos);
  assert.equal(raw.sheets, undefined);
  assert.ok(loadGraph(flatten(makeRoastery()).graph).graph);
});
test("invalid data is rejected atomically: duplicates, dangling ends, memberships, types, versions", () => {
  const mutations = [
    (g) => g.nodes.push(g.nodes[0]), (g) => g.edges.push({from:"blend", to:"missing"}),
    (g) => g.nodes[0].sheets.push("missing"), (g) => g.nodes[0].kind="secret-new-type",
    (g) => g.edges[0].kind="unknown", (g) => g.version=99,
    (g) => g.edges.push({...g.edges[0]}), (g) => g.nodes[0].sheets.push(7),
    (g) => g.nodes[0].id="__proto__", (g) => g.nodes[0].body={table:[["a"], null]},
  ];
  for (const mutate of mutations) { const g = makeRoastery(); mutate(g); const r = loadGraph(g); assert.equal(r.graph,null); assert.ok(r.errors.length); }
});
test("empty maps and bodies over 8000 characters survive storage round trip", () => {
  const g = makeRoastery(); g.nodes[0].body = "x".repeat(16000);
  assert.equal(loadGraph(g).graph.nodes[0].body.length,16000);
  g.nodes=[];g.edges=[];assert.equal(loadGraph(g).graph.nodes.length,0);
});
test("tree export removes memberships and retains graph edges", () => {
  const g=makeRoastery(), r=flatten(g);
  assert.equal(r.droppedMemberships,g.nodes.reduce((s,n)=>s+n.sheets.length-1,0));
  assert.deepEqual(r.graph.edges,g.edges);assert.equal(g.nodes[0].sheets.length,3);
});
test("a shared third sheet must not hide the boundary edge between A and B", () => {
  const g=loadGraph({sheets:[{id:"a"},{id:"b"},{id:"c"}], nodes:[{id:"x",sheets:["a","c"]},{id:"y",sheets:["b","c"]}],edges:[{from:"x",to:"y"}]}).graph;
  const idx=buildIndex(g);assert.equal(edgesBetweenSheets(g,idx,"a","b").length,1);
  assert.equal(stubsForSheet(g,idx,"a",new Map()).length,1);
  assert.equal(stubsForSheet(g,idx,"c",new Map()).length,0);
});
test("sheet classification accepts all node and relation types and never mutates the canonical graph", () => {
  const g=makeRoastery(), before=JSON.stringify(g), sheet={...g.sheets.find((s)=>s.id==="roasting"),notation:"процесс"};
  const loss=notationLoss(g,sheet);assert.equal(loss.nodes,0);assert.equal(loss.edges,0);
  assert.equal(JSON.stringify(g),before);
});
test("CSV supports BOM, escaped quotes, quoted commas and multiline bodies", () => {
  const rows=parseCSV('\uFEFFid,name,body\r\na,"Hello, ""coffee""","line1\nline2"\r\n');
  assert.deepEqual(rows,[{id:"a",name:'Hello, "coffee"',body:"line1\nline2"}]);
  assert.throws(()=>parseCSV('id,name\na,"broken'));
  const g=csvGraph([{name:"nodes.csv",text:"id,name,sheets\na,A,one|two\nb,B,two\n"},{name:"edges.csv",text:"from,to\na,b\n"}]);
  assert.equal(loadGraph(g).graph.nodes[0].sheets.length,2);
});
test("Canvas IDs are unique, all edge endpoints resolve, every canonical edge appears", () => {
  const g=makeRoastery(),c=toCanvas(g),ids=new Set(c.nodes.map((n)=>n.id));
  assert.equal(ids.size,c.nodes.length);
  for(const e of c.edges){assert.ok(ids.has(e.fromNode));assert.ok(ids.has(e.toNode));}
  for(const e of g.edges)assert.ok(c.edges.some((x)=>x.plyloomEdgeId===e.id));
  assert.equal(c.nodes.filter((n)=>n.plyloomNodeId==="blend").length,3);
  assert.ok(c.nodes.every((n)=>[n.x,n.y,n.width,n.height].every(Number.isFinite)));
});
test("laying a sheet out by a key is deterministic, ordered by the dictionary and keeps identities", () => {
  const g=makeDemo(),before=JSON.stringify(g),was=g.nodes.filter((n)=>n.sheets.includes("context"));
  const r=spreadSheet(g,"context",{by:"attribute",id:"status"});
  assert.equal(JSON.stringify(g),before);
  assert.deepEqual(r,spreadSheet(g,"context",{by:"attribute",id:"status"}));
  // One sheet per value present, in the order of the attribute options, unset last.
  assert.deepEqual(r.sheets.filter((s)=>s.id.startsWith("context-")).map((s)=>s.name),
    ["Контекст задачи · В работе","Контекст задачи · Готово","Контекст задачи · Без значения"]);
  assert.equal(r.sheets.length,g.sheets.length+2);
  assert.ok(!r.sheets.some((s)=>s.id==="context"));
  assert.deepEqual(r.nodes.map((n)=>n.id),g.nodes.map((n)=>n.id));
  assert.deepEqual(r.edges,g.edges);
  assert.deepEqual(loadGraph(r).errors,[]);
  // Every node keeps its coordinates and its memberships on other sheets.
  for(const n of was){
    const next=r.nodes.find((x)=>x.id===n.id);
    const made=next.sheets.filter((s)=>s.startsWith("context-"));
    assert.ok(made.length>=1);
    for(const s of made)assert.deepEqual(next.pos[s],n.pos.context);
    assert.deepEqual(next.sheets.filter((s)=>!s.startsWith("context-")),n.sheets.filter((s)=>s!=="context"));
  }
  // Nodes without the attribute go to the "no value" sheet, not nowhere.
  const blank=r.sheets.find((s)=>s.name.endsWith("Без значения")).id;
  assert.deepEqual(r.nodes.filter((n)=>n.sheets.includes(blank)).map((n)=>n.id).sort(),["role.analyst","role.developer","role.tester"]);
  // A sheet whose nodes all share one value has nothing left to lay out.
  assert.throws(()=>spreadSheet(r,blank,{by:"attribute",id:"status"}),/одно значение/);
  // A multiple-choice value puts one entity on several sheets — that is what memberships are for.
  const m=spreadSheet(g,"context",{by:"attribute",id:"areas"}),u=m.nodes.find((n)=>n.id==="usecase.export");
  const on=u.sheets.filter((s)=>s.startsWith("context-"));
  assert.equal(on.length,2);
  // Each of those memberships needs its own coordinates, or the node lands nowhere on the second sheet.
  for(const s of on)assert.deepEqual(u.pos[s],g.nodes.find((n)=>n.id==="usecase.export").pos.context);
  assert.deepEqual(loadGraph(m).errors,[]);
  // A select converges and a multi does not, on purpose: a node keeps carrying several values,
  // so a sheet made from one of them still mixes the others and can be laid out again.
  const mixed=m.sheets.find((s)=>s.name.endsWith("Интерфейс")).id;
  assert.ok(spreadSheet(m,mixed,{by:"attribute",id:"areas"}).sheets.length>m.sheets.length);
  // Option order, not alphabet: "Интерфейс" precedes "Документы" because the dictionary says so.
  assert.deepEqual(m.sheets.filter((s)=>s.id.startsWith("context-")).map((s)=>s.name.split(" · ")[1]),
    ["Интерфейс","Сервис","Документы","Проверки","Без значения"]);
  // Tags and node types work the same way; an unknown attribute and an empty sheet are refused.
  assert.equal(spreadSheet(g,"context",{by:"type"}).sheets.filter((s)=>s.id.startsWith("context-")).length,6);
  assert.throws(()=>spreadSheet(g,"context",{by:"attribute",id:"нет"}),/атрибута/);
  assert.throws(()=>spreadSheet(g,"нет",{by:"type"}),/не найден/);
});
test("sheet size is no longer a defect: checks flag what stands out in this project, not a fixed number", () => {
  const wide={title:"t",sheets:[{id:"a"},{id:"b"},{id:"c"}],
    nodes:[...Array.from({length:44},(_,i)=>({id:"x"+i,sheet:"a",name:"X"+i,body:"b"})),{id:"y",sheet:"b",name:"Y",body:"b"},{id:"z",sheet:"c",name:"Z",body:"b"}],
    edges:[{from:"y",to:"z"}]};
  const g=loadGraph(wide).graph,items=lint(g,buildIndex(g));
  assert.ok(!items.some((i)=>["sheet-overflow","sheet-near-limit"].includes(i.code)));
  // 44 nodes against a median of 1: worth a note, and only a note.
  const crowded=items.filter((i)=>i.code==="sheet-crowded");
  assert.equal(crowded.length,1);
  assert.equal(crowded[0].level,"info");
  assert.equal(crowded[0].sheetId,"a");
  // The same 44 nodes among sheets of the same size are unremarkable.
  const even={...wide,sheets:[{id:"a"},{id:"b"}],nodes:wide.nodes.slice(0,44).concat(Array.from({length:44},(_,i)=>({id:"w"+i,sheet:"b",name:"W"+i,body:"b"}))),edges:[]};
  const e=loadGraph(even).graph;
  assert.ok(!lint(e,buildIndex(e)).some((i)=>i.code==="sheet-crowded"));
  // The limit field is still read and written back, it just stops meaning anything.
  assert.equal(loadGraph({sheets:[{id:"a",limit:7}],nodes:[{id:"x",sheet:"a"}],edges:[]}).graph.sheets[0].limit,7);
});
test("image URLs cannot perform network requests", () => {
  for(const s of ["https://example.com/a.png","//example.com/a.png","\\\\example.com/a.png","/a.png","blob:abc","javascript:alert(1)","data:image/svg+xml;base64,PHN2Zz4="])assert.equal(safeSrc(s),null);
  assert.equal(safeSrc("data:image/png;base64,AAAA"),"data:image/png;base64,AAAA");
});
test("membership recommendations count unique neighbors, not parallel edges", () => {
  const g=loadGraph({sheets:[{id:"a"},{id:"b"}],nodes:[{id:"x",sheet:"a"},{id:"y",sheet:"b"}],edges:Array.from({length:4},()=>({from:"x",to:"y"}))}).graph;
  assert.ok(!lint(g,buildIndex(g)).some((x)=>x.code==="membership-candidate"));
});
test("large flat view uses bounded deterministic grid layout", () => {
  const g=makeRoastery();g.nodes=Array.from({length:301},(_,i)=>({...g.nodes[0],id:`n${i}`}));g.edges=[];
  const layout=forceLayout(g);assert.equal(layout.size,301);assert.deepEqual(layout,forceLayout(g));
});

test('spread hides only references with visible destinations and preserves every corresponding route',async()=>{
  const {sheetRoutes}=await import('../.qa/support.mjs');
  for(const graph of [makeRoastery(),makeDemo()]){
    const idx=buildIndex(graph),before=JSON.stringify(graph);
    for(const count of [1,2,3,5,6,graph.sheets.length]){
      const visible=graph.sheets.slice(0,count).map((s)=>s.id),routes=sheetRoutes(graph,idx,visible);
      for(const sid of visible){
        const base=stubsForSheet(graph,idx,sid,new Map()),shown=stubsForSheet(graph,idx,sid,new Map(),undefined,visible);
        for(const stub of base){
          const elsewhere=stub.node.sheets.some((s)=>s!==sid&&visible.includes(s));
          assert.equal(shown.some((s)=>s.node.id===stub.node.id),!elsewhere);
          if(elsewhere)for(const edge of stub.edges)assert.ok(routes.some((r)=>r.edge.id===edge.id&&(r.fromSheet===sid||r.toSheet===sid)),`lost ${edge.id} at ${sid}`);
        }
      }
      if(count===graph.sheets.length)for(const sid of visible)assert.equal(stubsForSheet(graph,idx,sid,new Map(),undefined,visible).length,0);
    }
    assert.equal(JSON.stringify(graph),before);
  }
});

test('a common third membership retains routes from both original appearances',async()=>{
  const {sheetRoutes}=await import('../.qa/support.mjs');
  const g=loadGraph({sheets:['a','b','c'].map(id=>({id,name:id})),nodes:[{id:'x',sheets:['a','c']},{id:'y',sheets:['b','c']}],edges:[{id:'xy',from:'x',to:'y'}]}).graph;
  const routes=sheetRoutes(g,buildIndex(g),['a','b','c']);
  assert.ok(routes.some(r=>r.fromSheet==='a'&&r.toSheet==='b'));assert.equal(new Set(routes.map(r=>r.key)).size,routes.length);
});

test('view reflow fills a wide sheet differently from a tall one without changing saved positions',async()=>{
  const {responsivePositions}=await import('../.qa/support.mjs');const nodes=makeRoastery().nodes.slice(0,8),before=JSON.stringify(nodes);
  const wide=responsivePositions(nodes,new Map(),1400,200),tall=responsivePositions(nodes,new Map(),300,1100);
  assert.ok(new Set([...wide.values()].map(p=>p.x)).size>new Set([...tall.values()].map(p=>p.x)).size);
  assert.equal(JSON.stringify(nodes),before);
  const sizes=new Map([[nodes[0].id,350]]),expanded=responsivePositions(nodes,sizes,600,500);
  const boxes=nodes.map(n=>({...expanded.get(n.id),w:208,h:sizes.get(n.id)||64}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
});

test('both AI v3 examples load with typed attributes, sheet classification and shared identities',async()=>{
  const {generationExample,generationPrompt}=await import('../.qa/support.mjs');
  for(const locale of ['ru','en']){const g=generationExample(locale);const r=loadGraph(JSON.parse(JSON.stringify(g)));assert.deepEqual(r.errors,[]);assert.equal(r.graph.version,3);assert.deepEqual(JSON.parse(JSON.stringify(r.graph.nodes)),g.nodes);assert.ok(!g.sheets.some(s=>'limit' in s),'the prompt no longer asks for a node limit');assert.ok(r.graph.sheets.every(s=>s.limit===15),'the loader still supplies the legacy default');assert.deepEqual(JSON.parse(JSON.stringify(r.graph.sheets)).map(({limit,...s})=>s),g.sheets);assert.equal(r.graph.types.attributes.length,7);assert.deepEqual(new Set(r.graph.types.attributes.map(d=>d.dataType)),new Set(['text','number','boolean','date','url','select','multi']));assert.ok(Array.isArray(r.graph.nodes[0].attributes.channels)&&r.graph.nodes[0].attributes.channels.length===2,'the example fills the multiple-choice attribute');assert.deepEqual(r.graph.nodes[1].attributes.channels,[],'and shows an empty list too');assert.equal(r.graph.nodes[0].attributes.unitCost,null);assert.equal(r.graph.nodes[0].attributes.confirmed,false);assert.equal(g.nodes.filter(n=>n.id==='blend').length,1);assert.equal(g.nodes[0].sheets.length,2);assert.ok(generationPrompt(locale).includes(JSON.stringify(g,null,2)));}
  const g=generationExample('en');g.sheets[0].notation='process';assert.equal(notationLoss(g,g.sheets[0]).nodes,0);
});

test('identity lines connect repeated appearances without manufacturing graph edges',async()=>{
 const {identityRoutes,makeCrossNotation}=await import('../.qa/support.mjs');
 for(const g of [makeRoastery(),makeCrossNotation('en')]){
  const before=JSON.stringify(g),visible=g.sheets.map(s=>s.id),routes=identityRoutes(g,visible);
  assert.equal(routes.length,g.nodes.reduce((sum,n)=>sum+Math.max(0,n.sheets.length-1),0));
  assert.equal(identityRoutes(g,[visible[0]]).length,0);
  for(const r of routes){assert.ok(r.node.sheets.includes(r.fromSheet));assert.ok(r.node.sheets.includes(r.toSheet));assert.notEqual(r.fromSheet,r.toSheet);}
  assert.equal(JSON.stringify(g),before);
 }
});

test('cross-notation examples retain distinct activity/service/state IDs and valid shared appearances',async()=>{
 const {makeCrossNotation}=await import('../.qa/support.mjs');
 for(const lang of ['ru','en']){
  const g=makeCrossNotation(lang),r=loadGraph(JSON.parse(JSON.stringify(g)));assert.deepEqual(r.errors,[]);assert.equal(g.nodes.length,13);assert.equal(g.sheets.length,6);
  const idx=buildIndex(g);assert.notEqual(idx.nodeById.get('activity.pay'),idx.nodeById.get('service.payment'));
  assert.deepEqual(idx.nodeById.get('class.payment').sheets,['classes','states']);assert.equal(g.nodes.filter(n=>n.id==='req.confirmed').length,1);
  assert.ok(g.edges.some(e=>e.from==='service.payment'&&e.to==='activity.pay'));assert.ok(g.edges.some(e=>e.from==='test.duplicate'&&e.to==='req.once'));
 }
});

// Layout checks use the same cubic control points as the SVG renderer.
const layoutAPI=await import('../.qa/support.mjs');
const {responsivePositions,identityRoutes,sheetRoutes}=layoutAPI;
const layoutBox=(id,x,y,h=64)=>({id,x,y,w:208,h,group:'one'});
const tangled=()=>({nodes:[layoutBox('a',0,0),layoutBox('b',500,240),layoutBox('c',0,240),layoutBox('d',500,0)],links:[{from:'a',to:'b'},{from:'c',to:'d'}],groups:[{id:'one',aspect:1.5}]});

test('layout detects a cubic X, a line through a card, and coincident line runs',()=>{
  const {measureLayout}=layoutAPI,req=tangled();
  assert.equal(measureLayout({boxes:req.nodes,links:req.links}).crossings,1);
  const boxes=[layoutBox('a',0,0),layoutBox('b',350,0),layoutBox('c',700,0)];
  assert.equal(measureLayout({boxes,links:[{from:'a',to:'c'}]}).nodeHits,1);
  const shared=measureLayout({boxes,links:[{from:'a',to:'c'},{from:'a',to:'c'}]});
  assert.equal(shared.sharedSegments,1);assert.equal(shared.crossings,0);
});

test('optimization reduces crossings, separates unequal cards, and is reproducible without mutation',()=>{
  const {optimizeLayout,compareLayout}=layoutAPI,req=tangled(),original=structuredClone(req);
  const a=optimizeLayout(req),b=optimizeLayout(req);
  assert.equal(a.before.crossings,1);assert.equal(a.after.crossings,0);
  assert.equal(a.after.nodeHits,0);assert.deepEqual(a.positions,b.positions);assert.deepEqual(req,original);
  const pile={...req,nodes:req.nodes.map((n,i)=>({...n,x:0,y:0,h:64+i*110}))};
  const result=optimizeLayout(pile);
  assert.equal(result.before.overlaps,6);assert.equal(result.after.overlaps,0);assert.ok(compareLayout(result.after,result.before)<0);
  assert.deepEqual([...result.positions.keys()].sort(),req.nodes.map(n=>n.id).sort());
  const reversed=optimizeLayout({...req,nodes:[...req.nodes].reverse(),links:[...req.links].reverse()});
  assert.deepEqual(reversed.positions,a.positions);
});

test('optimization handles empty, isolated and cyclic graphs with finite coordinates',()=>{
  const {optimizeLayout}=layoutAPI;
  for(const links of [[],[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'},{from:'a',to:'a'}]]){
    const req={nodes:[layoutBox('a',0,0),layoutBox('b',0,0),layoutBox('c',0,0)],links,groups:[{id:'one',aspect:.3}]};
    const r=optimizeLayout(req);assert.equal(r.after.overlaps,0);
    for(const p of r.positions.values())assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  }
  const empty=optimizeLayout({nodes:[],links:[],groups:[]});assert.equal(empty.changed,false);assert.equal(empty.after.overlaps,0);
});

test('spread scoring includes inter-sheet relations, shared identity and boundary references',()=>{
  const {viewLayoutRequest,appearanceId}=layoutAPI;
  const g=makeRoastery(),idx=buildIndex(g),sizes=new Map(),visible=g.sheets.slice(0,6);
  const snapshot={external:true,panes:visible.map((s,i)=>({sid:s.id,width:600,height:400,frame:{x:i%3*600,y:Math.floor(i/3)*400,w:600,h:400},positions:responsivePositions(idx.bySheet.get(s.id),sizes,600,400)}))};
  const req=viewLayoutRequest(g,sizes,snapshot),ids=new Set(req.nodes.map(n=>n.id));
  const first=identityRoutes(g,visible.map(s=>s.id))[0];assert.ok(first);
  assert.ok(req.links.some(e=>e.from===appearanceId(first.fromSheet,first.node.id)&&e.to===appearanceId(first.toSheet,first.node.id)));
  const cross=sheetRoutes(g,idx,visible.map(s=>s.id))[0];assert.ok(req.links.some(e=>e.from===appearanceId(cross.fromSheet,cross.edge.from)&&e.to===appearanceId(cross.toSheet,cross.edge.to)));
  const positions=new Map(req.nodes.map(n=>[n.id,{x:n.x,y:n.y}])),scene=req.scene(positions);
  assert.ok(scene.boxes.length>ids.size);assert.ok(scene.links.length>req.links.length);
  const hidden=viewLayoutRequest(g,sizes,{...snapshot,external:false});assert.equal(hidden.scene(positions).boxes.length,ids.size);
});

test('six-sheet optimization preserves all identities and unopened coordinates; native save retains layouts',()=>{
  const {viewLayoutRequest,optimizeLayout,applyViewLayout,compareLayout}=layoutAPI;
  const g=makeRoastery(),original=structuredClone(g),idx=buildIndex(g),sizes=new Map();
  const panes=g.sheets.slice(0,6).map((s,i)=>({sid:s.id,width:600,height:400,frame:{x:i%3*600,y:Math.floor(i/3)*400,w:600,h:400},positions:responsivePositions(idx.bySheet.get(s.id),sizes,600,400)}));
  const snapshot={panes,external:true},result=optimizeLayout(viewLayoutRequest(g,sizes,snapshot)),next=applyViewLayout(g,snapshot,result);
  assert.ok(result.changed);assert.ok(compareLayout(result.after,result.before)<0);assert.ok(result.after.nodeHits<result.before.nodeHits);
  assert.deepEqual(g,original);assert.deepEqual(next.edges,g.edges);
  assert.deepEqual(next.nodes.map(n=>[n.id,n.sheets,n.name,n.body]),g.nodes.map(n=>[n.id,n.sheets,n.name,n.body]));
  const closed=g.sheets[6].id;for(const n of next.nodes)assert.deepEqual(n.pos[closed],g.nodes.find(v=>v.id===n.id).pos[closed]);
  const loaded=loadGraph(JSON.parse(JSON.stringify(next)));assert.deepEqual(loaded.errors,[]);assert.ok(loaded.graph.sheets.slice(0,6).every(s=>s.layout==='manual'));
  assert.deepEqual(loaded.graph.nodes.map(n=>n.pos),next.nodes.map(n=>n.pos));
});

test('flat layout saves separately and rejects malformed or orphaned stored positions atomically',()=>{
  const {viewLayoutRequest,optimizeLayout,applyViewLayout}=layoutAPI;
  const g=makeRoastery(),snapshot={flat:true,external:false,panes:[{sid:'__flat',width:1000,height:600,positions:forceLayout(g)}]};
  const r=optimizeLayout(viewLayoutRequest(g,new Map(),snapshot)),next=applyViewLayout(g,snapshot,r);
  assert.equal(r.after.overlaps,0);assert.deepEqual(next.nodes,g.nodes);assert.deepEqual(next.sheets,g.sheets);
  assert.deepEqual({...loadGraph(JSON.parse(JSON.stringify(next))).graph.flatPositions},next.flatPositions);
  for(const flatPositions of [[],{missing:{x:0,y:0}},{blend:{x:Infinity,y:0}},{blend:{x:1e10,y:0}},{blend:{x:'0',y:0}}])assert.equal(loadGraph({...g,flatPositions}).graph,null);
  assert.equal(loadGraph({...g,sheets:g.sheets.map(s=>({...s,layout:'surprise'}))}).graph,null);
});

test('dense layouts keep every node and disclose their bounded edge sample',()=>{
  const {optimizeLayout,compareLayout}=layoutAPI;
  const nodes=Array.from({length:1000},(_,i)=>layoutBox('n'+i,(i%25)*240,Math.floor(i/25)*100));
  const links=Array.from({length:5000},(_,i)=>({from:'n'+(i%1000),to:'n'+((i*7+19)%1000)}));
  const result=optimizeLayout({nodes,links,groups:[{id:'one',aspect:1.6}]});
  assert.equal(result.positions.size,1000);assert.equal(result.after.sampled,true);assert.equal(result.after.checkedEdges,400);assert.equal(result.after.totalEdges,5000);
  assert.ok(result.evaluated<=18);assert.ok(compareLayout(result.after,result.before)<=0);
});

test('overview sheet layout persists independently from every node position and diagram route',()=>{
 const g=emptyProject();g.sheets.push({...g.sheets[0],id:'second'});g.nodes=[{id:'shared',kind:'entity',name:'Shared',body:'One entity',sheets:['main','second'],pos:{main:{x:25,y:45},second:{x:80,y:60}}}];
 const snapshot=structuredClone(g),positions=overviewPositions(g),moved=moveOverviewSheet(g,'main',{x:370,y:-90},positions);
 assert.deepEqual(g,snapshot);assert.deepEqual(moved.nodes,g.nodes);assert.deepEqual(moved.edges,g.edges);assert.deepEqual(moved.sheets[0].overviewPos,{x:370,y:-90});assert.deepEqual(moved.sheets[1].overviewPos,positions.get('second'));
 const r=loadGraph(JSON.parse(serializeProject(moved)));assert.deepEqual(r.errors,[]);assert.deepEqual(r.graph.sheets.map(s=>s.overviewPos),moved.sheets.map(s=>s.overviewPos));
 const added={...moved,sheets:[...moved.sheets,{...g.sheets[0],id:'new'}]},next=overviewPositions(added);assert.deepEqual(next.get('main'),{x:370,y:-90});assert.deepEqual(next.get('second'),positions.get('second'));assert.ok(next.has('new'));
});

test('overview node movement edits one appearance, retains identity and does not move any sheet',()=>{
 const g=emptyProject();g.sheets[0].overviewPos={x:500,y:800};g.sheets.push({...g.sheets[0],id:'other',overviewPos:{x:1300,y:0}});g.nodes=[{id:'shared',kind:'entity',name:'Shared',body:'Common',sheets:['main','other'],pos:{main:{x:10,y:20},other:{x:80,y:90}}}];
 const snapshot=structuredClone(g),next=moveOverviewNode(g,'shared','other',{x:140,y:160});assert.deepEqual(g,snapshot);assert.deepEqual(next.sheets,g.sheets);assert.deepEqual(next.nodes[0].pos.main,{x:10,y:20});assert.deepEqual(next.nodes[0].pos.other,{x:140,y:160});assert.deepEqual(next.nodes[0].sheets,['main','other']);assert.equal(next.nodes[0].body,'Common');assert.equal(moveOverviewNode(g,'shared','missing',{x:1,y:2}),g);
});

test('overview geometry rejects invalid coordinates and fits large or empty projects finitely',()=>{
 for(const pos of [{x:Infinity,y:0},{x:1,y:'2'},{x:1e9,y:0},null,[1,2]]){const g=emptyProject();g.sheets[0].overviewPos=pos;assert.equal(loadGraph(g).graph,null);}
 const g=emptyProject();g.sheets=Array.from({length:100},(_,i)=>({...g.sheets[0],id:`s${i}`}));const positions=overviewPositions(g),fit=fitOverview(positions,390,600);assert.equal(positions.size,100);assert.ok([fit.x,fit.y,fit.k].every(Number.isFinite));assert.ok(fit.k>0);assert.deepEqual(overviewPositions(g),positions);assert.ok(fitOverview(new Map(),390,600).k>0);
});


test('focused overview connects every shared appearance directly and excludes unrelated sheet routes',async()=>{
 const {overviewRoutes}=await import('../.qa/support.mjs');
 const g=loadGraph({sheets:['a','b','c'].map(id=>({id,name:id})),nodes:[
  {id:'shared',sheets:['a','b','c']},{id:'x',sheets:['a']},{id:'y',sheets:['b']},{id:'z',sheets:['c']}
 ],edges:[{id:'xy',from:'x',to:'y'},{id:'zx',from:'z',to:'x'},{id:'yz',from:'y',to:'z'}]}).graph;
 const before=JSON.stringify(g),idx=buildIndex(g),visible=['a','b','c'];
 const focused=overviewRoutes(g,idx,visible,'a');
 assert.deepEqual(new Set(focused.edges.map(r=>r.edge.id)),new Set(['xy','zx']));
 assert.ok(focused.edges.some(r=>r.edge.id==='zx'&&r.fromSheet==='c'&&r.toSheet==='a'),'incoming direction survives');
 assert.deepEqual(focused.identities.map(r=>[r.fromSheet,r.toSheet]),[['a','b'],['a','c']]);
 assert.deepEqual(overviewRoutes(g,idx,[...visible,'b'],'a'),focused);
 assert.deepEqual(overviewRoutes(g,idx,visible,'missing'),{edges:[],identities:[]});
 assert.equal(overviewRoutes(g,idx,visible).edges.length,3);
 assert.equal(JSON.stringify(g),before);
});

test('downloadable AI prompts and examples match the v3 contract used by the application',async()=>{
 const {readFileSync}=await import('node:fs');
 const {generationExample,generationPrompt}=await import('../.qa/support.mjs');
 for(const locale of ['ru','en']){
  assert.equal(readFileSync(`docs/AI-PROMPT.${locale}.txt`,'utf8'),generationPrompt(locale)+'\n');
  assert.deepEqual(JSON.parse(readFileSync(`data/ai-example-${locale}.json`,'utf8')),generationExample(locale));
 }
});

// ---------- S3a: multiple choice and the search line ----------
const multiGraph=()=>{
  const g=emptyProject("Interests","Главный");
  g.sheets=[{...g.sheets[0],id:"main",name:"Главный",tags:["draft"]},{...g.sheets[0],id:"war",name:"Война",tags:["review"]}];
  g.types.attributes=[{id:"interests",label:"Интересы",dataType:"multi",options:["рисование","музыка","спорт"]},{id:"house",label:"House",dataType:"select",options:["Rostov","Bezukhov"]}];
  const row=(id,name,body,attributes,tags,sheets=["main"])=>({id,name,body,kind:"person",sheets,pos:Object.fromEntries(sheets.map(s=>[s,{x:0,y:0}])),...(attributes?{attributes}:{}),...(tags?{tags}:{})});
  g.nodes=[
    row("anna","Анна","любит гулять",{interests:["рисование","музыка"],house:"Rostov"},["юность"]),
    row("boris","Борис","",{interests:["рисование","спорт"]}),
    row("vera","Вера","",{interests:["спорт"]},undefined,["war"]),
    row("gleb","Глеб","рисование в тексте",{interests:[]}),
    row("dina","Дина","",{}),
  ];
  g.edges=[];
  return g;
};
test("multiple choice: any of or all selected, an empty list counts as not set, facets count every option",()=>{
  const g=multiGraph(),r=typesFor(g),ids=(f)=>g.nodes.filter(n=>matchNode(n,r,{...EMPTY_FILTER,...f})).map(n=>n.id);
  assert.deepEqual(ids({attributes:{interests:{values:["рисование","спорт"]}}}),["anna","boris","vera"],"any of: one checked option is enough");
  assert.deepEqual(ids({attributes:{interests:{values:["рисование","спорт"],all:true}}}),["boris"],"all selected: the node needs every checked option");
  assert.deepEqual(ids({attributes:{interests:{values:["спорт"],all:true}}}),["boris","vera"],"one checked option: both modes agree");
  assert.deepEqual(ids({attributes:{interests:{values:["музыка"],all:true}}}),["anna"]);
  assert.deepEqual(ids({attributes:{interests:{unset:true}}}),["gleb"],"an empty list is not set");
  assert.deepEqual(ids({attributes:{interests:{missing:true}}}),["dina"],"missing is still not the same as empty");
  assert.deepEqual(ids({attributes:{interests:{values:["рисование"]},house:{values:["Rostov"]}}}),["anna"],"AND with another attribute");
  assert.equal(compileNodeFilter(r,{...EMPTY_FILTER,attributes:{interests:{values:[],all:true}}}),null,"nothing checked does not filter");
  const facet=filterFacets(g.nodes,g.edges,r).attributes.get("interests");
  assert.equal(facet.values.get("рисование"),2);assert.equal(facet.values.get("музыка"),1);assert.equal(facet.values.get("спорт"),2);
  assert.equal(facet.unset,1);assert.equal(facet.missing,1);
  const def=g.types.attributes[0];
  assert.equal(attributeError(def,["музыка"]),null);
  assert.equal(attributeError(def,[]),null,"an empty list is a valid value");
  assert.ok(attributeError(def,["кино"]),"options outside the dictionary are rejected");
  assert.ok(attributeError(def,["музыка","музыка"]),"repeated options are rejected");
  assert.ok(attributeError(def,"музыка"),"a plain string is not a list");
  assert.ok(attributeError(g.types.attributes[1],["Rostov"]),"a single-choice attribute does not take a list");
  assert.deepEqual(readAttributes({interests:["спорт","музыка"]},r),{interests:["спорт","музыка"]});
  assert.throws(()=>readAttributes({interests:["кино"]},r),/Интересы/);
  assert.equal(attributeText(["спорт","музыка"]),"спорт, музыка");assert.equal(attributeText([]),"—");
});
test("the search line looks in the name, body, tags, sheets and attribute values, and joins words with AND",()=>{
  const g=multiGraph(),r=typesFor(g);
  const ids=(search,rest)=>g.nodes.filter(n=>matchNode(n,r,{...EMPTY_FILTER,...rest,search},g.sheets)).map(n=>n.id);
  const all=["name","body","tags","sheet","attrs"];
  assert.deepEqual(ids({text:"анна",fields:["name"]}),["anna"],"the search is case-insensitive");
  assert.deepEqual(ids({text:"  ГУЛЯТЬ ",fields:["body"]}),["anna"],"the text is trimmed");
  assert.deepEqual(ids({text:"юность",fields:["tags"]}),["anna"]);
  assert.deepEqual(ids({text:"война",fields:["sheet"]}),["vera"],"a node is matched through the sheet it sits on");
  assert.deepEqual(ids({text:"на проверке",fields:["sheet"]}),["vera"],"sheet tags are matched by their name");
  assert.deepEqual(ids({text:"review",fields:["sheet"]}),["vera"],"and by their ID");
  assert.deepEqual(ids({text:"главный",fields:["sheet"]}),["anna","boris","gleb","dina"]);
  assert.deepEqual(ids({text:"рисование",fields:["attrs"]}),["anna","boris"],"attribute values are an area of their own");
  assert.deepEqual(ids({text:"рисование",fields:all}),["anna","boris","gleb"],"together with the body area");
  assert.deepEqual(ids({text:"рисование",fields:["name","body","tags","sheet"]}),["gleb"],"and only the body without it");
  // Several words: AND between the words, OR between the areas of one word.
  assert.deepEqual(ids({text:"анна гулять",fields:all}),["anna"],"one word by name, the other by body");
  assert.deepEqual(ids({text:"рисование главный",fields:all}),["anna","boris","gleb"],"one word by attribute, the other by sheet");
  assert.deepEqual(ids({text:"анна война",fields:all}),[],"a word that matches nothing removes the node");
  assert.deepEqual(ids({text:"  анна   анна ",fields:all}),["anna"],"repeated words and stray spaces change nothing");
  assert.deepEqual(ids({text:"б",fields:["name"]},{attributes:{interests:{values:["спорт"]}}}),["boris"],"the search and a condition apply together");
  assert.deepEqual(ids({text:"нет такого",fields:all}),[]);
  assert.equal(compileNodeFilter(r,{...EMPTY_FILTER,search:{text:"   ",fields:all}}),null,"an empty query does not filter");
  assert.equal(activeConditions(r,{...EMPTY_FILTER,search:{text:"две части",fields:all}}),1,"several words are still one condition");
  assert.equal(compileNodeFilter(r,{...EMPTY_FILTER,search:{text:"анна",fields:[]}}),null,"no area to search in does not filter");
  assert.equal(activeConditions(r,{...EMPTY_FILTER,search:{text:"анна",fields:["name"]},attributes:{interests:{values:["спорт"]}}}),2);
  assert.equal(activeConditions(r,{...EMPTY_FILTER,search:{text:"",fields:["name"]}}),0);
  const without=compileNodeFilter(r,{...EMPTY_FILTER,search:{text:"война",fields:["sheet"]}});
  assert.deepEqual(g.nodes.filter(without).map(n=>n.id),[],"without the sheet list the sheet area matches nothing");
});

// ---------- S3: node filter engine ----------
const filterGraph=()=>{
  const g=emptyProject("Filter","Main");
  g.types.attributes=[{id:"age",label:"Age",dataType:"number"},{id:"house",label:"House",dataType:"select",options:["Rostov","Bolkonsky","Bezukhov"]},{id:"alive",label:"Alive",dataType:"boolean"},{id:"born",label:"Born",dataType:"date"},{id:"note",label:"Note",dataType:"text"}];
  const row=(id,attributes,tags,kind="person")=>({id,name:id,body:"",kind,sheets:["main"],pos:{main:{x:0,y:0}},...(attributes?{attributes}:{}),...(tags?{tags}:{})});
  g.nodes=[row("natasha",{age:13,house:"Rostov",alive:true,born:"1792-08-26",note:"First Ball"},["main"]),row("nikolai",{age:20,house:"Rostov",alive:true,born:"1785-01-01",note:null}),row("andrei",{age:31,house:"Bolkonsky",alive:false,born:"1775-03-10"},["main"]),row("pierre",{age:20,house:"Bezukhov",alive:true,born:null,note:""},["main","mason"]),row("platon",undefined,undefined,"note"),row("marya",{age:null,house:null})];
  g.edges=[{id:"e1",from:"natasha",to:"andrei",kind:"depends"},{id:"e2",from:"pierre",to:"natasha",kind:"ref"},{id:"e3",from:"nikolai",to:"marya",kind:"ref"}];
  return g;
};
test("node filter: every data type, empty and missing values, AND between conditions, OR inside one", () => {
  const g=filterGraph(),r=typesFor(g),ids=(f)=>g.nodes.filter(n=>matchNode(n,r,{...EMPTY_FILTER,...f})).map(n=>n.id);
  assert.equal(compileNodeFilter(r,EMPTY_FILTER),null,"an empty filter lets everything through");
  assert.deepEqual(ids({attributes:{age:{min:"18"}}}),["nikolai","andrei","pierre"]);
  assert.deepEqual(ids({attributes:{age:{min:"18",max:"25"}}}),["nikolai","pierre"],"bounds are inclusive");
  assert.deepEqual(ids({attributes:{age:{max:"20",unset:true}}}),["natasha","nikolai","pierre","marya"]);
  assert.deepEqual(ids({attributes:{age:{missing:true}}}),["platon"],"missing is not the same as empty");
  assert.deepEqual(ids({attributes:{age:{unset:true,missing:true}}}),["platon","marya"]);
  assert.deepEqual(ids({attributes:{house:{values:["Rostov","Bezukhov"]}}}),["natasha","nikolai","pierre"]);
  assert.deepEqual(ids({attributes:{alive:{values:["false"]}}}),["andrei"]);
  assert.deepEqual(ids({attributes:{alive:{values:["true","false"]}}}),["natasha","nikolai","andrei","pierre"],"yes or no = any set value");
  assert.deepEqual(ids({attributes:{born:{min:"1780-01-01",max:"1790-12-31"}}}),["nikolai"]);
  assert.deepEqual(ids({attributes:{born:{unset:true}}}),["pierre"]);
  assert.deepEqual(ids({attributes:{note:{text:"  ball "}}}),["natasha"],"text: trimmed, case-insensitive contains");
  assert.deepEqual(ids({attributes:{note:{unset:true}}}),["nikolai","pierre"],"an empty string counts as not set");
  assert.deepEqual(ids({attributes:{house:{values:["Rostov"]},age:{min:"18"}}}),["nikolai"],"different attributes are AND");
  assert.deepEqual(ids({hiddenNodeTypes:["note"],attributes:{house:{values:["Rostov","Bolkonsky"]}}}),["natasha","nikolai","andrei"]);
  // Node tags live in the format but are not a filter condition; they must not affect matching.
  assert.deepEqual(ids({attributes:{age:{min:"18"}}}),["nikolai","andrei","pierre"]);
  assert.deepEqual(ids({hiddenNodeTypes:["person"]}),["platon"]);
  assert.deepEqual(ids({attributes:{age:{min:"30",max:"10"}}}),[],"an empty range matches nothing");
  // Inactive and unknown conditions never filter: nothing typed, invalid numbers, deleted attributes.
  assert.equal(compileNodeFilter(r,{...EMPTY_FILTER,attributes:{age:{min:"abc"},ghost:{text:"x"},note:{text:"   "},house:{values:[]}}}),null);
  assert.equal(activeConditions(r,{...EMPTY_FILTER,hiddenNodeTypes:["note"],attributes:{age:{min:"1"},note:{}}}),2);
  assert.equal(filterFacets(g.nodes,g.edges,r).tags,undefined,"node tags are not a filter facet");
});
test("visible sets: a relation needs a shown type and both ends; pinned objects stay visible", () => {
  const g=filterGraph(),r=typesFor(g),p=compileNodeFilter(r,{...EMPTY_FILTER,attributes:{house:{values:["Rostov"]}}});
  assert.equal(visibleNodes(g.nodes,null),null);assert.equal(visibleEdges(g.edges,null,new Set()),null);
  const nodes=visibleNodes(g.nodes,p);assert.deepEqual([...nodes],["natasha","nikolai"]);
  assert.equal(visibleEdges(g.edges,nodes,new Set()).size,0,"every relation has a hidden end");
  const pins={nodes:new Set(["andrei"]),edges:new Set()};
  assert.deepEqual([...visibleEdges(g.edges,visibleNodes(g.nodes,p,pins),new Set(),pins)],["e1"]);
  assert.deepEqual([...visibleEdges(g.edges,null,new Set(["ref"]))],["e1"]);
  assert.deepEqual([...visibleEdges(g.edges,null,new Set(["ref"]),{nodes:new Set(),edges:new Set(["e2"])})],["e1","e2"],"a pinned relation ignores its hidden type");
});
test("filter facets count types, values, empty and missing attributes", () => {
  const g=filterGraph(),f=filterFacets(g.nodes,g.edges,typesFor(g));
  assert.equal(f.nodeTypes.get("person"),5);assert.equal(f.nodeTypes.get("note"),1);assert.equal(f.edgeTypes.get("ref"),2);
  const house=f.attributes.get("house");assert.equal(house.values.get("Rostov"),2);assert.equal(house.unset,1);assert.equal(house.missing,1);
  assert.equal(f.attributes.get("note").unset,2);assert.equal(f.attributes.get("alive").values.get("false"),1);
});
test("the search scans 10 000 nodes with long bodies without copying their text", () => {
  const r=typesFor(multiGraph());
  const sheets=Array.from({length:20},(_,i)=>({id:"s"+i,name:"Лист "+i,notation:"plyloom",color:"#0ea5e9",tags:i%3?[]:["draft"]}));
  const body="Длинный текст карточки. ".repeat(40);
  const nodes=Array.from({length:10000},(_,i)=>({id:"n"+i,name:"Персонаж "+i,body:body+i,kind:"person",sheets:["s"+(i%20)],pos:{},attributes:{interests:i%2?["музыка"]:["рисование","спорт"]},...(i%5?{}:{tags:["эпилог"]})}));
  const all=["name","body","tags","sheet","attrs"];
  const cost=(text)=>{
    const f={...EMPTY_FILTER,search:{text,fields:all}};
    const start=performance.now();let shown=0;
    for(let run=0;run<3;run++)shown=visibleNodes(nodes,compileNodeFilter(r,f,sheets)).size;
    return {ms:(performance.now()-start)/3,shown};
  };
  const one=cost("777"),two=cost("777 карточки"),values=cost("рисование");
  const ms=one.ms,shown=one.shown;
  assert.ok(shown>0&&shown<nodes.length);
  assert.ok(two.shown>0&&two.shown<=shown,"the second word only narrows the result");
  assert.equal(values.shown,5000,"the attribute area matches half of the nodes");
  // Two words cost at most one extra pass over the same text, and attribute values are cheap.
  assert.ok(two.ms<300&&values.ms<300,`two words ${two.ms.toFixed(1)} ms, attribute values ${values.ms.toFixed(1)} ms`);
  console.log(`# two words: ${two.ms.toFixed(2)} ms per pass; attribute values: ${values.ms.toFixed(2)} ms per pass`);
  // Lowercasing every body instead would copy about 10 MB of text per pass and take several times longer.
  // The bound is loose on purpose: the sandbox spread is 16–54 ms for the same code. Compare the printed number.
  assert.ok(ms<300,`one pass took ${ms.toFixed(1)} ms`);
  console.log(`# search over 10000 nodes with 1 KB bodies: ${ms.toFixed(2)} ms per pass, ${shown} found`);
});
test("the filter checks 10 000 nodes in a few milliseconds without a worker", () => {
  const g=filterGraph(),r=typesFor(g);
  const nodes=Array.from({length:10000},(_,i)=>({id:"n"+i,name:"n"+i,body:"",kind:i%7?"person":"note",sheets:["main"],pos:{main:{x:0,y:0}},attributes:{age:i%90,house:["Rostov","Bolkonsky","Bezukhov"][i%3],note:"text "+i}}));
  const f={...EMPTY_FILTER,hiddenNodeTypes:["note"],attributes:{age:{min:"18",max:"40"},house:{values:["Rostov","Bezukhov"]},note:{text:"7"}}};
  const start=performance.now();let shown=0;for(let run=0;run<5;run++)shown=visibleNodes(nodes,compileNodeFilter(r,f)).size;
  const ms=(performance.now()-start)/5;
  assert.ok(shown>0&&shown<nodes.length);assert.ok(ms<100,`one pass took ${ms.toFixed(1)} ms`);
  console.log(`# filter over 10000 nodes: ${ms.toFixed(2)} ms per pass, ${shown} shown`);
});


test("large native projects preserve all objects and reserve missing edge IDs in one pass", () => {
  const g=emptyProject();
  g.sheets=Array.from({length:105},(_,i)=>({...g.sheets[0],id:'s'+i}));
  g.types.attributes=Array.from({length:205},(_,i)=>({id:'a'+i,label:'A'+i,dataType:'text'}));
  g.nodes=Array.from({length:10001},(_,i)=>({id:'n'+i,name:'N'+i,kind:'entity',body:'',sheets:['s'+(i%105)],pos:{['s'+(i%105)]:{x:i*4,y:0}}}));
  g.edges=Array.from({length:30000},(_,i)=>({from:'n'+(i%10001),to:'n'+((i+1)%10001)}));
  g.edges.push({id:'edge-0',from:'n1',to:'n2'},{id:'edge-0-',from:'n2',to:'n3'});
  const start=performance.now(),r=loadGraph(g);
  assert.deepEqual(r.errors,[]);assert.equal(r.graph.nodes.length,10001);assert.equal(r.graph.edges.length,30002);
  assert.equal(r.graph.edges[0].id,'edge-0--');assert.equal(new Set(r.graph.edges.map(e=>e.id)).size,30002);
  assert.equal(r.graph.types.attributes.length,205);assert.equal(g.edges[0].id,undefined);
  console.log(`# loadGraph 10001 nodes / 30002 edges: ${(performance.now()-start).toFixed(1)} ms`);
});

test("indexed sheet boundaries agree with the edge definition, including shared sheets and loops", () => {
  const g=makeRoastery(),idx=buildIndex(g);
  for(const s of g.sheets){
    const own=new Set(g.nodes.filter(n=>n.sheets.includes(s.id)).map(n=>n.id));
    assert.deepEqual(idx.boundaryBySheet.get(s.id),g.edges.filter(e=>own.has(e.from)!==own.has(e.to)));
    assert.deepEqual(idx.edgesBySheet.get(s.id),g.edges.filter(e=>own.has(e.from)&&own.has(e.to)));
  }
});

test("spatial layout overlap count agrees with exhaustive geometry for negative and oversized boxes", () => {
  const boxes=Array.from({length:220},(_,i)=>({id:'b'+i,x:(i*491%2300)-1200,y:(i*241%1700)-850,w:20+i%900,h:30+i%180}));
  boxes.push({id:'huge',x:-1e6,y:-1e6,w:2e6,h:2e6});
  let expected=0;for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];if(a.x<b.x+b.w-.1&&a.x+a.w>b.x+.1&&a.y<b.y+b.h-.1&&a.y+a.h>b.y+.1)expected++;
  }
  assert.equal(layoutAPI.measureLayout({boxes,links:[]}).overlaps,expected);
});

test("saved views validate filters and survive native serialization",async()=>{
  const {readNodeFilter}=await import('../.qa/support.mjs');
  const g=emptyProject(),filter={...EMPTY_FILTER,search:{text:'<script> [word]',fields:['name','attrs']},attributes:{age:{min:'0',missing:true}}};
  g.savedViews=[{id:'v1',name:'My view',filter,filterMode:'dim',mode:'spread',sheetId:'main',sheetIds:['main']}];
  const r=loadGraph(JSON.parse(serializeProject(g)));assert.deepEqual(r.errors,[]);
  assert.deepEqual(JSON.parse(JSON.stringify(r.graph.savedViews)),g.savedViews);
  for(const bad of [null,{}, {...filter,search:{text:'x',fields:['unknown']}},{...filter,attributes:JSON.parse('{"__proto__":{"missing":true}}')},{...filter,attributes:{age:{all:'yes'}}}])assert.throws(()=>readNodeFilter(bad));
  g.savedViews.push({...g.savedViews[0]});assert.equal(loadGraph(g).graph,null);
});

test("smart sheets recompute memberships, preserve homes and coordinates and never recurse",async()=>{
  const {resolveSmartSheets}=await import('../.qa/support.mjs');
  const g=emptyProject();g.nodes=[{id:'a',name:'Alpha',kind:'entity',body:'',sheets:['main'],pos:{main:{x:17,y:-4}}},{id:'b',name:'Beta',kind:'entity',body:'',sheets:['main'],pos:{main:{x:50,y:75}}}];
  g.sheets.push({id:'smart',name:'Alpha',notation:'plyloom',color:'#123456',smartFilter:{...EMPTY_FILTER,search:{text:'Alpha',fields:['name']}}});
  const snapshot=JSON.stringify(g),r=resolveSmartSheets(g);
  assert.equal(JSON.stringify(g),snapshot);assert.deepEqual(r.nodes[0].sheets,['main','smart']);assert.deepEqual(r.nodes[1].sheets,['main']);assert.deepEqual(r.nodes[0].pos.main,{x:17,y:-4});
  assert.equal(resolveSmartSheets(r),r);
  const updated=resolveSmartSheets({...r,nodes:r.nodes.map(n=>n.id==='b'?{...n,name:'Alpha two'}:n)});
  assert.deepEqual(updated.nodes[1].sheets,['main','smart']);assert.deepEqual(updated.nodes[0].pos.smart,r.nodes[0].pos.smart);
  const gone=resolveSmartSheets({...updated,nodes:updated.nodes.map(n=>({...n,name:'No match'}))});assert.ok(gone.nodes.every(n=>n.sheets.join()==='main'));
  const recursive=resolveSmartSheets({...r,sheets:r.sheets.map(s=>s.id==='smart'?{...s,smartFilter:{...EMPTY_FILTER,search:{text:'Alpha',fields:['sheet']}}}:s)});
  assert.ok(recursive.nodes.every(n=>!n.sheets.includes('smart')),'a smart sheet cannot match its own name');
  assert.deepEqual(loadGraph(JSON.parse(serializeProject(updated))).graph.nodes,updated.nodes.map(n=>({...n,tags:undefined})));
  assert.equal(loadGraph({...r,sheets:[r.sheets[1]]}).graph,null);
});
