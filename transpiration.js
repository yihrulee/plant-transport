(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const ids=['q1','q2','q3','q4','q5','q6'];
 let saved=PT.draft('p8')||{experiment:null,viewed:false,answers:{}};
 let chart=null,sending=false,animating=false;
 ids.forEach(id=>{$(id).value=saved.answers[id]||'';$(id).disabled=false;$(id).addEventListener('input',()=>{saved.answers[id]=$(id).value;PT.draft('p8',saved);refresh();});});
 $('endLink').href='9.html';$('endLink').classList.add('disabled');
 function refresh(){
  const filled=ids.every(id=>$(id).value.trim());
  $('submitBtn').disabled=sending||!saved.viewed||!filled;
  $('submitHints').textContent=!saved.viewed?'請先完成模擬並觀看結果。':!filled?'請完成全部 6 題探究回答。':'可以提交答案。';
 }
 function ticks(){document.querySelectorAll('.cylinder .ticks').forEach(host=>{host.replaceChildren();for(let n=0;n<=10;n++){const tick=document.createElement('div');tick.className='tick-line'+(n%5===0?' major':'');tick.style.bottom=n*10+'%';host.append(tick);if(n%5===0){const label=document.createElement('div');label.className='tick-label';label.style.bottom=n*10+'%';label.textContent=n;host.append(label);}}});}
 function liquids(){if(!saved.experiment)return;const d=saved.experiment;$('liqA').style.height=(d.endA/10*90)+'%';$('liqB').style.height=(d.endB/10*90)+'%';}
 function results(){
  const d=saved.experiment;if(!d)return;
  saved.viewed=true;PT.draft('p8',saved);
  for(const k of ['endA','endB','lossA','lossB'])$(k).textContent=d[k].toFixed(1);
  $('diffEnd').textContent=(d.endB-d.endA).toFixed(1);$('diffLoss').textContent=(d.lossB-d.lossA).toFixed(1);
  $('resultsSection').classList.remove('hidden');$('qaSection').classList.remove('hidden');
  if(typeof Chart==='function'){if(chart)chart.destroy();chart=new Chart($('barChart'),{type:'bar',data:{labels:['無葉子','有葉子'],datasets:[{label:'水量減少（mL，教學模擬）',data:[d.lossA,d.lossB],backgroundColor:['#9abdaf','#23734f']}]},options:{responsive:true,scales:{y:{beginAtZero:true,title:{display:true,text:'mL'}}}}});}
  refresh();
 }
 $('startBtn').addEventListener('click',()=>{
  if(saved.experiment||animating)return;animating=true;$('startBtn').disabled=true;$('resultBtn').disabled=true;
  const lossA=Math.round((.6+Math.random()*1.4)*10)/10,lossB=Math.round((4.2+Math.random()*2.6)*10)/10;
  saved.experiment={lossA,lossB,endA:Math.round((10-lossA)*10)/10,endB:Math.round((10-lossB)*10)/10};PT.draft('p8',saved);
  $('status').textContent='模擬進行中：液面下降…';requestAnimationFrame(liquids);
  setTimeout(()=>{animating=false;$('resultBtn').disabled=false;$('resultBtn').setAttribute('aria-disabled','false');$('status').textContent='模擬完成，請觀看結果。';},5000);
 });
 $('resultBtn').addEventListener('click',()=>{if(!$('resultBtn').disabled)results();});
 $('submitBtn').addEventListener('click',async()=>{
  if($('submitBtn').disabled)return;sending=true;refresh();$('submitStatus').textContent='上傳中…';
  const data={...saved.experiment,simulation:true,...Object.fromEntries(ids.map(id=>[id,$(id).value.trim()]))};
  try{await PT.submit('p8',data);$('submitStatus').className='badge ok';$('submitStatus').textContent='已確認上傳';$('endLink').classList.add('unlocked');}
  catch(err){$('submitStatus').className='badge err';$('submitStatus').textContent=err.message;}
  finally{sending=false;refresh();}
 });
 ticks();if(saved.experiment){$('startBtn').disabled=true;$('resultBtn').disabled=false;$('resultBtn').setAttribute('aria-disabled','false');liquids();$('status').textContent='已還原這次模擬數據。';if(saved.viewed)results();}refresh();
})();
