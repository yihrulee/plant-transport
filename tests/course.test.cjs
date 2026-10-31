const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const results=[];
const check=(name,fn)=>{fn();results.push(name);};
let failWrite=null;
class Sheet {
 constructor(name){this.name=name;this.rows=[];}
 getLastRow(){return this.rows.length;}
 getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
 getRange(row,col,n=1,m=1){
  const sh=this;
  return {
   getValues(){return Array.from({length:n},(_,r)=>Array.from({length:m},(_,c)=>sh.rows[row-1+r]?.[col-1+c]??''));},
   setNumberFormat(){return this;},
   setValues(values){
    if(failWrite && failWrite(sh.name,row)){failWrite=null;throw new Error('simulated write interruption');}
    for(let r=0;r<n;r++){while(sh.rows.length<row+r)sh.rows.push([]);for(let c=0;c<m;c++){let val=values[r][c];if(typeof val==='string'&&val.startsWith("'"))val=val.slice(1);sh.rows[row-1+r][col-1+c]=val;}}return this;
   }
  };
 }
}
const sheets=new Map();
const spreadsheet={getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{const s=new Sheet(name);sheets.set(name,s);return s;}};
const old=spreadsheet.insertSheet('plant-transport');
old.rows=[['timestamp','class','seat','name','q1','q2','q3','q4'],['2026-10-30T19:44:29.031Z','原班級','01','原紀錄','原1','原2','原3','原4']];
const originalRow=JSON.stringify(old.rows[1]);
const gas=vm.createContext({
 SpreadsheetApp:{openById(id){assert.equal(id,'SET_YOUR_SPREADSHEET_ID');return spreadsheet;},flush(){}},
 ContentService:{MimeType:{JSON:'application/json'},createTextOutput(text){return {text,setMimeType(){return this;}};}},
 LockService:{getScriptLock(){return {tryLock(){return true;},releaseLock(){}};}},
 Utilities:{formatDate(date,zone){assert.equal(zone,'Asia/Taipei');return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);}}
});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8'),gas);
const api='plant-transport-v2';
let sequence=0;
const profile={class:'測試701',seat:'12',name:'自動測試學生'};
const sessionId='test-session-00000001';
function request(activity,data,overrides={}){return {apiVersion:api,eventId:'test-event-'+String(++sequence).padStart(12,'0'),sessionId,activity,profile:{...profile},data,...overrides};}
function post(body){return JSON.parse(gas.doPost({postData:{contents:JSON.stringify(body)}}).text);}
const dataContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assessment-data.js'),'utf8'),dataContext);
const questions=dataContext.window.PT_QUESTIONS;
check('all JavaScript and HTML inline scripts compile',()=>{
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(root,name),'utf8'),{filename:name});
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html')&&n!=='enzymatic_inquiry.html')){
  const html=fs.readFileSync(path.join(root,name),'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1],{filename:name});
  for(const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g))if(!/^(https?:|javascript:|data:)/.test(match[1]))assert(fs.existsSync(path.join(root,match[1])),name+' missing '+match[1]);
 }
});
check('20 questions, four options, balanced keys, matching backend key',()=>{
 assert.equal(questions.length,20);assert.equal(new Set(questions.map(q=>q.id)).size,20);
 questions.forEach(q=>assert.equal(q.options.length,4));
 for(let i=0;i<4;i++)assert.equal(questions.filter(q=>q.answer===i).length,5);
 assert.equal(JSON.stringify(questions.map(q=>q.answer)),vm.runInContext('JSON.stringify(ANSWER_KEY)',gas));
});
check('health check exposes version only, no student records',()=>{const h=JSON.parse(gas.doGet().text);assert.equal(h.apiVersion,api);assert(!h.profile);});
check('legacy submissions preserved, new server time is Taipei text',()=>{
 const r=post({class:'舊版測試',seat:'03',name:'測試',q1:'1',q2:'2',q3:'3',q4:'4'});assert(r.ok);assert.equal(JSON.stringify(old.rows[1]),originalRow);assert.match(old.rows.at(-1)[0],/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
});
check('invalid fields and unfinished summary rejected',()=>{assert(!post(request('p4',{q1:'only'})).ok);assert(!post(request('summary',{})).ok);assert(!post(request('p1',{completed:true,answers:{controls:[]}},{apiVersion:'old'})).ok);});
check('seat boundaries accept 1 and 30, normalize 01, reject invalid values on server',()=>{
 for(const [input,expected]of [['1','1'],['30','30'],['01','1']]){
  const p={...profile,seat:input},r=post(request('p1',{completed:true,answers:{controls:[]}},{profile:p,sessionId:'seat-boundary-'+String(++sequence).padStart(8,'0')}));assert(r.ok);assert.equal(vm.runInContext('seat_('+JSON.stringify(input)+')',gas),expected);
 }
 for(const input of ['0','31','99','-1','1.5','abc','001',''])assert(!post(request('p1',{completed:true,answers:{controls:[]}},{profile:{...profile,seat:input},sessionId:'seat-invalid-00000001'})).ok);
 const prior=post({class:'舊頁測試',seat:'31',name:'測試',q1:'1',q2:'2',q3:'3',q4:'4'});assert(!prior.ok);
});
const completion={completed:true,answers:{controls:[]}};
for(const activity of ['p1','p2','p3','p5','p6'])assert(post(request(activity,completion)).ok);
function learningData(count,attempts){return {completed:true,answers:{controls:[]},score:999,maxScore:999,learning:{version:'attempt-321-v1',score:999,maxScore:999,questions:Array.from({length:count},(_,i)=>({id:'q'+(i+1),attempts:attempts[i],solved:true,points:999}))}};}
check('learning scores use first/second/third-or-later rules, recomputed by server',()=>{
 let receipt;
 for(const activity of ['p1','p2','p3','p5','p6']){
  const count=activity==='p1'?3:4;
  receipt=post(request(activity,learningData(count,count===3?[1,2,4]:[1,2,3,4])));
  assert(receipt.ok);assert.equal(receipt.learningVersion,'attempt-321-v1');assert.equal(receipt.score,count===3?6:7);assert.equal(receipt.maxScore,count*3);
 }
 assert.equal(receipt.summary.learning.score,34);assert.equal(receipt.summary.learning.maxScore,57);assert.equal(receipt.summary.learning.scoredPages,5);
 const table=sheets.get('學習歷程'),headers=table.rows[0];assert(headers.includes('q1Attempts')&&headers.includes('q4Points'));
 const last=table.rows.at(-1);assert.equal(last[headers.indexOf('q2Attempts')],2);assert.equal(last[headers.indexOf('q2Points')],2);assert.equal(last[headers.indexOf('q4Points')],1);
 const sum=sheets.get('學習總表');assert.equal(sum.rows.at(-1)[sum.rows[0].indexOf('learningTotal')],34);
});
check('learning score rejects duplicate questions and reset attempts after grading',()=>{
 const malformed=learningData(3,[1,2,3]);malformed.learning.questions[2].id='q1';assert(!post(request('p1',malformed)).ok);
 assert(!post(request('p1',learningData(3,[1,1,1]))).ok);
 const incomplete=learningData(4,[1,2,3,4]);incomplete.learning.questions[3].solved=false;assert(!post(request('p2',incomplete)).ok);
});
check('old backend acknowledgement can be upgraded from saved attempt data without duplicate event',()=>{
 const body=request('p2',learningData(4,[2,2,2,2]),{sessionId:'upgrade-session-000001'});
 const prior={ok:true,apiVersion:api,recorded:true,eventId:body.eventId,activity:'p2',score:'',maxScore:''};
 gas.upsert_('學習歷程',vm.runInContext('LOG_HEADERS',gas),'eventId',{timestamp:'2026-10-31 00:00:00',class:profile.class,seat:profile.seat,name:profile.name,sessionId:body.sessionId,eventId:body.eventId,activity:'p2',score:'',maxScore:'',dataJson:JSON.stringify(body.data),receiptJson:JSON.stringify(prior)});
 const count=sheets.get('學習歷程').rows.length;const receipt=post(body);assert(receipt.ok);assert.equal(receipt.score,8);assert.equal(receipt.learningVersion,'attempt-321-v1');assert.equal(sheets.get('學習歷程').rows.length,count);
});
const ring=request('p4',{q1:'甲',q2:'乙',q3:'丙',q4:'丁'});
check('p4 retains old columns and appends identified records',()=>{assert(post(ring).recorded);assert.equal(JSON.stringify(old.rows[1]),originalRow);assert.equal(old.rows[0].slice(0,8).join(','),'timestamp,class,seat,name,q1,q2,q3,q4');});
check('exact retry does not append another row',()=>{const n=old.rows.length;const a=post(ring),b=post(ring);assert.equal(old.rows.length,n);assert.equal(a.eventId,b.eventId);});
check('challenge score recalculated, no client score trusted',()=>{const r=post(request('p7',{correct:10,wrong:2,seconds:83,score:999}));assert.equal(r.score,79);assert(sheets.has('運輸挑戰賽'));});
check('inquiry routes six answers and simulated data to separate sheet',()=>{const r=post(request('p8',{q1:'問題',q2:'假設',q3:'有無葉片',q4:'水量',q5:'結果',q6:'結論',simulation:true,endA:8.8,endB:4.5,lossA:1.2,lossB:5.5}));assert(r.ok);assert(sheets.has('蒸散探究'));});
check('assessment graded on server at 5 points each, latest and best kept',()=>{
 const a=post(request('assessment',{version:'transport-20-v1',answers:questions.map(q=>q.answer),score:0}));assert.equal(a.score,100);
 const b=post(request('assessment',{version:'transport-20-v1',answers:questions.map(q=>(q.answer+1)%4),score:999}));assert.equal(b.score,0);assert.equal(b.summary.assessment.latest,0);assert.equal(b.summary.assessment.best,100);assert.equal(b.summary.assessment.attempts,2);
 const final=post(request('summary',{}));assert(final.ok&&final.summary.complete);
});
check('interruption after detail write recovers without duplicate detail',()=>{
 const body=request('p4',{q1:'重試甲',q2:'重試乙',q3:'重試丙',q4:'重試丁'});
 failWrite=(name,row)=>name==='學習歷程'&&row>1;
 assert(!post(body).ok);const n=old.rows.length;assert(post(body).ok);assert.equal(old.rows.length,n);
});
check('interruption after ledger write recovers summary without duplicate event',()=>{
 const body=request('p7',{correct:15,wrong:0,seconds:90});failWrite=(name,row)=>name==='學習總表'&&row>1;
 assert(!post(body).ok);const n=sheets.get('學習歷程').rows.length;assert(post(body).ok);assert.equal(sheets.get('學習歷程').rows.length,n);
});
check('cross-student session reuse rejected',()=>{const bad=request('p1',completion,{profile:{class:'其他班',seat:'02',name:'另一位'}});assert(!post(bad).ok);});

async function browserTests(){
 const deviceName=process.env.COURSE_TEST_DEVICE||'desktop';
 const profiles={desktop:{viewport:{width:1366,height:900},hasTouch:false,isMobile:false},phone:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2},tablet:{viewport:{width:820,height:1180},hasTouch:true,isMobile:false,deviceScaleFactor:2}};
 const device=profiles[deviceName];if(!device)throw new Error('Unknown test device');
 const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const data=fs.readFileSync(target);res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':target.endsWith('.png')?'image/png':target.endsWith('.jpg')?'image/jpeg':target.endsWith('.mp4')?'video/mp4':'text/html; charset=utf-8');res.end(data);}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext(device);
 const page=await context.newPage();const errors=[];page.on('pageerror',err=>errors.push(err.message));
 let mode='normal';let outbound=0;
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith(origin))return route.continue();
  if(url.startsWith('https://script.google.com/macros/s/')){
   outbound++;
   if(mode==='offline')return route.abort('failed');
   const submitted=route.request().postDataJSON();
   const body=mode==='old'?{ok:true}:mode==='old-grade'?{ok:true,apiVersion:api,recorded:true,eventId:submitted.eventId,activity:submitted.activity,score:'',maxScore:''}:post(submitted);
   return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  }
  return route.abort('blockedbyclient');
 });
 const uploaded=activity=>page.waitForFunction(id=>PT.last(id)?.status==='uploaded',activity);
 const activate=selector=>device.hasTouch?page.locator(selector).tap():page.locator(selector).click();
 try{
  await page.goto(origin+'/7.html');await page.waitForURL('**/index.html?return=7.html');
  assert.equal(await page.locator('#student-form input').count(),3);
  await page.goto(origin+'/index.html');
  for(const value of ['0','31','99','-1','1.5','xx']){await page.locator('[name=seat]').fill(value);assert.equal(await page.locator('[name=seat]').evaluate(el=>el.checkValidity()),false);}
  for(const value of ['1','30','01']){await page.locator('[name=seat]').fill(value);assert.equal(await page.locator('[name=seat]').evaluate(el=>el.checkValidity()),true);}
  const rejected=await page.evaluate(()=>{try{PT.startProfile({class:'測試',seat:'31',name:'測試'});return false;}catch{return true;}});assert(rejected);
  results.push('browser: seat range validated by input and application, including boundaries 1 and 30');
  await page.locator('[name=class]').fill(profile.class);await page.locator('[name=seat]').fill(profile.seat);await page.locator('[name=name]').fill(profile.name);await page.locator('#student-form button').click();await page.waitForURL('**/1.html');
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();});await page.waitForFunction(()=>document.querySelector('video').currentTime>.2);await page.evaluate(()=>document.querySelector('video').pause());
  assert.equal(await page.locator('#pt-learning-points').textContent(),'0／57 分');
  await page.evaluate(()=>{el.xylem.value='光合作用的養分';el.phloem.value='水分與礦物質';check1();});
  assert.equal(await page.evaluate(()=>PT.learning.packet().questions[0].attempts),1);
  await page.reload();assert.equal(await page.evaluate(()=>PT.learning.packet().questions[0].attempts),1);
  await page.evaluate(()=>{el.xylem.value='水分與礦物質';el.phloem.value='光合作用的養分';check1();});assert.equal(await page.locator('#pt-learning-points').textContent(),'2／57 分');
  await page.evaluate(()=>check1());assert.equal(await page.evaluate(()=>PT.learning.packet().questions[0].attempts),2);
  for(let attempt=0;attempt<3;attempt++){
   await page.evaluate(()=>{el.leafX.value='';el.leafP.value='';el.stemX.value='';el.stemP.value='';check2();});
   await page.locator('#redo2').click();
  }
  await page.evaluate(()=>{el.leafX.value='上側';el.leafP.value='下側';el.stemX.value='內側';el.stemP.value='外側';check2();el.ms.forEach(e=>e.checked=['A','B'].includes(e.value));check3();});await uploaded('p1');
  assert.equal(await page.locator('#pt-learning-points').textContent(),'6／57 分');assert.equal(await page.evaluate(()=>PT.last('p1').receipt.score),6);
  assert.equal(await page.evaluate(()=>PT.learning.packet().questions[1].attempts),4);
  const priorEvent=await page.evaluate(()=>PT.last('p1').eventId);await page.locator('#redo1').click();await page.evaluate(()=>{el.xylem.value='水分與礦物質';el.phloem.value='光合作用的養分';check1();});await uploaded('p1');assert.equal(await page.evaluate(()=>PT.last('p1').eventId),priorEvent);
  results.push('browser: wrong attempts survive reload, second correct is 2, fourth correct is 1, solved questions never add points again');
  await page.goto(origin+'/2.html');
  assert.equal(await page.locator('#pt-learning-points').textContent(),'6／57 分');
  await page.locator('input[name=q1][value=A]').check();await page.locator('button[data-check=q1]').click();
  for(const value of ['a','b','c','e'])await page.locator('input[name=q2][value='+value+']').check();await page.locator('button[data-check=q2]').click();
  for(const value of ['向日葵','榕樹','玉米','水稻']){await activate('.chip[data-item="'+value+'"]');if(['玉米','水稻'].includes(value))await activate('.chip[data-item="'+value+'"]');}await activate('button[data-check=q3]');
  mode='old-grade';await page.locator('#sel-out').selectOption('韌皮部');await page.locator('#sel-in').selectOption('木質部');await page.locator('button[data-check=q4]').click();await page.waitForFunction(()=>PT.last('p2')?.error.includes('學習歷程分數'));assert.equal(await page.locator('#nextLink').getAttribute('aria-disabled'),'true');assert.equal(await page.locator('#pt-learning-points').textContent(),'18／57 分');mode='normal';await page.locator('#pt-retry').click();await uploaded('p2');assert.equal(await page.evaluate(()=>PT.last('p2').receipt.score),12);assert.equal(await page.locator('#pt-learning-points').textContent(),'18／57 分');
  results.push('browser: old scoring receipt is rejected, retry confirms real page score');
  await page.goto(origin+'/3.html');
  assert.equal(await page.locator('#pt-learning-points').textContent(),'18／57 分');
  await page.locator('input[name=q1][value=A]').check();await page.locator('#q1-check').click();
  for(const value of ['A','C','E'])await page.locator('input[name=q2][value='+value+']').check();await page.locator('#q2-check').click();
  await page.locator('#q3-input').fill('韌皮部');await page.locator('#q3-check').click();
  for(const [id,value] of [['q4-spring-size','大'],['q4-spring-color','淺'],['q4-fall-size','小'],['q4-fall-color','深']])await page.locator('#'+id).selectOption(value);await page.locator('#q4-check').click();await uploaded('p3');
  await page.goto(origin+'/4.html');assert.equal(await page.locator('#cls,#no,#name').count(),0);assert(!(await page.content()).includes('目前指定的雲端表'));
  for(let i=1;i<=4;i++)await page.locator('#q'+i).fill('測試回答 '+i);
  await page.locator('#submitBtn').click();await uploaded('p4');
  await page.goto(origin+'/5.html');
  await page.locator('#q1 input[value=B]').check();await page.locator('#q1 .check-btn').click();
  for(const value of ['花苞','花朵','幼葉'])await page.locator('#q2 input[value="'+value+'"]').check();await page.locator('#q2 .check-btn').click();
  await page.evaluate(()=>{const list=document.getElementById('ord');for(const key of ['D','C','B','A']){const li=list.querySelector('[data-key='+key+']');while(li.previousElementSibling)li.querySelector('button[data-move=up]').click();}});await page.locator('#q3 .check-btn').click();
  await page.locator('#sel-autumn').selectOption('down');await page.locator('#sel-spring').selectOption('up');await page.locator('#q4 .check-btn').click();await uploaded('p5');
  await page.goto(origin+'/6.html');await page.locator('#q1 input[value="木質部"]').check();await page.locator('#q1 .check').click();
  for(const value of ['A','B','D'])await page.locator('#q2 input[value='+value+']').check();await page.locator('#q2 .check').click();
  for(const [key,value] of [['0','根毛'],['1','保衛細胞'],['2','滲透作用']])await page.locator('#q3 select[data-key="'+key+'"]').selectOption(value);await page.locator('#q3 .check').click();
  await page.locator('#q4 select[data-k=a]').selectOption('close');await page.locator('#q4 select[data-k=b]').selectOption('transpull');await page.locator('#q4 .check').click();await uploaded('p6');
  await page.goto(origin+'/7.html');await activate('#btnStart');await page.waitForFunction(()=>GAME.state==='playing');
  await page.evaluate(()=>{GAME.options=[];GAME.questionAnswered=true;fish.y=canvas.height/2;});
  const yBefore=await page.evaluate(()=>fish.y);
  if(device.hasTouch){
   await page.locator('#btnDown').scrollIntoViewIfNeeded();const b=await page.locator('#btnDown').boundingBox();const client=await context.newCDPSession(page);
   await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForFunction(y=>fish.y>y+5,yBefore);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>fish.vy===0);
   await page.locator('#game').scrollIntoViewIfNeeded();const c=await page.locator('#game').boundingBox();await page.touchscreen.tap(c.x+c.width*.25,c.y+c.height*.5);
  }else{await page.keyboard.down('ArrowDown');await page.waitForFunction(y=>fish.y>y+5,yBefore);await page.keyboard.up('ArrowDown');await page.waitForFunction(()=>fish.vy===0);}
  await page.evaluate(()=>{GAME.qIndex=0;loadQuestion();fish.y=canvas.height*.6;const correct=GAME.options.find(o=>o.isCorrect);GAME.options.forEach(o=>{if(o!==correct)o.alive=false;});correct.x=fish.x-10*DPR;correct.y=fish.y-correct.h/2;});await page.waitForFunction(()=>GAME.correct===1);await page.waitForFunction(()=>GAME.qIndex===1);
  await page.evaluate(()=>{fish.y=canvas.height*.6;const wrong=GAME.options.find(o=>!o.isCorrect);GAME.options.forEach(o=>{if(o!==wrong)o.alive=false;});wrong.x=fish.x-10*DPR;wrong.y=fish.y-wrong.h/2;});await page.waitForFunction(()=>GAME.wrong===1);
  const longOption=await page.evaluate(()=>{const text=QUESTIONS.flatMap(q=>q.options).sort((a,b)=>b.length-a.length)[0],option=makeOption(text,false,350*DPR,0);return {width:option.w,limit:canvas.width*.68,height:option.h};});assert(longOption.width<=longOption.limit+1);
  await page.evaluate(()=>{GAME.questionAnswered=true;GAME.options=[];GAME.timeLeft=1;});await uploaded('p7');assert.equal(await page.evaluate(()=>PT.last('p7').receipt.score),55);
  results.push('browser: actual '+(device.hasTouch?'touch movement':'keyboard movement')+', correct/wrong collision scoring, timed finish, and game upload');
  assert.equal(await page.locator('#pt-learning-score').count(),1);
  await activate('#nextLink');await page.waitForURL('**/8.html');assert.equal(await page.locator('#cls,#seat,#stu').count(),0);
  await page.locator('#startBtn').click();await page.locator('#resultBtn').click({timeout:10000});
  assert(await page.evaluate(()=>typeof Chart==='function'&&Chart.getChart(document.getElementById('barChart'))?.data.datasets[0].data.length===2));
  for(let i=1;i<=6;i++)await page.locator('#q'+i).fill('探究測試回答 '+i);
  const exp=await page.evaluate(()=>JSON.stringify(PT.draft('p8').experiment));await page.reload();assert.equal(await page.locator('#q6').inputValue(),'探究測試回答 6');assert.equal(await page.evaluate(()=>JSON.stringify(PT.draft('p8').experiment)),exp);
  await page.locator('#submitBtn').click();await uploaded('p8');await page.locator('#endLink').click();await page.waitForURL('**/9.html');
  for(let i=0;i<20;i++)await page.locator('input[name="'+questions[i].id+'"][value="'+questions[i].answer+'"]').check();
  await page.locator('#grade-button').click();await uploaded('assessment');assert.equal(await page.locator('#score').textContent(),'100／100 分');
  const shots=path.join(root,'qa','final-'+deviceName);fs.mkdirSync(shots,{recursive:true});
  await page.screenshot({path:path.join(shots,'assessment-desktop.png'),fullPage:true});
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(shots,'assessment-top.png')});
  await page.locator('#nextLink').click();await page.waitForURL('**/10.html');assert.equal(await page.locator('#summary-rows tr').count(),9);assert((await page.locator('#completion-note').textContent()).includes('9／9'));assert.equal(await page.locator('#learning-total').textContent(),'54／57 分');assert((await page.locator('#summary-rows tr').first().textContent()).includes('6／9'));
  await uploaded('summary');await page.screenshot({path:path.join(shots,'summary-desktop.png'),fullPage:true});
  results.push('browser: sign in once, real lesson question handlers, challenge end, inquiry, assessment, automatic final summary');
  await page.goto(origin+'/6.html');await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('#pt-learning-points').textContent(),'54／57 分');
  const boxes=await page.evaluate(()=>{const panel=document.getElementById('pt-learning-score'),badge=panel.getBoundingClientRect(),nav=document.querySelector('.page-nav').getBoundingClientRect();return {right:badge.right,left:badge.left,bottom:badge.bottom,width:badge.width,height:badge.height,navTop:nav.top,position:getComputedStyle(panel).position,identity:document.getElementById('pt-student').textContent,headerCount:document.querySelectorAll('.pt-bar').length};});assert.equal(boxes.position,'fixed');assert(boxes.headerCount===0&&boxes.left>=0&&boxes.right<=390&&boxes.bottom<=boxes.navTop-8&&boxes.width<180&&boxes.height<75);assert.equal(boxes.identity,'測試701 班　12 號');await page.screenshot({path:path.join(shots,'learning-score-mobile.png')});await page.setViewportSize({width:1280,height:900});
  await page.reload();assert.equal(await page.locator('#pt-learning-points').textContent(),'54／57 分');
  results.push('browser: small bottom-right identity box aggregates 57 points, avoids navigation, and survives page changes and reload');
  await page.goto(origin+'/4.html');mode='offline';await page.locator('#q1').fill('離線保留的回答');await page.locator('#submitBtn').click();await page.waitForFunction(()=>!!PT.last('p4').error);assert.equal(await page.locator('#next-link').getAttribute('aria-disabled'),'true');
  const pendingId=await page.evaluate(()=>PT.last('p4').eventId);await page.reload();assert.equal(await page.locator('#q1').inputValue(),'離線保留的回答');mode='normal';await page.locator('#pt-retry').click();await uploaded('p4');assert.equal(await page.evaluate(()=>PT.last('p4').eventId),pendingId);
  results.push('browser: offline draft survives reload, retry reuses event ID, next link waits for receipt');
  mode='old';await page.locator('#q1').fill('檢查舊版後端回應');await page.locator('#submitBtn').click();await page.waitForFunction(()=>PT.last('p4').error.includes('尚未更新'));assert.equal(await page.evaluate(()=>PT.last('p4').status),'pending');mode='normal';await page.locator('#pt-retry').click();await uploaded('p4');results.push('browser: old ok:true response is not accepted as a confirmed write');
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/10.html');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(shots,'summary-mobile.png'),fullPage:true});
  await page.goto(origin+'/index.html');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(shots,'home-mobile.png'),fullPage:true});
  page.on('dialog',dialog=>dialog.accept());await page.locator('[name=class]').fill('測試702');await page.locator('[name=name]').fill('第二位測試學生');await page.locator('#student-form button').click();await page.waitForURL('**/1.html');assert.equal(await page.evaluate(()=>PT.events().length),0);assert.equal(await page.evaluate(()=>PT.profile().name),'第二位測試學生');
  results.push('browser: mobile layout and shared-computer student isolation');
  assert.deepEqual(errors,[]);
  const report={passed:true,device:deviceName,viewport:device.viewport,hasTouch:device.hasTouch,checks:results,externalWrites:0,mockedRequests:outbound,sheets:[...sheets.keys()],limitations:['Live Apps Script deployment and Google Sheets writes are not tested.','Device tests use Chromium emulation, not physical iOS/Android devices. Safari and Firefox engines are unavailable.','Game correct/wrong collisions are sampled; the timer is advanced for completion instead of playing all 15 questions.']};
  fs.writeFileSync(path.join(shots,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
browserTests().catch(error=>{console.error(error);process.exitCode=1;});
