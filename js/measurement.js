// Timestamped research baseline. Units: seconds, RGB 0–255, intervals milliseconds.
// POS overlap-add + causal Butterworth sections; NOT HRVCam or a validated device.
export const CONFIG = Object.freeze({ fs: 60, posSeconds: 1.6, low: 0.7, high: 4,
  historySeconds: 16, lookahead: 2, analysisStep: 0.25, warmup: 8,
  maxGap: 0.15, qualityThreshold: 0.55, hrvSeconds: 60, hrvCoverage: 0.9 });
export const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const sd = a => { const m=mean(a); return Math.sqrt(mean(a.map(v => (v-m)**2))); };
const clamp = v => Math.max(0, Math.min(1, v));

export function posWaveform(rgb, fs = CONFIG.fs) {
  const n = rgb.length, w = Math.round(CONFIG.posSeconds * fs);
  const out = new Float64Array(n), weights = new Float64Array(n);
  for (let end = w; end <= n; end++) {
    const start = end - w, sums = [0, 0, 0];
    for (let i = start; i < end; i++) for (let c = 0; c < 3; c++) sums[c] += rgb[i][c] / w;
    if (sums.some(v => v <= 0)) continue;
    const s1 = [], s2 = [];
    for (let i = start; i < end; i++) {
      const [r, g, b] = rgb[i].map((v, c) => v / sums[c]);
      s1.push(g - b); s2.push(g + b - 2 * r);
    }
    const m1 = mean(s1), m2 = mean(s2), d2 = sd(s2);
    const alpha = d2 > 1e-12 ? sd(s1) / d2 : 0;
    for (let j = 0; j < w; j++) {
      out[start + j] += s1[j] - m1 + alpha * (s2[j] - m2);
      weights[start + j]++;
    }
  }
  return Array.from(out, (v, i) => weights[i] ? v / weights[i] : 0);
}

export function biquadCoefficients(type, cutoff, fs) {
  const w = 2 * Math.PI * cutoff / fs, c = Math.cos(w), a = Math.sin(w) / Math.SQRT2;
  const b = type === 'highpass' ? [(1+c)/2, -(1+c), (1+c)/2] : [(1-c)/2, 1-c, (1-c)/2];
  return { b: b.map(v => v / (1+a)), a: [1, -2*c/(1+a), (1-a)/(1+a)] };
}
export function bandpass(values, fs = CONFIG.fs) {
  let out = values;
  for (const [type, cutoff] of [['highpass', CONFIG.low], ['lowpass', CONFIG.high]]) {
    const { a, b } = biquadCoefficients(type, cutoff, fs);
    let x1=0, x2=0, y1=0, y2=0;
    out = out.map(x => {
      const y=b[0]*x+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2;
      x2=x1; x1=x; y2=y1; y1=y; return y;
    });
  }
  return out;
}

// Hann-window spectral concentration, not a calibrated probability of accuracy.
export function spectrum(values, fs = CONFIG.fs) {
  if (values.length < fs * 2 || sd(values) < 1e-8) return { hr: null, quality: 0, bins: [] };
  const m=mean(values), x=values.map((v,i)=>(v-m)*(0.5-0.5*Math.cos(2*Math.PI*i/(values.length-1))));
  const bins=[];
  for (let f=0.4; f<=6; f+=0.025) {
    const angle=2*Math.PI*f/fs, cr=Math.cos(angle), ci=Math.sin(angle);
    let re=0, im=0, r=1, q=0;
    for (const v of x) { re+=v*r; im+=v*q; const next=r*cr-q*ci; q=q*cr+r*ci; r=next; }
    bins.push({ hz:f, power:re*re+im*im });
  }
  const candidates=bins.filter(b=>b.hz>=CONFIG.low-1e-6 && b.hz<=CONFIG.high+1e-6);
  const peak=candidates.reduce((a,b)=>a.power>b.power?a:b);
  const radius=Math.max(0.16,1.3/(x.length/fs));
  const total=bins.reduce((s,b)=>s+b.power,0);
  const inside=bins.reduce((s,b)=>s+((Math.abs(b.hz-peak.hz)<radius || Math.abs(b.hz-2*peak.hz)<radius)?b.power:0),0);
  return { hr: peak.hz*60, quality: total ? clamp(inside/total) : 0, bins };
}
export function signalQuality(signal, fs=30) { return spectrum(signal,fs).quality; }

