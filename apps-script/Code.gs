/** 植物的運輸：以同一份試算表分頁儲存。替換前先保留原始 Apps Script 版本。 */
// 部署時在私人工作副本填入目標試算表 ID，公開範本不含成績表識別碼。
const SPREADSHEET_ID = 'SET_YOUR_SPREADSHEET_ID';
const API_VERSION = 'plant-transport-v2';
const ASSESSMENT_VERSION = 'transport-20-v1';
const LEARNING_VERSION = 'attempt-321-v1';
const LEARNING_COUNTS = {p1:3,p2:4,p3:4,p5:4,p6:4};
const ANSWER_KEY = [0,2,1,3,2,0,3,1,0,3,2,1,3,1,0,2,1,2,3,0];
const ACTIVITIES = ['p1','p2','p3','p4','p5','p6','p7','p8','assessment'];
const LOG_HEADERS = ['timestamp','class','seat','name','sessionId','eventId','activity','score','maxScore','dataJson','receiptJson','scoringVersion','q1Attempts','q1Points','q2Attempts','q2Points','q3Attempts','q3Points','q4Attempts','q4Points'];

function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'); }
function text_(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > (limit || 6000)) throw new Error('欄位未填寫或長度超過限制。');
  return value.trim();
}
function seat_(value) {
  const raw=String(value == null?'':value).trim();
  if(!/^(0?[1-9]|[12][0-9]|30)$/.test(raw)) throw new Error('座號需為 1～30 的整數。');
  return String(Number(raw));
}
function safe_(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const s = value == null ? '' : String(value);
  return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
}
function sheet_(name, requiredHeaders) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  let headers = sh.getLastRow() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String) : [];
  requiredHeaders.forEach(h => { if (headers.indexOf(h) < 0) headers.push(h); });
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  return {sh:sh,headers:headers};
}
function find_(table, column, value) {
  const index = table.headers.indexOf(column);
  if (index < 0 || table.sh.getLastRow() < 2) return 0;
  const values = table.sh.getRange(2,index+1,table.sh.getLastRow()-1,1).getValues();
  for (let i=0;i<values.length;i++) if (String(values[i][0]) === String(value)) return i+2;
  return 0;
}
function upsert_(name, headers, key, record) {
  const table = sheet_(name, headers);
  const row = find_(table,key,record[key]) || table.sh.getLastRow()+1;
  const old = row<=table.sh.getLastRow() ? table.sh.getRange(row,1,1,table.headers.length).getValues()[0] : [];
  const values = table.headers.map((h,i) => Object.prototype.hasOwnProperty.call(record,h) ? safe_(record[h]) : (old[i] == null?'':old[i]));
  // 座號以 1～30 的整數文字寫入，不補前導零。
  const seatCol = table.headers.indexOf('seat');
  if (seatCol >= 0) table.sh.getRange(row,seatCol+1).setNumberFormat('@');
  table.sh.getRange(row,1,1,values.length).setValues([values]);
  return row;
}
function doGet() {
  // 不透過公開端點提供學生名單或成績查詢。
  return json_({ok:true,message:'Web App is running',sheet:'plant-transport',apiVersion:API_VERSION,learningVersion:LEARNING_VERSION});
}
function validate_(body) {
  if (body.apiVersion !== API_VERSION) throw new Error('不支援的課程版本。');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(body.eventId || '') || !/^[a-zA-Z0-9-]{16,80}$/.test(body.sessionId || '')) throw new Error('紀錄識別碼無效。');
  if (ACTIVITIES.concat(['summary']).indexOf(body.activity) < 0) throw new Error('活動代碼無效。');
  const p = body.profile || {};
  p.class = text_(p.class,40); p.name = text_(p.name,50); p.seat = seat_(p.seat);
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new Error('缺少活動內容。');
  const data = body.data;
  if (['p1','p2','p3','p5','p6'].indexOf(body.activity) >= 0) {
    if (data.completed !== true || !data.answers || !Array.isArray(data.answers.controls)) throw new Error('學習頁尚未完成。');
    if (data.learning) {
      const learning=data.learning,count=LEARNING_COUNTS[body.activity];
      if (learning.version!==LEARNING_VERSION || !Array.isArray(learning.questions) || learning.questions.length!==count) throw new Error('學習歷程計分版本或題數不一致。');
      const ids=new Set();
      learning.questions.forEach(q=>{
        if (!q || !new RegExp('^q[1-'+count+']$').test(q.id) || ids.has(q.id) || q.solved!==true || !Number.isInteger(q.attempts) || q.attempts<1 || q.attempts>10000) throw new Error('題目嘗試次數或完成狀態無效。');
        ids.add(q.id);q.points=Math.max(1,4-q.attempts);
      });
      learning.questions.sort((a,b)=>a.id.localeCompare(b.id));
      learning.score=learning.questions.reduce((sum,q)=>sum+q.points,0);learning.maxScore=count*3;
      data.score=learning.score;data.maxScore=learning.maxScore;
    } else { delete data.score;delete data.maxScore; }
  }
  if (body.activity === 'p4') ['q1','q2','q3','q4'].forEach(k => { data[k] = text_(data[k]); });
  if (body.activity === 'p7') {
    if (!Number.isInteger(data.correct) || data.correct<0 || data.correct>15 || !Number.isInteger(data.wrong) || data.wrong<0 || data.wrong>30) throw new Error('遊戲作答次數無效。');
    if (!Number.isInteger(data.seconds) || data.seconds<0 || data.seconds>120) throw new Error('遊戲時間無效。');
    // 沿用原遊戲規則：起始 55，答對 +3、碰錯 -3；不是答對率。
    data.score = 55 + data.correct*3 - data.wrong*3;
    data.maxScore = 100;
  }
  if (body.activity === 'p8') {
    ['q1','q2','q3','q4','q5','q6'].forEach(k => { data[k] = text_(data[k]); });
    if (data.simulation !== true) throw new Error('需標示模擬資料。');
    ['endA','endB','lossA','lossB'].forEach(k => { if (!Number.isFinite(data[k]) || data[k]<0 || data[k]>10) throw new Error('模擬數值無效。'); });
    if (Math.abs(data.endA+data.lossA-10)>.051 || Math.abs(data.endB+data.lossB-10)>.051 || data.lossB<=data.lossA) throw new Error('模擬數值不一致。');
  }
  if (body.activity === 'assessment') {
    if (data.version !== ASSESSMENT_VERSION || !Array.isArray(data.answers) || data.answers.length !== 20 || data.answers.some(n => !Number.isInteger(n) || n<0 || n>3)) throw new Error('請完整回答同版本的 20 題選擇題。');
    data.correct = data.answers.filter((n,i) => n===ANSWER_KEY[i]).length;
    data.score = data.correct*5; data.maxScore = 100;
  }
  return body;
}
function sessionEvents_(table, sessionId) {
  if (table.sh.getLastRow()<2) return [];
  const index = table.headers.indexOf('sessionId');
  return table.sh.getRange(2,1,table.sh.getLastRow()-1,table.headers.length).getValues().filter(row => row[index]===sessionId).map(row => {
    const obj={}; table.headers.forEach((h,i) => obj[h]=row[i]); return obj;
  });
}
function summary_(events) {
  const completed = ACTIVITIES.filter(a => events.some(e => e.activity===a));
  function stats(activity) {
    const scores=events.filter(e => e.activity===activity && e.score!=='' && e.score!=null).map(e => Number(e.score));
    return {attempts:scores.length,latest:scores.length?scores[scores.length-1]:null,best:scores.length?Math.max.apply(null,scores):null};
  }
  const learning={score:0,maxScore:57,scoredPages:0,pages:{}};
  Object.keys(LEARNING_COUNTS).forEach(activity=>{
    const graded=events.filter(e=>e.activity===activity && e.score!=='' && e.score!=null && e.scoringVersion===LEARNING_VERSION);
    const latest=graded.length?graded[graded.length-1]:null;
    learning.pages[activity]={score:latest?Number(latest.score):null,maxScore:LEARNING_COUNTS[activity]*3};
    if(latest){learning.score+=Number(latest.score);learning.scoredPages++;}
  });
  return {completed:completed,complete:completed.length===ACTIVITIES.length,learning:learning,challenge:stats('p7'),assessment:stats('assessment')};
}
function saveSummary_(body, info, timestamp) {
  const p=body.profile;
  const headers=['timestamp','class','seat','name','sessionId','completedPages','complete','challengeLatest','challengeBest','challengeAttempts','assessmentLatest','assessmentBest','assessmentAttempts','learningTotal','learningMaxScore','learningScoredPages','p1Score','p1MaxScore','p2Score','p2MaxScore','p3Score','p3MaxScore','p5Score','p5MaxScore','p6Score','p6MaxScore'];
  const record={timestamp:timestamp,class:p.class,seat:p.seat,name:p.name,sessionId:body.sessionId,completedPages:info.completed.join(','),complete:info.complete,challengeLatest:info.challenge.latest,challengeBest:info.challenge.best,challengeAttempts:info.challenge.attempts,assessmentLatest:info.assessment.latest,assessmentBest:info.assessment.best,assessmentAttempts:info.assessment.attempts,learningTotal:info.learning.score,learningMaxScore:info.learning.maxScore,learningScoredPages:info.learning.scoredPages};
  Object.keys(LEARNING_COUNTS).forEach(activity=>{record[activity+'Score']=info.learning.pages[activity].score;record[activity+'MaxScore']=info.learning.pages[activity].maxScore;});
  upsert_('學習總表',headers,'sessionId',record);
}
function saveDetail_(body, timestamp) {
  const d=body.data,p=body.profile;
  const base={timestamp:timestamp,class:p.class,seat:p.seat,name:p.name,eventId:body.eventId,sessionId:body.sessionId};
  if (body.activity==='p4') upsert_('plant-transport',['timestamp','class','seat','name','q1','q2','q3','q4','eventId','sessionId'],'eventId',Object.assign({},base,{q1:d.q1,q2:d.q2,q3:d.q3,q4:d.q4}));
  if (body.activity==='p7') upsert_('運輸挑戰賽',['timestamp','class','seat','name','score','maxScore','correct','wrong','seconds','eventId','sessionId'],'eventId',Object.assign({},base,{score:d.score,maxScore:100,correct:d.correct,wrong:d.wrong,seconds:d.seconds}));
  if (body.activity==='p8') upsert_('蒸散探究',['timestamp','class','seat','name','q1','q2','q3','q4','q5','q6','initialVolume','endA','endB','lossA','lossB','diffLoss','dataType','eventId','sessionId'],'eventId',Object.assign({},base,{q1:d.q1,q2:d.q2,q3:d.q3,q4:d.q4,q5:d.q5,q6:d.q6,initialVolume:10,endA:d.endA,endB:d.endB,lossA:d.lossA,lossB:d.lossB,diffLoss:Math.round((d.lossB-d.lossA)*10)/10,dataType:'教學模擬，非實測'}));
  if (body.activity==='assessment') {
    const r=Object.assign({},base,{version:d.version,score:d.score,maxScore:100,correct:d.correct});
    const questions=ANSWER_KEY.map((_,i) => 'q'+(i+1)); questions.forEach((k,i) => r[k]='ABCD'[d.answers[i]]);
    upsert_('總評量',['timestamp','class','seat','name','version','score','maxScore','correct'].concat(questions,['eventId','sessionId']),'eventId',r);
  }
}
function legacy_(body) {
  // 舊版第 4 頁仍可提交；不修改或清空既有八欄資料。
  const record={timestamp:now_()};
  ['class','seat','name','q1','q2','q3','q4'].forEach(k => record[k]=text_(body[k]));
  record.seat=seat_(record.seat);
  const table=sheet_('plant-transport',['timestamp','class','seat','name','q1','q2','q3','q4']);
  table.sh.getRange(table.sh.getLastRow()+1,1,1,table.headers.length).setValues([table.headers.map(h => safe_(record[h]))]);
  return {ok:true};
}
function doPost(e) {
  const lock=LockService.getScriptLock();
  let locked=false;
  try {
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length>100000) throw new Error('缺少內容或資料過大。');
    const raw=JSON.parse(e.postData.contents);
    locked=lock.tryLock(20000);
    if (!locked) throw new Error('目前提交人數較多，請稍後重試。');
    if (!raw.apiVersion && !raw.activity) return json_(legacy_(raw));
    const body=validate_(raw);
    const table=sheet_('學習歷程',LOG_HEADERS);
    const existing=find_(table,'eventId',body.eventId);
    if (existing) {
      const row=table.sh.getRange(existing,1,1,table.headers.length).getValues()[0];
      if (row[table.headers.indexOf('sessionId')]!==body.sessionId || row[table.headers.indexOf('activity')]!==body.activity) throw new Error('紀錄識別碼衝突。');
      const prior=JSON.parse(row[table.headers.indexOf('receiptJson')]);
      // 上次若在寫入總表時中斷，重試仍補寫總表。
      if(!body.data.learning || prior.learningVersion===LEARNING_VERSION){
        saveSummary_(body,summary_(sessionEvents_(table,body.sessionId)),now_());
        return json_(prior);
      }
      // 新前端曾送到舊後端時，以原本保存的嘗試次數補計分，沿用同一筆事件。
      const original=JSON.parse(row[table.headers.indexOf('dataJson')]);
      if(original.learning?.version!==LEARNING_VERSION || !Array.isArray(original.learning.questions) || body.data.learning.questions.some(q=>!original.learning.questions.some(old=>old.id===q.id&&old.attempts===q.attempts&&old.solved===true))) throw new Error('舊紀錄沒有可核對的嘗試次數，不能直接補計分。');
    }
    const events=sessionEvents_(table,body.sessionId).filter(r=>r.eventId!==body.eventId);
    if (events.some(r => String(r.class)!==body.profile.class || String(Number(r.seat))!==body.profile.seat || String(r.name)!==body.profile.name)) throw new Error('此學習紀錄的學生資料不一致，請由首頁確認。');
    if (body.activity==='summary' && !summary_(events).complete) throw new Error('仍有活動尚未上傳，完成後才能確認全部學習。');
    if (body.data.learning) {
      const prior=events.filter(r=>r.activity===body.activity && r.scoringVersion===LEARNING_VERSION).slice(-1)[0];
      if(prior){
        const previous=JSON.parse(prior.dataJson).learning.questions;
        if(body.data.learning.questions.some(q=>!previous.some(old=>old.id===q.id&&old.attempts===q.attempts))) throw new Error('本頁已保留第一次答對時的得分，不能重設嘗試次數。');
      }
    }
    const timestamp=now_();
    saveDetail_(body,timestamp);
    const event={timestamp:timestamp,class:body.profile.class,seat:body.profile.seat,name:body.profile.name,sessionId:body.sessionId,eventId:body.eventId,activity:body.activity,score:body.data.score == null?'':body.data.score,maxScore:body.data.maxScore == null?'':body.data.maxScore,dataJson:JSON.stringify(body.data)};
    if(body.data.learning){event.scoringVersion=LEARNING_VERSION;body.data.learning.questions.forEach(q=>{event[q.id+'Attempts']=q.attempts;event[q.id+'Points']=q.points;});}
    const info=summary_(events.concat([event]));
    const receipt={ok:true,apiVersion:API_VERSION,recorded:true,eventId:body.eventId,activity:body.activity,timestamp:timestamp,score:event.score,maxScore:event.maxScore,correct:body.data.correct == null?null:body.data.correct,summary:info};
    if(body.data.learning)receipt.learningVersion=LEARNING_VERSION;
    event.receiptJson=JSON.stringify(receipt);
    upsert_('學習歷程',LOG_HEADERS,'eventId',event);
    saveSummary_(body,info,timestamp);
    SpreadsheetApp.flush();
    return json_(receipt);
  } catch (err) { return json_({ok:false,apiVersion:API_VERSION,error:String(err.message || err)}); }
  finally { if (locked) lock.releaseLock(); }
}
