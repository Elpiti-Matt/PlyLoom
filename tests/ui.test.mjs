// DOM unit tests. jsdom has no layout engine: these are NOT browser or device QA.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { clearAutosave, App, makeRoastery, makeSoftwareDemo, loadGraph, emptyProject, parseCanvas, overviewContent, overviewPositions, clampOverviewNode } from "../.qa/support.mjs";

async function savedGraph() {
  if(!window.indexedDB)return JSON.parse(localStorage.getItem("plyloom.graph.v2"));
  return new Promise((resolve,reject)=>{const r=indexedDB.open("plyloom",1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction("projects"),read=tx.objectStore("projects").get("current");tx.oncomplete=()=>{resolve(read.result?JSON.parse(JSON.stringify(read.result)):null);db.close();};};});
}
// `extra` writes raw keys before the first render; used to check migration from pre-rc.7 storage keys.
async function mount(width=1366, stored=null, geometry=false, extra=null, scene=false) {
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url:"https://plyloom.test",pretendToBeVisual:true});
  const w=dom.window;
  // Known rectangles only for testing SVG endpoint rendering; this is not CSS/layout QA.
  if(geometry)w.HTMLElement.prototype.getBoundingClientRect=function(){
    const pane=this.closest?.('.spread-pane');const index=pane?[...document.querySelectorAll('.spread-pane')].indexOf(pane):0;
    const x=Math.max(0,index)*600;return {x,y:0,left:x,top:0,right:x+600,bottom:400,width:600,height:400,toJSON(){return this;}};
  };
  if(scene){
    Object.defineProperty(w.HTMLElement.prototype,"clientWidth",{configurable:true,get(){return this.hasAttribute("data-canvas-id")?800:0;}});
    Object.defineProperty(w.HTMLElement.prototype,"clientHeight",{configurable:true,get(){return this.hasAttribute("data-canvas-id")?600:0;}});
    w.HTMLCanvasElement.prototype.getContext=function(){return {setTransform(){},clearRect(){},translate(){},scale(){},setLineDash(){},stroke(){},beginPath(){},rect(){},ellipse(){},moveTo(){},lineTo(){},closePath(){},fill(){w.__canvasFills=(w.__canvasFills??0)+1;},fillRect(){}};};
  }
  Object.defineProperty(w,"innerWidth",{value:width,configurable:true});
  w.matchMedia=()=>({matches:width<1024,addEventListener(){},removeEventListener(){}});
  // Counts subscriptions so tests can prove camera gestures do not re-measure cards.
  const RO=class{observe(){w.__roObserve=(w.__roObserve??0)+1;} unobserve(){} disconnect(){}};
  w.ResizeObserver=RO;
  w.HTMLElement.prototype.setPointerCapture=function(){};
  w.confirm=()=>true;
  // In jsdom these globals point at the new window. In a real browser (npm run test:browser) they are
  // fixed, non-configurable and already correct, so the redefinition is skipped.
  for(const name of ["window","document","localStorage","HTMLElement","HTMLInputElement","HTMLTextAreaElement","navigator","Event","KeyboardEvent"])
    try{Object.defineProperty(globalThis,name,{value:w[name]??w,writable:true,configurable:true});}catch{/* browser global */}
  globalThis.ResizeObserver=RO;
  globalThis.requestAnimationFrame=w.requestAnimationFrame.bind(w);
  globalThis.cancelAnimationFrame=w.cancelAnimationFrame.bind(w);
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  await clearAutosave();
  if(stored)localStorage.setItem("plyloom.graph.v2",JSON.stringify(stored));
  for(const [key,value] of Object.entries(extra??{}))localStorage.setItem(key,value);
  const { createRoot } = await import("react-dom/client");
  const root=createRoot(document.getElementById("root"));
  await act(async()=>root.render(React.createElement(App)));
  for(let i=0;i<200&&document.querySelector(".storage-loading");i++)await act(async()=>new Promise(r=>setTimeout(r,10)));
  assert.equal(document.querySelector(".storage-loading"),null,"storage initialization finishes");
  const click=async(text)=>{
    const el=[...document.querySelectorAll("button")].find((b)=>!b.closest("[inert]")&&(b.textContent.trim()===text||b.getAttribute("aria-label")===text));
    assert.ok(el,`button: ${text}`);await act(async()=>el.click());
  };
  const flush=()=>act(async()=>new Promise((resolve)=>setTimeout(resolve,350)));
  const field=async(id,value)=>{
    const input=document.getElementById(id);assert.ok(input,`field: ${id}`);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,value);
      input.dispatchEvent(new w.Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));
    });
  };
  const close=async()=>{await act(async()=>root.unmount());w.close();};
  return {w,click,flush,close,field};
}

test("software example loads complete English content and undo restores the previous map",async()=>{
  const previousConfirm=globalThis.confirm;
  globalThis.confirm=()=>true;
  const t=await mount();
  try{
    await t.click("ENG");await t.click("Example: software");await t.flush();
    const saved=(await savedGraph());
    assert.deepEqual(saved,makeSoftwareDemo("en"));
    assert.ok(document.body.textContent.includes("Software: report export"));
    assert.ok(!saved.nodes.some((n)=>/[А-Яа-яЁё]/.test(n.name+n.body)));
    await t.click("Undo change");await t.flush();
    assert.deepEqual((await savedGraph()),makeRoastery());
  } finally{await t.close();globalThis.confirm=previousConfirm;}
});

