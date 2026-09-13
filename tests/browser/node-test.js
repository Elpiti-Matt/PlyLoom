// Browser stand-in for node:test: tests register here and scripts/test-browser.mjs runs them in order.
const tests = (globalThis.__plyloomTests ??= []);
export default function test(name, fn) { tests.push({ name, fn }); }
export { test };
