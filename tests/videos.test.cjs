const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),origin=process.env.PLANT_PREVIEW_ORIGIN||'http://127.0.0.1:8768';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'videos/manifest.json'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 const report={passed:true,externalWrites:0,totalBytes:manifest.totalBytes,videos:[]};
 for(const item of manifest.videos){
  assert.equal(hash(path.join(root,'videos',item.file)),item.sha256);
  assert.equal(hash(path.join(root,'..','output',item.sourceName)),item.sha256);
  const response=await fetch(origin+'/videos/'+item.file,{headers:{Range:'bytes=0-31'}});
  assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal((await response.arrayBuffer()).byteLength,32);
  assert.equal(response.headers.get('content-range'),'bytes 0-31/'+item.bytes);
 }
 const invalid=await fetch(origin+'/videos/lesson-1.mp4',{headers:{Range:'bytes=999999999-'}});assert.equal(invalid.status,416);
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort('blockedbyclient'));
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(origin+'/index.html');
  await page.locator('[name=class]').fill('影片測試');await page.locator('[name=seat]').fill('30');await page.locator('[name=name]').fill('測試學生');await page.locator('#student-form button').click();await page.waitForURL('**/1.html');
  const anchors={1:'[aria-labelledby="sec-func"]',2:'[aria-labelledby="sec1"]',3:'.card.lesson',5:'.lesson',6:'[aria-labelledby="s1h"]'};
  for(const item of manifest.videos){
   await page.goto(origin+'/'+item.page+'.html');
   await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.videoWidth===1920&&v.duration>0;});
   const state=await page.evaluate(anchor=>{const v=document.querySelector('video'),block=v.closest('section'),text=document.querySelector(anchor);return {controls:v.controls,autoplay:v.autoplay,inline:v.playsInline,duration:v.duration,width:v.videoWidth,height:v.videoHeight,precedesText:!!(block.compareDocumentPosition(text)&Node.DOCUMENT_POSITION_FOLLOWING)};},anchors[item.page]);
   assert(state.controls&&state.inline&&!state.autoplay&&state.precedesText);
   await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();});
   await page.waitForFunction(()=>document.querySelector('video').currentTime>.2);
   await page.evaluate(()=>{const v=document.querySelector('video');v.pause();v.currentTime=v.duration/2;});
   await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.seeking&&Math.abs(v.currentTime-v.duration/2)<1&&v.readyState>=2;});
   await page.evaluate(()=>{document.querySelector('video').currentTime=0;scrollTo(0,0);});
   if(item.page===1)await page.screenshot({path:path.join(root,'qa/video-page-1-desktop.png'),fullPage:false});
   await page.setViewportSize({width:390,height:844});
   const layout=await page.evaluate(()=>{const r=document.querySelector('video').getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth};});
   assert(layout.left>=-1&&layout.right<=layout.viewport+1);
   if(item.page===6){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'qa/video-page-6-mobile.png'),fullPage:false});}
   await page.setViewportSize({width:1280,height:1000});
   report.videos.push({page:item.page,file:item.file,duration:state.duration,playback:'PASS',seeking:'PASS',placement:'before text',mobileWidth:'PASS',originalHashUnchanged:true});
  }
  assert.deepEqual(errors,[]);
  const health=await (await fetch(origin+'/_preview/health')).json();assert.equal(health.sheets.length,0);
  fs.writeFileSync(path.join(root,'qa/video-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
