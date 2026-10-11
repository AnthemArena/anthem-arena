#!/usr/bin/env node
// Turns the master pool (data/edits.json) into ONE self-contained HTML page you open in your browser to review candidates:
// thumbnails, creator, views, likes, length, upload date, flags, and which cups an edit is already in. Click a column to sort.
//
//   node tools/edits-report.js                     (reads data/edits.json, writes data/edits-report.html)
//   node tools/edits-report.js in.json out.html
//
// Nothing here talks to YouTube or Firebase: run tools/edits-import.js first to refresh the numbers.
import fs from 'fs';
import path from 'path';

const inFile = process.argv[2] || 'data/edits.json';
const outFile = process.argv[3] || 'data/edits-report.html';
const edits = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const perCreator = {};
for (const e of edits) perCreator[e.channelId] = (perCreator[e.channelId] || 0) + 1;

const rows = edits.map(e => ({
  id: e.videoId, title: e.shortTitle || e.title || e.videoId, full: e.title || '', creator: e.artist || '', channelId: e.channelId || '',
  creatorUrl: e.creatorUrl || '', creatorCount: perCreator[e.channelId] || 1, views: e.views || 0, likes: e.likes ?? null,
  likeRate: e.likes != null && e.views ? +(100 * e.likes / e.views).toFixed(2) : null, duration: e.duration ?? null,
  uploaded: e.uploadDate || '', characters: e.characters || [], cups: e.tournaments || [], status: e.status || 'ok',
  flags: e.flags || [], notes: e.notes || '',
}));
const chars = [...new Set(rows.flatMap(r => r.characters))].sort();
const data = JSON.stringify({ rows, chars, generated: new Date().toISOString().slice(0, 10) }).replace(/</g, '\\u003c');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edits pool review</title>
<style>
:root{--bg:#07060d;--panel:#100b1a;--line:#2a1b3a;--pink:#ff4fb4;--text:#f2e9f7;--muted:#a99bb8;--warn:#ffb454;--bad:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 Inter,system-ui,sans-serif;padding:20px}
h1{margin:0 0 4px;font-size:22px}.sub{color:var(--muted);margin-bottom:14px}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
input,select{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit}
label{display:flex;gap:6px;align-items:center;color:var(--muted)}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
.stat b{display:block;font-size:18px;color:var(--pink)}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
th{position:sticky;top:0;background:#1a1128;cursor:pointer;white-space:nowrap;user-select:none;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
th.sorted{color:var(--pink)}tr:hover td{background:#170f24}
img{width:54px;height:96px;object-fit:cover;border-radius:6px;background:#000;display:block}
a{color:var(--pink);text-decoration:none}a:hover{text-decoration:underline}
.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin:1px 2px 1px 0;font-size:12px;color:var(--muted)}
.pill.dupe{border-color:var(--warn);color:var(--warn)}.pill.bad{border-color:var(--bad);color:var(--bad)}.pill.cup{border-color:var(--pink);color:var(--pink)}
.flags{color:var(--warn);font-size:12px;max-width:240px}.empty{padding:30px;text-align:center;color:var(--muted)}
.title{font-weight:600;max-width:260px}.note{color:var(--muted);font-size:12px}
</style></head><body>
<h1>Edits pool review</h1><div class="sub" id="sub"></div>
<div class="stats" id="stats"></div>
<div class="bar">
  <input id="q" placeholder="Search title or creator…" size="28">
  <select id="char"><option value="">All characters</option></select>
  <select id="status"><option value="">Any status</option><option value="ok">OK only</option><option value="review">Needs review</option><option value="blocked">Blocked</option></select>
  <label><input type="checkbox" id="oneper"> Best edit per creator only</label>
  <label><input type="checkbox" id="hideCup"> Hide edits already in a cup</label>
  <span id="count" style="color:var(--muted)"></span>
</div>
<table><thead><tr id="head"></tr></thead><tbody id="body"></tbody></table>
<script>
const D=${data};const rows=D.rows;
const cols=[['','thumb'],['Title','title'],['Creator','creator'],['Views','views','num'],['Likes','likes','num'],['Like %','likeRate','num'],['Length','duration','num'],['Uploaded','uploaded'],['Characters','characters'],['In cups','cups'],['Status / flags','status']];
let sortKey='views',sortDir=-1;
const $=id=>document.getElementById(id);
const fmt=n=>n==null?'–':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(n>=1e4?0:1)+'K':String(n);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
D.chars.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;$('char').appendChild(o)});
$('head').innerHTML=cols.map(c=>'<th data-k="'+c[1]+'"'+(c[2]?' class="num"':'')+'>'+c[0]+'</th>').join('');
$('head').onclick=e=>{const k=e.target.dataset.k;if(!k||k==='thumb')return;sortDir=sortKey===k?-sortDir:(k==='title'||k==='creator'?1:-1);sortKey=k;render()};
['q','char','status','oneper','hideCup'].forEach(i=>$(i).oninput=render);
function visible(){
  const q=$('q').value.toLowerCase(),ch=$('char').value,st=$('status').value;
  let r=rows.filter(x=>(!q||(x.title+' '+x.full+' '+x.creator).toLowerCase().includes(q))&&(!ch||x.characters.includes(ch))&&(!st||x.status===st)&&(!$('hideCup').checked||!x.cups.length));
  if($('oneper').checked){const best={};r.forEach(x=>{if(!best[x.channelId]||x.views>best[x.channelId].views)best[x.channelId]=x});r=r.filter(x=>best[x.channelId]===x)}
  const v=x=>{const a=x[sortKey];return Array.isArray(a)?a.join(',').toLowerCase():a==null?-1:typeof a==='string'?a.toLowerCase():a};
  return r.sort((a,b)=>{const A=v(a),B=v(b);return (A>B?1:A<B?-1:0)*sortDir});
}
function render(){
  const r=visible();
  document.querySelectorAll('th').forEach(t=>t.classList.toggle('sorted',t.dataset.k===sortKey));
  $('count').textContent=r.length+' of '+rows.length+' shown';
  $('body').innerHTML=r.length?r.map(x=>'<tr><td><a href="https://www.youtube.com/shorts/'+x.id+'" target="_blank" rel="noopener"><img loading="lazy" src="https://img.youtube.com/vi/'+x.id+'/mqdefault.jpg" alt=""></a></td>'
   +'<td><div class="title"><a href="https://www.youtube.com/shorts/'+x.id+'" target="_blank" rel="noopener">'+esc(x.title)+'</a></div>'+(x.notes?'<div class="note">'+esc(x.notes)+'</div>':'')+'<div class="note">'+esc(x.id)+'</div></td>'
   +'<td><a href="'+esc(x.creatorUrl)+'" target="_blank" rel="noopener">'+esc(x.creator)+'</a>'+(x.creatorCount>1?'<br><span class="pill dupe">'+x.creatorCount+' edits in pool</span>':'')+'</td>'
   +'<td class="num">'+fmt(x.views)+'</td><td class="num">'+fmt(x.likes)+'</td><td class="num">'+(x.likeRate==null?'–':x.likeRate+'%')+'</td>'
   +'<td class="num">'+(x.duration==null?'–':x.duration+'s')+'</td><td>'+esc(x.uploaded)+'</td>'
   +'<td>'+(x.characters.map(c=>'<span class="pill">'+esc(c)+'</span>').join('')||'–')+'</td>'
   +'<td>'+(x.cups.map(c=>'<span class="pill cup">'+esc(c)+'</span>').join('')||'–')+'</td>'
   +'<td>'+(x.status!=='ok'?'<span class="pill '+(x.status==='blocked'?'bad':'dupe')+'">'+x.status+'</span>':'<span class="pill">ok</span>')+(x.flags.length?'<div class="flags">'+x.flags.map(esc).join('<br>')+'</div>':'')+'</td></tr>').join(''):'<tr><td colspan="11" class="empty">No edits match.</td></tr>';
}
const creators=new Set(rows.map(r=>r.channelId)).size,okN=rows.filter(r=>r.status==='ok').length;
const sortedV=rows.map(r=>r.views).sort((a,b)=>a-b),median=sortedV.length?sortedV[Math.floor(sortedV.length/2)]:0;
$('sub').textContent='Generated '+D.generated+' from data/edits.json. Click a column heading to sort.';
$('stats').innerHTML=[['Edits in pool',rows.length],['Creators',creators],['OK to use',okN],['Need review / blocked',rows.length-okN],['Median views',fmt(median)]].map(s=>'<div class="stat"><b>'+s[1]+'</b>'+s[0]+'</div>').join('');
render();
</script></body></html>`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`Wrote ${outFile}: ${rows.length} edits, ${new Set(rows.map(r => r.channelId)).size} creators. Open it in your browser.`);
