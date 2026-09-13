// Browser stand-in for node:assert/strict (strict equality and deep strict equality).
// Minimal node:assert/strict for the browser: strict (Object.is / deep strict) semantics.
class AssertionError extends Error { constructor(m) { super(m); this.name = "AssertionError"; } }
const show = (v) => { try { const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v, (k, x) => x instanceof Map ? [...x] : x instanceof Set ? [...x] : x); return (s ?? String(v)).slice(0, 400); } catch { return String(v).slice(0, 400); } };
function deepStrict(a, b, seen = new Map()) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (seen.get(a) === b) return true; seen.set(a, b);
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return String(a) === String(b);
  if (a instanceof Map) { if (a.size !== b.size) return false; for (const [k, v] of a) { if (!b.has(k) || !deepStrict(v, b.get(k), seen)) return false; } return true; }
  if (a instanceof Set) { if (a.size !== b.size) return false; for (const v of a) if (!b.has(v)) return false; return true; }
  if (Array.isArray(a) && a.length !== b.length) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k) || !deepStrict(a[k], b[k], seen)) return false; }
  return true;
}
const fail = (msg, def) => { throw msg instanceof Error ? msg : new AssertionError(msg ?? def); };
function matches(err, expected) {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(String(err?.message ?? err)) || expected.test(String(err));
  if (typeof expected === "function") { if (expected.prototype !== undefined && err instanceof expected) return true; if (Error.isPrototypeOf?.(expected) || expected === Error) return err instanceof expected; return expected(err) === true; }
  if (typeof expected === "object") return Object.keys(expected).every((k) => expected[k] instanceof RegExp ? expected[k].test(err?.[k]) : deepStrict(err?.[k], expected[k]));
  return true;
}
const assert = (v, m) => ok(v, m);
function ok(v, m) { if (!v) fail(m, `expected truthy, got ${show(v)}`); }
assert.ok = ok;
assert.equal = assert.strictEqual = (a, b, m) => { if (!Object.is(a, b)) fail(m, `expected ${show(a)} to equal ${show(b)}`); };
assert.notEqual = assert.notStrictEqual = (a, b, m) => { if (Object.is(a, b)) fail(m, `expected ${show(a)} to differ`); };
assert.deepEqual = assert.deepStrictEqual = (a, b, m) => { if (!deepStrict(a, b)) fail(m, `deepEqual failed\n actual:   ${show(a)}\n expected: ${show(b)}`); };
assert.notDeepEqual = assert.notDeepStrictEqual = (a, b, m) => { if (deepStrict(a, b)) fail(m, `expected values to differ: ${show(a)}`); };
assert.throws = (fn, expected, m) => { try { fn(); } catch (e) { if (!matches(e, expected)) fail(typeof expected === "string" ? expected : m, `unexpected error: ${e?.message ?? e}`); return; } fail(typeof expected === "string" ? expected : m, "missing expected exception"); };
assert.rejects = async (p, expected, m) => { try { await (typeof p === "function" ? p() : p); } catch (e) { if (!matches(e, expected)) fail(m, `unexpected rejection: ${e?.message ?? e}`); return; } fail(m, "missing expected rejection"); };
assert.match = (s, re, m) => { if (!re.test(s)) fail(m, `${show(s)} does not match ${re}`); };
assert.AssertionError = AssertionError;
export default assert;
