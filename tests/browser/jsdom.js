// Browser stand-in for jsdom. `new JSDOM()` resets the one real page instead of creating a new window,
// so the unchanged test harness mounts into real Chromium with real layout.
const realRect = HTMLElement.prototype.getBoundingClientRect, realWidth = window.innerWidth, NativeMouseEvent = window.MouseEvent;

// Chromium truncates MouseEvent clientX/clientY to integers; jsdom and real PointerEvents keep fractions.
// Tests dispatch synthetic MouseEvents at fractional zoom-scaled coordinates, so keep the fractions.
class FractionalMouseEvent extends NativeMouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    if (typeof init.clientX === "number") Object.defineProperty(this, "clientX", { value: init.clientX });
    if (typeof init.clientY === "number") Object.defineProperty(this, "clientY", { value: init.clientY });
  }
}

// jsdom has no requestIdleCallback, so storage.ts schedules autosaves with setTimeout(…, 50) there.
// Real Chromium only guarantees the callback within its 1000 ms timeout — about three times longer
// than the harness flush — so every storage assertion would depend on scheduler luck, and a check
// for the *absence* of a write could never observe anything. Match the jsdom timing instead.
function idleShim(callback) {
  return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 50);
}

export class JSDOM {
  constructor(html) {
    HTMLElement.prototype.getBoundingClientRect = realRect;
    Object.defineProperty(window, "innerWidth", { value: realWidth, configurable: true, writable: true });
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage may be unavailable */ }
    if (html) document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    window.MouseEvent = FractionalMouseEvent;
    window.requestIdleCallback = idleShim;
    window.cancelIdleCallback = (id) => clearTimeout(id);
    window.close = () => {};
    this.window = window;
  }
}
