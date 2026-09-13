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

export class JSDOM {
  constructor(html) {
    HTMLElement.prototype.getBoundingClientRect = realRect;
    Object.defineProperty(window, "innerWidth", { value: realWidth, configurable: true, writable: true });
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage may be unavailable */ }
    if (html) document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    window.MouseEvent = FractionalMouseEvent;
    window.close = () => {};
    this.window = window;
  }
}
