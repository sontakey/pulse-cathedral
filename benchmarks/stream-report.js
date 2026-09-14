import {readFileSync,writeFileSync} from 'node:fs';
import {RPPGProcessor} from '../js/measurement.js';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));const runs={};
for(const mode of ['production','without-region-agreement','wide-mask','forehead-only']){
 const p=new RPPGProcessor(),readouts=[],beats=[],waveform=[];let committed=-Infinity;
 for(const f of input.frames){
  const meta={...f};if(mode!=='production')delete meta.regions;
  const rgb=mode==='wide-mask'?f.wideRGB:mode==='forehead-only'?f.regions?.[0]:f.rgb;
  const d=rgb?p.addSample(rgb,f.t,meta):p.gap(f.invalidReason,f.t);
  if(d.timestamp===f.t){readouts.push(d);beats.push(...d.newBeats);for(const x of p.waveform)if(x.t>committed){waveform.push(x);committed=x.t;}}
 }
 runs[mode]={readouts,beats,waveform};
}
writeFileSync(process.argv[3],JSON.stringify(runs));
console.log(Object.fromEntries(Object.entries(runs).map(([k,r])=>[k,{readouts:r.readouts.length,accepted:r.readouts.filter(d=>d.hr!==null).length,validBeats:r.beats.filter(b=>b.valid).length}])));
