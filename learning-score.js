(function(){
 'use strict';
 const counts={p1:3,p2:4,p3:4,p5:4,p6:4};
 const count=counts[PT.page];
 if(!count)return;
 const version=PT_CONFIG.learningVersion || 'attempt-321-v1';
 const key='learning:'+PT.page;
 const previous=PT.last(PT.page)?.data.learning;
 const stored=PT.draft(key);
 const initial=stored?.version===version?stored:previous?.version===version?previous:null;
 const questions=Array.from({length:count},(_,i)=>{
  const id='q'+(i+1),old=initial?.questions?.find(q=>q.id===id);
  const attempts=Number.isSafeInteger(old?.attempts)&&old.attempts>=0?old.attempts:0;
  const solved=old?.solved===true&&attempts>0;
  return {id,attempts,solved,points:solved?Math.max(1,4-attempts):0};
 });
 let message=initial?.message||'答錯不加分；每題以第一次答對時的嘗試次數計分。';
 function packet(){return {version,questions:questions.map(q=>({...q})),score:questions.reduce((sum,q)=>sum+q.points,0),maxScore:count*3};}
 function total(){
  return PT.learningTotal();
 }
 function render(){
  PT.renderLearningDock(message);
 }
 function record(id,correct){
  const question=questions.find(q=>q.id===id);
  if(!question)throw new Error('未知的學習計分題號：'+id);
  if(question.solved){message='第 '+id.slice(1)+' 題已得 '+question.points+' 分，重做不會重複加分。';render();return {...question};}
  question.attempts++;
  if(correct){question.solved=true;question.points=Math.max(1,4-question.attempts);message='第 '+id.slice(1)+' 題：第 '+question.attempts+' 次答對，得 '+question.points+' 分。';}
  else message='第 '+id.slice(1)+' 題：第 '+question.attempts+' 次尚未答對，暫不加分。';
  PT.draft(key,{...packet(),message});render();
  return {...question};
 }
 PT.learning={record,packet,total,render};
 document.addEventListener('DOMContentLoaded',()=>{
  if(!PT.profile())return;
  document.addEventListener('pt:state',render);render();
 });
})();
