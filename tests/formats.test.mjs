import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { emptyProject,defaultTypes,serializeProject,loadGraph,parseDrawio,appendDrawio,exportDrawio,readTypes,makeSoftwareDemo,allowsNode,allowsEdge,sheetTypeId,parseCanvas,parseBpmn,readAttributes,routedPath,groupStackSheets,spreadSheet } from "../.qa/support.mjs";

const xmlWindow=new JSDOM().window;
globalThis.DOMParser=xmlWindow.DOMParser;
const model=`<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="Requirement" vertex="1" parent="1"><mxGeometry x="10" y="20" as="geometry"/></mxCell>
<mxCell id="b" value="Component" vertex="1" parent="1"><mxGeometry x="300" y="50" as="geometry"/></mxCell>
<mxCell id="e" value="implements" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`;
const twoPages=`<mxfile><diagram name="Requirements">${model}</diagram><diagram name="Architecture">${model}</diagram></mxfile>`;

test(".plyloom preserves custom types, memberships and positions; legacy visual profiles migrate to unrestricted dictionaries",()=>{
  const g=makeSoftwareDemo();assert.equal(g.version,3);assert.equal(g.types.attributes.length,4);
  g.types.nodes.push({id:"team:artifact",label:"Артефакт",labelEn:"Artifact",base:"rule",glyph:"A",color:"#123456",description:"A versioned document"});
  g.types.edges.push({id:"team:realizes",label:"Реализует",directed:false,color:"#654321",dash:"6 4"});
  g.types.sheets.push({id:"team:spec",label:"Спецификация",color:"#123456",nodes:["team:artifact"],edges:["team:realizes"]});
  g.nodes[0].kind="team:artifact";g.edges[0].kind="team:realizes";g.sheets[0].notation="team:spec";
  const before=JSON.stringify(g),r=loadGraph(JSON.parse(serializeProject(g)));
  assert.deepEqual(r.errors,[]);assert.equal(r.graph.version,3);assert.equal(r.graph.nodes[0].kind,"team:artifact");
  assert.deepEqual(r.graph.nodes,g.nodes);assert.deepEqual(r.graph.edges,g.edges);assert.deepEqual(r.graph.sheets,g.sheets.map(s=>({...s,typeId:sheetTypeId(s,g.types),tags:[]})));
  assert.equal(r.graph.types.nodes.at(-1).base,"rule");assert.equal(r.graph.types.edges.at(-1).directed,undefined);assert.equal(r.graph.types.edges.at(-1).dash,undefined);assert.equal(r.graph.types.nodes.at(-1).glyph,undefined);assert.equal(r.graph.types.sheets.at(-1).nodes,undefined);
  assert.equal(allowsNode(r.graph.sheets[0],r.graph.nodes[0],r.graph.types),true);
  assert.equal(allowsNode(r.graph.sheets[0],{...r.graph.nodes[0],kind:"entity"},r.graph.types),true);
  assert.equal(allowsEdge(r.graph.sheets[0],"team:realizes",r.graph.types),true);
  assert.equal(JSON.stringify(g),before);
});

test("empty projects have one valid sheet, no example data and portable dictionaries",()=>{
  const g=emptyProject("Мой проект","Требования");assert.equal(g.nodes.length,0);assert.equal(g.edges.length,0);assert.equal(g.sheets.length,1);
  assert.equal(loadGraph(JSON.parse(serializeProject(g))).graph.title,"Мой проект");
});

test("malformed custom dictionaries and dangling type references reject the whole project",()=>{
  for(const change of [g=>g.types.nodes.push({...g.types.nodes[0]}),g=>g.types.nodes[0].color="url(https://bad)",g=>g.types.nodes[0].id="__proto__",g=>g.types.nodes[0].id='x)"',g=>g.types.nodes[0].base="code",g=>g.types.attributes=[{id:"attr",label:"A",dataType:"unknown"}],g=>g.sheets[0].tags=["missing"],g=>g.sheets[0].typeId="missing",g=>delete g.types]){
    const g=emptyProject();change(g);assert.equal(loadGraph(g).graph,null);
  }
  assert.throws(()=>readTypes({nodes:[],edges:[],sheets:[],attributes:[{id:"x",label:"x",dataType:"select",options:["same","same"]}]}));
});

