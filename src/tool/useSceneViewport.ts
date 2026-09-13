import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { View } from "../model/types";
import type { Rect } from "../lib/graph";

/** Overscan is refreshed after 180 screen pixels, not on every pan frame.
 * The animation loop also observes the actual frame budget on this device. */
export function useSceneViewport(root: RefObject<HTMLElement | null>, view: View, enabled: boolean, draw?: RefObject<() => void>) {
  const [revision, update] = useState(0), frame = useRef(0), lastMove = useRef(0), previousFrame = useRef(0), slow = useRef(0);
  const rendered = useRef(view), live = useRef(view), active = useRef(enabled);
  rendered.current = view; active.current = enabled;
  const paint = useRef(draw); paint.current = draw;
  const onCamera = useCallback((v: View) => {
    live.current = v; lastMove.current = performance.now();
    if (root.current) root.current.dataset.sceneMoving = "";
    if (frame.current) return;
    previousFrame.current = 0;
    const tick = (now: number) => {
      const before = rendered.current, current = live.current, el = root.current;
      if (!el) { frame.current = 0; return; }
      if (active.current && (Math.abs(current.x-before.x)>180 || Math.abs(current.y-before.y)>180 || Math.abs(Math.log(current.k/before.k))>.12 || (current.k<.35)!==(before.k<.35))) {
        rendered.current = current; update(n=>n+1);
      }
      if (previousFrame.current && now-previousFrame.current>24) slow.current++; else slow.current=Math.max(0,slow.current-1);
      if (slow.current>=3) el.dataset.sceneQuality = "low";
      previousFrame.current = now; paint.current?.current();
      if (now-lastMove.current<200) frame.current=requestAnimationFrame(tick);
      else { frame.current=0; slow.current=0; delete el.dataset.sceneMoving; delete el.dataset.sceneQuality; }
    };
    frame.current = requestAnimationFrame(tick);
  }, [root]);
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
  const w = root.current?.clientWidth ?? 0, h = root.current?.clientHeight ?? 0;
  const bounds: Rect | null = enabled && w>0 && h>0 ? {x:(-view.x-320)/view.k,y:(-view.y-320)/view.k,w:(w+640)/view.k,h:(h+640)/view.k} : null;
  return {bounds, revision, onCamera};
}
