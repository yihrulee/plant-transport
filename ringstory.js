(function(){
 'use strict';
 const ids=['q1','q2','q3','q4'];
 const button=document.getElementById('submitBtn'),message=document.getElementById('submitFB');
 let sending=false;
 const saved=PT.draft('p4');
 if(saved)ids.forEach(id=>{document.getElementById(id).value=saved[id]||'';});
 function answers(){return Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value.trim()]));}
 function refresh(){button.disabled=sending||ids.some(id=>!document.getElementById(id).value.trim());}
 ids.forEach(id=>document.getElementById(id).addEventListener('input',()=>{PT.draft('p4',answers());refresh();}));
 button.addEventListener('click',async()=>{
  if(button.disabled)return;sending=true;refresh();message.className='feedback correct';message.textContent='正在上傳…';
  const data=answers();PT.draft('p4',data);
  try{await PT.submit('p4',data);message.className='feedback correct';message.textContent='已確認寫入，可以前往下一頁。';ids.forEach((_,i)=>{const fb=document.getElementById('fb'+(i+1));fb.className='feedback correct';fb.textContent='已記錄回答，待老師評閱。';});}
  catch(err){message.className='feedback incorrect';message.textContent=err.message;}
  finally{sending=false;refresh();}
 });refresh();
})();