export function peakTimes(signal, times, fs=CONFIG.fs) {
  const candidates=[], spread=sd(signal), radius=Math.round(fs*0.3);
  if (spread<1e-8) return [];
  for (let i=1;i<signal.length-1;i++) {
    if (signal[i]<=signal[i-1] || signal[i]<signal[i+1]) continue;
    const left=Math.min(...signal.slice(Math.max(0,i-radius),i));
    const right=Math.min(...signal.slice(i+1,Math.min(signal.length,i+radius+1)));
    if (signal[i]-Math.max(left,right)<spread*0.35) continue;
    // A local ±83 ms least-squares fit reduces frame jitter without regularizing IBIs.
    const fitRadius=Math.min(Math.round(fs/12),i,signal.length-1-i), count=2*fitRadius+1;
    let sy=0,s2=0,s4=0,sxy=0,s2y=0;
    for(let k=-fitRadius;k<=fitRadius;k++){const y=signal[i+k];sy+=y;s2+=k*k;s4+=k**4;sxy+=k*y;s2y+=k*k*y;}
    const curvature=(s2y-s2*sy/count)/(s4-s2*s2/count), slope=sxy/s2;
    const shift=curvature<0?Math.max(-2.5,Math.min(2.5,-slope/(2*curvature))):0;
    candidates.push({ t:times[i]+shift/fs, value:signal[i] });
  }
  const selected=[];
  for (const p of candidates.sort((a,b)=>b.value-a.value)) {
    if (selected.every(q=>Math.abs(q.t-p.t)>=0.24)) selected.push(p);
  }
  return selected.sort((a,b)=>a.t-b.t);
}

export function intervalStats(intervals, end, seconds=CONFIG.hrvSeconds) {
  const window=intervals.filter(b=>b.start>=end-seconds && b.t<=end);
  const valid=window.filter(b=>b.valid), duration=valid.reduce((s,b)=>s+b.ibiMs/1000,0);
  const coverage=clamp(duration/seconds), diffs=[];
  for (let i=1;i<window.length;i++) {
    const a=window[i-1], b=window[i];
    if (a.valid && b.valid && a.segment===b.segment && Math.abs(a.t-b.start)<1e-6) diffs.push((b.ibiMs-a.ibiMs)**2);
  }
  const ready=coverage>=CONFIG.hrvCoverage && valid.length>=20 && diffs.length>=18;
  const vals=valid.map(b=>b.ibiMs), avg=mean(vals);
  return { coverage, count:valid.length, rmssd:ready?Math.sqrt(mean(diffs)):null,
    sdnn:ready?Math.sqrt(vals.reduce((s,v)=>s+(v-avg)**2,0)/(vals.length-1)):null };
}

