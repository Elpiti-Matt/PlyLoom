import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Sizes } from "../lib/graph";

/** Одна ResizeObserver на все карточки; высота по id узла. */
export function useSizes(): [Sizes, (el: HTMLElement | null, id: string) => void] {
  const [sizes, setSizes] = useState<Sizes>(() => new Map());
  const roRef = useRef<ResizeObserver | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const pending = useRef(new Map<string, number>());
  const raf = useRef(0);

  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) {
        const id = (en.target as HTMLElement).dataset.measureId??(en.target as HTMLElement).dataset.nid;
        if (!id) continue;
        const h = en.borderBoxSize?.[0]?.blockSize ?? (en.target as HTMLElement).offsetHeight;
        pending.current.set(id, Math.round(h));
        const nid=(en.target as HTMLElement).dataset.nid;if(nid)pending.current.set(nid,Math.round(h));
      }
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        setSizes((prev) => {
          let changed = false;
          const next = new Map(prev);
          for (const [id, h] of pending.current) {
            if (prev.get(id) !== h) {
              next.set(id, h);
              changed = true;
            }
          }
          pending.current.clear();
          return changed ? next : prev;
        });
      });
    });
    roRef.current = ro;
    for (const el of els.current.values()) ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const observe = useCallback((el: HTMLElement | null, id: string) => {
    const ro = roRef.current;
    const prev = els.current.get(id);
    if (prev && prev !== el) ro?.unobserve(prev);
    if (el) {
      if (prev === el) return;
      el.dataset.measureId=id;
      els.current.set(id, el);
      ro?.observe(el);
    } else els.current.delete(id);
  }, []);

  return [sizes, observe];
}