test("draw.io pages append as new sheets with isolated IDs and unchanged existing content",async()=>{
  const imported=await parseDrawio(twoPages,"design.drawio");assert.equal(imported.graph.sheets.length,2);assert.equal(imported.graph.nodes.length,4);assert.equal(imported.graph.edges.length,2);
  assert.equal(new Set(imported.graph.nodes.map(n=>n.id)).size,4);
  const target=makeSoftwareDemo(),before=JSON.stringify(target),merged=appendDrawio(target,[imported,imported]);
  assert.equal(JSON.stringify(target),before);assert.equal(merged.sheets.length,12);assert.equal(merged.nodes.length,48);assert.equal(merged.edges.length,79);
  assert.deepEqual(merged.nodes.slice(0,40),target.nodes);assert.deepEqual(merged.edges.slice(0,75),target.edges);
  assert.equal(new Set(merged.nodes.map(n=>n.id)).size,48);assert.equal(merged.types.nodes.length,defaultTypes().nodes.length,"identical base types must not duplicate");
});

test("compressed draw.io pages decode raw deflate, Unicode and multiple pages",async()=>{
  const encoded=deflateRawSync(encodeURIComponent(model.replace("Requirement","Требование ✓"))).toString("base64");
  const r=await parseDrawio(`<mxfile><diagram name="Compressed">${encoded}</diagram><diagram name="Plain">${model}</diagram></mxfile>`);
  assert.equal(r.graph.sheets.length,2);assert.equal(r.graph.nodes[0].name,"Требование ✓");assert.equal(r.graph.edges.length,2);
});

test("draw.io export remains XML and reimports shared nodes and cross-sheet relations without duplicates",async()=>{
  const g=makeSoftwareDemo(),out=exportDrawio(g),r=await parseDrawio(out);
  assert.ok(out.startsWith('<?xml version="1.0"'));assert.ok(out.includes('<mxfile'));
  assert.equal(r.graph.sheets.length,g.sheets.length);assert.equal(r.graph.nodes.length,g.nodes.length);assert.equal(r.graph.edges.length,g.edges.length);
  for(const node of g.nodes){const imported=r.graph.nodes.find(n=>n.id===`shared:${node.id}`);assert.ok(imported);assert.equal(imported.sheets.length,node.sheets.length);assert.equal(imported.body,node.body);assert.equal(imported.kind,node.kind);}
  assert.deepEqual(r.graph.sheets.map(s=>s.name),g.sheets.map(s=>s.name));
});

test("draw.io preserves plain angle-bracket labels and custom type definitions from PlyLoom exports",async()=>{
  const g=emptyProject();g.types.nodes.push({id:"team:api",label:"API",color:"#445566",base:"entity",glyph:"A"});
  g.nodes.push({id:"api",name:"Map<T> & value",body:"one\ntwo",kind:"team:api",sheets:["main"],pos:{main:{x:5,y:9}}});
  const r=await parseDrawio(exportDrawio(g));assert.equal(r.graph.nodes[0].name,"Map<T> & value");assert.equal(r.graph.nodes[0].kind,"team:api");assert.equal(r.graph.types.nodes.at(-1).id,"team:api");
});

test("draw.io labels are inert text; unsupported connectors are explicitly reported",async()=>{
  const source=model.replace('value="Requirement"','value="&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;Safe&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;"').replace('target="b"','target="missing"');
  const r=await parseDrawio(source);assert.equal(r.graph.nodes[0].name,"Safe");assert.equal(r.graph.edges.length,0);assert.ok(r.warnings.some(w=>w.includes("Пропущено соединителей")));
});

test("invalid XML, entities, cyclic parents, conflicting identities and decompression bombs fail safely",async()=>{
  const bad=["<mxfile>","<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><mxfile/>",model.replace('id="b"','id="a"'),model.replace('id="a" value="Requirement" vertex="1" parent="1"','id="a" value="Requirement" vertex="1" parent="b"').replace('id="b" value="Component" vertex="1" parent="1"','id="b" value="Component" vertex="1" parent="a"'),`<mxfile><diagram>${model.replace('vertex="1"','vertex="1" plyraNodeId="shared"')}</diagram><diagram>${model.replace('value="Requirement"','value="Different"').replace('vertex="1"','vertex="1" plyraNodeId="shared"')}</diagram></mxfile>`];
  for(const source of bad)await assert.rejects(()=>parseDrawio(source));
  const bomb=deflateRawSync('x'.repeat(10*1024*1024+1)).toString('base64');
  await assert.rejects(()=>parseDrawio(`<mxfile><diagram>${bomb}</diagram></mxfile>`,"bomb",10*1024*1024),/128 МиБ/);
});

test("import accepts more than 100 sheets, keeps the source and enforces a decoded byte budget",async()=>{
  await assert.rejects(()=>parseDrawio(twoPages,"test",100),/128 МиБ/);
  const target=emptyProject();target.sheets=Array.from({length:100},(_,i)=>({...target.sheets[0],id:`s${i}`}));
  const snapshot=JSON.stringify(target),r=await parseDrawio(model);assert.equal(appendDrawio(target,[r]).sheets.length,101);assert.equal(JSON.stringify(target),snapshot);
});