test("mobile keyboard selection opens the node drawer, labels work, link action closes drawer",async()=>{
  const t=await mount(390);
  try{
    const card=document.querySelector('main [data-nid="blend"]');assert.ok(card);
    await act(async()=>card.dispatchEvent(new t.w.KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    assert.equal(document.querySelector('aside[aria-label="Свойства карты"]').getAttribute("aria-modal"),"true");
    assert.equal(document.querySelector('label[for="node-name"]').textContent,"Имя");
    assert.equal(document.getElementById("node-name").value,"Эспрессо-смесь «Утро»");
    await t.click("+ связать с…");
    assert.ok(document.querySelector('aside[aria-label="Свойства карты"]').hasAttribute("inert"));
  } finally{await t.close();}
});
test("sheet type changes classification without excluding nodes",async()=>{
  const t=await mount();
  try{
    const button=[...document.querySelectorAll('aside[aria-label="Листы"] button')].find((b)=>b.textContent.includes("Обжарка"));
    await act(async()=>button.click());
    const field=document.getElementById("sheet-notation");
    await act(async()=>{field.value="процесс";field.dispatchEvent(new t.w.Event("change",{bubbles:true}));});
    assert.ok(!document.body.textContent.includes("Вне нотации:"));assert.equal(document.querySelectorAll("main [data-nid]:not(.opacity-50)").length>=8,true);
    await t.flush();const g=(await savedGraph());assert.equal(g.nodes.length,42);assert.equal(g.sheets.find(s=>s.id==="roasting").typeId,"процесс");
  }finally{await t.close();}
});
test("the sheet panel lays a sheet out by an attribute instead of capping its size",async()=>{
  const t=await mount();
  try{
    const button=[...document.querySelectorAll('aside[aria-label="Листы"] button')].find((b)=>b.textContent.includes("Обжарка"));
    await act(async()=>button.click());
    // The node limit and the capacity bar are gone: a boundary is a meaning, not a count.
    assert.equal(document.getElementById("sheet-limit"),null);
    assert.ok(!document.body.textContent.includes("Заполненность"));
    assert.ok(!document.querySelector('[title="узлов / лимит"]'));
    const strip=[...document.querySelectorAll('aside[aria-label="Листы"] li')].find((li)=>li.textContent.includes("Обжарка"));
    assert.match(strip.textContent,/8$/,"the strip shows a plain node count");
    await t.field("sheet-spread","attr:basis");
    const run=document.querySelector('[data-action="spread-sheet"]');assert.ok(run);
    await act(async()=>run.click());
    await t.flush();
    const g=(await savedGraph());
    // Two values plus the unset bucket replace one sheet; nothing is lost on the way.
    assert.equal(g.sheets.length,9);
    assert.deepEqual(g.sheets.filter((s)=>s.id.startsWith("roasting-")).map((s)=>s.name),
      ["Обжарка · Допущение","Обжарка · Нужна проверка","Обжарка · Без значения"]);
    assert.equal(g.nodes.length,42);
    assert.ok(!g.nodes.some((n)=>n.sheets.includes("roasting")));
    assert.ok(g.nodes.every((n)=>n.sheets.length>0&&n.sheets.every((s)=>s in n.pos)));
    assert.ok(document.body.textContent.includes("Лист разложен"));
    await t.click("Отменить изменение");await t.flush();
    assert.equal((await savedGraph()).sheets.length,7);
  }finally{await t.close();}
});
test("creating a node, undoing and redoing restore data and persisted graph",async()=>{
  const t=await mount();
  try{
    await t.click("+ Узел");
    await t.field("add-node-name","Новая сезонная смесь");
    await t.field("add-node-kind","hypothesis");
    await t.click("Создать узел");
    await t.flush();const g=(await savedGraph());assert.equal(g.nodes.length,43);assert.equal(g.nodes.at(-1).name,"Новая сезонная смесь");assert.equal(g.nodes.at(-1).kind,"hypothesis");
    await t.click("Отменить изменение");await t.flush();assert.equal((await savedGraph()).nodes.length,42);
    await t.click("Повторить изменение");await t.flush();assert.equal((await savedGraph()).nodes.length,43);
  }finally{await t.close();}
});
test("all seven view components mount and the spread handles shared memberships",async()=>{
  const t=await mount();
  try{
    for(const mode of ["Разворот","Стопка","Оглавление","Все на один лист","Подготовить проект с ИИ","Как работать с PlyLoom","Листы"]) {
      await t.click(mode);assert.ok(!document.body.textContent.includes("Что-то сломалось"),mode);
    }
  }finally{await t.close();}
});
test("an intentionally empty saved graph is not replaced by the demo",async()=>{
  const g=makeRoastery();g.nodes=[];g.edges=[];
  const t=await mount(390,g);
  try{assert.equal(document.querySelectorAll("[data-nid]").length,0);assert.ok(document.body.textContent.includes("0 узлов"));}
  finally{await t.close();}
});
test("malformed saved data has a recovery download rather than silent loss",async()=>{
  const t=await mount(390,{nodes:[],edges:[],sheets:[]});
  try{assert.ok(document.querySelector('[role="alert"]').textContent.includes("Скачать прежнее сохранение"));}
  finally{await t.close();}
});

test("invalid import preserves the current graph; a subsequent valid import is undoable",async()=>{
  const t=await mount(390);
  try{
    const input=document.querySelector('input[type="file"]');
    const send=async(value)=>{
      Object.defineProperty(input,"files",{configurable:true,value:[{name:"map.json",size:100,text:async()=>JSON.stringify(value)}]});
      await act(async()=>input.dispatchEvent(new t.w.Event("change",{bubbles:true})));
    };
    await send({nodes:[{id:"a"}],edges:[{from:"a",to:"missing"}]});
    assert.ok(document.querySelector('[role="alert"]').textContent.includes("Импорт отклонён"));
    assert.ok(document.body.textContent.includes("42 узлов"));
    await send({nodes:[{id:"a",name:"Imported"}],edges:[]});
    assert.ok(document.querySelector('[role="dialog"]').textContent.includes("Открыть проект"));
    assert.equal(document.querySelectorAll("main [data-nid]").length>1,true);
    await t.click("Открыть и заменить");
    await t.flush();assert.equal((await savedGraph()).nodes.length,1);
    assert.equal(document.querySelectorAll('[role="alert"]').length,0);
    await t.click("Отменить изменение");await t.flush();assert.equal((await savedGraph()).nodes.length,42);
  }finally{await t.close();}
});

test("all spread compositions keep unique sheets and an occupied picker swaps two slots",async()=>{
  const t=await mount();
  try{
    await t.click("Разворот");
    for(const count of [2,3,4,5,6,2]){
      const button=document.querySelector(`.composition-options button[aria-label^="${count} "]`);
      await act(async()=>button.click());
      const ids=[...document.querySelectorAll('.spread-pane')].map((el)=>el.dataset.sheetId);
      assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);
    }
    const before=[...document.querySelectorAll('.spread-pane')].map((el)=>el.dataset.sheetId);
    const picker=document.querySelector('[aria-label="Лист в окне 1"]');
    await act(async()=>{picker.value=before[1];picker.dispatchEvent(new t.w.Event("change",{bubbles:true}));});
    assert.deepEqual([...document.querySelectorAll('.spread-pane')].map((el)=>el.dataset.sheetId),before.toReversed());
    assert.equal(document.querySelector('.spread-pane.is-active').dataset.sheetId,before[1]);
  }finally{await t.close();}
});

test("mobile six-sheet spread shows one editing canvas and tabs preserve the composition",async()=>{
  const t=await mount(390);
  try{
    await t.click("Разворот");
    await act(async()=>document.querySelector('.composition-options button[aria-label^="6 листов"]').click());
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.equal(document.querySelectorAll('.sheet-tabs .is-visible').length,6);
    const last=document.querySelectorAll('.sheet-tabs .is-visible')[5];
    const name=last.querySelector('span').textContent;
    await act(async()=>last.click());
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.ok(document.querySelector('.spread-pane').getAttribute('aria-label').includes(name));
    assert.equal(document.querySelectorAll('.sheet-tabs .is-visible').length,6);
    await act(async()=>document.querySelector('[aria-label="Следующий лист"]').click());
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.equal(document.querySelectorAll('.sheet-tabs .is-visible').length,6);
  }finally{await t.close();}
});

test("adding from a spread pane targets that sheet and cancelling the menu creates nothing",async()=>{
  const t=await mount();
  try{
    await t.click("Разворот");
    const last=[...document.querySelectorAll('.spread-pane')].at(-1),sid=last.dataset.sheetId;
    await act(async()=>last.querySelector('button[aria-label^="Добавить узел"]').click());
    assert.equal(document.getElementById('add-node-sheet').value,sid);
    assert.equal(document.activeElement.id,'add-node-name');
    await t.field('add-node-name','Связанный контракт');
    await t.click('Создать узел');await t.flush();
    const graph=(await savedGraph());
    assert.deepEqual(graph.nodes.at(-1).sheets,[sid]);
    await t.click('+ Узел');
    await act(async()=>document.activeElement.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('.node-dialog'),null);
    await t.flush();assert.equal((await savedGraph()).nodes.length,43);
  }finally{await t.close();}
});

test("external reference navigates to the canonical node without creating another node",async()=>{
  const t=await mount();
  try{
    const ref=document.querySelector('button[data-external-node]');assert.ok(ref);
    const id=ref.dataset.externalNode;const expected=makeRoastery().nodes.find((n)=>n.id===id);
    await act(async()=>ref.click());
    const canvas=document.querySelector(`main [id="canvas-${expected.sheets[0]}"]`);assert.ok(canvas);
    assert.ok([...canvas.querySelectorAll('[data-nid]')].some((el)=>el.dataset.nid===id));
    assert.equal(document.getElementById('node-name').value,expected.name);
    assert.ok(document.body.textContent.includes('42 узлов'));
  }finally{await t.close();}
});

test("stack layer checkboxes, labels, connection switches and focused creation work",async()=>{
  const t=await mount();
  try{
    await t.click('Стопка');
    const checks=[...document.querySelectorAll('.stack-layer-checks input')];
    assert.equal(checks.filter((c)=>c.checked).length,7);
    await act(async()=>checks[1].click());
    assert.equal(document.querySelectorAll('.stack-layer-checks input:checked').length,6);
    assert.ok(document.querySelectorAll('[data-stack-edge]').length>0);
    const toggle=(text)=>[...document.querySelectorAll('.stack-settings-row label')].find((l)=>l.textContent===text).querySelector('input');
    await act(async()=>toggle('Связи').click());assert.equal(document.querySelectorAll('[data-stack-edge]').length,0);
    await act(async()=>toggle('Связи').click());assert.ok(document.querySelectorAll('[data-stack-edge]').length>0);
    await act(async()=>toggle('Подписи узлов').click());assert.equal(document.querySelectorAll('#stack-svg text[role="button"]').length,0);
    await act(async()=>toggle('Подписи узлов').click());assert.ok(document.querySelectorAll('#stack-svg text[role="button"]').length>0);
    await act(async()=>document.querySelector('[aria-label="Активировать слой Деньги"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    await t.click('+ Узел');assert.equal(document.getElementById('add-node-sheet').selectedOptions[0].textContent,'Деньги');
    await t.click('Отмена');await t.click('Очистить');assert.equal(document.querySelector('#stack-svg'),null);
    await t.click('Все');assert.equal(document.querySelectorAll('.stack-layer-checks input:checked').length,7);
  }finally{await t.close();}
});

test("sheet paging has keyboard access and ignores shortcuts while a node menu is open",async()=>{
  const t=await mount();
  try{
    const before=document.querySelector('.sheet-tabs [aria-current="page"]').textContent;
    await act(async()=>window.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));
    assert.notEqual(document.querySelector('.sheet-tabs [aria-current="page"]').textContent,before);
    await t.click('+ Узел');const active=document.getElementById('add-node-sheet').value;
    await act(async()=>document.activeElement.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));
    assert.equal(document.getElementById('add-node-sheet').value,active);
  }finally{await t.close();}
});

test("a six-pane composition survives importing a one-sheet map and undoing the import",async()=>{
  const t=await mount();
  try{
    await t.click('Разворот');
    await act(async()=>document.querySelector('.composition-options button[aria-label^="6 листов"]').click());
    const input=document.querySelector('input[type="file"]');
    Object.defineProperty(input,'files',{value:[{name:'small.json',size:100,text:async()=>JSON.stringify({nodes:[{id:'only',name:'Единственный'}],edges:[]})}]});
    await act(async()=>input.dispatchEvent(new t.w.Event('change',{bubbles:true})));
    await t.click('Открыть и заменить');
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.ok(document.querySelector('.spread-pane [data-nid="only"]'));
    await t.click('Отменить изменение');
    assert.equal(document.querySelectorAll('.spread-pane').length,6);
    assert.equal(new Set([...document.querySelectorAll('.spread-pane')].map((p)=>p.dataset.sheetId)).size,6);
  }finally{await t.close();}
});

test("linking between the first and third pane creates one canonical edge and is undoable",async()=>{
  const t=await mount();
  try{
    await t.click('Разворот');
    await act(async()=>document.querySelector('.composition-options button[aria-label^="3 листа"]').click());
    const panes=[...document.querySelectorAll('.spread-pane')];const graph=makeRoastery();
    const from=graph.nodes.find((n)=>n.sheets.includes(panes[0].dataset.sheetId));
    const to=graph.nodes.find((n)=>n.id!==from.id&&n.sheets.includes(panes[2].dataset.sheetId)&&!graph.edges.some((e)=>e.from===from.id&&e.to===n.id));
    const pick=async(pane,id)=>act(async()=>pane.querySelector(`[data-nid="${id}"]`).dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    await pick(panes[0],from.id);await t.click('Свойства и связи');await t.click('+ связать с…');await pick(panes[2],to.id);
    await t.flush();const saved=(await savedGraph());
    assert.equal(saved.edges.length,44);assert.equal(saved.nodes.length,42);
    assert.ok(saved.edges.some((e)=>e.from===from.id&&e.to===to.id));
    await t.click('Отменить изменение');await t.flush();assert.equal((await savedGraph()).edges.length,43);
  }finally{await t.close();}
});

test('RU/ENG changes controls, demo names and contents title without changing saved graph',async()=>{
  const graph=makeRoastery();const t=await mount(1366,graph);
  try{
    await t.click('ENG');assert.equal(document.documentElement.lang,'en');assert.equal(document.querySelector('.workspace-titlebar h1').textContent,'Small Coffee Roastery');
    assert.ok(document.querySelector('[data-nid="blend"]').textContent.includes('Morning espresso blend'));
    assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Spread'));
    await t.click('Contents');assert.equal(document.querySelector('.project-overview h2').textContent,'Small Coffee Roastery');
    await t.click('Prepare a project with AI');assert.ok(document.querySelector('.help-contract pre').textContent.includes('CONTRACT — PlyLoom v3'));
    await t.click('Using PlyLoom');assert.ok(document.querySelector('.faq-list').textContent.includes('What does the plus on a node do?'));
    await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(graph).graph)));assert.equal(localStorage.getItem('plyloom.language'),'en');
    await t.click('RU');assert.equal(document.documentElement.lang,'ru');assert.equal(document.querySelector('.workspace-titlebar h1').textContent,graph.title);
  }finally{await t.close();}
});

test('inline name/body edits are shared across appearances and can be undone',async()=>{
  const t=await mount();
  try{
    await t.click('Разворот');const before=makeRoastery().nodes.find(n=>n.id==='blend').body;
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());
    assert.equal(document.querySelectorAll('[data-node-body-editor="blend"]').length,2);
    const editor=document.querySelector('[data-node-body-editor="blend"]');await t.field(editor.id,'Edited from the card\nSecond line');
    assert.ok([...document.querySelectorAll('[data-node-body-editor="blend"]')].every(e=>e.value==='Edited from the card\nSecond line'));
    await t.field(document.querySelector('[data-node-name-editor="blend"]').id,'Общая смесь');await t.flush();
    const g=(await savedGraph());assert.equal(g.nodes.find(n=>n.id==='blend').name,'Общая смесь');assert.equal(g.nodes.length,42);
    await t.click('Отменить изменение');assert.ok([...document.querySelectorAll('[data-node-body-editor="blend"]')].every(e=>e.value===before));
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());assert.equal(document.querySelectorAll('[data-node-body-editor="blend"]').length,0);
  }finally{await t.close();}
});

test('desktop spread removes external duplicates dynamically; mobile keeps links to offscreen layers',async()=>{
  const g=makeRoastery();
  for(const width of [1366,390]){
    const t=await mount(width);
    try{
      if(width===390){await t.click("Разворот");}else await t.click('Разворот');
      for(const count of [6,2]){
        await act(async()=>document.querySelector(`.composition-options button[aria-label^="${count} "]`).click());
        const visible=[...document.querySelectorAll('.spread-pane')].map(p=>p.dataset.sheetId);
        const refs=[...document.querySelectorAll('[data-external-node]')];assert.ok(refs.length>0);
        for(const ref of refs){const n=g.nodes.find(n=>n.id===ref.dataset.externalNode);assert.ok(!n.sheets.some(s=>visible.includes(s)));}
      }
    }finally{await t.close();}
  }
});

