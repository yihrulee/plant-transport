// 本機預覽專用；不修改網站檔案，也不呼叫 Google 或其他正式寫入服務。
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.PLANT_PREVIEW_PORT || 8768);
const origin='http://127.0.0.1:'+port;
const previewId=crypto.randomUUID();
const sheets=new Map();
class Sheet{
 constructor(name){this.name=name;this.rows=[];}
 getLastRow(){return this.rows.length;}
 getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
 getRange(row,col,n=1,m=1){const sh=this;return {
  getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sh.rows[row-1+i]?.[col-1+j]??''));},
  setNumberFormat(){return this;},
  setValues(values){for(let i=0;i<n;i++){while(sh.rows.length<row+i)sh.rows.push([]);for(let j=0;j<m;j++){const v=values[i][j];sh.rows[row-1+i][col-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}}return this;}
 };}
}
const spreadsheet={getSheetByName:name=>sheets.get(name)||null,insertSheet(name){const sheet=new Sheet(name);sheets.set(name,sheet);return sheet;}};
const gas=vm.createContext({
 SpreadsheetApp:{openById(){return spreadsheet;},flush(){}},
 ContentService:{MimeType:{JSON:'application/json'},createTextOutput(text){return {text,setMimeType(){return this;}};}},
 LockService:{getScriptLock(){return {tryLock(){return true;},releaseLock(){}};}},
 Utilities:{formatDate(date,zone){return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);}}
});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8'),gas);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const banner='<aside style="padding:12px 18px;background:#fff4cc;color:#4a3b00;font:15px/1.5 system-ui;text-align:center;border-bottom:1px solid #d4b96d">本機預覽模式：請使用測試身分。所有上傳只寫入本機模擬工作表，不會送到正式試算表。　<a style="color:#235d43" href="/_preview/sheets" target="_blank" rel="noopener">查看模擬工作表</a></aside>';
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const url=new URL(req.url,origin);
 if(url.pathname==='/_preview/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({preview:true,externalWrites:0,seatRange:[1,30],learningVersion:JSON.parse(gas.doGet().text).learningVersion,sheets:[...sheets.keys()]}));}
 if(url.pathname==='/_preview/submit'){
  if(req.method!=='POST'){res.writeHead(405);return res.end();}
  if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);return res.end();}
  let body='';req.on('data',chunk=>{body+=chunk;if(body.length>100000)req.destroy();});
  req.on('end',()=>{res.setHeader('Content-Type','application/json; charset=utf-8');try{res.end(gas.doPost({postData:{contents:body}}).text);}catch{res.writeHead(500);res.end('{"ok":false,"error":"Preview error"}');}});return;
 }
 if(url.pathname==='/_preview/sheets'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  let html='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本機模擬工作表</title><style>body{font:16px/1.6 system-ui;margin:24px;color:#18382b;background:#f1f6f1}section{overflow:auto;background:white;padding:18px;border-radius:12px;margin:20px 0}table{border-collapse:collapse;white-space:pre-wrap;font-size:13px}th,td{border:1px solid #d1ded3;padding:8px;min-width:70px;max-width:330px;overflow-wrap:anywhere}th{background:#e8f1e7}a{color:#17653f}</style><h1>本機模擬工作表</h1><p>這些是預覽期間暫存在記憶體的資料，並非正式 Google 試算表。關閉預覽服務後會清除。</p><p><a href="/index.html">回到課程</a>　<button onclick="location.reload()">重新整理資料</button></p>';
  if(!sheets.size)html+='<section>尚未收到提交。完成第一個活動後，工作表會出現在這裡。</section>';
  for(const [name,sheet]of sheets){html+='<section><h2>'+escape(name)+'</h2><table>';sheet.rows.forEach((row,i)=>{html+='<tr>'+row.map(value=>'<'+(i?'td':'th')+'>'+escape(value)+'</'+(i?'td':'th')+'>').join('')+'</tr>';});html+='</table></section>';}
  return res.end(html+'</html>');
 }
 if(url.pathname==='/course-config.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end('window.PT_CONFIG=Object.freeze('+JSON.stringify({endpoint:'/_preview/submit',apiVersion:'plant-transport-v2',assessmentVersion:'transport-20-v1',learningVersion:'attempt-321-v1'})+');');}
 const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');
 const target=path.resolve(root,name);
 if(!target.startsWith(root+path.sep)||!/^\.(html|js|css|png|jpg|mp4)$/.test(path.extname(target))||name.split(/[\\/]/).some(part=>part.startsWith('.'))){res.writeHead(403);return res.end('Forbidden');}
 try{
  if(target.endsWith('.mp4')){
   const size=fs.statSync(target).size;
   let start=0,end=size-1;
   res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');
   if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end();}
    if(!match[1])start=Math.max(0,size-Number(match[2]));
    else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end();}
    res.statusCode=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+size);
   }
   res.setHeader('Content-Length',end-start+1);
   if(req.method==='HEAD')return res.end();
   const stream=fs.createReadStream(target,{start,end});stream.on('error',()=>res.destroy());req.on('close',()=>stream.destroy());stream.pipe(res);return;
  }
  let content=fs.readFileSync(target);
  if(name==='course.js')content=content.toString().replace("const KEY = 'plant-transport-course-v2';","const KEY = 'plant-transport-preview-"+previewId+"';");
  if(target.endsWith('.html'))content=content.toString().replace(/<body([^>]*)>/i,'<body$1>'+banner);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
  res.setHeader('Content-Type',types[path.extname(target)]);res.end(content);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('Preview ready: '+origin+'/index.html (no external writes)'));
