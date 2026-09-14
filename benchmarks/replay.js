import { readFileSync,writeFileSync } from 'node:fs';
import { RPPGProcessor, CONFIG } from '../js/measurement.js';
import { scoreBeats, scoreReadouts } from './score.js';
// node benchmarks/replay.js recording.json reference.json fixedOffsetSeconds output.json
const [recordingPath,referencePath,offsetText,outputPath]=process.argv.slice(2);
if(!recordingPath)throw new Error('Usage: node benchmarks/replay.js recording.json [reference.json fixedOffsetSeconds output.json]');
if(referencePath && !Number.isFinite(Number(offsetText)))throw new Error('Provide a finite fixed reference clock offset in seconds.');
const recording=JSON.parse(readFileSync(recordingPath,'utf8')),processor=new RPPGProcessor(),beats=[],readouts=[];
if(recording.schema!=='pulse-cathedral/1'||!Array.isArray(recording.frames))throw new Error('Unsupported session schema');
let previous=-Infinity;
for(const frame of recording.frames){
  if(!Number.isFinite(frame.t)||frame.t<=previous)throw new Error('Frame timestamps must be strictly increasing');previous=frame.t;
  if(frame.resetProcessor)processor.reset();
  const data=frame.rgb?processor.addSample(frame.rgb,frame.t,frame):processor.gap(frame.invalidReason,frame.t);
  beats.push(...data.newBeats);if(data.timestamp===frame.t)readouts.push(data);
}
const reference=referencePath?JSON.parse(readFileSync(referencePath,'utf8')):recording.reference;
if(reference && (!Array.isArray(reference.beats)||reference.beats.some((t,i,a)=>!Number.isFinite(t)||(i>0&&t<=a[i-1]))))throw new Error('Reference beats must be increasing timestamps in seconds');
const score=reference?scoreBeats(beats,reference.beats,{offset:Number(offsetText||0),start:recording.frames[0]?.t||0,end:recording.frames.at(-1)?.t||0}):null;
const summary=reference?scoreReadouts(readouts,reference.beats,{offset:Number(offsetText||0),lookahead:CONFIG.lookahead}):null;
const duration=(recording.frames.at(-1)?.t||0)-(recording.frames[0]?.t||0);
const coverage=duration?beats.filter(b=>b.valid&&b.ibiMs).reduce((s,b)=>s+b.ibiMs/1000,0)/duration:0;
const reasons={},gaps=[];
for(let i=0;i<recording.frames.length;i++){
  const f=recording.frames[i];if(f.invalidReason)reasons[f.invalidReason]=(reasons[f.invalidReason]||0)+1;
  if(i && f.t-recording.frames[i-1].t>CONFIG.maxGap)gaps.push({t:f.t,seconds:f.t-recording.frames[i-1].t});
}
const diagnosticSummary={durationSeconds:duration,frameCount:recording.frames.length,
  observedFps:duration?(recording.frames.length-1)/duration:null,invalidFrameReasons:reasons,
  longFrameGaps:gaps,reportedErrors:(recording.events||[]).filter(e=>e.type==='error'||e.type==='promise rejection'),
  referenceAvailable:!!reference,note:'Replay diagnoses software/signal behavior. Accuracy requires an independent reference. A truncated diagnostic window needs fresh warmup.'};
const report={evidence:recording.source==='synthetic'?'synthetic':'recorded RGB replay; reference provenance must be independently verified',referenceKind:reference?.kind||null,score,summary,diagnosticSummary,validIntervalCoverage:coverage,beats,readouts};
if(outputPath)writeFileSync(outputPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({frames:recording.frames.length,score,summary,diagnosticSummary,validIntervalCoverage:coverage,referenceKind:report.referenceKind},null,2));
