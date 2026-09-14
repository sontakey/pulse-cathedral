import test from 'node:test';
import assert from 'node:assert/strict';
import {BeatMetrics,summarizeIntervals} from '../facephys/metrics.js';
test('constant intervals give 60 BPM and zero time-domain variability',()=>{
const rr=Array.from({length:130},(_,i)=>({start:i,t:i+1,ms:1000}));const m=summarizeIntervals(rr);assert.equal(m.bpm,60);assert.equal(m.ibi,1000);assert.equal(m.rmssd,0);assert.equal(m.sdnn,0);assert.equal(m.pnn50,0);assert.equal(m['LF/HF'],null);
});
test('short windows withhold HRV and alternating intervals use milliseconds',()=>{
const rr=Array.from({length:64},(_,i)=>({start:i,t:i+1,ms:i%2?1100:900}));assert.equal(summarizeIntervals(rr.slice(0,10)).rmssd,null);const m=summarizeIntervals(rr);assert.equal(m.rmssd,200);assert.equal(m.pnn50,100);assert.equal(m['LF/HF'],null);
});
test('low quality and timestamp gaps clear old metrics',()=>{const p=new BeatMetrics();for(let i=0;i<600;i++)p.add(Math.sin(i/30*2*Math.PI),i/30,true);assert.ok(p.result.bpm);p.add(1,25,true);assert.equal(p.result.bpm,null);p.add(1,25.03,false);assert.equal(p.result.ibi,null)});

test('steady synthetic pulse does not invent variability from frame quantization',()=>{const p=new BeatMetrics();for(let i=0;i<2200;i++)p.add(Math.sin(i/30*2*Math.PI),i/30,true);assert.ok(p.result.rmssd<.001);});

test('duplicate video timestamps do not erase accepted intervals',()=>{const p=new BeatMetrics();for(let i=0;i<600;i++)p.add(Math.sin(i/30*2*Math.PI),i/30,true);const before={...p.result};const count=p.rr.length;p.add(0,599/30,true);assert.deepEqual(p.result,before);assert.equal(p.rr.length,count);});
test('missing timestamps are reported distinctly from signal quality',()=>{const p=new BeatMetrics();p.add(1,undefined,true);assert.match(p.reason,/timestamp/);});

test('provisional beats at SQI 0.39 do not release strict HRV',()=>{const preview=new BeatMetrics(),strict=new BeatMetrics();for(let i=0;i<2200;i++){const v=Math.sin(i/30*2*Math.PI);preview.add(v,i/30,.39>.38);strict.add(v,i/30,.39>.5)}assert.ok(Math.abs(preview.result.ibi-1000)<.001);assert.equal(strict.result.ibi,null);assert.equal(strict.result.rmssd,null);});

test('one accepted interval is visible as IBI without releasing HRV',()=>{const m=summarizeIntervals([{start:1,t:2,ms:1000}]);assert.equal(m.ibi,1000);assert.equal(m.bpm,null);assert.equal(m.rmssd,null);assert.equal(m.sdnn,null);});
