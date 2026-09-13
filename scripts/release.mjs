import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
let html=readFileSync("dist/index.html","utf8");
const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
html=html.replace('<meta charset="UTF-8" />',`<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${policy}">`);
if(!html.includes('Content-Security-Policy'))throw new Error("CSP was not inserted");
const notices = [readFileSync("LICENSE","utf8")];
for (const name of ["react","react-dom","scheduler","clsx","tailwind-merge","tailwindcss"]) {
  const root=`node_modules/${name}`;
  const path=["LICENSE","LICENSE.md","license"].map((file)=>`${root}/${file}`).find(existsSync);
  if(!path)throw new Error(`Missing license for ${name}`);
  const pkg=JSON.parse(readFileSync(`${root}/package.json`,"utf8"));
  notices.push(`${name} ${pkg.version}\n${readFileSync(path,"utf8")}`);
}
// Vite's modulepreload polyfill is emitted into the browser bundle. Its core
// MIT license belongs in the release even though Vite is a devDependency.
// The rest of LICENSE.md covers dependencies of the build tool, not this code.
const vitePackage=JSON.parse(readFileSync("node_modules/vite/package.json","utf8"));
const viteLicense=readFileSync("node_modules/vite/LICENSE.md","utf8");
const viteCoreEnd=viteLicense.indexOf("\n# Licenses of bundled dependencies");
if(viteCoreEnd<0)throw new Error("Vite license structure changed; review the bundled polyfill license");
notices.push(`vite ${vitePackage.version} — bundled modulepreload polyfill\n${viteLicense.slice(0,viteCoreEnd).trim()}\n`);
writeFileSync("THIRD_PARTY_NOTICES.txt",notices.join("\n\n"));
html=html.replace('</body>',`<!--\n${notices.join("\n\n").replaceAll("-->","-- >")}\n-->\n</body>`);
mkdirSync("demo",{recursive:true});
writeFileSync("demo/index.html",html);writeFileSync("dist/index.html",html);
writeFileSync("demo/SHA256SUMS",`${createHash("sha256").update(html).digest("hex")}  index.html\n`);
console.log(`Self-contained demo: ${Buffer.byteLength(html)} bytes`);
