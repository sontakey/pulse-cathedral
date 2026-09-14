import { mkdirSync, cpSync, copyFileSync, rmSync } from 'node:fs';
const output = new URL('../dist/', import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(new URL('benchmarks/', output), { recursive: true });
for (const name of ['index.html', 'css', 'js', 'facephys']) {
  cpSync(new URL('../' + name, import.meta.url), new URL(name, output), { recursive: true });
}
copyFileSync(new URL('../benchmarks/latest.json', import.meta.url), new URL('benchmarks/latest.json', output));
console.log('Static app built in dist; recordings and test artifacts are excluded.');

copyFileSync(new URL("../index.html", import.meta.url), new URL("legacy.html", output));
await import("node:fs").then(({writeFileSync}) => writeFileSync(new URL("index.html", output), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./facephys/"><title>Pulse Cathedral — FacePhys</title></head><body><a href="./facephys/">Open FacePhys</a> · <a href="./legacy.html">Previous Signal Lab</a></body></html>`));
