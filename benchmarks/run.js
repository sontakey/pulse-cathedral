import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { RPPGProcessor, CONFIG, mean } from '../js/measurement.js';
import { makeSynthetic } from '../js/synthetic.js';
import { scoreBeats, referenceHRV } from './score.js';

const scenarios=[
  {name:'rest-72-30fps',bpm:72,fps:30},
  {name:'off-grid-73.3-30fps',bpm:73.3,fps:30},
  {name:'rest-90-60fps',bpm:90,fps:60},
  {name:'low-48-30fps',bpm:48,fps:30},
  {name:'fast-210-60fps',bpm:210,fps:60},
  {name:'variable-72-30fps',bpm:72,fps:30,variability:.05},
  {name:'jitter-and-dropped-frames',bpm:90,fps:30,jitter:true,drop:true},
  {name:'face-loss-35-to-38s',bpm:72,fps:30,gap:true},
  {name:'broadband-noise',bpm:72,fps:30,noiseOnly:true},
  {name:'flat-no-pulse',bpm:72,fps:30,flat:true},
];
const results=[];
for(const s of scenarios){
  const duration=80,fixture=makeSynthetic({...s,duration}),processor=new RPPGProcessor();
  const beats=[],hrErrors=[],hrvErrors=[],sdnnErrors=[],latencies=[];let reported=0,validHRSeconds=0,previousTime=0,lastReport=-1,seed=19;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const begin=performance.now();
  for(let i=0;i<duration*s.fps;i++){
    const t=i/s.fps+(s.jitter?Math.sin(i*1.7)*.005:0);
    if(s.drop && i%47===0)continue;
    const rgb=s.flat?[120,120,120]:s.noiseOnly?[0,1,2].map(()=>120+30*(random()-.5)):fixture.sample(t);
    const data=s.gap && t>=35 && t<38?processor.gap('Face lost',t):processor.addSample(rgb,t);
    if(data.hr!==null)validHRSeconds+=t-previousTime;previousTime=t;
    beats.push(...data.newBeats);latencies.push(...data.newBeats.filter(b=>b.valid).map(b=>(b.confirmedAt-b.t)*1000));
    if(data.timestamp!==lastReport){
      lastReport=data.timestamp;
      if(data.hr!==null){reported++;if(!s.flat&&!s.noiseOnly){
        const ref=fixture.beats.filter(t=>t>=data.hrWindow.start && t<=data.hrWindow.end);
        if(ref.length>1)hrErrors.push(Math.abs(data.hr-60*(ref.length-1)/(ref.at(-1)-ref[0])));
      }}
      if(data.hrv!==null){const ref=referenceHRV(fixture.beats,t-CONFIG.lookahead-60,t-CONFIG.lookahead);if(ref.rmssd!==null){hrvErrors.push(Math.abs(data.hrv-ref.rmssd));sdnnErrors.push(Math.abs(data.sdnn-ref.sdnn));}}
    }
  }
  const score=scoreBeats(beats,s.flat||s.noiseOnly?[]:fixture.beats,{start:CONFIG.warmup,end:duration-CONFIG.lookahead,tolerance:.25});
  const validDuration=processor.intervals.filter(b=>b.valid).reduce((s,b)=>s+b.ibiMs/1000,0);
  const result={name:s.name,kind:'synthetic',...score,hrMAEBpm:hrErrors.length?mean(hrErrors):null,
    rmssdMAEMs:hrvErrors.length?mean(hrvErrors):null,sdnnMAEMs:sdnnErrors.length?mean(sdnnErrors):null,hrvWindows:hrvErrors.length,
    validIntervalCoverage:validDuration/duration,hrReadoutCoverage:validHRSeconds/duration,
    meanConfirmationLatencyMs:latencies.length?mean(latencies):null,processingWallMs:performance.now()-begin};
  // Regression gates for constructed fixtures, not human accuracy targets.
  result.pass=s.noiseOnly||s.flat?reported===0:result.f1>.90&&result.ibiMAEMs<35&&result.hrMAEBpm<3;
  if(s.gap)result.pass=result.pass && !processor.intervals.some(b=>b.start<35&&b.t>38);
  result.capabilities={hr:s.noiseOnly||s.flat?(reported===0?'correctly withheld':'FAIL'):result.hrMAEBpm<3?'pass':'FAIL',
    ibi:result.ibiMAEMs===null?'not available':result.ibiMAEMs<35&&result.f1>.90?'pass':'FAIL',
    hrv:result.rmssdMAEMs===null?'withheld; insufficient accepted duration':result.rmssdMAEMs<=10&&result.sdnnMAEMs<=10?'pass':'needs improvement (>10 ms summary error)'};
  results.push(result);console.log(`${result.pass?'PASS':'FAIL'} ${s.name}: HR ${result.hrMAEBpm?.toFixed(2)??'withheld'} bpm MAE, IBI ${result.ibiMAEMs?.toFixed(2)??'—'} ms MAE, F1 ${result.f1?.toFixed(3)??'—'}, coverage ${(100*result.validIntervalCoverage).toFixed(1)}%`);
}
writeFileSync(new URL('./latest.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),evidence:'Synthetic regression only. No human camera accuracy measured.',config:CONFIG,results},null,2)+'\n');
if(results.some(r=>!r.pass))process.exitCode=1;