export class RPPGProcessor {
  constructor({captureStages=false}={}) { this.captureStages=captureStages; this.reset(); }
  reset() {
    this.samples=[]; this.rgbBuffer=[]; this.pulseSignal=[]; this.waveform=[]; this.analysisTrace=null;
    this.beats=[]; this.intervals=[]; this.segment=0; this.origin=null;
    this.lastInput=null; this.lastAnalysis=-Infinity; this.lastBeat=null; this.committed=-Infinity;
    this.sampleRate=CONFIG.fs; this.windowLength=CONFIG.fs*4; this.duplicates=0;
    this.result=this.empty('Waiting for camera');
  }
  empty(reason) { return { pulse:0, hr:null, hrv:null, sdnn:null, ibi:null, quality:0, fps:0,
    coverage:0, agreement:null, reason, newBeats:[], latency:null, timestamp:null, windowSeconds:CONFIG.hrvSeconds, diagnostics:null }; }
  gap(reason='Face lost', t=this.lastInput) {
    if (this.samples.length) this.segment++;
    this.samples=[]; this.rgbBuffer=[]; this.pulseSignal=[]; this.waveform=[]; this.analysisTrace=null;
    this.origin=null; this.lastInput=null; this.lastBeat=null; this.committed=-Infinity;
    this.lastAnalysis=-Infinity; this.result={...this.empty(reason), timestamp:t};
    return this.result;
  }
  addSample(rgb, t, meta={}) {
    if (!Number.isFinite(t)) throw new TypeError('A video timestamp in seconds is required');
    if (!rgb || rgb.length!==3 || rgb.some(v=>!Number.isFinite(v)||v<0||v>255)) return this.gap('Invalid RGB',t);
    if (this.lastInput!==null && t<=this.lastInput) { this.duplicates++; return {...this.result,newBeats:[]}; }
    if (this.lastInput!==null && t-this.lastInput>CONFIG.maxGap) this.gap('Frame gap',t);
    if (meta.invalidReason) return this.gap(meta.invalidReason,t);
    if (this.origin===null) this.origin=t;
    this.lastInput=t;
    this.samples.push({t,rgb,regions:meta.regions});
    while(this.samples.length && this.samples[0].t<t-CONFIG.historySeconds) this.samples.shift();
    this.rgbBuffer=this.samples.map(s=>s.rgb);
    if (t-this.lastAnalysis<CONFIG.analysisStep) return {...this.result,newBeats:[]};
    this.lastAnalysis=t;
    const recent=this.samples.filter(s=>s.t>=t-3), fps=recent.length>1?(recent.length-1)/(t-recent[0].t):0;
    if (t-this.origin<CONFIG.warmup) return this.result={...this.empty('Collecting 8 seconds of clean signal'),fps,timestamp:t};
    if (fps<20) return this.result={...this.empty('Frame rate below 20 fps'),fps,timestamp:t};
    const startIndex=Math.ceil((this.samples[0].t-this.origin)*CONFIG.fs), times=[], rgbUniform=[], regions=[[],[],[]];
    let j=0;
    for (let k=startIndex;this.origin+k/CONFIG.fs<=t;k++) {
      const at=this.origin+k/CONFIG.fs;
      while(j<this.samples.length-2 && this.samples[j+1].t<at) j++;
      const a=this.samples[j], b=this.samples[j+1]; if(!b) break;
      const w=clamp((at-a.t)/(b.t-a.t));
      times.push(at); rgbUniform.push(a.rgb.map((v,c)=>v+(b.rgb[c]-v)*w));
      for(let r=0;r<3;r++) if(a.regions?.[r] && b.regions?.[r]) regions[r].push(a.regions[r].map((v,c)=>v+(b.regions[r][c]-v)*w));
    }
    const rawPulse=posWaveform(rgbUniform), pulse=bandpass(rawPulse);
    // Optional local replay instrumentation. It does not change signal processing or gates.
    if(this.captureStages) this.analysisTrace={times,rgb:rgbUniform,rawPOS:rawPulse,filtered:pulse};
    const trim=Math.round(3*CONFIG.fs), end=times.findLastIndex(at=>at<=t-CONFIG.lookahead);
    const stable=pulse.slice(trim,end+1), stableTimes=times.slice(trim,end+1);
    const spec=spectrum(stable.slice(-8*CONFIG.fs));
    let agreement=null;
    if(regions.every(r=>r.length===times.length)) {
      const waves=regions.map(r=>bandpass(posWaveform(r)).slice(trim,end+1));
      const correlations=[];
      for(let a=0;a<3;a++) for(let b=a+1;b<3;b++) {
        const ma=mean(waves[a]), mb=mean(waves[b]); let xy=0,xx=0,yy=0;
        for(let i=0;i<waves[a].length;i++){const x=waves[a][i]-ma,y=waves[b][i]-mb;xy+=x*y;xx+=x*x;yy+=y*y;}
        correlations.push(xx*yy>1e-20?clamp(xy/Math.sqrt(xx*yy)):0);
      }
      agreement=mean(correlations);
    }
    // Check before bandpass too: filtering broadband noise can make it look periodic.
    const unfilteredQuality=spectrum(rawPulse.slice(trim,end+1).slice(-8*CONFIG.fs)).quality;
    const quality=Math.min(spec.quality,unfilteredQuality)*(agreement===null?1:agreement), good=quality>=CONFIG.qualityThreshold;
    const reason=good?'Signal accepted — heuristic quality':agreement!==null && agreement<0.6?'Facial regions disagree':'Weak or irregular signal — readouts withheld';
    const newBeats=[];
    for(const peak of peakTimes(pulse.slice(trim,end+1+Math.round(0.3*CONFIG.fs)),times.slice(trim,end+1+Math.round(0.3*CONFIG.fs)))) {
      if(peak.t>t-CONFIG.lookahead) continue;
      if(peak.t<=this.committed || (this.lastBeat && peak.t-this.lastBeat.t<0.24)) continue;
      // The first analysis seeds a single prior beat rather than emitting historical beats.
      if(this.committed===-Infinity && peak.t<t-CONFIG.lookahead-CONFIG.analysisStep-0.1) continue;
      const beat={t:peak.t,confirmedAt:t,valid:good,quality,segment:this.segment};
      if(this.lastBeat) {
        const ibiMs=(beat.t-this.lastBeat.t)*1000;
        const valid=good && this.lastBeat.valid && ibiMs>=250 && ibiMs<=60000/42;
        const interval={start:this.lastBeat.t,t:beat.t,ibiMs,valid,quality,segment:this.segment,
          reason:valid?'accepted':(!good || !this.lastBeat.valid)?'quality':'interval outside 42–240 bpm'};
        this.intervals.push(interval); beat.ibiMs=ibiMs; beat.valid=valid;
      }
      this.beats.push(beat); newBeats.push(beat); this.lastBeat={...beat,valid:good};
    }
    this.committed=t-CONFIG.lookahead;
    this.beats=this.beats.filter(b=>b.t>=t-310); this.intervals=this.intervals.filter(b=>b.t>=t-310);
    this.pulseSignal=stable; this.waveform=stableTimes.map((at,i)=>({t:at,value:stable[i]}));
    const windowEnd=t-CONFIG.lookahead, stats=intervalStats(this.intervals,windowEnd);
    const latest=this.intervals.at(-1), fresh=latest && windowEnd-latest.t<1.5;
    return this.result={pulse:stable.at(-1)||0,hr:good?spec.hr:null,hrv:good?stats.rmssd:null,sdnn:good?stats.sdnn:null,
      ibi:good && fresh && latest.valid?latest.ibiMs:null,quality,fps,coverage:stats.coverage,agreement,reason,
      newBeats,latency:newBeats.length?1000*(t-newBeats.at(-1).t):this.result.latency,timestamp:t,windowSeconds:CONFIG.hrvSeconds,
      diagnostics:{candidateHr:spec.hr,filteredConcentration:spec.quality,rawConcentration:unfilteredQuality,
        agreementMultiplier:agreement===null?1:agreement,qualityThreshold:CONFIG.qualityThreshold,
        inputSamples:this.samples.length,uniformSamples:times.length,uniformFs:CONFIG.fs},
      hrWindow:{start:stableTimes[Math.max(0,stableTimes.length-8*CONFIG.fs)],end:stableTimes.at(-1)}};
  }
}