test('typed attributes, one sheet type and multiple tags survive native and draw.io round trips',async()=>{
 const g=emptyProject();g.sheets.push({...g.sheets[0],id:'second'});g.sheets[0].tags=['draft','review'];
 g.types.attributes=[{id:'owner',label:'Owner',dataType:'text'},{id:'cost',label:'Cost',dataType:'number'},{id:'approved',label:'Approved',dataType:'boolean'},{id:'due',label:'Due',dataType:'date'},{id:'url',label:'URL',dataType:'url'},{id:'state',label:'State',dataType:'select',options:['New','Done']}];
 const attributes={owner:'Ada',cost:0,approved:false,due:'2028-02-29',url:'https://example.com/spec',state:'New'};
 g.nodes=[{id:'a',name:'Shared',body:'Text',kind:'flowchart:decision',sheets:['main','second'],pos:{main:{x:-50,y:25},second:{x:80,y:20}},attributes,appearance:{main:{width:140,height:90,shape:'diamond',fill:'#ffffff',stroke:'#112233',fontColor:'#000000'}}}];
 const snapshot=JSON.stringify(g),r=loadGraph(JSON.parse(serializeProject(g)));assert.deepEqual(r.errors,[]);assert.deepEqual(JSON.parse(JSON.stringify(r.graph.nodes)),g.nodes);assert.deepEqual(JSON.parse(JSON.stringify(r.graph.sheets)),g.sheets);
 const drawio=await parseDrawio(exportDrawio(g));assert.equal(drawio.graph.nodes.length,1);assert.deepEqual(drawio.graph.nodes[0].attributes,attributes);assert.equal(drawio.graph.nodes[0].sheets.length,2);assert.deepEqual(drawio.graph.sheets[0].tags,['draft','review']);
 assert.equal(JSON.stringify(g),snapshot);
});

test('attributes reject wrong types, unsafe URLs, unknown definitions and invalid calendar dates atomically',()=>{
 const registry=defaultTypes();registry.attributes=[{id:'n',label:'N',dataType:'number'},{id:'b',label:'B',dataType:'boolean'},{id:'d',label:'D',dataType:'date'},{id:'u',label:'U',dataType:'url'},{id:'s',label:'S',dataType:'select',options:['Open','Closed']}];
 for(const raw of [{n:'1'},{n:Infinity},{b:'false'},{d:'2026-02-29'},{d:'2026-13-01'},{u:'javascript:alert(1)'},{s:'Missing'},{missing:'x'}])assert.throws(()=>readAttributes(raw,registry));
 assert.deepEqual(readAttributes({n:0,b:false,d:null,s:'Open'},registry),{n:0,b:false,d:null,s:'Open'});
 const g=emptyProject();g.types=registry;g.nodes=[{id:'n',name:'N',body:'',kind:'entity',sheets:['main'],pos:{main:{x:0,y:0}},attributes:{b:1}}];assert.equal(loadGraph(g).graph,null);
 g.nodes[0].attributes={b:false};g.sheets[0].notation='__proto__';assert.equal(loadGraph(g).graph.sheets[0].typeId,'свободная');
});

test('draw.io preserves nested geometry, basic shape styling and routed connectors',async()=>{
 const source='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="g" value="Group" style="group;" vertex="1" parent="1"><mxGeometry x="100" y="200" width="500" height="300" as="geometry"/></mxCell><mxCell id="a" value="Check" style="rhombus;fillColor=#ffeecc;strokeColor=#112233;fontSize=17;" vertex="1" parent="g"><mxGeometry x="20" y="30" width="110" height="70" as="geometry"/></mxCell><mxCell id="b" value="End" style="ellipse;" vertex="1" parent="1"><mxGeometry x="700" y="240" width="60" height="60" as="geometry"/></mxCell><mxCell id="e" edge="1" source="a" target="b" parent="1" style="dashed=1;endArrow=classic;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="400" y="260"/><mxPoint x="600" y="260"/></Array></mxGeometry></mxCell></root></mxGraphModel>';
 const r=await parseDrawio(source),sid=r.graph.sheets[0].id,n=r.graph.nodes.find(n=>n.name==='Check'),e=r.graph.edges[0];
 assert.deepEqual(n.pos[sid],{x:120,y:230});assert.equal(n.appearance[sid].width,110);assert.equal(n.appearance[sid].shape,'diamond');assert.equal(n.appearance[sid].fill,'#ffeecc');assert.equal(n.appearance[sid].fontSize,17);
 assert.deepEqual(e.routes[sid].points.slice(1,-1),[{x:400,y:260},{x:600,y:260}]);assert.equal(r.graph.sheets[0].layout,'manual');
 const a=e.routes[sid].from,b=e.routes[sid].to,path=routedPath(e,sid,{x:a.x,y:a.y,w:a.width,h:a.height},{x:b.x,y:b.y,w:b.width,h:b.height});assert.ok(path.d.includes('L400 260 L600 260'));
 const again=await parseDrawio(exportDrawio(r.graph));assert.deepEqual(again.graph.nodes.find(n=>n.name==='Check').appearance[again.graph.sheets[0].id],n.appearance[sid]);assert.deepEqual(again.graph.edges[0].routes[again.graph.sheets[0].id],e.routes[sid]);
});

