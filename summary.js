(function(){
 'use strict';
 const host=document.getElementById('summary-rows');
 const status=document.getElementById('summary-status');
 const sync=document.getElementById('sync-summary');
 let syncing=false,autoTried='';
 const student=PT.profile();
 if(student)document.getElementById('summary-student').textContent=student.class+' 班　'+student.seat+' 號　'+student.name;
 function render(){
  host.replaceChildren();let count=0,learningTotal=0,learningPages=0;
  const learningIds=['p1','p2','p3','p5','p6'];
  PT.REQUIRED.forEach((activity,i)=>{
   const events=PT.confirmed(activity),last=PT.last(activity);
   if(events.length)count++;
   const graded=events.filter(e=>typeof e.receipt.score==='number');
   const latest=graded.at(-1),scores=graded.map(e=>e.receipt.score);
   const maximum=latest?.receipt.maxScore;
   if(learningIds.includes(activity)&&latest){learningTotal+=latest.receipt.score;learningPages++;}
   const state=last?.status==='uploaded'?(learningIds.includes(activity)&&!events.length?'已上傳，尚未計分':'已確認上傳'):last?'待上傳':'尚未完成';
   const values=[(i+1)+'．'+PT.LABELS[activity],state,latest?latest.receipt.score+'／'+maximum:'—',scores.length?Math.max(...scores)+'／'+maximum:'—',String(events.length)];
   const tr=document.createElement('tr');values.forEach((value,col)=>{const cell=document.createElement(col===0?'th':'td');if(col===0)cell.scope='row';cell.textContent=value;tr.append(cell);});host.append(tr);
  });
  document.getElementById('learning-total').textContent=learningTotal+'／57 分';
  document.getElementById('learning-total-note').textContent='已確認計分 '+learningPages+'／5 頁。各題依第一次答對時的嘗試次數計分；未確認上傳的分數不列入此合計。';
  const pending=PT.events().some(e=>e.status!=='uploaded');
  document.getElementById('completion-note').textContent='已確認上傳 '+count+'／9 項活動。'+(count===9&&!pending?'你已完成這次學習。':'完成各頁並收到上傳確認後，才能確認全部學習完成。');
  sync.disabled=syncing||!PT.allDone()||pending;
  const confirmation=PT.last('summary');
  const latest=PT.events().filter(e=>e.activity!=='summary' && e.status==='uploaded').map(e=>e.eventId).join(',');
  const synced=confirmation?.status==='uploaded'&&confirmation.data.signature===latest;
  sync.hidden=!!synced||!PT.allDone();
  if(synced)status.textContent='學習總表已同步到老師的試算表。';
  else if(!syncing)status.textContent=PT.allDone()?'正在準備同步完整學習總表。':'目前仍有活動尚未確認上傳。';
  if(!synced&&!syncing&&!pending&&PT.allDone()&&autoTried!==latest){autoTried=latest;queueMicrotask(syncNow);}
 }
 async function syncNow(){
  if(syncing)return;
  syncing=true;render();status.textContent='正在確認雲端的完整學習紀錄…';
  try{const signature=PT.events().filter(e=>e.activity!=='summary'&&e.status==='uploaded').map(e=>e.eventId).join(',');await PT.submit('summary',{signature});status.textContent='學習總表已同步到老師的試算表。';}
  catch(err){status.textContent=err.message;}
  finally{syncing=false;sync.disabled=!PT.allDone();}
 }
 sync.addEventListener('click',syncNow);
 document.getElementById('print-summary').addEventListener('click',()=>window.print());
 document.addEventListener('pt:state',render);render();
})();
