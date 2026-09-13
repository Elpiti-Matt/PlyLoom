import type { Rect } from "./graph";

/** Conservative broad phase. Large imported shapes live in a separate bucket,
 * so even a million-unit rectangle cannot allocate a million grid cells. */
export class SpatialGrid<T extends Rect> {
  private cells = new Map<string, number[]>();
  private large: number[] = [];
  constructor(readonly boxes: readonly T[], private cellSize = 512) {
    boxes.forEach((box, i) => {
      const [x0, y0, x1, y1] = this.range(box);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) { this.large.push(i); return; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`, cell = this.cells.get(key);
        if (cell) cell.push(i); else this.cells.set(key, [i]);
      }
    });
  }
  private range(b: Rect) {
    return [Math.floor(b.x / this.cellSize), Math.floor(b.y / this.cellSize),
      Math.floor((b.x + b.w) / this.cellSize), Math.floor((b.y + b.h) / this.cellSize)];
  }
  query(box: Rect): number[] {
    const [x0, y0, x1, y1] = this.range(box);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return this.boxes.flatMap((b, i) => intersects(box, b) ? [i] : []);
    const found = new Set(this.large);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
      for (const i of this.cells.get(`${x},${y}`) ?? []) found.add(i);
    return [...found].filter(i => intersects(box, this.boxes[i]));
  }
}

export const intersects = (a: Rect, b: Rect) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export function boundsOfPoints(points: readonly {x:number;y:number}[]): Rect {
  let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;
  for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);r=Math.max(r,p.x);b=Math.max(b,p.y);}
  return points.length?{x,y,w:r-x,h:b-y}:{x:0,y:0,w:0,h:0};
}