test('Obsidian Canvas imports groups as frames and text/file/link nodes without fetching content',()=>{
 const source={nodes:[{id:'g',type:'group',label:'Area',x:-30,y:10,width:700,height:500},{id:'t',type:'text',text:'# Title\nBody',x:5,y:20,width:300,height:160,color:'2'},{id:'f',type:'file',file:'notes/example.md',x:350,y:20,width:240,height:180},{id:'l',type:'link',url:'https://example.com',x:5,y:250,width:300,height:150}],edges:[{id:'e',fromNode:'t',toNode:'f',fromSide:'bottom',toSide:'top',toEnd:'none',fromEnd:'arrow',label:'refers to'}]};
 const r=parseCanvas(JSON.stringify(source),'Research.canvas'),g=r.graph;assert.equal(g.sheets.length,1);assert.equal(g.nodes.length,4);assert.equal(g.nodes[0].kind,'canvas:group');assert.equal(g.nodes[0].appearance.canvas.width,700);assert.equal(g.nodes[1].body,'# Title\nBody');assert.deepEqual(g.nodes[1].pos.canvas,{x:5,y:20});assert.equal(g.edges[0].from,'f');assert.equal(g.edges[0].to,'t');assert.ok(r.warnings.some(w=>w.includes('не загружаются')));
 const before=JSON.stringify(source);assert.throws(()=>parseCanvas(JSON.stringify({...source,edges:[{...source.edges[0],toNode:'missing'}]})));assert.equal(JSON.stringify(source),before);
 assert.throws(()=>parseCanvas(JSON.stringify({nodes:[{...source.nodes[0],width:-1}]})));
});

