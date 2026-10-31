(function () {
  'use strict';
  const KEY = 'plant-transport-course-v2';
  const LABELS = {p1:'維管束的功能與分布',p2:'莖內維管束的排列',p3:'樹皮與年輪',p4:'年輪的故事',p5:'植物體內的養分運輸',p6:'植物體內的水分運輸',p7:'植物的運輸挑戰賽',p8:'影響蒸散作用因素探討',assessment:'總評量'};
  const REQUIRED = Object.keys(LABELS);
  const LEARNING_PAGES = {p1:3,p2:4,p3:4,p5:4,p6:4};
  const LEARNING_VERSION = PT_CONFIG.learningVersion || 'attempt-321-v1';
  const file = location.pathname.split('/').pop() || 'index.html';
  const page = /^([1-8])\.html$/.test(file) ? 'p' + file[0] : file === '9.html' ? 'assessment' : file === '10.html' ? 'summary' : 'home';
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* 重新顯示登入表單。 */ }
  if (!state || state.version !== 2 || !Array.isArray(state.events)) state = {version:2,profile:null,sessionId:null,events:[],drafts:{}};
  if (state.profile && normalizeSeat(state.profile.seat)) state.profile.seat=normalizeSeat(state.profile.seat);
  const inflight = new Map();
  const ready = new Set();
  let bar;
  let storageError = false;
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2,'0')).join(''); }
  function normalizeSeat(value) { const raw=String(value ?? '').trim(); return /^(0?[1-9]|[12][0-9]|30)$/.test(raw)?String(Number(raw)):''; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageError = false; }
    catch (_) { storageError = true; throw new Error('瀏覽器無法儲存學習紀錄。請允許本站使用本機儲存空間後再繼續。'); }
  }
  function emit() { render(); document.dispatchEvent(new CustomEvent('pt:state')); }
  function last(activity) { return state.events.filter(e => e.activity === activity).at(-1); }
  function eligible(event,activity) { return event && event.status === 'uploaded' && (!LEARNING_PAGES[activity] || (event.data.learning?.version===LEARNING_VERSION && event.receipt?.learningVersion===LEARNING_VERSION)); }
  function confirmed(activity) { return state.events.filter(e => e.activity === activity && eligible(e,activity)); }
  function learningTotal() {
    let score=0,solved=0,uploadedPages=0;
    for(const [activity,count] of Object.entries(LEARNING_PAGES)){
      const source=[activity===page?window.PT?.learning?.packet():null,state.drafts['learning:'+activity],last(activity)?.data.learning].find(value=>value?.version===LEARNING_VERSION);
      for(let i=1;i<=count;i++){
        const question=source?.questions?.find(q=>q.id==='q'+i);
        if(question?.solved===true&&Number.isSafeInteger(question.attempts)&&question.attempts>0){score+=Math.max(1,4-question.attempts);solved++;}
      }
      if(confirmed(activity).length)uploadedPages++;
    }
    return {score,maxScore:57,solved,questionCount:19,uploadedPages};
  }
  function positionDock() {
    if(!bar)return;
    let bottom=12;
    document.querySelectorAll('footer,nav,.footer,.page-nav').forEach(el=>{
      if(el.closest('#pt-learning-score'))return;
      const rect=el.getBoundingClientRect();
      if(getComputedStyle(el).position==='fixed'&&rect.bottom>=innerHeight-2)bottom=Math.max(bottom,innerHeight-rect.top+10);
    });
    const controls=document.querySelector('#stageWrap .controls');
    if(controls){const r=controls.getBoundingClientRect(),dock=bar.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0&&r.right>dock.left)bottom=Math.max(bottom,innerHeight-r.top+10);}
    bottom=Math.min(bottom,Math.max(12,innerHeight-bar.offsetHeight-12));
    bar.style.setProperty('--pt-dock-bottom',bottom+'px');
  }
  function renderLearningDock(message) {
    if(!bar)return;
    const total=learningTotal();
    document.getElementById('pt-learning-points').textContent=total.score+'／57 分';
    document.getElementById('pt-learning-done').textContent='已答對 '+total.solved+'／19 題・已上傳 '+total.uploadedPages+'／5 頁';
    if(message)document.getElementById('pt-learning-message').textContent=message;
    positionDock();
  }
  function status(text, error) {
    const el = document.getElementById('pt-status');
    if (el) { el.hidden=false; el.textContent = text; el.className = 'pt-status' + (error ? ' error' : ''); if(error&&bar)bar.open=true; }
  }
  function profile() { return state.profile ? {...state.profile} : null; }
  function allDone() { return REQUIRED.every(id => confirmed(id).length > 0); }
  function snapshot() {
    const controls = [...document.querySelectorAll('input,select,textarea')].filter(el => !el.closest('.pt-bar'));
    return {
      controls:controls.map((el,i) => ({key:el.id || el.name || String(i),type:el.type || el.tagName,value:el.value,checked:!!el.checked})),
      groups:[...document.querySelectorAll('.bucket')].map(el => ({bucket:el.dataset.bucket,items:[...el.querySelectorAll('.chip')].map(ch => ch.dataset.item)})),
      order:[...document.querySelectorAll('#ord > li')].map(el => el.dataset.key)
    };
  }
  function draft(activity, value) {
    if (arguments.length === 1) return state.drafts[activity] || null;
    state.drafts[activity] = value;
    try { save(); } catch (err) { status(err.message, true); }
    return value;
  }
  async function transmit(event) {
    if (event.status === 'uploaded') return event.receipt;
    if (inflight.has(event.eventId)) return inflight.get(event.eventId);
    const job = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      event.error = '';
      try {
        const resp = await fetch(PT_CONFIG.endpoint, {
          method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',signal:controller.signal,
          body:JSON.stringify({apiVersion:PT_CONFIG.apiVersion,eventId:event.eventId,sessionId:state.sessionId,activity:event.activity,profile:state.profile,data:event.data})
        });
        if (!resp.ok) throw new Error('雲端回應 HTTP ' + resp.status + '。請稍後重試。');
        let result;
        try { result = await resp.json(); } catch (_) { throw new Error('雲端沒有回傳可確認的結果。資料已保留，可重新上傳。'); }
        if (result.apiVersion !== PT_CONFIG.apiVersion) throw new Error('雲端程式尚未更新到本課程版本。資料已保留，請老師更新 Apps Script 後重試。');
        if (!result.ok || !result.recorded || result.eventId !== event.eventId || result.activity !== event.activity) throw new Error(result.error || '雲端未確認這筆資料已寫入。');
        if (event.data.learning && (result.learningVersion!==LEARNING_VERSION || typeof result.score!=='number' || result.maxScore!==event.data.learning.maxScore || result.score!==event.data.learning.score)) throw new Error('雲端尚未確認新版學習歷程分數，請老師更新 Apps Script 後重試。');
        event.status = 'uploaded'; event.receipt = result;
        save();
        return result;
      } catch (err) {
        event.error = err.name === 'AbortError' ? '連線逾時，尚未確認是否寫入；重試時不會重複新增同一筆紀錄。' : err.message;
        try { save(); } catch (_) { storageError = true; }
        throw new Error(event.error);
      } finally { clearTimeout(timeout); inflight.delete(event.eventId); emit(); }
    })();
    inflight.set(event.eventId, job); emit();
    return job;
  }
  async function submit(activity, data) {
    if (!state.profile) throw new Error('請先回首頁填寫學生資料。');
    const previous = last(activity);
    let event = previous && JSON.stringify(previous.data) === JSON.stringify(data) ? previous : null;
    if (!event) {
      event = {eventId:uuid(),activity,data:JSON.parse(JSON.stringify(data)),status:'pending',error:'',createdAt:new Date().toISOString()};
      state.events.push(event);
      try { save(); } catch (err) { state.events.pop(); throw err; }
    }
    emit();
    return transmit(event);
  }
  async function retry() {
    const button = document.getElementById('pt-retry');
    if (button) button.disabled = true;
    let error = '';
    for (const event of state.events.filter(e => e.status !== 'uploaded')) {
      try { await transmit(event); } catch (err) { error = err.message; break; }
    }
    emit();
    if (error) status(error, true);
    if (button) button.disabled = false;
  }
  function markReady(activity, complete) {
    if (!complete) { ready.delete(activity); return; }
    ready.add(activity);
    const data = {completed:true,answers:snapshot()};
    if (LEARNING_PAGES[activity]) {
      const learning=window.PT.learning?.packet();
      if (!learning || activity!==page || learning.questions.some(q=>!q.solved)) { status('請先完成本頁全部題目的答案檢查與計分。',true); return; }
      data.learning=learning;
    }
    submit(activity, data).catch(err => status(err.message, true));
    queueMicrotask(render);
  }
  function nextElement() { return document.querySelector('#nextBtn,#nextLink,#next-link,#endLink'); }
  function render() {
    if (!bar) return;
    renderLearningDock();
    const pending = state.events.filter(e => e.status !== 'uploaded');
    const event = last(page);
    const uploading = inflight.size > 0;
    const retryButton = document.getElementById('pt-retry');
    retryButton.hidden = !pending.length;
    retryButton.disabled = uploading;
    const latestMessage = event && event.error;
    status(storageError ? '本機儲存空間無法寫入，請先處理後再繼續。' : uploading ? '正在上傳，請稍候…' : latestMessage || (pending.length ? '有 ' + pending.length + ' 筆紀錄保存在此裝置，尚未確認上傳。' : eligible(event,page) ? '本活動已收到雲端寫入確認。' : event?.status==='uploaded'&&LEARNING_PAGES[page] ? '本頁先前的紀錄尚未計分，請完成本頁練習以記錄學習歷程分數。' : '各頁完成後會依序上傳。請使用同一瀏覽器完成課程。'), !!latestMessage || storageError);
    document.getElementById('pt-status').hidden=!(storageError||uploading||latestMessage||pending.length||(event?.status==='uploaded'&&LEARNING_PAGES[page]&&!eligible(event,page)));
    const next = nextElement();
    if (next && page !== 'summary') {
      const uploaded = eligible(event,page);
      if (event || ready.has(page)) {
        next.classList.toggle('disabled', !uploaded);
        next.setAttribute('aria-disabled', String(!uploaded));
        next.style.pointerEvents = uploaded ? '' : 'none';
        if (uploaded) {
          next.removeAttribute('tabindex');
          if (page === 'p7') next.href = '8.html';
          if (page === 'p8') next.href = '9.html';
        }
      }
    }
  }
  function startProfile(values) {
    const p = {class:String(values.class || '').trim(),seat:normalizeSeat(values.seat),name:String(values.name || '').trim()};
    if (!p.class || p.class.length > 40 || !p.seat || !p.name || p.name.length > 50) throw new Error('請填寫班級、姓名與 1～30 的整數座號。');
    if (state.profile && JSON.stringify(state.profile) !== JSON.stringify(p)) {
      if (!confirm('更換學生後，這個瀏覽器將開始新的學習紀錄。尚未上傳的紀錄請先完成上傳。確定更換嗎？')) return false;
      if (state.events.some(e => e.status !== 'uploaded')) throw new Error('尚有未上傳紀錄，請先完成上傳，再更換學生。');
      state = {version:2,profile:null,sessionId:null,events:[],drafts:{}};
    }
    state.profile = p; state.sessionId = state.sessionId || uuid(); save(); return true;
  }
  function boot() {
    if (page !== 'home' && (!state.profile || !normalizeSeat(state.profile.seat))) { location.replace('index.html?return=' + encodeURIComponent(file)); return; }
    if (state.profile) {
      bar = document.createElement('details');bar.id='pt-learning-score';bar.className='pt-learning-score';bar.setAttribute('aria-label','班級座號與學習歷程累積分數');
      bar.innerHTML='<summary title="查看學習進度與操作"><span id="pt-student"></span><span class="pt-dock-scoreline">學習歷程 <output id="pt-learning-points" aria-live="polite"></output></span></summary><div class="pt-learning-popover"><strong>學習歷程總分</strong><p id="pt-learning-done"></p><p>累積第 1、2、3、5、6 頁。首次答對 3 分；第二次 2 分；第三次以後 1 分。包含本機尚未上傳的得分，各頁完成後會上傳。</p><p id="pt-learning-message"></p><p id="pt-status" class="pt-status" role="status" aria-live="polite" hidden></p><nav class="pt-dock-actions" aria-label="學習操作"><a href="index.html">首頁／更換學生</a><a href="10.html">學習總表</a><button id="pt-retry" type="button" hidden>重試上傳</button></nav></div>';
      document.body.append(bar);
      document.getElementById('pt-student').textContent = state.profile.class + ' 班　' + state.profile.seat + ' 號';
      document.getElementById('pt-retry').addEventListener('click', retry);
      document.addEventListener('pointerdown',event=>{if(bar.open&&!bar.contains(event.target))bar.open=false;});
      document.addEventListener('keydown',event=>{if(event.key==='Escape')bar.open=false;});
      window.addEventListener('resize',positionDock);
      window.addEventListener('scroll',positionDock,{passive:true});
      render();
    }
    // 完成紀錄可從原連結繼續；未完成時仍由原活動的檢查控制。
    document.addEventListener('click', event => {
      const target = event.target.closest('a');
      if (!target || target !== nextElement() || page === 'summary') return;
      if (!eligible(last(page),page)) {
        event.preventDefault(); event.stopImmediatePropagation();
        status('請先完成本頁，並等候雲端確認。若上傳失敗，可按「重試上傳」。', true);
      }
    }, true);
    window.addEventListener('beforeunload', event => {
      if (inflight.size) { event.preventDefault(); event.returnValue = ''; }
    });
    window.addEventListener('online', () => { if (state.events.some(e => e.status !== 'uploaded')) retry(); });
  }
  window.PT = {page,LABELS,REQUIRED,profile,last,confirmed,allDone,snapshot,draft,submit,markReady,startProfile,retry,render,status,uuid,learningTotal,renderLearningDock,
    events:() => JSON.parse(JSON.stringify(state.events)),session:() => state.sessionId};
  document.addEventListener('DOMContentLoaded', boot);
})();
