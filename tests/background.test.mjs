// Actual worker-thread structured clone and execution; browser CSP is checked by test:release.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {emptyProject,loadGraph,optimizeLayout,viewLayoutRequest} from '../.qa/support.mjs';
const code=readFileSync(new URL('../.qa/background.js',import.meta.url),'utf8');
function request(data){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:value=>parentPort.postMessage(value)};${code}\nparentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},20000);
  worker.on('error',e=>{clearTimeout(timer);worker.terminate();reject(e);});
  worker.on('message',value=>{if('progress' in value)return;clearTimeout(timer);worker.terminate();resolve(value);});
  worker.postMessage(data);
 });
}
test('background parsing matches native validation and reports invalid JSON without a partial graph',async()=>{
 const g=emptyProject('worker import'),sid=g.sheets[0].id;
 g.nodes=Array.from({length:1500},(_,i)=>({id:`n${i}`,name:`Node ${i}`,body:'details '.repeat(100),kind:'entity',sheets:[sid],pos:{[sid]:{x:i*10,y:0}}}));
 g.edges=[{from:'n0',to:'n1',kind:'flow'},{id:'edge-0',from:'n1',to:'n2',kind:'flow'}];
 const text=JSON.stringify(g);assert.ok(text.length>1024*1024);
 assert.deepEqual((await request({kind:'load',text})).result,loadGraph(JSON.parse(text)));
 const bad=await request({kind:'load',text:'{broken'});assert.equal(typeof bad.error,'string');assert.equal(bad.result,undefined);
});
test('background layout transfers Maps and returns the same deterministic solution as the main thread',async()=>{
 const g=emptyProject('worker layout'),sid=g.sheets[0].id;
 g.nodes=Array.from({length:14},(_,i)=>({id:`n${i}`,name:`Node ${i}`,kind:'entity',body:'',sheets:[sid],pos:{[sid]:{x:i%3*30,y:Math.floor(i/3)*20}}}));
 g.edges=g.nodes.slice(1).map((n,i)=>({id:`e${i}`,from:`n${i}`,to:n.id,kind:'flow'}));
 const snapshot={panes:[{sid,positions:new Map(g.nodes.map(n=>[n.id,n.pos[sid]])),width:900,height:600}],external:false},sizes=new Map();
 const expected=optimizeLayout(viewLayoutRequest(g,sizes,snapshot));
 const actual=await request({kind:'layout',graph:g,sizes,snapshot});
 assert.equal(actual.error,undefined);assert.ok(actual.result.positions instanceof Map);assert.deepEqual(actual.result,expected);
});
