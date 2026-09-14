// Explicit numeric whitelist: never retain frames, crops, model states or device identifiers.
export class DiagnosticLog {
 constructor(limit=10800){this.limit=limit;this.rows=[];this.total=0;this.started=new Date().toISOString();}
 add(input){const row={};for(const k of ['t','value','sqi','latencyMs','arrivalMs','faceAgeMs','bufferSamples','previewIntervals','strictIntervals','previewLastBeat','strictLastBeat','ibi','rmssd'])row[k]=Number.isFinite(input[k])?input[k]:null;
 for(const k of ['running','faceFresh','bufferFull','previewGood','strictGood'])row[k]=input[k]===true;
 for(const k of ['previewReason','strictReason'])row[k]=String(input[k]??'').slice(0,200);
 this.rows.push(row);this.total++;if(this.rows.length>this.limit)this.rows.splice(0,this.rows.length-this.limit);}
 snapshot(){return {schema:'pulse-cathedral/facephys-diagnostics/1',started:this.started,exported:new Date().toISOString(),totalSamples:this.total,retainedSamples:this.rows.length,thresholds:{previewSqi:.38,hrvSqi:.5,maxGapSeconds:.15},note:'Local numeric waveform and diagnostic data; no images, video, face geometry, or model state. Retains at most 10800 inference samples. No automatic upload.',samples:this.rows.map(r=>({...r}))};}
}
