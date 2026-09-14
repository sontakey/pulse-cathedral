import {readFileSync,writeFileSync} from 'node:fs';
import {replayStages} from './replay-engine.js';
const output=replayStages(JSON.parse(readFileSync(process.argv[2],'utf8')));
writeFileSync(process.argv[3],JSON.stringify(output));
console.log(Object.fromEntries(Object.entries(output.runs).map(([k,v])=>[k,{accepted:v.acceptedReadouts,eligible:v.eligibleReadouts,availability:v.availability,reasons:v.reasons}])));
