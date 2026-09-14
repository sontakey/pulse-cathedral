import { mkdirSync, cpSync, copyFileSync, rmSync } from 'node:fs';
const output = new URL('../dist/', import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(new URL('benchmarks/', output), { recursive: true });
for (const name of ['index.html', 'css', 'js']) {
  cpSync(new URL('../' + name, import.meta.url), new URL(name, output), { recursive: true });
}
copyFileSync(new URL('../benchmarks/latest.json', import.meta.url), new URL('benchmarks/latest.json', output));
console.log('Static app built in dist; recordings and test artifacts are excluded.');
