const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const origin=process.env.PLANT_PREVIEW_ORIGIN||'http://127.0.0.1:8768';
(async()=>{
 const browser=await chromium.launch({headless:true});const results=[];
 try{
  for(const width of [360,390,768,820,1024,1366]){
   const context=await browser.newContext({viewport:{width,height:width<700?844:1000},hasTouch:width<=1024,isMobile:width<700});
   let writes=0;await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/_preview/submit')){writes++;return route.abort('blockedbyclient');}return url.startsWith(origin)?route.continue():route.abort('blockedbyclient');});
   const page=await context.newPage();const errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.goto(origin+'/index.html');await page.locator('[name=class]').fill('版面測試');await page.locator('[name=seat]').fill('12');await page.locator('[name=name]').fill('測試學生');await page.locator('#student-form button').click();await page.waitForURL('**/1.html');
   for(const file of ['index.html',...Array.from({length:10},(_,i)=>(i+1)+'.html')]){
    await page.goto(origin+'/'+file);
    const data=await page.evaluate(()=>{
     const viewport=document.documentElement.clientWidth;
     const offenders=[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>viewport+2&&!el.closest('.pt-table-wrap,.table-wrap');}).slice(0,8).map(el=>({tag:el.tagName,id:el.id,class:typeof el.className==='string'?el.className:'',right:Math.round(el.getBoundingClientRect().right)}));
     let game=null;const button=document.getElementById('btnStart');if(button){const r=button.getBoundingClientRect(),stage=document.getElementById('stageWrap').getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);game={buttonWithinStage:r.top>=stage.top&&r.bottom<=stage.bottom,clickTarget:!!top&&(top===button||button.contains(top)),stageHeight:Math.round(stage.height)};}
     return {width:viewport,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>viewport+2,offenders,game};
    });results.push({width,file,...data});
    if(file==='7.html'&&(width===390||width===820)){fs.mkdirSync(path.join(__dirname,'../qa'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../qa','audit-game-'+width+'.png'),fullPage:true});}
   }
   results.push({width,errors,writes});await context.close();
  }
 }finally{await browser.close();}
 const failures=results.filter(r=>r.overflow||(r.game&&(!r.game.buttonWithinStage||!r.game.clickTarget))||(r.errors&&r.errors.length)||r.writes);
 fs.writeFileSync(path.join(__dirname,'../qa/layout-audit.json'),JSON.stringify({passed:!failures.length,results},null,2));console.log(JSON.stringify({checked:results.length,failures},null,2));
})().catch(err=>{console.error(err);process.exitCode=1;});
