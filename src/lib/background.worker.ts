import { loadGraph } from "./graph";
import { viewLayoutRequest, type LayoutSnapshot } from "./layoutViews";
import { layoutSteps } from "./optimizeLayout";
import type { Graph } from "../model/types";

export type BackgroundRequest = {kind:"load"; text:string} | {kind:"layout"; graph:Graph; sizes:Map<string,number>; snapshot:LayoutSnapshot};
self.onmessage = (event: MessageEvent<BackgroundRequest>) => {
  try {
    const request = event.data;
    if (request.kind === "load") { self.postMessage({result:loadGraph(JSON.parse(request.text))}); return; }
    const iterator = layoutSteps(viewLayoutRequest(request.graph,request.sizes,request.snapshot));
    let step = iterator.next(), last = performance.now();
    while (!step.done) {
      if (performance.now()-last>60) { self.postMessage({progress:step.value}); last=performance.now(); }
      step=iterator.next();
    }
    self.postMessage({result:step.value});
  } catch (e) { self.postMessage({error:e instanceof Error?e.message:String(e)}); }
};
