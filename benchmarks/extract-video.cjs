// Deterministic extraction uses production FaceDetector and sampleFacePixels.
// Landmarks update at 10 Hz synchronously: does not reproduce asynchronous camera scheduling.
const {chromium}=require('playwright');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage();page.on('console',m=>{if(m.text().startsWith('progress'))console.log(m.text())});
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:8987/');
 await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js'});
 const result=await page.evaluate(async({seconds,start,source,diagnostics})=>{
  const {skinMaskRGB}=await import('/benchmarks/skin-mask.js');const {FaceDetector}=await import('/js/rppg.js');const {sampleFacePixels}=await import('/js/capture-sample.js');
  const info=await(await fetch('/video-info')).json();const face=new FaceDetector();await face.init();
  const canvas=document.createElement('canvas');canvas.width=info.width;canvas.height=info.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const maskCanvas=document.createElement('canvas');maskCanvas.width=info.width;maskCanvas.height=info.height;const maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});const frames=[];let previous=null,motion=0,previousBrightness=null,lastDetect=-Infinity;
  const stride=Math.max(1,Math.round(info.fps/30));
  for(let i=Math.round(start*info.fps);i<Math.min(info.frames,(start+seconds)*info.fps);i+=stride){
   const t=info.timestamps?.[i]??i/info.fps;const blob=await(await fetch('/frame/'+i)).blob();const image=await createImageBitmap(blob);ctx.drawImage(image,0,0);image.close();
   if(t-lastDetect>=.1-1e-8){lastDetect=t;await face.detect(canvas);const current=face.lastLandmarks;if(current&&previous){const width=Math.abs(current[234].x-current[454].x)||.1;motion=Math.hypot(current[1].x-previous[1].x,current[1].y-previous[1].y)/width;}else motion=0;previous=current;}
   if(face.lastLandmarks){const s=sampleFacePixels(face.lastLandmarks,ctx.getImageData(0,0,info.width,info.height).data,info.width,info.height,{motion,previousBrightness});previousBrightness=s.meta.brightness;const wide=skinMaskRGB(face.lastLandmarks,ctx.getImageData(0,0,info.width,info.height).data,info.width,info.height,maskCtx);frames.push({t,rgb:s.rgb,...s.meta,wideRGB:wide.rgb,widePixels:wide.pixels,...(diagnostics?{sourceIndex:i,boxes:s.boxes,landmarks:face.lastLandmarks.map(p=>[p.x,p.y])}:{})});}
   else frames.push({t,rgb:null,invalidReason:'No face',...(diagnostics?{sourceIndex:i}: {})});
   if(frames.length%300===0)console.log('progress '+frames.length+' frames');
  }
  return {schema:'pulse-cathedral/1',source,settings:{...info,extractionFps:info.fps/stride,clock:info.timestamps?'decoded presentation timestamps':'frame index / container FPS; independent synchronization unverified',detector:'production MediaPipe, synchronous 10 Hz'},frames};
 },{seconds:Number(process.env.REPLAY_SECONDS||120),start:Number(process.env.REPLAY_START_SECONDS||0),source:process.env.DATASET||'MPU-rPPG public sample',diagnostics:process.env.REPLAY_DIAGNOSTICS==='1'});
 fs.writeFileSync(process.argv[2],JSON.stringify(result));console.log('saved '+result.frames.length+' frames');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
