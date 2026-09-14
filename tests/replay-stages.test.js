import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RPPGProcessor,CONFIG} from '../js/measurement.js';
import {makeSynthetic} from '../js/synthetic.js';
import {replayStages} from '../benchmarks/replay-engine.js';

test('optional stage instrumentation preserves every production output and clears on gaps',()=>{
 const ordinary=new RPPGProcessor(),instrumented=new RPPGProcessor({captureStages:true});
 const fixture=makeSynthetic({duration:18,noise:.01});
 for(let i=0;i<540;i++){
  const t=i/30,rgb=fixture.sample(t);
  assert.deepEqual(instrumented.addSample(rgb,t),ordinary.addSample(rgb,t));
 }
 assert.equal(ordinary.analysisTrace,null);
 const trace=instrumented.analysisTrace;
 assert.ok(trace.times.length>500);
 assert.equal(trace.times.length,trace.rawPOS.length);
 assert.equal(trace.times.length,trace.filtered.length);
 assert.equal(instrumented.result.diagnostics.uniformFs,CONFIG.fs);
 instrumented.gap('test gap',19);
 assert.equal(instrumented.analysisTrace,null);
 assert.equal(instrumented.result.diagnostics,null);
});

test('replay preserves absent measurements, duplicate times, and the elapsed-time denominator',()=>{
 const frames=Array.from({length:360},(_,i)=>({t:i/30,rgb:[120,120,120]}));
 frames.splice(100,0,{...frames[100]});
 const result=replayStages({frames});
 const run=result.runs.production;
 assert.equal(run.availability,0);
 assert.equal(run.acceptedReadouts,0);
 assert.ok(Math.abs(run.eligibleSeconds-(frames.at(-1).t-CONFIG.warmup))<1e-10);
 assert.equal(new Set(run.readouts.map(r=>r.timestamp)).size,run.readouts.length);
 assert.equal(run.duplicateInputs,1);
 assert.throws(()=>replayStages({frames:[{t:1},{t:0}]}),/backwards/);
});
