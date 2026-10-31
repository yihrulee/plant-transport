(function(){
 'use strict';
 const form=document.getElementById('assessment-form');
 const button=document.getElementById('grade-button');
 const note=document.getElementById('assessment-status');
 const result=document.getElementById('assessment-result');
 let saved=PT.draft('assessment') || {answers:{},attemptId:PT.uuid()};
 let locked=false;
 function values(){return PT_QUESTIONS.map(q=>{const el=form.querySelector('input[name="'+q.id+'"]:checked');return el?Number(el.value):null;});}
 function progress(){document.getElementById('answer-progress').textContent='已回答 '+values().filter(v=>v!==null).length+'／20 題';}
 function build(){
  const host=document.getElementById('questions');host.replaceChildren();
  PT_QUESTIONS.forEach((q,i)=>{
   const field=document.createElement('fieldset');field.className='pt-question';field.id='question-'+q.id;
   const legend=document.createElement('legend');legend.textContent=(i+1)+'．'+q.q;field.append(legend);
   q.options.forEach((text,index)=>{
    const label=document.createElement('label');label.className='pt-option';
    const radio=document.createElement('input');radio.type='radio';radio.name=q.id;radio.value=index;radio.required=true;radio.checked=saved.answers[q.id]===index;
    const span=document.createElement('span');span.textContent='ABCD'[index]+'．'+text;label.append(radio,span);field.append(label);
   });host.append(field);
  });progress();
 }
 function freeze(){locked=true;form.querySelectorAll('input').forEach(el=>el.disabled=true);button.disabled=true;}
 function show(receipt){
  if(!receipt || typeof receipt.score!=='number')return;
  result.hidden=false;document.getElementById('score').textContent=receipt.score+'／100 分';
  document.getElementById('result-note').textContent='答對 '+receipt.correct+'／20 題。成績已由雲端重新計分並確認寫入。';
  PT_QUESTIONS.forEach((q,i)=>{
   const field=document.getElementById('question-'+q.id);field.querySelector('.pt-explanation')?.remove();
   field.classList.add(saved.answers[q.id]===q.answer?'pt-correct':'pt-wrong');
   const text=document.createElement('p');text.className='pt-explanation';text.textContent='正確答案：'+'ABCD'[q.answer]+'。'+q.explanation;field.append(text);
  });
  note.textContent='已上傳，可查看學習總表。';PT.render();
 }
 build();
 const prior=PT.last('assessment');
 if(prior && prior.data.attemptId===saved.attemptId){freeze();if(prior.status==='uploaded')show(prior.receipt);else{button.disabled=false;button.textContent='重試上傳這次作答';note.textContent='這次作答已保留，尚未收到雲端確認。';}}
 form.addEventListener('change',()=>{if(locked)return;PT_QUESTIONS.forEach((q,i)=>{const a=values()[i];if(a!==null)saved.answers[q.id]=a;});PT.draft('assessment',saved);progress();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();const answers=values();if(answers.some(v=>v===null)){note.textContent='請完成全部 20 題。';return;}
  freeze();button.textContent='正在上傳…';note.textContent='正在等待雲端計分與寫入確認。';
  try{show(await PT.submit('assessment',{version:PT_CONFIG.assessmentVersion,answers,attemptId:saved.attemptId}));button.textContent='已送出';}
  catch(err){note.textContent=err.message;button.disabled=false;button.textContent='重試上傳這次作答';}
 });
 document.addEventListener('pt:state',()=>{const event=PT.last('assessment');if(event?.status==='uploaded' && event.data.attemptId===saved.attemptId)show(event.receipt);});
 document.getElementById('new-attempt').addEventListener('click',()=>{
  if(!confirm('開始新的 20 題練習？先前已上傳的成績會保留。'))return;
  saved={answers:{},attemptId:PT.uuid()};PT.draft('assessment',saved);locked=false;result.hidden=true;button.disabled=false;button.textContent='送出總評量';note.textContent='';build();window.scrollTo({top:0,behavior:'smooth'});
 });
})();
