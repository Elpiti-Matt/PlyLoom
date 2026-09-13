// Production HTML checks. --static also executes the emitted worker in Node;
// the default adds real Chromium, file://, native IndexedDB, CSP and viewport QA.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {runInNewContext} from 'node:vm';
const file=resolve('dist/index.html'),html=readFileSync(file,'utf8');
assert.equal(html,readFileSync('demo/index.html','utf8'),'demo must come from this build');
assert.equal(readFileSync('demo/SHA256SUMS','utf8').split(' ')[0],createHash('sha256').update(html).digest('hex'));
assert.match(html,/worker-src blob:/);assert.match(html,/connect-src 'none'/);
assert.doesNotMatch(html,/<script[^>]+src\s*=/i);assert.doesNotMatch(html,/<link[^>]+(?:href=["'](?:https?:|\.\/assets))/i);
assert.doesNotMatch(html,/id=["']plyloom-test-harness/);
// Vite currently emits the worker as a JS string literal. Fail explicitly if
// its representation changes; never silently skip the production worker test.
const literal=html.match(/\bconst \w+=('(?:\\.|[^'\\])*self\.onmessage(?:\\.|[^'\\])*')/s)?.[1];
assert.ok(literal,'embedded worker source');
const source=runInNewContext(literal,Object.create(null),{timeout:1000});
const graph={version:2,title:'Release worker',sheets:[{id:'s',name:'Sheet',color:'#0ea5e9',notation:'plyloom'}],nodes:[],edges:[]};
await new Promise((ok,fail)=>{
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:v=>parentPort.postMessage(v)};${source}\nparentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
 const timer=setTimeout(()=>{worker.terminate();fail(new Error('production worker timeout'));},10000);
 worker.on('error',e=>{clearTimeout(timer);worker.terminate();fail(e);});
 worker.once('message',v=>{clearTimeout(timer);worker.terminate();try{assert.equal(v.result.graph.title,graph.title);assert.deepEqual(v.result.errors,[]);ok();}catch(e){fail(e);}});
 worker.postMessage({kind:'load',text:JSON.stringify(graph)});
});
console.log('PASS: release HTML, checksum, CSP, embedded assets and actual emitted worker execution');
if(process.argv.includes('--static'))process.exit(0);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch(process.env.PLYLOOM_CHROME?{executablePath:process.env.PLYLOOM_CHROME}:{});
mkdirSync('.qa/release',{recursive:true});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],external=[],workers=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('worker',w=>workers.push(w.url()));
  page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));});
  await page.goto(pathToFileURL(file).href);await page.waitForSelector('main [data-canvas-id]');
  await page.locator('[data-action="filter"]').click();await page.locator('[data-filter-search]').fill('Эспрессо');
  await page.locator('[data-filter-search]').press('Enter');
  assert.ok(await page.locator('[data-filter-panel]').isVisible());
  await page.screenshot({path:`.qa/release/filter-${width}.png`,fullPage:true});
  const pageWidth=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(pageWidth.scroll<=pageWidth.viewport+1,'no document horizontal overflow');
  // A real file import above the worker threshold, followed by a real IDB reload.
  const g={...graph,title:`Release ${width}`,nodes:Array.from({length:1200},(_,i)=>({id:`n${i}`,name:`Node ${i}`,body:'detail '.repeat(140),kind:'entity',sheets:['s'],pos:{s:{x:(i%40)*270,y:Math.floor(i/40)*150}}}))};
  await page.locator('[data-import="native"]').setInputFiles({name:'release.plyloom',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(g))});
  await page.getByRole('button',{name:'Открыть и заменить',exact:true}).click({timeout:30000});
  await page.waitForSelector('main [data-renderer="canvas"]');
  assert.ok(workers.some(url=>url.startsWith('blob:')),'large import starts a blob worker under release CSP');
  const pixels=await page.locator('canvas.dense-scene').evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i])n++;return n;});
  assert.ok(pixels>100,'dense scene contains actual pixels');
  await page.screenshot({path:`.qa/release/dense-${width}.png`,fullPage:true});
  await page.waitForFunction(title=>new Promise(resolve=>{const r=indexedDB.open('plyloom',1);r.onerror=()=>resolve(false);r.onsuccess=()=>{const db=r.result,tx=db.transaction('projects'),q=tx.objectStore('projects').get('current');tx.oncomplete=()=>{db.close();resolve(q.result?.title===title&&q.result?.nodes.length===1200);};};}),g.title);
  await page.reload();await page.waitForSelector('main [data-renderer="canvas"][data-visible-nodes="1200"]');
  // Exercise pointer capture using native mouse events, then verify the selected
  // node is readable and the remaining offscreen DOM is culled.
  const target=await page.locator('main [data-canvas-id]').evaluate((el,nodes)=>{const r=el.getBoundingClientRect(),x=+el.dataset.viewX,y=+el.dataset.viewY,k=+el.dataset.viewK;for(const n of nodes){const px=x+(n.pos.s.x+100)*k,py=y+(n.pos.s.y+30)*k;if(px>40&&px<r.width-40&&py>80&&py<r.height-80)return {x:r.left+px,y:r.top+py,name:n.name};}},g.nodes);
  assert.ok(target);await page.mouse.click(target.x,target.y);
  await page.waitForFunction(()=>+document.querySelector('main [data-canvas-id]').dataset.viewK>=.7);
  assert.equal(await page.locator('#node-name').inputValue(),target.name);
  assert.ok(await page.locator('main [data-nid]').count()<500,'readable scale culls distant cards');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
  console.log(`PASS: file:// ${width}px, search, production blob worker, native IndexedDB reload, Canvas pixels and pointer selection`);
  await context.close();
 }
}finally{await browser.close();}