test('mobile inline editor does not open a blocking drawer; entering text does not page or select',async()=>{
  const t=await mount(390);
  try{
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());
    assert.equal(document.querySelector('[aria-modal="true"]'),null);
    const input=document.querySelector('[data-node-body-editor="blend"]');const active=document.querySelector('.sheet-tabs [aria-current="page"]').textContent;
    await act(async()=>input.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));
    assert.equal(document.querySelector('.sheet-tabs [aria-current="page"]').textContent,active);assert.equal(document.querySelector('[aria-modal="true"]'),null);
  }finally{await t.close();}
});

test('spread toggles side references without losing graph or visible routes and draws gold identity lines',async()=>{
 const graph=makeRoastery(),t=await mount(1366,graph,true);
 try{
  await t.click('Разворот');const before=document.querySelectorAll('[data-external-node]').length;assert.ok(before>0);
  assert.ok(document.querySelector('[data-spread-edge] path[stroke-dasharray="6 5"]'));
  const identity=document.querySelector('.spread-connections [data-identity-node="blend"]');assert.ok(identity);assert.equal(identity.querySelector('[marker-end]'),null);
  assert.ok(document.querySelector('[data-line-kind="local"] path[stroke="#778293"]:not([stroke-dasharray])'),"all intra-sheet relations use solid lines");
  const edgeCount=document.querySelectorAll('[data-spread-edge]').length;
  await act(async()=>document.querySelector('.external-toggle').click());
  assert.equal(document.querySelectorAll('[data-external-node]').length,0);assert.equal(document.querySelectorAll('[data-spread-edge]').length,edgeCount);
  assert.equal(document.querySelector('.external-toggle').getAttribute('aria-pressed'),'false');
  await act(async()=>document.querySelector('.external-toggle').click());assert.equal(document.querySelectorAll('[data-external-node]').length,before);
  await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(graph).graph)));
 }finally{await t.close();}
});

test('line legend opens by hover and tap, explains identity, and closes with Escape',async()=>{
 const t=await mount();
 try{
  await t.click('Разворот');const trigger=document.querySelector('.legend-trigger');
  await act(async()=>trigger.dispatchEvent(new t.w.MouseEvent('mouseover',{bubbles:true})));assert.ok(document.querySelector('.legend-panel'));
  assert.equal(document.querySelectorAll('.legend-row').length,3);assert.ok(document.querySelector('.legend-panel').textContent.includes('не новое ребро'));
  await act(async()=>trigger.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('.legend-panel'),null);
  await act(async()=>trigger.click());assert.ok(document.querySelector('.legend-panel'));
  await act(async()=>document.querySelector('.legend-close').click());assert.equal(document.querySelector('.legend-panel'),null);
 }finally{await t.close();}
});

test('mobile spread has a local side-reference switch and keeps node membership unchanged',async()=>{
 const t=await mount(390,makeRoastery());
 try{
  await t.click("Разворот");
  assert.ok(document.querySelector('.external-toggle'));await act(async()=>document.querySelector('.external-toggle').click());assert.equal(document.querySelectorAll('[data-external-node]').length,0);
  await act(async()=>document.querySelector('.legend-trigger').click());assert.ok(document.querySelector('.legend-panel'));
  await act(async()=>document.querySelector('.legend-close').click());assert.equal(document.querySelector('.legend-panel'),null);
  await t.flush();assert.equal((await savedGraph()).nodes.length,42);
 }finally{await t.close();}
});

test('help media starts as a still, plays a local GIF, stops, and changes language',async()=>{
 const t=await mount();
 try{
  await t.click('Подготовить проект с ИИ');const first=document.querySelector('.help-media');assert.ok(first.querySelector('img').src.startsWith('data:image/png;base64,'));
  await act(async()=>first.querySelector('button').click());assert.ok(first.querySelector('img').src.startsWith('data:image/gif;base64,'));
  await act(async()=>first.querySelector('button').click());assert.ok(first.querySelector('img').src.startsWith('data:image/png;base64,'));
  await t.click('ENG');assert.ok(document.querySelector('.help-media-title').textContent.includes('Illustrated walkthrough'));
  const links=[...document.querySelectorAll('.help-media a')];assert.ok(links.every(a=>a.download.endsWith('-en.gif')||a.download.endsWith('-en.png')));
 }finally{await t.close();}
});

test('cross-model walkthrough reveals review targets without mutating the current map',async()=>{
 const graph=makeRoastery(),t=await mount(1366,graph);
 try{
  await t.click('Как работать с PlyLoom');assert.equal(document.querySelectorAll('[data-case-model]').length,6);
  await t.click('2. Меняем контракт');assert.equal(document.querySelectorAll('.changed-model').length,1);assert.equal(document.querySelectorAll('.needs-review').length,0);
  await t.click('3. Видим последствия');assert.equal(document.querySelectorAll('.needs-review').length,6);assert.equal(document.querySelectorAll('.case-review').length,6);
  assert.ok(document.querySelector('.case-explanation').textContent.includes('сохраняют разные ID'));
  await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(graph).graph)));
 }finally{await t.close();}
});

async function finishLayout(t){
  for(let i=0;i<100&&document.querySelector('.layout-progress');i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));
  assert.equal(document.querySelector('.layout-progress'),null,'calculation finished');await t.flush();
}
const currentPositions=()=>[...document.querySelectorAll('main [data-canvas-id]')].map(canvas=>[canvas.dataset.canvasId,[...canvas.querySelectorAll('[data-nid]')].map(n=>[n.dataset.nid,n.style.left,n.style.top])]);

test('sheet optimization persists positions and ordinary undo/redo restore the whole action',async()=>{
 const g=makeRoastery(),t=await mount(1366,g);
 try{
  const before=currentPositions();await t.click('Оптимизировать расположение');await finishLayout(t);
  const after=currentPositions(),saved=(await savedGraph());
  assert.notDeepEqual(after,before);assert.equal(saved.sheets[0].layout,'manual');assert.deepEqual(saved.edges,g.edges);
  assert.ok(document.querySelector('.toast').textContent.includes('Проходов через карточки'));
  await t.click('Отменить изменение');await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));assert.deepEqual(currentPositions(),before);
  await t.click('Повторить изменение');await t.flush();assert.deepEqual((await savedGraph()),saved);assert.deepEqual(currentPositions(),after);
 }finally{await t.close();}
});

test('spread optimization survives fit, side-reference toggles and reopening; undo restores all six sheets',async()=>{
 const g=makeRoastery(),t=await mount(1366,g,true);
 try{
  await t.click('Разворот');await act(async()=>document.querySelector('.composition-options button[aria-label^="6 "]').click());
  await t.click('Оптимизировать расположение');await finishLayout(t);
  const saved=(await savedGraph()),after=currentPositions();
  assert.ok(saved.sheets.slice(0,6).every(s=>s.layout==='manual'));assert.deepEqual(saved.edges,g.edges);
  assert.deepEqual(saved.nodes.map(n=>[n.id,n.sheets,n.body]),g.nodes.map(n=>[n.id,n.sheets,n.body]));
  await t.click('вписать');assert.deepEqual(currentPositions(),after);
  await act(async()=>document.querySelector('.external-toggle').click());
  await act(async()=>document.querySelector('.external-toggle').click());assert.deepEqual(currentPositions(),after);
  await t.click('Листы');await t.click('Разворот');assert.deepEqual(currentPositions(),after);
  await t.click('Отменить изменение');await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));
  await t.click('Повторить изменение');await t.flush();assert.deepEqual(currentPositions(),after);
 }finally{await t.close();}
});

test('flat optimization saves independent positions, translates its button, and undoes without editing sheets',async()=>{
 const g=makeRoastery(),t=await mount(1366,g);
 try{
  await t.click('Все на один лист');const before=currentPositions();await t.click('ENG');
  assert.ok(document.querySelector('.optimize-button').textContent.includes('Optimize layout'));
  await t.click('Optimize layout');await finishLayout(t);
  const saved=(await savedGraph()),after=currentPositions();
  assert.equal(Object.keys(saved.flatPositions).length,g.nodes.length);assert.deepEqual(saved.nodes,g.nodes);assert.notDeepEqual(after,before);
  await t.click('Sheets');await t.click('All-to-1');assert.deepEqual(currentPositions(),after);
  await t.click('Undo change');await t.flush();assert.deepEqual(currentPositions(),before);assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));
 }finally{await t.close();}
});

test('mobile optimization touches only the visible layer and keeps the toolbar reachable',async()=>{
 const g=makeRoastery(),t=await mount(390,g,true);
 try{
  await t.click('Разворот');await act(async()=>document.querySelector('.composition-options button[aria-label^="6 "]').click());
  const sid=document.querySelector('.spread-pane').dataset.sheetId,button=document.querySelector('.canvas-toolbar .optimize-button');
  assert.equal(button.disabled,false);await act(async()=>button.click());await finishLayout(t);
  const saved=(await savedGraph());assert.equal(document.querySelectorAll('.spread-pane').length,1);
  assert.equal(saved.sheets.find(s=>s.id===sid).layout,'manual');
  for(const n of saved.nodes)for(const sheet of n.sheets)if(sheet!==sid)assert.deepEqual(n.pos[sheet],g.nodes.find(v=>v.id===n.id).pos[sheet]);
  assert.equal(document.querySelector('.canvas-toolbar').closest('[inert]'),null);
  await act(async()=>document.querySelector('button[aria-label="Отменить изменение"]').click());await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));
 }finally{await t.close();}
});

test('cancel calculation makes no graph edit or history entry; empty maps disable the action',async()=>{
 const g=makeRoastery(),t=await mount(390,g);
 try{
  const original=t.w.setTimeout.bind(t.w),pending=[];
  t.w.setTimeout=(fn,ms,...args)=>ms===0?(pending.push(()=>fn(...args)),9999):original(fn,ms,...args);
  await t.click('Оптимизировать расположение');assert.ok(document.querySelector('.layout-progress'));
  await t.click('Прервать расчёт');t.w.setTimeout=original;
  await act(async()=>pending.forEach(fn=>fn()));await finishLayout(t);
  assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));
  assert.equal(document.querySelector('button[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
 const empty={...g,nodes:[],edges:[]},u=await mount(390,empty);
 try{assert.equal(document.querySelector('.optimize-button').disabled,true);}finally{await u.close();}
});

test('new empty project supports sheets, nodes and a cross-sheet relation; undo restores it',async()=>{
 const t=await mount(390);
 try{
  await t.click('Новый пустой проект');await t.field('new-project-title','Мой тестовый проект');await t.field('new-project-sheet','Требования');
  await t.click('Создать пустой проект');await t.flush();
  let g=(await savedGraph());assert.equal(g.nodes.length,0);assert.equal(g.edges.length,0);assert.equal(g.sheets.length,1);assert.ok(document.querySelector('.empty-sheet-guide'));
  await t.click('Отменить изменение');await t.flush();assert.equal((await savedGraph()).nodes.length,42);await t.click('Повторить изменение');
  await t.click('+ Узел');await t.field('add-node-name','REQ-1');await t.click('Создать узел');
  await t.click('+ Лист');await t.field('new-sheet-name','Реализация');await t.click('Создать лист');
  await t.click('+ Узел');await t.field('add-node-name','Компонент');await t.click('Создать узел');
  await t.click('+ Связь');
  // Select endpoints from the live form rather than depending on autosave timing.
  const from=document.getElementById('new-edge-from'),to=document.getElementById('new-edge-to');
  await t.field('new-edge-from',from.options[0].value);await t.field('new-edge-to',to.options[1].value);
  await t.field('new-edge-kind','depends');await t.field('new-edge-label','реализуется');await t.click('Создать связь');await t.flush();
  g=(await savedGraph());assert.equal(g.nodes.length,2);assert.equal(g.sheets.length,2);assert.equal(g.edges.length,1);assert.equal(g.edges[0].kind,'depends');assert.notEqual(g.nodes[0].sheets[0],g.nodes[1].sheets[0]);
  await t.click('Оглавление');assert.equal(document.querySelectorAll('[data-overview-sheet]').length,2);assert.equal(document.querySelectorAll('[data-overview-connection]').length,1);
 }finally{await t.close();}
});

test('all four type tabs persist a custom node type and expose it in creation and editing',async()=>{
 const t=await mount();
 try{
  await t.click('Типы');assert.equal(document.querySelectorAll('.type-tabs [role="tab"]').length,4);
  await act(async()=>document.getElementById('type-tab-nodes').click());await t.click('+ Создать тип');
  await t.field('type-label','Документ команды');await t.field('type-label-en','Team document');await t.field('type-base','rule');
  const customId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];await t.click('Сохранить типы');
  await t.click('+ Узел');assert.ok([...document.getElementById('add-node-kind').options].some(o=>o.value===customId));
  await t.field('add-node-name','Новый документ');await t.field('add-node-kind',customId);await t.click('Создать узел');await t.flush();
  const saved=(await savedGraph());assert.equal(saved.version,3);assert.equal(saved.nodes.at(-1).kind,customId);assert.equal(saved.types.nodes.at(-1).base,'rule');
  assert.equal(document.getElementById('node-kind').value,customId);assert.ok(!document.body.textContent.includes('Что-то сломалось'));
  await t.click('Типы');await act(async()=>document.getElementById('type-tab-nodes').click());await act(async()=>[...document.querySelectorAll('.type-list button')].find(b=>b.textContent.includes('Документ команды')).click());
  assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Удалить').disabled,true);
  await t.click('Отмена');await t.click('ENG');await t.click('+ Node');assert.ok(document.getElementById('add-node-kind').textContent.includes('Team document'));
 }finally{await t.close();}
});

