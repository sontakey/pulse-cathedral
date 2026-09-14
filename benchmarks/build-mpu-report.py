"""Create a standalone numeric-only waveform and HR inspection report."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'benchmarks/artifacts/mpu-toolbox'
data = json.loads((BASE / 'results.json').read_text())
data['referenceAudit'] = json.loads((BASE / 'verification.json').read_text())['diagnostics']
for clip in data['clips']:
    clip['waveform'] = json.loads((BASE / clip['recording'] / clip['segment'] / 'waveforms.json').read_text())
methods = ['POS', 'CHROM', 'GREEN', 'TS-CAN']
colors = {'POS': '#e5a55b', 'CHROM': '#c291ec', 'GREEN': '#69bf85', 'TS-CAN': '#5ebcf4'}

# Exportable HR comparison across all prespecified clips; common y-axis and no selection.
fig, axes = plt.subplots(5, 3, figsize=(17, 16), sharey=True)
for ax, clip in zip(axes.ravel(), data['clips']):
    for method in methods:
        rows = [r for r in clip['windows'] if r['method'] == method]
        x = [r['start'] + 4 for r in rows]
        ax.plot(x, [r['hr'] for r in rows], label=method, color=colors[method], linewidth=1.2)
    ax.plot(x, [r['deviceHR'] for r in rows], color='black', label='Device HR', linewidth=2)
    ax.set_title(f"Recording {clip['recording']} · {clip['segment']}" + (' · NO FACE' if clip['fallback'] else ''))
    ax.set_ylim(35, 185)
    ax.set_xlabel('Video seconds')
    ax.set_ylabel('bpm')
    ax.grid(alpha=.2)
axes[0, 0].legend(fontsize=8)
fig.suptitle('MPU representative recordings · frozen offline Toolbox methods\n8 s windows / 4 s step · smoothed device HR reference · no IBI/HRV validation', fontsize=15)
fig.tight_layout(rect=(0, 0, 1, .96))
fig.savefig(BASE / 'hr-comparison.png', dpi=150)
plt.close(fig)

template = r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MPU · Toolbox benchmark</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#10171d;color:#e0e8ef}body{margin:auto;max-width:1160px;padding:28px 20px 60px}h1{font-size:30px;margin:8px 0}h2{font-size:20px;margin-top:30px}p{line-height:1.55;color:#acbdca}.eyebrow{color:#7dbde1;font-size:12px;letter-spacing:.15em}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}th,td{text-align:right;padding:12px 10px;border-bottom:1px solid #31404a}th:first-child,td:first-child{text-align:left}.scroll{overflow-x:auto}select{background:#22323e;color:inherit;border:1px solid #4b677b;border-radius:6px;padding:10px;font:inherit;max-width:100%}.controls{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:20px 0}label{display:flex;gap:8px;align-items:center}input[type=range]{flex:1;min-width:140px}canvas{width:100%;height:145px;display:block;background:#16212a;border-radius:8px;margin:8px 0 18px}.hr{height:210px}.note{padding:14px;border:1px solid #43515b;border-radius:8px}.stats{font-variant-numeric:tabular-nums;color:#9cd7f7}a{color:#90cef5}#readout{min-height:24px} @media(max-width:600px){body{padding:20px 12px}h1{font-size:25px}th,td{padding:10px 7px}.controls{gap:10px}}
</style><body><div class="eyebrow">SIGNAL LAB / OFFLINE BENCHMARK</div><h1>MPU-rPPG: does the pulse survive?</h1>
<p>Five recordings · three predefined 120-second segments each · four frozen methods. These are recording-level development results, not verified participant-held-out accuracy.</p>
<p class="note">All methods use the published Toolbox static face crop, 72×72 input and offline processing. TS-CAN uses the pretrained PURE checkpoint. CSV Count is paired with encoded frame index; physiological synchronization is unverified. Nominal 60 fps includes repeated or minimally changed frames. <strong>HR agreement does not establish IBI or HRV accuracy.</strong></p>
<h2>Four additional recordings</h2><p>Recording 8 is excluded from this aggregate because it duplicates our previous sample. Every planned window is retained; invalid outputs and reference windows are counted separately.</p><div class="scroll"><table id="aggregate"></table></div>
<h2>Results by recording</h2><div class="scroll"><table id="recordings"></table></div>
<h2>Inspect every segment</h2><div class="controls"><label>Recording <select id="recording"></select></label><label>Segment <select id="segment"><option>early</option><option>middle</option><option>late</option></select></label></div>
<p id="clip-info"></p><div class="scroll"><table id="clip-metrics"></table></div>
<h2>Heart-rate estimates</h2><p>Black/white reference line: device HR. Colored lines: estimates from 8-second windows. The waveform cursor selects an independent inspection interval below.</p><canvas id="hr" class="hr"></canvas>
<div class="controls"><label>Waveform view <select id="span"><option value="10">10 seconds</option><option value="20">20 seconds</option><option value="60">60 seconds</option></select></label><input id="position" aria-label="Waveform start time" type="range" step=".25"><span id="readout" class="stats"></span></div>
<p>Each trace is independently centered and scaled within the visible interval. Amplitudes are arbitrary and cannot be compared between methods. No phase alignment or cosmetic pulse reconstruction is applied. The reference PPG is shown as supplied.</p><p id="reference-audit" class="note"></p>
<div id="traces"></div><p class="note" id="limits"></p><p>Upstream revision <code id="revision"></code>. No training or deployment. Source videos remain on the external drive; this report contains numeric signals only.</p>
<script>const DATA=__DATA__;const methods=['POS','CHROM','GREEN','TS-CAN'];const colors={'POS':'#e5a55b','CHROM':'#c291ec','GREEN':'#69bf85','TS-CAN':'#5ebcf4','Reference PPG':'#d8e1e8'};const $=s=>document.querySelector(s);const fmt=(x,n=2)=>x==null?'—':x.toFixed(n);function metrics(id,m){$(id).innerHTML='<tr><th>Method</th><th>MAE bpm</th><th>Bias bpm</th><th>Within ±5 bpm</th><th>Scored / planned</th></tr>'+methods.map(k=>`<tr><td style="color:${colors[k]}">${k}</td><td>${fmt(m[k].maeBpm)}</td><td>${fmt(m[k].biasBpm)}</td><td>${fmt(m[k].within5Bpm*100,1)}%</td><td>${m[k].scoredWindows} / ${m[k].plannedWindows}</td></tr>`).join('')}
metrics('#aggregate',DATA.additionalRecordingsOnly);$('#recordings').innerHTML='<tr><th>Recording</th>'+methods.map(m=>`<th>${m} MAE</th>`).join('')+'</tr>'+Object.entries(DATA.byRecording).map(([k,v])=>`<tr><td>${k}${k==='8'?' (repeat control)':''}</td>`+methods.map(m=>`<td>${fmt(v[m].maeBpm)}</td>`).join('')+'</tr>').join('');$('#recording').innerHTML=DATA.recordings.map(r=>`<option value="${r.recording}">${r.recording}${r.recording==='8'?' · repeat control':''}</option>`).join('');$('#revision').textContent=DATA.protocol.upstreamCommit;$('#limits').textContent=DATA.protocol.limitations.join(' ');
$('#traces').innerHTML=['Reference PPG',...methods].map((m,i)=>`<div style="color:${colors[m]}">${m}</div><canvas id="trace-${i}" aria-label="${m} waveform"></canvas>`).join('');let clip;
function setup(c){let d=devicePixelRatio||1;c.width=c.clientWidth*d;c.height=c.clientHeight*d;let ctx=c.getContext('2d');ctx.scale(d,d);return [ctx,c.clientWidth,c.clientHeight]}
function axes(c,start,end,lo,hi){const [ctx,w,h]=setup(c);ctx.strokeStyle='#35434e';ctx.fillStyle='#8ba0af';ctx.font='11px system-ui';for(let i=0;i<5;i++){let x=45+(w-60)*i/4;ctx.beginPath();ctx.moveTo(x,10);ctx.lineTo(x,h-25);ctx.stroke();ctx.fillText((start+(end-start)*i/4).toFixed(1)+'s',Math.min(x,w-45),h-7)}return {ctx,w,h,x:t=>45+(t-start)/(end-start)*(w-60),y:v=>10+(hi-v)/(hi-lo)*(h-35)}}
function line(a,t,v,color){a.ctx.strokeStyle=color;a.ctx.lineWidth=1.5;a.ctx.beginPath();let active=false;for(let i=0;i<t.length;i++){if(!Number.isFinite(v[i])){active=false;continue}let x=a.x(t[i]),y=a.y(v[i]);if(active)a.ctx.lineTo(x,y);else a.ctx.moveTo(x,y);active=true}a.ctx.stroke()}
function plotHR(){let a=axes($('#hr'),clip.start,clip.start+120,35,185);for(let v=40;v<=180;v+=35){a.ctx.fillText(v,8,a.y(v));}for(let m of methods){let rows=clip.windows.filter(r=>r.method===m);line(a,rows.map(r=>r.start+4),rows.map(r=>r.hr),colors[m]);if(m==='POS')line(a,rows.map(r=>r.start+4),rows.map(r=>r.deviceHR),'#f5f5f5')}}
function draw(){let start=+$('#position').value,span=+$('#span').value,end=start+span;$('#readout').textContent=`${start.toFixed(2)}–${end.toFixed(2)} s`;let wf=clip.waveform,ix=[];wf.t.forEach((t,i)=>{if(t>=start&&t<end)ix.push(i)});['Reference PPG',...methods].forEach((m,j)=>{let raw=m==='Reference PPG'?wf.reference:wf.signals[m],v=ix.map(i=>raw[i]);let mean=v.reduce((a,b)=>a+b,0)/v.length;let sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/v.length)||1;let z=v.map(x=>(x-mean)/sd),range=Math.max(3,...z.map(Math.abs));let a=axes($('#trace-'+j),start,end,-range,range);line(a,ix.map(i=>wf.t[i]),z,colors[m]);a.ctx.fillText('a.u.',8,20)});plotHR()}
function range(reset){let span=+$('#span').value;$('#position').min=clip.start;$('#position').max=clip.start+120-span;if(reset)$('#position').value=clip.start+8;draw()}
function select(){clip=DATA.clips.find(c=>c.recording===$('#recording').value&&c.segment===$('#segment').value);metrics('#clip-metrics',clip.metrics);$('#clip-info').textContent=`${clip.start}–${clip.start+120} s · ${clip.faceCount} face candidate(s) at first frame · ${clip.fallback?'FACE DETECTION FAILED: upstream fallback retained':'fixed crop'} · PPG reference zeros ${(clip.referencePPGZeroFraction*100).toFixed(1)}%`;const audit=DATA.referenceAudit.find(a=>a.recording===clip.recording&&a.segment===clip.segment);$('#reference-audit').textContent=`Reference check: dominant-frequency HR from the supplied PPG differs from device HR by ${fmt(audit.referenceSpectralVsDeviceHRMAE)} bpm on average in this segment. This is an exploratory consistency check, not independent ground truth. Poor agreement may reflect artifacts, harmonics, or reference timing issues.`;range(true)}$('#recording').onchange=select;$('#segment').onchange=select;$('#span').onchange=()=>range(false);$('#position').oninput=draw;window.onresize=draw;select();</script></body></html>'''
(BASE / 'report.html').write_text(template.replace('__DATA__', json.dumps(data, separators=(',', ':'), allow_nan=False).replace('</', '<\\/')))
print(BASE / 'report.html')
