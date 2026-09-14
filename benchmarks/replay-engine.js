// Pure replay orchestration shared by Node and the local browser Worker.
import {RPPGProcessor,CONFIG} from '../js/measurement.js';
export function replayStages(session,onProgress=()=>{}) {
 if(!Array.isArray(session.frames)||session.frames.length<2||session.frames.length>36000)throw new Error('Expected 2–36,000 numeric frames');
 if(session.frames.some(f=>!Number.isFinite(f.t)))throw new Error('Every frame needs a timestamp');
 if(session.frames.some((f,i)=>i&&f.t<session.frames[i-1].t))throw new Error('Timestamps must not go backwards');
 const modes=['production','without-region-agreement'];
 if(session.frames.some(f=>f.wideRGB))modes.push('wide-mask');
 const runs={};
 for(const mode of modes) {
  const p=new RPPGProcessor({captureStages:true}),readouts=[],trace=[];
  let committed=-Infinity,lastReadout=-Infinity,previous=null,availableSeconds=0,eligibleSeconds=0;
  const eligibleStart=session.frames[0].t+CONFIG.warmup;
  for(let index=0;index<session.frames.length;index++) {
   const f=session.frames[index];
   if(previous&&f.t>previous.t) {
    const dt=Math.max(0,f.t-Math.max(previous.t,eligibleStart));eligibleSeconds+=dt;
    if(previous.hr!==null&&f.t-previous.t<=CONFIG.maxGap)availableSeconds+=dt;
   }
   const meta={...f};if(mode!=='production')delete meta.regions;
   const rgb=mode==='wide-mask'?f.wideRGB:f.rgb;
   const d=rgb?p.addSample(rgb,f.t,meta):p.gap(f.invalidReason||'No face',f.t);
   previous={t:f.t,hr:d.hr};
   if(d.timestamp===f.t&&d.timestamp>lastReadout) {
    readouts.push({...d,segment:p.segment});lastReadout=d.timestamp;
    if(p.analysisTrace) {
     const s=p.analysisTrace;
     for(let i=3*CONFIG.fs;i<s.times.length;i++) {
      const at=s.times[i];if(at>committed&&at<=p.committed) {
       trace.push({t:at,raw:s.rawPOS[i],filtered:s.filtered[i],segment:p.segment});committed=at;
      }
     }
    }
   }
   if(index%300===0)onProgress({mode,frames:index,total:session.frames.length});
  }
  const eligible=readouts.filter(r=>r.timestamp>=eligibleStart),accepted=eligible.filter(r=>r.hr!==null),reasons={};
  for(const r of eligible)reasons[r.reason]=(reasons[r.reason]||0)+1;
  runs[mode]={readouts,trace,eligibleReadouts:eligible.length,acceptedReadouts:accepted.length,
   acceptedFraction:eligible.length?accepted.length/eligible.length:0,availableSeconds,eligibleSeconds,
   availability:eligibleSeconds?availableSeconds/eligibleSeconds:0,duplicateInputs:p.duplicates,reasons,
   note:mode==='production'?'Unchanged production core and validity gates':'Diagnostic ablation only; not deployed. Wider mask also removes region agreement.'};
 }
 return {schema:'pulse-cathedral/stages/1',config:CONFIG,runs};
}