test('native and draw.io inputs are separate; draw.io preview can be cancelled or appended and undone',async()=>{
 const t=await mount(390);globalThis.DOMParser=t.w.DOMParser;
 try{
  const native=document.querySelector('[data-import="native"]'),drawio=document.querySelector('[data-import="drawio"]');
  assert.ok(native.accept.includes('.plyloom'));assert.equal(native.multiple,false);assert.ok(drawio.accept.includes('.drawio'));assert.equal(drawio.multiple,true);
  const source='<mxfile><diagram name="Imported sheet"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Imported node" vertex="1" parent="1"><mxGeometry x="20" y="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
  Object.defineProperty(drawio,'files',{value:[{name:'example.drawio',size:source.length,text:async()=>source}]});
  const send=()=>act(async()=>drawio.dispatchEvent(new t.w.Event('change',{bubbles:true})));
  await send();assert.ok(document.querySelector('.import-summary'));assert.equal(document.querySelectorAll('[data-nid="blend"]').length>0,true);
  await t.click('Отмена');assert.equal(document.querySelector('[role="dialog"]'),null);
  await send();await t.click('Добавить листы');await t.flush();
  const saved=(await savedGraph());assert.equal(saved.nodes.length,43);assert.equal(saved.sheets.length,8);assert.equal(saved.nodes.at(-1).name,'Imported node');
  await t.click('Отменить изменение');await t.flush();assert.deepEqual((await savedGraph()),makeRoastery());
 }finally{await t.close();}
});

test('a map left under the pre-0.7.0-rc.7 storage keys still opens and is saved under the new ones',async()=>{
 const g=makeRoastery();
 const t=await mount(1366,null,false,{'atlas.graph.v2':JSON.stringify(g),'atlas.language':'en'});
 try{
  assert.equal(document.querySelector('.workspace-titlebar h1').textContent,'Small Coffee Roastery','the old map and the old language are read');
  assert.equal(document.documentElement.lang,'en');
  await t.click('+ Узел'.replace('+ Узел','+ Node'));await t.field('add-node-name','Migrated');await t.click('Create node');await t.flush();
  assert.equal((await savedGraph()).nodes.at(-1).name,'Migrated','new work is written under the new key');
  assert.equal(localStorage.getItem('plyloom.language'),'en');
  assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).nodes.length,g.nodes.length,'the old key is left untouched, not silently rewritten');
 }finally{await t.close();}
});

test('the filter panel hides relation types, keeps the remaining geometry and the saved project',async()=>{
 const g=makeRoastery(),t=await mount(390,g);
 try{
  const kindIds=[...new Set(g.edges.filter(e=>e.kind==='depends').map(e=>e.id))];
  // Local edges use the edge ID; references outside the sheet append "<otherNodeId>:<side>".
  const ofKind=id=>kindIds.some(k=>id===k||(id.startsWith(k)&&/^[^\d].*:(left|right)$/.test(id.slice(k.length))));
  const paths=()=>[...document.querySelectorAll('[data-edge-id]')].map(el=>[el.dataset.edgeId,el.querySelector('path')?.getAttribute('d')]);
  const before=paths();assert.ok(before.length>0);assert.ok(before.some(([id])=>ofKind(id)));
  assert.equal(document.querySelector('[data-filter-status]'),null);
  await t.click('Показ');assert.ok(document.querySelector('[role="dialog"]').textContent.includes('Золотая линия'));
  await t.click('Открыть фильтр');assert.equal(document.querySelector('[role="dialog"]'),null);assert.ok(document.querySelector('[data-filter-panel]'));
  await tick('input[data-filter-edge-type="depends"]');await t.click('Свернуть фильтр');
  const after=paths();
  assert.ok(after.length>0);assert.ok(after.every(([id])=>!ofKind(id)),'hidden relations are not rendered');
  assert.deepEqual(after,before.filter(([id])=>!ofKind(id)),'remaining relations keep their geometry');
  const status=document.querySelector('[data-filter-status]');assert.ok(status);assert.ok(status.textContent.includes('скрыто связей'));
  assert.equal(document.querySelector('[data-action="filter"] .toolbar-count').textContent,'1');
  assert.equal(document.querySelector('[data-line-kind="local"] path[stroke-dasharray]'),null);
  await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));
  await t.click('Показать всё');
  assert.deepEqual(paths(),before);assert.equal(document.querySelector('[data-filter-status]'),null);
 }finally{await t.close();}
});

test('mobile contents defaults to a portrait diagram with sheets, relations and shared identities',async()=>{
 const t=await mount(390,makeSoftwareDemo());
 try{
  await t.click('Оглавление');assert.equal(document.querySelector('.project-overview').dataset.overviewLayout,'mobile');
  const svg=document.querySelector('.sheet-overview-svg');assert.ok(svg);assert.equal(svg.getAttribute('viewBox').split(' ')[2],'390');
  assert.equal(svg.querySelectorAll('[data-overview-sheet]').length,8);assert.ok(svg.querySelectorAll('[data-overview-connection]').length>0);
  assert.ok(svg.querySelector('path[stroke="#b78425"]'));await t.click('Список');assert.equal(document.querySelector('.sheet-overview-svg'),null);
  await t.click('Схема');assert.equal(document.querySelectorAll('[data-overview-sheet]').length,8);
 }finally{await t.close();}
});

test('sheet dictionaries follow tags, types, sheets order and save one type with multiple tags atomically',async()=>{
 const t=await mount();try{
  await t.click('Типы');assert.deepEqual([...document.querySelectorAll('[data-catalog]')].map(el=>el.dataset.catalog),['tags','sheet-types','sheets']);
  await t.click('+ Добавить тег');await t.field('type-label','Команда A');
  const tagId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];
  await act(async()=>document.querySelector('[data-catalog="sheet-types"] header button').click());await t.field('type-label','Архитектура');
  const typeId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];
  await t.field('catalog-sheet-type',typeId);
  await act(async()=>{const checks=document.querySelectorAll('.catalog-sheet-editor .tag-choices input');checks[0].click();});
  await act(async()=>[...document.querySelectorAll('.catalog-sheet-editor .tag-choices label')].find(l=>l.textContent==='Команда A').querySelector('input').click());
  await t.click('+ Добавить лист');await t.field('catalog-sheet-name','Новый слой');
  assert.equal(document.querySelectorAll('[aria-label*="Доступные"]').length,0);
  await t.click('Сохранить типы');await t.flush();const g=(await savedGraph());
  assert.equal(g.sheets.length,8);assert.equal(g.sheets[0].typeId,typeId);assert.deepEqual(g.sheets[0].tags,['draft',tagId]);assert.equal(g.sheets.at(-1).name,'Новый слой');assert.deepEqual(loadGraph(g).errors,[]);
 }finally{await t.close();}
});

test('attribute creation and inline editing are shared across appearances and undoable',async()=>{
 const t=await mount();try{
  await t.click('Типы');await act(async()=>document.getElementById('type-tab-attributes').click());await t.click('+ Создать атрибут');
  await t.field('type-label','Стоимость');await t.field('attribute-data-type','number');
  const attributeId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];await t.click('Сохранить типы');
  await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());
  const add=document.querySelector('[data-nid="blend"] .attribute-add');await act(async()=>{add.value=attributeId;add.dispatchEvent(new t.w.Event('change',{bubbles:true}));});
  const input=document.querySelector('[data-nid="blend"] .attribute-field input[type="number"]');await t.field(input.id,'123.5');await t.flush();
  let saved=(await savedGraph());assert.equal(saved.nodes.find(n=>n.id==='blend').attributes[attributeId],123.5);
  await t.click('Разворот');const appearances=document.querySelectorAll('[data-nid="blend"] .attribute-field input[type="number"]');assert.equal(appearances.length,2);assert.ok([...appearances].every(input=>input.value==='123.5'));
  await t.click('Отменить изменение');await t.flush();saved=(await savedGraph());assert.equal(saved.nodes.find(n=>n.id==='blend').attributes?.[attributeId],undefined);
  await t.click('Повторить изменение');await t.flush();assert.ok([...document.querySelectorAll('[data-nid="blend"] .attribute-field input[type="number"]')].every(input=>input.value==='123.5'));
 }finally{await t.close();}
});

test('stack renders more than ten nodes in both modes and optimizes without changing sheet positions',async()=>{
 const g=emptyProject();g.nodes=Array.from({length:36},(_,i)=>({id:`n${i}`,name:`Node ${i}`,body:'',kind:'entity',sheets:['main'],pos:{main:{x:(i%6)*250,y:Math.floor(i/6)*100}}}));g.edges=g.nodes.slice(1).map((n,i)=>({id:`e${i}`,from:`n${i}`,to:n.id,kind:'depends'}));
 const t=await mount(1366,g);try{
  await t.click('Стопка');await t.click('Построчно');assert.equal(document.querySelectorAll('[data-stack-node]').length,36);assert.equal(document.querySelectorAll('[data-stack-edge]').length,35);
  await t.click('Узлы и связи');assert.equal(document.querySelectorAll('[data-stack-node]').length,36);
  await t.click('Оптимизировать расположение');for(let i=0;i<100&&!document.body.textContent.includes('Вернуть расположение');i++)await act(async()=>new Promise(r=>setTimeout(r,20)));
  assert.ok(document.body.textContent.includes('Вернуть расположение'));await t.flush();assert.deepEqual((await savedGraph()),g);
  await t.click('Вернуть расположение');await t.click('Построчно');assert.equal(document.querySelectorAll('[data-stack-node]').length,36);
 }finally{await t.close();}
});

