const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.PLANT_PREVIEW_ORIGIN||'http://127.0.0.1:8768';
(async()=>{
 const browser=await chromium.launch({headless:true}),results=[];const folder=path.join(__dirname,'../qa/compact-header');fs.mkdirSync(folder,{recursive:true});
 try{
  for(const width of [360,390,768,820,1024,1366]){
   const touch=width<=1024,context=await browser.newContext({viewport:{width,height:900},hasTouch:touch,isMobile:width<700});let writes=0;
   await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/_preview/submit')){writes++;return route.abort('blockedbyclient');}return url.startsWith(origin)?route.continue():route.abort('blockedbyclient');});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/index.html');await page.locator('[name=class]').fill('701');await page.locator('[name=seat]').fill('22');await page.locator('[name=name]').fill('測試學生');await page.locator('#student-form button').click();await page.waitForURL('**/1.html');
   const dims=await page.evaluate(()=>{const chip=document.getElementById('pt-learning-score'),r=chip.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,bottom:r.bottom,top:r.top,position:getComputedStyle(chip).position,closed:!chip.open,headerCount:document.querySelectorAll('.pt-bar').length,identity:document.getElementById('pt-student').textContent,statusHidden:document.getElementById('pt-status').hidden,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert(dims.width<180&&dims.height<75&&dims.position==='fixed'&&dims.closed&&dims.headerCount===0&&dims.statusHidden&&!dims.overflow);assert(Math.abs(width-dims.right-12)<1);assert.equal(dims.identity,'701 班　22 號');
   assert.equal(await page.locator('#pt-learning-points').textContent(),'0／57 分');
   await page.locator('#pt-learning-score summary')[touch?'tap':'click']();
   await page.waitForFunction(()=>document.getElementById('pt-learning-score').open,null,{timeout:3000});
   const opened=await page.evaluate(()=>{const pop=document.querySelector('.pt-learning-popover').getBoundingClientRect(),box=document.getElementById('pt-learning-score').getBoundingClientRect();return {open:document.getElementById('pt-learning-score').open,left:pop.left,right:pop.right,top:pop.top,bottom:pop.bottom,boxTop:box.top,boxHeight:box.height};});
   assert(opened.open&&opened.left>=0&&opened.right<=width&&opened.top>=0&&opened.bottom<=opened.boxTop-7&&Math.abs(opened.boxHeight-dims.height)<1,JSON.stringify({width,dims,opened}));
   await page.keyboard.press('Escape');assert.equal(await page.locator('#pt-learning-score').evaluate(el=>el.open),false);
   await page.evaluate(()=>{PT.learning.record('q1',false);PT.learning.record('q1',true);});assert.equal(await page.locator('#pt-learning-points').textContent(),'2／57 分');
   if(width===390||width===1366)await page.screenshot({path:path.join(folder,'header-'+width+'.png'),fullPage:false});
   await page.goto(origin+'/2.html');assert.equal(await page.locator('#pt-learning-points').textContent(),'2／57 分');await page.reload();assert.equal(await page.locator('#pt-learning-points').textContent(),'2／57 分');
   await page.evaluate(()=>PT.status('測試上傳失敗訊息',true));assert.equal(await page.locator('#pt-status').isVisible(),true);await page.evaluate(()=>PT.render());assert.equal(await page.locator('#pt-status').isVisible(),false);
   assert.deepEqual(errors,[]);assert.equal(writes,0);results.push({viewportWidth:width,...dims,detailsOverlay:'PASS',aggregateRetained:'PASS',errorStatus:'PASS'});await context.close();
  }
 }finally{await browser.close();}
 const report={passed:true,externalWrites:0,results};fs.writeFileSync(path.join(folder,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
