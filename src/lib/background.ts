import type { BackgroundRequest } from "./background.worker";

export class BackgroundUnavailable extends Error {}
/** Vite embeds the worker inside the single HTML. No request to a sibling file
 * is made, including under file://. A worker is owned by one cancellable task. */
export async function runBackground<T>(request: BackgroundRequest, signal: AbortSignal, progress?: (n:number)=>void): Promise<T> {
  if(signal.aborted)throw new DOMException("Cancelled","AbortError");
  if(typeof Worker==="undefined")throw new BackgroundUnavailable("Background processing unavailable");
  let worker: Worker;
  try {
    const {default:Factory}=await import("./background.worker?worker&inline");
    if(signal.aborted)throw new DOMException("Cancelled","AbortError");
    worker=new Factory();
  } catch(error) {
    if(signal.aborted)throw new DOMException("Cancelled","AbortError");
    throw new BackgroundUnavailable(String(error));
  }
  return new Promise((resolve,reject)=>{
    let received=false;
    const finish=()=>{window.clearTimeout(timer);signal.removeEventListener("abort",cancel);worker.terminate();};
    const cancel=()=>{finish();reject(new DOMException("Cancelled","AbortError"));};
    const timer=window.setTimeout(()=>{finish();reject(new Error("Calculation timed out"));},120000);
    signal.addEventListener("abort",cancel,{once:true});
    worker.onerror=event=>{event.preventDefault();finish();reject(received?new Error(event.message):new BackgroundUnavailable(event.message));};
    worker.onmessage=event=>{
      received=true;
      if(typeof event.data.progress==="number"){progress?.(event.data.progress);return;}
      finish();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result as T);
    };
    try{worker.postMessage(request);}catch(error){finish();reject(error);}
    if(signal.aborted)cancel();
  });
}
