const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 const errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await page.goto('http://127.0.0.1:8991/');
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
 assert.equal(await page.locator('#hr').innerText(),'—');
 assert.equal(await page.locator('#coverage').innerText(),'0.0%');
 await page.waitForFunction(()=>{const c=document.querySelector('#source'),d=c.getContext('2d').getImageData(0,0,640,480).data;let min=255,max=0;for(let i=0;i<d.length;i+=4000){min=Math.min(min,d[i]);max=Math.max(max,d[i]);}return max-min>50;});
 for(const subject of ['subject1','subject3','subject4']){
  await page.selectOption('#recording',subject);
  await page.waitForFunction(s=>document.querySelector('#status').textContent.startsWith('Ready')&&document.querySelector('#status').textContent.includes(s),subject);
  for(const mode of ['production','without-region-agreement','wide-mask']){
   await page.selectOption('#mode',mode);
   await page.locator('#cursor').evaluate(el=>{el.value=25;el.dispatchEvent(new Event('input'));});
   assert.notEqual(await page.locator('#reason').innerText(),'—');
   assert.equal(await page.locator('#path-scores tr').count(),4);
   for(const span of ['8','15','30'])await page.selectOption('#span',span);
  }
 }
 await page.selectOption('#recording','subject1');
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('subject1')&&document.querySelector('#status').textContent.startsWith('Ready'));
 await page.selectOption('#mode','production');await page.selectOption('#span','15');
 await page.screenshot({path:'benchmarks/artifacts/control/replay-desktop.png',fullPage:true});
 const before=await page.locator('#cursor').inputValue();await page.click('#play');
 await page.waitForFunction(v=>Number(document.querySelector('#cursor').value)>Number(v)+.2,before);await page.click('#play');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'benchmarks/artifacts/control/replay-mobile.png',fullPage:true});
 await page.locator('#file').setInputFiles('/Users/anton/Desktop/pulse-camera-2026-09-13T01-39-12.659Z.json');
 await page.waitForFunction(()=>document.querySelector('#recording').value==='local'&&document.querySelector('#status').textContent.startsWith('Ready'),{},{timeout:120000});
 assert.equal(await page.locator('#show-source').isDisabled(),true);
 assert.match(await page.locator('#score-note').innerText(),/No synchronized reference/);
 assert.equal(await page.locator('#control-error').innerText(),'—');
 await page.screenshot({path:'benchmarks/artifacts/control/user-log-replay.png',fullPage:true});
 assert.deepEqual(posts,[],'Local replay must not upload data');assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: controls, modes, spans, source overlay, playback, mobile, actual user JSON in Worker, no uploads/errors.');
})().catch(e=>{console.error(e);process.exit(1)});