test('imported figures render their dimensions and semantic shapes without decorative glyph controls',async()=>{
 const g=parseCanvas(JSON.stringify({nodes:[{id:'text',type:'text',text:'A\nFull text',x:17,y:29,width:330,height:170}],edges:[]})).graph;
 const t=await mount(1366,g);try{
  const card=document.querySelector('[data-nid="text"]');assert.equal(card.style.width,'330px');assert.equal(card.style.left,'17px');assert.equal(card.style.top,'29px');assert.ok(card.querySelector('svg.notation-shape'));assert.ok(card.textContent.includes('Full text'));
  await t.click('Типы');await act(async()=>document.getElementById('type-tab-nodes').click());assert.equal(document.getElementById('type-glyph'),null);
  await act(async()=>document.getElementById('type-tab-edges').click());assert.equal(document.getElementById('type-color'),null);assert.equal(document.getElementById('type-dash'),null);
 }finally{await t.close();}
});

async function pointer(t,el,type,x,y,id=1,pointerType='mouse'){
 assert.ok(el,`pointer target for ${type}`);const event=new t.w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType}});await act(async()=>el.dispatchEvent(event));
}
// Filter panel helpers (S3). The panel opens from the toolbar and collapses into the status bar.
const openFilter=async()=>{if(!document.querySelector('[data-filter-panel]'))await act(async()=>document.querySelector('[data-action="filter"]').click());assert.ok(document.querySelector('[data-filter-panel]'),'filter panel');};
const tick=async(selector)=>{const el=document.querySelector(selector);assert.ok(el,selector);await act(async()=>el.click());};
const setInput=async(w,el,value)=>{assert.ok(el,'input');await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
const attributeFixture=()=>{
 const g=emptyProject('Attributes','Main');
 g.types.attributes=[{id:'age',label:'Возраст',dataType:'number'},{id:'house',label:'Дом',dataType:'select',options:['Ростовы','Болконские','Безуховы']},{id:'alive',label:'Жив',dataType:'boolean'},{id:'born',label:'Родился',dataType:'date'},{id:'note',label:'Заметка',dataType:'text'}];
 const row=(id,name,attributes,x)=>({id,name,body:'',kind:'person',sheets:['main'],pos:{main:{x,y:100+(x%500)/5}},...(attributes?{attributes}:{})});
 g.nodes=[row('natasha','Наташа',{age:13,house:'Ростовы',alive:true,born:'1792-08-26',note:'Первый бал'},0),row('nikolai','Николай',{age:20,house:'Ростовы',alive:true,born:'1785-01-01',note:null},250),row('andrei','Андрей',{age:31,house:'Болконские',alive:false,born:'1775-03-10'},500),row('pierre','Пьер',{age:20,house:'Безуховы',alive:true,born:null},750),row('platon','Платон',undefined,1000),row('marya','Марья',{age:null,house:null},1250)];
 g.edges=[{id:'e1',from:'natasha',to:'andrei',kind:'depends'},{id:'e2',from:'pierre',to:'natasha',kind:'ref'},{id:'e3',from:'nikolai',to:'marya',kind:'ref'}];return g;
};
const overviewFixture=()=>{
 const g=emptyProject('Overview test','First');g.sheets.push({...g.sheets[0],id:'second',name:'Second'});
 g.nodes=[{id:'shared',name:'Shared entity',body:'Shared text',kind:'entity',sheets:['main','second'],pos:{main:{x:80,y:100},second:{x:110,y:80}}},{id:'a',name:'A',body:'',kind:'entity',sheets:['main'],pos:{main:{x:400,y:180}}},{id:'b',name:'B',body:'',kind:'process',sheets:['second'],pos:{second:{x:410,y:180}}}];
 g.edges=[{id:'local',from:'shared',to:'a',kind:'depends'},{id:'cross',from:'a',to:'b',kind:'ref'}];return g;
};

test('canvas has two levels, preserves overview camera through +/− and leaves spread as a separate view',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  assert.ok([...document.querySelectorAll('.workspace-view-tabs button')].some(b=>b.textContent==='Листы'));
  await t.click('Выйти к обзору листов');assert.equal(document.querySelectorAll('[data-board-sheet]').length,2);assert.equal(document.querySelectorAll('[data-overview-open]').length,2);assert.equal(document.querySelector('.spread-pane'),null);
  assert.equal(document.querySelectorAll('[data-overview-node="shared"]').length,2);assert.ok(document.querySelector('[data-overview-identity="shared"]'));assert.ok(document.querySelector('[data-overview-edge="cross"][stroke-dasharray]'));assert.equal(document.querySelector('[data-line-kind="local"] path[stroke-dasharray]'),null);
  await t.click('Увеличить обзор');const before=[document.querySelector('.overview-viewport').dataset.overviewZoom,document.querySelector('.overview-viewport').dataset.overviewX,document.querySelector('.overview-viewport').dataset.overviewY];
  await t.click('Редактировать лист Second');assert.equal(document.querySelector('main [data-canvas-id]').dataset.canvasId,'second');await t.click('Выйти к обзору листов');
  assert.deepEqual([document.querySelector('.overview-viewport').dataset.overviewZoom,document.querySelector('.overview-viewport').dataset.overviewX,document.querySelector('.overview-viewport').dataset.overviewY],before);
  await t.click('Разворот');assert.equal(document.querySelectorAll('.spread-pane').length,2);assert.equal(document.querySelector('.overview-viewport'),null);
  await t.flush();assert.deepEqual((await savedGraph()),g);
 }finally{await t.close();}
});

test('overview header drag moves a whole sheet in one undo action and keeps all node coordinates',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport'),k=Number(surface.dataset.overviewZoom),start=overviewPositions(g).get('main');
  await pointer(t,document.querySelector('[data-overview-handle="main"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',100+70*k,100+40*k);
  assert.deepEqual((await savedGraph()),g,'drag preview does not save partial positions');
  await pointer(t,surface,'pointerup',100+70*k,100+40*k);await t.flush();const saved=(await savedGraph());
  assert.deepEqual(saved.sheets[0].overviewPos,{x:start.x+70,y:start.y+40});assert.deepEqual(saved.nodes,g.nodes);assert.deepEqual(saved.sheets[1].overviewPos,overviewPositions(g).get('second'));
  await t.click('Отменить изменение');await t.flush();assert.equal((await savedGraph()).sheets[0].overviewPos,undefined);
  await t.click('Повторить изменение');await t.flush();assert.deepEqual((await savedGraph()).sheets[0].overviewPos,saved.sheets[0].overviewPos);
 }finally{await t.close();}
});

test('overview node drag respects both zoom levels and edits only the selected appearance',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const node=document.querySelector('[data-board-sheet="main"] [data-overview-node="shared"]'),surface=document.querySelector('.overview-viewport'),scale=Number(surface.dataset.overviewZoom)*Number(node.dataset.contentScale);
  await pointer(t,node,'pointerdown',100,100);await pointer(t,surface,'pointermove',100+30*scale,100+20*scale);await pointer(t,surface,'pointerup',100+30*scale,100+20*scale);await t.flush();const saved=(await savedGraph());
  assert.deepEqual(saved.nodes[0].pos.main,{x:110,y:120});assert.deepEqual(saved.nodes[0].pos.second,g.nodes[0].pos.second);assert.deepEqual(saved.nodes[0].sheets,g.nodes[0].sheets);assert.deepEqual(saved.sheets.map(s=>s.overviewPos),[undefined,undefined]);assert.equal(saved.nodes.length,3);
  await t.click('Редактировать лист First');assert.equal(document.querySelector('[data-nid="shared"]').style.left,'110px');assert.equal(document.querySelector('[data-nid="shared"]').style.top,'120px');
  await t.click('Отменить изменение');await t.flush();assert.deepEqual((await savedGraph()).nodes[0].pos,g.nodes[0].pos);
 }finally{await t.close();}
});

test('dragging outside a sheet clamps the node and never transfers its memberships',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport'),node=document.querySelector('[data-board-sheet="main"] [data-overview-node="shared"]');
  await pointer(t,node,'pointerdown',100,100);await pointer(t,surface,'pointermove',100000,100000);await pointer(t,surface,'pointerup',100000,100000);await t.flush();const saved=(await savedGraph());
  const content=overviewContent(g.nodes.filter(n=>n.sheets.includes('main')),'main');assert.deepEqual(saved.nodes[0].pos.main,clampOverviewNode({x:1e7,y:1e7},g.nodes[0],'main',content));assert.deepEqual(saved.nodes.map(n=>n.sheets),g.nodes.map(n=>n.sheets));assert.deepEqual(saved.nodes[0].pos.second,g.nodes[0].pos.second);
 }finally{await t.close();}
});

