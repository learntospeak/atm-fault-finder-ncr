const state = { data: [], filtered: [], models: new Set(), modules: new Set() };
const els = {
  model: document.getElementById('model'),
  module: document.getElementById('module'),
  query: document.getElementById('query'),
  results: document.getElementById('results'),
  btnExport: document.getElementById('btn-export'),
  chips: document.querySelectorAll('.chip'),
  strictBoost: document.getElementById('strictBoost'),
  keywordBoost: document.getElementById('keywordBoost'),
  showScores: document.getElementById('showScores'),
};
async function loadData() {
  const res = await fetch('faults.json', { cache: 'no-store' });
  state.data = await res.json();
  state.data.forEach(item => {
    (item.models || []).forEach(m => state.models.add(m));
    (item.modules || []).forEach(m => state.modules.add(m));
  });
  renderSelect(els.model, [...state.models].sort());
  renderSelect(els.module, [...state.modules].sort());
  runSearch();
}
function renderSelect(select, items){ items.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v;select.appendChild(o);});}
function tokenize(text){ return (text||'').toLowerCase().split(/[^a-z0-9\/\-\+]+/).filter(Boolean); }
function scoreEntry(entry, qTokens, filters){
  let score = entry.likelihood ?? 0.2;
  const fields = [...(entry.symptoms||[]), ...(entry.match_keywords||[]), entry.id||'', entry.title||''].join(' ').toLowerCase();
  let matches = 0; qTokens.forEach(t=>{ if(fields.includes(t)) matches++; });
  if(els.keywordBoost.checked) score += 0.05*matches;
  if(els.strictBoost.checked){
    if(filters.model && (entry.models||[]).includes(filters.model)) score += 0.2;
    if(filters.module && (entry.modules||[]).includes(filters.module)) score += 0.2;
  }
  const qText = qTokens.join(' ');
  if(/all positions|all bays|every slot/.test(qText)) score += 0.15;
  if(/works in atmdesk|atmdesk.*(sees|works).*aptra/.test(qText)) score += 0.2;
  if(/dfm replaced|dual pick module replaced|pick module replaced/.test(qText)) score += 0.1;
  if(/firmware mismatch|sp mismatch|xfs/.test(qText)) score += 0.1;
  return score;
}
function runSearch(){
  const filters={ model:els.model.value, module:els.module.value };
  const q=els.query.value.trim(); const qTokens=tokenize(q);
  let candidates=state.data.filter(e=>{
    const modelMatch=!filters.model||(e.models||[]).includes(filters.model);
    const moduleMatch=!filters.module||(e.modules||[]).includes(filters.module);
    if(!modelMatch||!moduleMatch) return false;
    if(!q) return true;
    const allText=[e.id,e.title,...(e.symptoms||[]),...(e.match_keywords||[]),...(e.causes||[]).map(c=>c.title+' '+(c.notes||''))].join(' ').toLowerCase();
    return qTokens.every(t=>allText.includes(t));
  });
  candidates=candidates.map(e=>({e,s:scoreEntry(e,qTokens,filters)})).sort((a,b)=>b.s-a.s);
  state.filtered=candidates; renderResults();
}
function renderResults(){
  els.results.innerHTML='';
  if(!state.filtered.length){ const d=document.createElement('div'); d.className='empty'; d.textContent='No matches yet — try different keywords, or loosen filters.'; els.results.appendChild(d); return; }
  state.filtered.forEach(({e,s})=>{
    const card=document.createElement('div'); card.className='card';
    const scoreHtml=els.showScores.checked?`<span class="score">${s.toFixed(2)}</span>`:'';
    card.innerHTML=`
      <h3>${e.title||e.id} ${scoreHtml}</h3>
      <div class="meta"><span class="pill">${(e.models||[]).join(', ')||'NCR'}</span>
        <span class="pill">${(e.modules||[]).join(', ')||'Module'}</span>
        ${e.symptoms?.length?`<span class="badge">${e.symptoms.join(' • ')}</span>`:''}
      </div>
      ${e.description?`<p>${e.description}</p>`:''}
      ${(e.causes||[]).map(c=>`
        <div class="section-title">Cause: <strong>${c.title}</strong></div>
        ${c.context?`<p class="small">${c.context}</p>`:''}
        <div class="section-title">Quick checks</div>
        <ul>${(c.checks||[]).map(it=>`<li>${it}</li>`).join('')}</ul>
        <div class="section-title">Fix</div>
        <ul>${(c.fixes||[]).map(it=>`<li>${it}</li>`).join('')}</ul>
      `).join('')}
      ${e.logs?.length?`<div class="section-title">Logs & traces</div><ul>${e.logs.map(l=>`<li><code>${l.path}</code>${l.note?' — '+l.note:''}</li>`).join('')}</ul>`:''}
      ${e.notes?.length?`<div class="section-title">Notes</div><ul>${e.notes.map(n=>`<li>${n}</li>`).join('')}</ul>`:''}
    `;
    els.results.appendChild(card);
  });
}
function setupUI(){
  ['change','keyup'].forEach(ev=>{
    els.model.addEventListener(ev,runSearch);
    els.module.addEventListener(ev,runSearch);
    els.query.addEventListener(ev,runSearch);
    els.strictBoost.addEventListener(ev,runSearch);
    els.keywordBoost.addEventListener(ev,runSearch);
    els.showScores.addEventListener(ev,renderResults);
  });
  els.chips.forEach(chip=>chip.addEventListener('click',()=>{ const tag=chip.dataset.tag; els.query.value=(els.query.value+' '+tag).trim(); runSearch(); }));
  els.btnExport.addEventListener('click',exportResults);
}
function exportResults(e){
  e.preventDefault();
  const lines=state.filtered.map(({e,s})=>[
    `# ${e.title||e.id} (${(e.models||[]).join(', ')}) [score ${s.toFixed(2)}]`,
    e.description||'',
    ...(e.causes||[]).flatMap(c=>[`- Cause: ${c.title}`,...(c.checks||[]).map(x=>`  * Check: ${x}`),...(c.fixes||[]).map(x=>`  * Fix: ${x}`)]),
    e.logs?.length?'Logs:':'',
    ...(e.logs||[]).map(l=>`  - ${l.path}${l.note?' — '+l.note:''}`),
    ''
  ].join('\n')).join('\n');
  const blob=new Blob([lines],{type:'text/plain'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='atm-fault-finder-results.txt'; a.click(); URL.revokeObjectURL(url);
}
loadData(); setupUI();