const bpmnFixture=`<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"><bpmn:process id="process"><bpmn:startEvent id="start" name="Start"/><bpmn:userTask id="task" name="Review"/><bpmn:sequenceFlow id="flow" sourceRef="start" targetRef="task"/></bpmn:process><bpmndi:BPMNDiagram id="diagram"><bpmndi:BPMNPlane bpmnElement="process"><bpmndi:BPMNShape bpmnElement="start"><dc:Bounds x="100" y="80" width="36" height="36"/></bpmndi:BPMNShape><bpmndi:BPMNShape bpmnElement="task"><dc:Bounds x="220" y="60" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNEdge bpmnElement="flow"><di:waypoint x="136" y="98"/><di:waypoint x="220" y="98"/></bpmndi:BPMNEdge></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
test('BPMN DI imports standard node/edge types, coordinates and waypoints and rejects missing DI',()=>{
 const r=parseBpmn(bpmnFixture),g=r.graph,sid=g.sheets[0].id;assert.equal(g.nodes.length,2);assert.equal(g.nodes[0].kind,'bpmn:startEvent');assert.equal(g.nodes[0].appearance[sid].shape,'ellipse');assert.deepEqual(g.nodes[1].pos[sid],{x:220,y:60});assert.equal(g.nodes[1].kind,'bpmn:userTask');assert.equal(g.edges[0].kind,'bpmn:sequenceFlow');assert.deepEqual(g.edges[0].routes[sid].points,[{x:136,y:98},{x:220,y:98}]);
 assert.ok(r.warnings.some(w=>w.includes('не строгая')));assert.deepEqual(loadGraph(JSON.parse(serializeProject(g))).errors,[]);
 assert.throws(()=>parseBpmn(bpmnFixture.replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/,'')),/BPMN DI/);
 assert.throws(()=>parseBpmn('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+bpmnFixture));
});

test('diagram append remaps conflicting attribute and tag IDs without changing existing nodes',()=>{
 const a=emptyProject(),b=emptyProject();a.types.attributes=[{id:'status',label:'Count',dataType:'number'}];b.types.attributes=[{id:'status',label:'Status',dataType:'text'}];b.types.tags[0].label='Imported tag';b.sheets[0].tags=['draft'];
 b.nodes=[{id:'shared',name:'Imported',body:'',kind:'entity',sheets:['main'],pos:{main:{x:8,y:16}},attributes:{status:'Open'}}];
 const before=JSON.stringify(a),g=appendDrawio(a,[{graph:b,warnings:[],decodedBytes:10}]);assert.equal(JSON.stringify(a),before);assert.equal(g.types.attributes.length,2);assert.equal(g.types.attributes[0].dataType,'number');assert.equal(Object.values(g.nodes[0].attributes)[0],'Open');assert.notEqual(Object.keys(g.nodes[0].attributes)[0],'status');assert.notEqual(g.sheets[1].tags[0],'draft');assert.deepEqual(loadGraph(g).errors,[]);
});

test('stack grouping keeps every selected sheet exactly once with overlapping tags',()=>{
 const g=emptyProject();g.sheets=[{...g.sheets[0],id:'a',typeId:'процесс',tags:['draft','review']},{...g.sheets[0],id:'b',tags:[]},{...g.sheets[0],id:'c',tags:['review']}];
 const ids=['b','a','c'],snapshot=JSON.stringify(g);assert.deepEqual(groupStackSheets(g,ids,'tag:review'),['a','c','b']);assert.equal(new Set(groupStackSheets(g,ids,'type')).size,3);assert.equal(JSON.stringify(g),snapshot);
});

test('laying an imported sheet out by tags remaps appearances and drops routes that cross new boundaries',()=>{
 const source={nodes:Array.from({length:7},(_,i)=>({id:`n${i}`,type:'text',text:`N${i}`,x:i*150,y:0,width:120,height:80})),edges:[{id:'local',fromNode:'n0',toNode:'n1'},{id:'cross',fromNode:'n0',toNode:'n6'}]};
 const g=parseCanvas(JSON.stringify(source)).graph;
 // n0 and n1 are drafts, n3..n6 are in review, n2 is both and therefore lands on two sheets.
 g.nodes.forEach((n,i)=>{n.tags=i<2?['draft']:i===2?['draft','review']:['review'];});
 const snapshot=JSON.stringify(g),spread=spreadSheet(g,'canvas',{by:'tag'});
 assert.equal(JSON.stringify(g),snapshot);
 assert.equal(spread.sheets.length,2);assert.deepEqual(loadGraph(spread).errors,[]);
 assert.equal(spread.nodes.length,7);assert.equal(spread.edges.length,2);
 assert.equal(spread.nodes.find(n=>n.id==='n2').sheets.length,2);
 assert.equal(spread.nodes[0].appearance[spread.nodes[0].sheets[0]].width,120);
 // Both ends of "local" stay on one sheet, so its waypoints survive; "cross" spans two.
 assert.equal(Object.keys(spread.edges.find(e=>e.id==='cross').routes).length,0);
 assert.equal(Object.keys(spread.edges.find(e=>e.id==='local').routes).length,1);
 assert.equal(Object.keys(spread.nodes.find(n=>n.id==='n2').appearance).length,2);
});

test("projects and draw.io files written before 0.7.0-rc.7 open unchanged under the plyra* names",async()=>{
  const g=makeSoftwareDemo();
  // A project saved by an earlier version: sheet and node-type notation IDs say "plyra".
  const legacyProject=JSON.parse(serializeProject(g));
  legacyProject.sheets=legacyProject.sheets.map(s=>({...s,notation:"plyra"}));
  legacyProject.types.nodes=legacyProject.types.nodes.map(n=>n.notation?{...n,notation:"plyra"}:n);
  const loaded=loadGraph(legacyProject);
  assert.deepEqual(loaded.errors,[]);
  assert.ok(loaded.graph.sheets.every(s=>s.notation==="plyloom"),"sheet notation is migrated, not rejected");
  assert.ok(loaded.graph.types.nodes.every(n=>n.notation!=="plyra"));
  assert.equal(loaded.graph.nodes.length,g.nodes.length);
  // A draw.io file exported by an earlier version carries the same metadata under plyra* attributes.
  const current=exportDrawio(g);
  assert.ok(current.includes("plyloomNodeId")&&!current.includes("plyraNodeId"),"new exports use the new names");
  const legacyDrawio=current.replace(/plyloom(?=[A-Z])/g,"plyra");
  const fresh=await parseDrawio(current),old=await parseDrawio(legacyDrawio);
  assert.deepEqual(old.warnings,fresh.warnings);
  assert.deepEqual(old.graph,fresh.graph,"shared IDs, types, bodies, attributes and routes survive the old attribute names");
});