test('overview pointer cancellation and Escape discard sheet/node previews',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport');
  await pointer(t,document.querySelector('[data-overview-handle="main"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',200,140);await pointer(t,surface,'pointercancel',200,140);
  await pointer(t,document.querySelector('[data-board-sheet="main"] [data-overview-node="shared"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',150,150);await act(async()=>surface.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await pointer(t,surface,'pointerup',150,150);
  await pointer(t,document.querySelector('[data-overview-handle="main"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',200,140);await pointer(t,surface,'lostpointercapture',200,140);await pointer(t,surface,'pointerup',200,140);
  await t.flush();assert.deepEqual((await savedGraph()),g);assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});

test('touch pinch cancels a pending node drag and changes only the overview camera',async()=>{
 const g=overviewFixture(),t=await mount(390,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport'),k=Number(surface.dataset.overviewZoom);
  await pointer(t,document.querySelector('[data-overview-node="shared"]'),'pointerdown',100,100,1,'touch');await pointer(t,surface,'pointermove',110,100,1,'touch');
  await pointer(t,surface,'pointerdown',210,100,2,'touch');await pointer(t,surface,'pointermove',310,100,2,'touch');assert.ok(Number(surface.dataset.overviewZoom)>k*1.9);
  await pointer(t,surface,'pointerup',310,100,2,'touch');await pointer(t,surface,'pointerup',110,100,1,'touch');await t.flush();assert.deepEqual((await savedGraph()),g);
 }finally{await t.close();}
});

test('overview filters hide paths and keyboard movement preserves unrelated coordinates',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const paths=()=>[...document.querySelectorAll('[data-overview-edge]')].map(el=>[el.dataset.overviewEdge,el.getAttribute('d')??el.querySelector('path').getAttribute('d')]),before=paths();
  assert.ok(document.querySelector('[data-overview-edge="local"]'));
  await openFilter();await tick('input[data-filter-edge-type="depends"]');await t.click('Свернуть фильтр');
  assert.equal(document.querySelector('[data-overview-edge="local"]'),null);assert.deepEqual(paths(),before.filter(([id])=>id!=='local'));
  assert.equal(document.querySelectorAll('[data-overview-node="shared"]').length,2,'nodes stay when only a relation type is hidden');
  await act(async()=>document.querySelector('[data-overview-handle="second"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})));await t.flush();const saved=(await savedGraph());assert.equal(saved.sheets[1].overviewPos.y,overviewPositions(g).get('second').y+50);assert.deepEqual(saved.nodes,g.nodes);
 }finally{await t.close();}
});

test('empty sheets have a + entry point and All-to-1 is editable with independent positions',async()=>{
 const empty=emptyProject('Empty','Blank'),first=await mount(390,empty);try{
  await first.click('Выйти к обзору листов');assert.equal(document.querySelectorAll('[data-board-sheet]').length,1);await first.click('Редактировать лист Blank');assert.ok(document.querySelector('.empty-sheet-guide'));
 }finally{await first.close();}
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Все на один лист');assert.equal(document.querySelectorAll('main [data-nid="shared"]').length,1);assert.ok(document.querySelector('.all-to-one-note').textContent.includes('Каждая сущность один раз'));
  await act(async()=>document.querySelector('main [data-nid="shared"] .node-expand-button').click());const input=document.querySelector('[data-node-body-editor="shared"]');await t.field(input.id,'Edited in All-to-1');await t.flush();const saved=(await savedGraph());assert.equal(saved.nodes[0].body,'Edited in All-to-1');assert.deepEqual(saved.nodes[0].pos,g.nodes[0].pos);assert.deepEqual(saved.nodes[0].sheets,g.nodes[0].sheets);
  await t.click('ENG');assert.ok([...document.querySelectorAll('.workspace-view-tabs button')].some(b=>b.textContent==='All-to-1'));assert.ok([...document.querySelectorAll('.workspace-view-tabs button')].some(b=>b.textContent==='Sheets'));
 }finally{await t.close();}
});


test('bulk filter controls include custom types, stay independent and only hide existing objects',async()=>{
 const g=overviewFixture();g.types.nodes.push({id:'custom-node',label:'Custom node',base:'entity',color:'#475569'});g.types.edges.push({id:'custom-relation',label:'Custom relation',color:'#475569'});g.nodes[1].kind='custom-node';g.edges[0].kind='custom-relation';
 const t=await mount(1366,g);try{
  const geometry=()=>[...document.querySelectorAll('main [data-edge-id]')].map(el=>[el.dataset.edgeId,el.querySelector('path')?.getAttribute('d')]);
  const before=geometry(),nodeCount=document.querySelectorAll('main [data-nid]').length;assert.ok(nodeCount>0);assert.ok(before.length>0);
  await openFilter();
  assert.ok(document.querySelector('input[data-filter-type="custom-node"]'),'custom node type is listed');assert.ok(document.querySelector('input[data-filter-edge-type="custom-relation"]'),'custom relation type is listed');
  assert.equal(document.querySelector('input[data-filter-type="risk"]'),null,'types without objects are not listed');
  const checks=group=>[...document.querySelectorAll(`[data-filter-group="${group}"] input`)];
  await t.click('Выключить все типы узлов');assert.ok(checks('nodes').every(el=>!el.checked));assert.ok(checks('edges').every(el=>el.checked));
  assert.equal(document.querySelectorAll('main [data-nid]').length,0,'every card is hidden');
  assert.equal(document.querySelectorAll('main [data-edge-id]').length,0,'relations of hidden nodes are hidden too');
  assert.equal(document.querySelectorAll('main .external-reference').length,0,'references to hidden nodes are hidden');
  await t.click('Выключить все типы связей');assert.ok(checks('edges').every(el=>!el.checked));
  await t.click('Выбрать все типы узлов');assert.ok(checks('nodes').every(el=>el.checked));assert.ok(checks('edges').every(el=>!el.checked));
  assert.equal(document.querySelectorAll('main [data-nid]').length,nodeCount);
  assert.equal(document.querySelectorAll('main [data-edge-id]').length,0);
  assert.equal(document.querySelectorAll('main .external-reference').length,0,'a reference with no visible relation is hidden');
  await t.click('Выбрать все типы связей');assert.ok(checks('edges').every(el=>el.checked));await t.click('Свернуть фильтр');
  assert.equal(document.querySelector('[data-filter-status]'),null);
  assert.deepEqual(geometry(),before);assert.equal(document.querySelectorAll('main [data-nid]').length,nodeCount);
  await t.flush();assert.deepEqual((await savedGraph()),JSON.parse(JSON.stringify(loadGraph(g).graph)));assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});

test('the filter status counts hidden objects, every view hides them and Show all restores them',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  assert.ok(document.querySelector('main [data-external-node="b"]'),'reference to B is shown before filtering');
  await openFilter();await tick('input[data-filter-type="process"]');await t.click('Свернуть фильтр');
  const status=document.querySelector('[data-filter-status]');assert.ok(status);
  assert.ok(status.textContent.includes('показано 2 из 3 узлов'),status.textContent);assert.ok(status.textContent.includes('скрыто связей: 1'),status.textContent);assert.ok(status.textContent.includes('на листе: 2/2'),status.textContent);
  assert.equal(document.querySelector('main [data-external-node="b"]'),null,'reference outside the sheet follows the filter');
  await t.click('Выйти к обзору листов');
  assert.equal(document.querySelector('[data-overview-node="b"]'),null);assert.equal(document.querySelector('[data-overview-edge="cross"]'),null);
  assert.ok(document.querySelector('[data-overview-node="a"]'));assert.ok(document.querySelector('[data-overview-identity="shared"]'));
  await t.click('Стопка');assert.equal(document.querySelector('[data-stack-node="b"]'),null);assert.ok(document.querySelector('[data-stack-node="a"]'));
  await t.click('Показать всё');assert.equal(document.querySelector('[data-filter-status]'),null);assert.ok(document.querySelector('[data-stack-node="b"]'));
  await t.flush();assert.deepEqual((await savedGraph()),g);
 }finally{await t.close();}
});

test('a node opened or created outside the filter stays visible until the filter changes',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await openFilter();await tick('input[data-filter-type="entity"]');await t.click('Свернуть фильтр');
  assert.equal(document.querySelector('main [data-nid="a"]'),null);assert.equal(document.querySelector('main [data-nid="shared"]'),null);assert.ok(document.querySelector('[data-filter-status]'));
  await t.click('Читать лист');const link=[...document.querySelectorAll('.reader-list button')].find(b=>b.textContent.trim()==='A');assert.ok(link,'reader list still lists hidden nodes');
  await act(async()=>link.click());
  assert.ok(document.querySelector('main [data-nid="a"]'),'the opened node is visible');assert.equal(document.querySelector('main [data-nid="shared"]'),null,'other nodes of the type stay hidden');
  const status=document.querySelector('[data-filter-status]');assert.ok(status,'the filter itself is kept');assert.ok(status.textContent.includes('вне фильтра оставлено: 1'),status.textContent);
  assert.ok(document.querySelector('[role="status"].toast').textContent.includes('пока фильтр не изменится'));
  await openFilter();await tick('input[data-filter-edge-type="ref"]');await tick('input[data-filter-edge-type="ref"]');await t.click('Свернуть фильтр');
  assert.equal(document.querySelector('main [data-nid="a"]'),null,'any change of the filter drops kept nodes');
  const count=document.querySelectorAll('main [data-nid]').length;
  await t.click('+ Узел');await t.field('add-node-name','Fresh');await t.field('add-node-kind','entity');await t.click('Создать узел');await t.flush();
  const fresh=(await savedGraph()).nodes.find(n=>n.name==='Fresh');assert.ok(fresh);
  assert.ok(document.querySelector(`main [data-nid="${fresh.id}"]`),'the new node is visible');assert.equal(document.querySelectorAll('main [data-nid]').length,count+1);
  assert.ok(document.querySelector('[data-filter-status]'),'creating a node does not reset the filter');
 }finally{await t.close();}
});

