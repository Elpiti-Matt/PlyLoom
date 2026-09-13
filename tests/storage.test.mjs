// Storage transaction tests run in Node with the IndexedDB reference implementation,
// and unchanged in Chromium with its native IndexedDB (test:browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {indexedDB as fakeDB, IDBObjectStore as FakeStore} from 'fake-indexeddb';
import {readAutosave,writeAutosave,clearAutosave,emptyProject} from '../.qa/support.mjs';
async function setup(){
 const dom=new JSDOM('<div/>',{url:'https://storage.plyloom.test'});
 if(typeof window==='undefined'||!window.indexedDB){
  Object.defineProperty(globalThis,'window',{value:dom.window,configurable:true});
  Object.defineProperty(globalThis,'localStorage',{value:dom.window.localStorage,configurable:true});
  Object.defineProperty(window,'indexedDB',{value:fakeDB,configurable:true});
 }
 await clearAutosave();localStorage.clear();
 return typeof IDBObjectStore==='undefined'?FakeStore:IDBObjectStore;
}
async function stored(key){return new Promise((resolve,reject)=>{const r=window.indexedDB.open('plyloom',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('projects'),q=tx.objectStore('projects').get(key);tx.oncomplete=()=>{resolve(q.result);db.close();};};});}
test('IndexedDB stores a project beyond localStorage quota and reads it without losing data',async()=>{
 await setup();const g=emptyProject('large');g.description='Я'.repeat(6*1024*1024);
 assert.equal(await writeAutosave(g),'indexeddb');const r=await readAutosave();assert.equal(r.graph.description,g.description);assert.equal(r.graph.title,'large');assert.equal(localStorage.getItem('plyloom.graph.v2'),null);
});
test('a failed IndexedDB transaction rejects and preserves the last successful save',async()=>{
 const Store=await setup(),g=emptyProject('original');await writeAutosave(g);
 const put=Store.prototype.put;Store.prototype.put=function(...args){const request=put.apply(this,args);this.transaction.abort();return request;};
 try{await assert.rejects(()=>writeAutosave({...g,title:'lost'}));}finally{Store.prototype.put=put;}
 assert.equal((await readAutosave()).graph.title,'original');
});
test('old keys migrate without deletion and an unreadable original is preserved in the same write',async()=>{
 await setup();const g=emptyProject('legacy');localStorage.setItem('atlas.graph.v1',JSON.stringify(g));
 const r=await readAutosave();assert.equal(r.migrate,true);assert.equal(r.graph.title,'legacy');await writeAutosave(r.graph);
 assert.ok(localStorage.getItem('atlas.graph.v1'));assert.equal((await readAutosave()).migrate,false);
 await clearAutosave();localStorage.setItem('plyloom.graph.v2','{broken');const bad=await readAutosave();assert.equal(bad.graph,null);assert.equal(bad.warning,'{broken');
 await writeAutosave(g,bad.warning);assert.equal(await stored('recovery'),'{broken');assert.equal((await readAutosave()).graph.title,'legacy');
});