test('attribute conditions: AND between attributes, OR inside one, empty and missing values are separate states',async()=>{
 const g=attributeFixture(),t=await mount(1366,g);try{
  const shown=()=>[...document.querySelectorAll('main [data-nid]')].map(el=>el.dataset.nid).sort();
  const within=(id,sel)=>document.querySelector(`[data-filter-attribute="${id}"] ${sel}`);
  const add=async(id)=>{await setInput(t.w,document.querySelector('[data-filter-add-attribute]'),id);assert.ok(document.querySelector(`[data-filter-attribute="${id}"]`),id);};
  assert.equal(shown().length,6);await openFilter();
  await add('house');assert.equal(shown().length,6,'an empty condition does not filter');assert.ok(document.querySelector('[data-filter-attribute="house"]').textContent.includes('не фильтрует'));
  assert.equal(within('house','[data-filter-value="Ростовы"]').closest('label').querySelector('small').textContent,'2');
  assert.equal(within('house','[data-filter-unset]').closest('label').querySelector('small').textContent,'1');assert.equal(within('house','[data-filter-missing]').closest('label').querySelector('small').textContent,'1');
  await tick('[data-filter-attribute="house"] [data-filter-value="Ростовы"]');assert.deepEqual(shown(),['natasha','nikolai']);
  await tick('[data-filter-attribute="house"] [data-filter-value="Безуховы"]');assert.deepEqual(shown(),['natasha','nikolai','pierre'],'options of one attribute are OR');
  await add('age');await setInput(t.w,within('age','[data-filter-min]'),'18');assert.deepEqual(shown(),['nikolai','pierre'],'different attributes are AND');
  await tick('[data-filter-attribute="house"] [data-filter-unset]');assert.deepEqual(shown(),['nikolai','pierre'],'Marya has an empty house, but also an empty age');
  await tick('[data-filter-attribute="age"] [data-filter-unset]');assert.deepEqual(shown(),['marya','nikolai','pierre']);
  await tick('[data-filter-attribute="age"] [data-filter-missing]');assert.deepEqual(shown(),['marya','nikolai','pierre'],'Platon has no house attribute either');
  await tick('[data-filter-attribute="house"] [data-filter-missing]');assert.deepEqual(shown(),['marya','nikolai','pierre','platon']);
  assert.equal(document.querySelector('[data-action="filter"] .toolbar-count').textContent,'2');
  await t.click('Убрать условие Дом');await t.click('Убрать условие Возраст');assert.equal(shown().length,6);
  await add('born');await setInput(t.w,within('born','[data-filter-min]'),'1780-01-01');await setInput(t.w,within('born','[data-filter-max]'),'1790-12-31');assert.deepEqual(shown(),['nikolai']);
  await t.click('Убрать условие Родился');await add('alive');await tick('[data-filter-attribute="alive"] [data-filter-value="false"]');assert.deepEqual(shown(),['andrei']);
  await t.click('Убрать условие Жив');await add('note');await setInput(t.w,within('note','[data-filter-text]'),'БАЛ');assert.deepEqual(shown(),['natasha'],'text contains, case-insensitive');
  assert.equal(document.querySelectorAll('main [data-edge-id]').length,0,'relations to hidden nodes are hidden');
  assert.ok(document.querySelector('[data-filter-panel] [data-filter-status]').textContent.includes('показано 1 из 6 узлов'));
  await t.flush();assert.deepEqual((await savedGraph()),g,'the filter never changes the saved project');
  // Editing the visible node so that it no longer matches keeps it on screen.
  await t.click('Свернуть фильтр');await act(async()=>document.querySelector('main [data-nid="natasha"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const noteField=[...document.querySelectorAll('aside .attribute-field')].find(f=>f.querySelector('label').textContent.startsWith('Заметка'));assert.ok(noteField,'note field in the inspector');
  await setInput(t.w,noteField.querySelector('input'),'Сад');await t.flush();
  assert.equal((await savedGraph()).nodes.find(n=>n.id==='natasha').attributes.note,'Сад');
  assert.deepEqual(shown(),['natasha'],'the edited node stays');assert.ok(document.querySelector('[data-filter-status]').textContent.includes('вне фильтра оставлено: 1'));
  await t.click('Показать всё');assert.equal(shown().length,6);assert.equal(document.querySelector('[data-filter-status]'),null);
 }finally{await t.close();}
});

const multiFixture=()=>{
 const g=emptyProject('Multi','Главный');
 g.sheets=[{...g.sheets[0],id:'main',name:'Главный',tags:['draft']},{...g.sheets[0],id:'war',name:'Война',tags:['review']}];
 g.types.attributes=[{id:'interests',label:'Интересы',dataType:'multi',options:['рисование','музыка','спорт']}];
 const row=(id,name,body,attributes,tags,sheets,x)=>({id,name,body,kind:'person',sheets,pos:Object.fromEntries(sheets.map(s=>[s,{x,y:120}])),...(attributes?{attributes}:{}),...(tags?{tags}:{})});
 g.nodes=[
  row('anna','Анна','любит гулять',{interests:['рисование','музыка']},['юность'],['main'],0),
  row('boris','Борис','',{interests:['рисование','спорт']},undefined,['main'],250),
  row('vera','Вера','',{interests:['спорт']},undefined,['war'],0),
  row('gleb','Глеб','рисование в тексте',{interests:[]},undefined,['main'],500),
  row('dina','Дина','',{},undefined,['main'],750),
 ];
 g.edges=[];return g;
};

test('multiple choice: checkboxes on the card, any of or all selected in the filter',async()=>{
 const g=multiFixture(),t=await mount(1366,g);try{
  const shown=()=>[...document.querySelectorAll('main [data-nid]')].map(el=>el.dataset.nid).sort();
  const within=(sel)=>document.querySelector(`[data-filter-attribute="interests"] ${sel}`);
  // The card editor offers a checkbox per option and stores the list of chosen ones.
  await act(async()=>document.querySelector('[data-nid="gleb"] .node-expand-button').click());
  const box=document.querySelector('[data-nid="gleb"] [data-attribute-option="музыка"]');assert.ok(box,'a checkbox per option');
  assert.equal(document.querySelector('[data-nid="gleb"] select.attribute-add'),null,'the attribute is already attached');
  await act(async()=>box.click());await t.flush();
  let saved=(await savedGraph());
  assert.deepEqual(saved.nodes.find(n=>n.id==='gleb').attributes.interests,['музыка']);
  await act(async()=>document.querySelector('[data-nid="gleb"] [data-attribute-option="спорт"]').click());await t.flush();
  saved=(await savedGraph());
  assert.deepEqual(saved.nodes.find(n=>n.id==='gleb').attributes.interests,['музыка','спорт'],'options keep the dictionary order');
  await act(async()=>document.querySelector('[data-nid="gleb"] [data-attribute-option="музыка"]').click());await t.flush();
  saved=(await savedGraph());
  assert.deepEqual(saved.nodes.find(n=>n.id==='gleb').attributes.interests,['спорт'],'a second click removes the option');
  await t.click('Отменить изменение');await t.click('Отменить изменение');await t.click('Отменить изменение');await t.flush();
  assert.deepEqual((await savedGraph()).nodes.find(n=>n.id==='gleb').attributes.interests,[]);
  // The condition: any of the checked options, or every one of them.
  await openFilter();
  await setInput(t.w,document.querySelector('[data-filter-add-attribute]'),'interests');
  assert.equal(within('[data-filter-value="рисование"]').closest('label').querySelector('small').textContent,'2','each option is counted separately');
  assert.equal(within('[data-filter-unset]').closest('label').querySelector('small').textContent,'1','an empty list counts as not set');
  assert.equal(within('[data-filter-missing]').closest('label').querySelector('small').textContent,'1');
  await tick('[data-filter-attribute="interests"] [data-filter-value="рисование"]');
  await tick('[data-filter-attribute="interests"] [data-filter-value="спорт"]');
  assert.deepEqual(shown(),['anna','boris'],'any of: one checked option is enough');
  assert.equal(within('[data-filter-all="any"]').getAttribute('aria-pressed'),'true','any of is the default');
  await tick('[data-filter-attribute="interests"] [data-filter-all="all"]');
  assert.equal(within('[data-filter-all="all"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(shown(),['boris'],'all selected: the node needs every checked option');
  await tick('[data-filter-attribute="interests"] [data-filter-all="any"]');assert.deepEqual(shown(),['anna','boris']);
  await tick('[data-filter-attribute="interests"] [data-filter-unset]');assert.deepEqual(shown(),['anna','boris','gleb']);
  assert.equal(document.querySelector('[data-action="filter"] .toolbar-count').textContent,'1');
  await t.click('Показать всё');assert.deepEqual(shown(),['anna','boris','dina','gleb']);
 }finally{await t.close();}
});

test('the search line filters by name, body, tag, sheet and attribute values; words are joined by AND',async()=>{
 const g=multiFixture(),t=await mount(1366,g);try{
  const shown=()=>[...document.querySelectorAll('main [data-nid]')].map(el=>el.dataset.nid).sort();
  const status=()=>document.querySelector('[data-filter-status]')?.textContent??'';
  const field=(id)=>document.querySelector(`[data-filter-field="${id}"]`);
  const search=async(text)=>await setInput(t.w,document.querySelector('[data-filter-search]'),text);
  await openFilter();
  assert.ok(['name','body','tags','sheet','attrs'].every(id=>field(id)?.checked),'every area is on by default');
  await search('анна');assert.deepEqual(shown(),['anna']);
  assert.ok(status().includes('1 из 5'),'the status counts the whole project');
  assert.equal(document.querySelector('[data-action="filter"] .toolbar-count').textContent,'1','the search is one condition');
  await search('гулять');assert.deepEqual(shown(),['anna'],'the body is searched too');
  await act(async()=>field('body').click());assert.deepEqual(shown(),[],'narrowing the areas narrows the result');
  await act(async()=>field('body').click());assert.deepEqual(shown(),['anna']);
  await search('юность');assert.deepEqual(shown(),['anna'],'node tags are searched');
  await search('рисование');assert.deepEqual(shown(),['anna','boris','gleb'],'attribute values and the body both match');
  await act(async()=>field('attrs').click());assert.deepEqual(shown(),['gleb'],'without the attribute area only the body matches');
  await act(async()=>field('attrs').click());
  await search('война');assert.deepEqual(shown(),[],'Vera sits on the other sheet');
  assert.ok(status().includes('1 из 5'),'the sheet name matches through the sheet a node sits on');
  await search('на проверке');assert.ok(status().includes('1 из 5'),'sheet tags are searched by name');
  await search('главный');assert.deepEqual(shown(),['anna','boris','dina','gleb']);
  // Several words: every one of them has to be found, any checked area will do.
  await search('анна гулять');assert.deepEqual(shown(),['anna'],'name and body together');
  await search('рисование главный');assert.deepEqual(shown(),['anna','boris','gleb'],'attribute value and sheet name together');
  await search('анна война');assert.deepEqual(shown(),[],'a word that matches nothing removes the node');
  await search('  анна  ');assert.deepEqual(shown(),['anna'],'spaces around the query do not add empty words');
  await search('главный');
  for(const id of ['name','body','tags','sheet','attrs'])await act(async()=>field(id).click());
  assert.deepEqual(shown(),['anna','boris','dina','gleb'],'no area to search in does not filter');
  assert.equal(document.querySelector('[data-action="filter"] .toolbar-count'),null);
  await act(async()=>field('name').click());await search('бор');assert.deepEqual(shown(),['boris'],'the name area alone still filters');
  // The sheet strip marks where the matches are, so the search also serves navigation.
  await act(async()=>field('sheet').click());await search('война');
  assert.ok(document.querySelector('.sheet-tabs button[data-sheet-empty]'),'sheets without matches are faded');
  assert.equal(document.querySelectorAll('.sheet-tabs button[data-sheet-hit]').length,1,'only the matching sheet is marked');
  await t.click('Показать всё');
  assert.equal(document.querySelectorAll('.sheet-tabs button[data-sheet-empty]').length,0,'no filter, no marks');
  assert.equal(document.querySelector('[data-filter-search]').value,'','Show all clears the search');
  assert.ok(['name','body','tags','sheet','attrs'].every(id=>field(id)?.checked),'and restores every area');
 }finally{await t.close();}
});

test('Enter walks the matches and remembers the query; the sheet strip can keep only the matching sheets',async()=>{
 const g=multiFixture(),t=await mount(1366,g);try{
  const search=async(text)=>await setInput(t.w,document.querySelector('[data-filter-search]'),text);
  const enter=async()=>await act(async()=>document.querySelector('[data-filter-search]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const tabs=()=>document.querySelectorAll('.sheet-tabs button').length;
  const at=()=>document.querySelector('main [data-nid].ring-blue-500')?.dataset.nid;
  await openFilter();
  assert.equal(document.querySelector('[data-sheet-only-hits]'),null,'the toggle appears only while something is filtered');
  await search('рисование');
  await enter();assert.equal(at(),'anna','Enter goes to the first match');
  await enter();assert.equal(at(),'boris','and then to the next one');
  await enter();assert.equal(at(),'gleb');
  await enter();assert.equal(at(),'anna','the walk wraps around');
  assert.ok(document.body.textContent.includes('Совпадение 1 из 3'),'the status line counts the matches');
  assert.deepEqual([...document.querySelectorAll('#filter-search-recent option')].map(o=>o.value),['рисование'],'the query is offered back next time');
  // The status line counts the view on screen, not only the project.
  const scope=()=>document.querySelector('[data-filter-status]').textContent;
  assert.ok(scope().includes('на листе: 3/4'),scope());
  await t.click('Выйти к обзору листов');assert.ok(scope().includes('листов с узлами: 1/2'),scope());
  await t.click('Стопка');assert.ok(scope().includes('в стопке: 3/5'),scope());
  // Drop the second sheet out of the stack: the view counter follows the stack, not the project.
  await act(async()=>document.querySelector('.stack-layer-checks label:nth-of-type(2) input').click());
  assert.ok(scope().includes('в стопке: 3/4'),scope());
  await t.click('Листы');
  // Only matching sheets in the list: a view of the strip, not a condition of the filter.
  assert.equal(tabs(),2);
  await act(async()=>document.querySelector('[data-sheet-only-hits]').click());
  assert.equal(tabs(),1,'the sheet without matches leaves the list');
  assert.equal(document.querySelector('.sheet-paging span').textContent.replace(/\s+/g,''),'1/1','paging follows the shortened list');
  await t.click('Показать всё');
  assert.equal(tabs(),2,'clearing the filter brings every sheet back');
 }finally{await t.close();}
});

test('the Hide / Dim switch fades filtered objects in place in every view and keeps geometry',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  const cards=()=>[...document.querySelectorAll('main [data-nid]')].map(el=>[el.dataset.nid,el.style.left,el.style.top]);
  const before=cards(),edges=document.querySelectorAll('main [data-edge-id]').length;assert.ok(before.length>0&&edges>0);
  await openFilter();await tick('input[data-filter-type="entity"]');
  assert.equal(document.querySelectorAll('main [data-nid]').length,0,'hide is the default');
  assert.equal(document.querySelector('[data-filter-mode="hide"]').getAttribute('aria-pressed'),'true');
  await tick('[data-filter-panel] [data-filter-mode="dim"]');
  assert.deepEqual(cards(),before,'dimmed cards stay in place');assert.ok([...document.querySelectorAll('main [data-nid]')].every(el=>el.hasAttribute('data-filter-muted')));
  assert.equal(document.querySelectorAll('main [data-edge-id]').length,edges);assert.ok(document.querySelector('main [data-edge-id="local"]').hasAttribute('data-filter-muted'));
  assert.ok(document.querySelector('[data-filter-panel] [data-filter-status]').textContent.includes('подходят 1 из 3 узлов'));
  await t.click('Свернуть фильтр');const status=document.querySelector('[data-filter-status]');assert.ok(status.textContent.includes('остальные приглушены'));
  assert.equal(status.querySelector('[data-filter-mode="dim"]').getAttribute('aria-pressed'),'true');
  await t.click('Выйти к обзору листов');assert.ok(document.querySelector('[data-overview-node="a"]').hasAttribute('data-filter-muted'));assert.ok(!document.querySelector('[data-overview-node="b"]').hasAttribute('data-filter-muted'));
  await t.click('Стопка');assert.ok(document.querySelector('[data-stack-node="a"]').hasAttribute('data-filter-muted'));assert.ok(!document.querySelector('[data-stack-node="b"]').hasAttribute('data-filter-muted'));
  await tick('[data-filter-status] [data-filter-mode="hide"]');assert.equal(document.querySelector('[data-stack-node="a"]'),null,'back to hiding');assert.ok(document.querySelector('[data-stack-node="b"]'));
  await t.flush();assert.deepEqual((await savedGraph()),g);
 }finally{await t.close();}
});

test('selected-sheet overview keeps all sheets and local edges, fans shared IDs out and follows header selection',async()=>{
 const g=overviewFixture();g.sheets.push({...g.sheets[0],id:'third',name:'Third'});g.nodes[0].sheets.push('third');g.nodes[0].pos.third={x:80,y:100};g.nodes.push({id:'c',name:'C',body:'',kind:'entity',sheets:['third'],pos:{third:{x:400,y:180}}});g.edges.push({id:'unrelated',from:'b',to:'c',kind:'depends'});
 const t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');
  const cross=()=>[...document.querySelectorAll('[data-overview-edge][data-line-kind="external"]')];
  const shared=()=>[...document.querySelectorAll('[data-overview-identity="shared"]')];
  const toggle=async text=>{const label=[...document.querySelectorAll('.overview-canvas-actions label')].find(el=>el.textContent===text);assert.ok(label,text);await act(async()=>label.querySelector('input').click());};
  const locals=document.querySelectorAll('[data-overview-edge][data-line-kind="local"]').length;
  assert.ok(cross().some(el=>el.dataset.overviewEdge==='unrelated'));
  await toggle('Только для выделенного листа');
  assert.equal(document.querySelectorAll('[data-board-sheet]').length,3);assert.equal(document.querySelectorAll('[data-overview-edge][data-line-kind="local"]').length,locals);
  assert.ok(cross().every(el=>[el.dataset.fromSheet,el.dataset.toSheet].includes('main')));assert.ok(!cross().some(el=>el.dataset.overviewEdge==='unrelated'));
  assert.deepEqual(shared().map(el=>[el.dataset.fromSheet,el.dataset.toSheet]),[['main','second'],['main','third']]);
  const surface=document.querySelector('.overview-viewport');await pointer(t,document.querySelector('[data-overview-handle="third"]'),'pointerdown',100,100);await pointer(t,surface,'pointerup',100,100);
  assert.ok(document.querySelector('.overview-focus-note').textContent.includes('Third'));assert.ok(cross().every(el=>[el.dataset.fromSheet,el.dataset.toSheet].includes('third')));assert.ok(cross().some(el=>el.dataset.overviewEdge==='unrelated'));
  assert.ok(shared().every(el=>el.dataset.fromSheet==='third'));assert.equal(shared().length,2);
  await toggle('Между листами');assert.equal(cross().length,0);assert.equal(shared().length,2);
  await toggle('Один ID');assert.equal(shared().length,0);assert.equal(document.querySelectorAll('[data-overview-node="shared"]').length,3);
  await toggle('Между листами');await toggle('Один ID');await toggle('Только для выделенного листа');assert.ok(cross().some(el=>el.dataset.overviewEdge==='cross'));assert.equal(document.querySelector('.overview-focus-note'),null);
  await t.flush();assert.deepEqual((await savedGraph()),g);assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});

test('sheet camera gestures move the DOM without re-rendering cards and commit once',async()=>{
 const t=await mount(1366);try{
  const canvas=document.querySelector('main [data-canvas-id]'),card=canvas.querySelector('[data-nid]'),layer=card.parentElement,scene=canvas.querySelector('svg g[transform]');
  const before=layer.style.transform,observed=t.w.__roObserve,x0=Number(canvas.dataset.viewX);
  for(let i=0;i<5;i++)await act(async()=>canvas.dispatchEvent(new t.w.WheelEvent('wheel',{deltaX:20,deltaY:10,bubbles:true,cancelable:true})));
  assert.notEqual(layer.style.transform,before);assert.equal(Number(canvas.dataset.viewX),x0-100);
  assert.ok(scene.getAttribute('transform').startsWith(`translate(${x0-100} `),'edges follow the cards');
  assert.equal(t.w.__roObserve,observed,'cards are not re-subscribed during a gesture');
  const panned=layer.style.transform;await t.flush();
  await act(async()=>card.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  assert.equal(document.querySelector('main [data-canvas-id] [data-nid]').parentElement.style.transform,panned,'the committed camera survives a re-render');
 }finally{await t.close();}
});

test('dragging a sheet card writes the graph once on release; undo restores it',async()=>{
 const t=await mount(1366);try{
  const canvas=document.querySelector('main [data-canvas-id]'),sid=canvas.dataset.canvasId,k=Number(canvas.dataset.viewK),card=canvas.querySelector('[data-nid="blend"]');assert.ok(card);
  await t.flush();const start=(await savedGraph())?.nodes.find(n=>n.id==='blend').pos[sid]??makeRoastery().nodes.find(n=>n.id==='blend').pos[sid];
  await pointer(t,card,'pointerdown',100,100);await pointer(t,card,'pointermove',140,130);await pointer(t,card,'pointermove',180,160);await t.flush();
  const during=(await savedGraph())?.nodes.find(n=>n.id==='blend').pos[sid]??start;
  assert.deepEqual(during,start,'the preview does not save partial positions');
  assert.equal(card.style.left,`${start.x+Math.round(80/k)}px`,'the card follows the pointer');
  await pointer(t,card,'pointerup',180,160);await t.flush();
  const saved=(await savedGraph()).nodes.find(n=>n.id==='blend').pos[sid];
  assert.deepEqual(saved,{x:start.x+Math.round(80/k),y:start.y+Math.round(60/k)});
  await t.click('Отменить изменение');await t.flush();
  assert.deepEqual((await savedGraph()).nodes.find(n=>n.id==='blend').pos[sid],start);
 }finally{await t.close();}
});

test('a cancelled sheet card drag leaves the graph and history untouched',async()=>{
 const t=await mount(1366);try{
  const card=document.querySelector('main [data-canvas-id] [data-nid="blend"]'),left=card.style.left;
  await pointer(t,card,'pointerdown',100,100);await pointer(t,card,'pointermove',160,160);await pointer(t,card,'pointercancel',160,160);await t.flush();
  assert.equal(document.querySelector('main [data-canvas-id] [data-nid="blend"]').style.left,left);
  assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});

test('saved views restore filters and modes; smart sheets update when a matching node is edited',async()=>{
 const t=await mount(1366,attributeFixture());
 try{
  await openFilter(t);const search=document.querySelector('[data-filter-search]');await setInput(t.w,search,'Наташа');
  assert.ok(document.querySelector('main mark.search-match')?.textContent.includes('Наташа'));
  await act(async()=>document.querySelector('[data-action="saved-views"]').click());
  await t.field('saved-view-name','Наташа вид');await act(async()=>document.querySelector('[data-action="save-view"]').click());
  await t.field('saved-view-name','Наташа лист');await act(async()=>document.querySelector('[data-action="create-smart-sheet"]').click());
  await t.flush();let g=await savedGraph();const smart=g.sheets.find(s=>s.smartFilter);assert.ok(smart);assert.deepEqual(g.nodes.filter(n=>n.sheets.includes(smart.id)).map(n=>n.id),['natasha']);
  await act(async()=>document.querySelector('main [data-nid="natasha"] .node-expand-button').click());
  const input=document.querySelector('[data-node-name-editor="natasha"]');await t.field(input.id,'Другое имя');await t.flush();g=await savedGraph();assert.ok(!g.nodes.some(n=>n.sheets.includes(smart.id)));assert.ok(g.nodes.find(n=>n.id==='natasha').sheets.includes('main'));
  await openFilter(t);await act(async()=>document.querySelector('[data-action="saved-views"]').click());
  await act(async()=>document.querySelector('[data-apply-view]').click());
  await openFilter(t);assert.equal(document.querySelector('[data-filter-search]').value,'Наташа');
 }finally{await t.close();}
});

test('search history persists as a preference and can be cleared without changing the project',async()=>{
 const t=await mount(1366,attributeFixture(),false,{'plyloom.search.recent':'["старый запрос"]'});
 try{
  await openFilter(t);assert.equal(document.querySelector('#filter-search-recent option').value,'старый запрос');
  const search=document.querySelector('[data-filter-search]');await setInput(t.w,search,'Наташа');await act(async()=>search.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  assert.equal(JSON.parse(localStorage.getItem('plyloom.search.recent'))[0],'Наташа');
  await t.click('Очистить историю поиска');assert.deepEqual(JSON.parse(localStorage.getItem('plyloom.search.recent')),[]);
  assert.equal(document.querySelector('#filter-search-recent option'),null);
 }finally{await t.close();}
});

test('dense scene paints candidates and captured background clicks open a readable culled card',async()=>{
 const g=emptyProject('dense'),sid=g.sheets[0].id;
 g.nodes=Array.from({length:600},(_,i)=>({id:`dense-${i}`,name:`Dense ${i}`,kind:'entity',body:'',sheets:[sid],pos:{[sid]:{x:(i%30)*270,y:Math.floor(i/30)*150}}}));
 const t=await mount(1366,g,false,null,true);
 try{
  const root=document.querySelector('main [data-canvas-id]'),canvas=root.querySelector('canvas.dense-scene');
  assert.ok(canvas);assert.equal(root.dataset.renderer,'canvas');assert.equal(root.querySelectorAll('[data-nid]').length,0);assert.ok(t.w.__canvasFills>0);
  const v={x:+root.dataset.viewX,y:+root.dataset.viewY,k:+root.dataset.viewK};
  const n=g.nodes.find(n=>{const p=n.pos[sid],x=v.x+(p.x+100)*v.k,y=v.y+(p.y+30)*v.k;return x>100&&x<700&&y>100&&y<500;});assert.ok(n);
  const p=n.pos[sid],init={bubbles:true,clientX:v.x+(p.x+100)*v.k,clientY:v.y+(p.y+30)*v.k,button:0};
  await act(async()=>canvas.dispatchEvent(new t.w.MouseEvent('pointerdown',init)));
  // Native pointer capture retargets pointerup to the root, even if down was on the canvas.
  await act(async()=>root.dispatchEvent(new t.w.MouseEvent('pointerup',init)));
  assert.equal(document.getElementById('node-name').value,n.name);
  assert.equal(root.dataset.renderer,'dom');assert.ok(+root.dataset.viewK>=.7);
  assert.ok(root.querySelector(`[data-nid="${n.id}"]`));assert.ok(root.querySelectorAll('[data-nid]').length<200,'offscreen cards are culled at readable scale');
 }finally{await t.close();}
});
