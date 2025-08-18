/* coah/app.js v2025-08-17T10:55Z — diagnostics + Hand Wraps/Shadow Daggers + Float label */

// -------------------- toggles --------------------
const API_URL = '/.netlify/functions/fetch-items';
const DIAG = true;          // logs counts to console
const SAFE_MODE_IF_ZERO = true; // if strict filter yields 0, fall back to "Include=TRUE" only

// -------------------- time helpers (LA midnight +8d) --------------------
function tzOffsetAt(date, timeZone) {
  const fmt = (tz) => new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  const pTz  = fmt(timeZone);
  const pUtc = fmt('UTC');
  const asDate = (p) => new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  const dTz  = asDate(pTz);
  const dUtc = asDate(pUtc);
  return (dUtc - dTz) / 60000;
}
function pstMidnight(dateLike) {
  const base = new Date(dateLike);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(base).reduce((a, p) => (a[p.type] = p.value, a), {});
  const y = +parts.year, m = +parts.month, d = +parts.day;
  const fakeUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetMin = tzOffsetAt(fakeUtc, 'America/Los_Angeles');
  return new Date(fakeUtc.getTime() + offsetMin * 60000);
}
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function countdownFromPurchase(purchaseDate) {
  if (!purchaseDate) return null;
  const midnightLA = pstMidnight(purchaseDate);
  const unlockAt   = addDays(midnightLA, 8);
  const now = new Date();
  const diff = unlockAt - now;
  if (diff <= 0) return null;
  const MS_H = 1000 * 60 * 60, MS_D = MS_H * 24;
  const days  = Math.floor(diff / MS_D);
  const hours = Math.floor((diff % MS_D) / MS_H);
  return { days, hours };
}

// -------------------- parsing/helpers --------------------
function parseFloatSafe(v){ if(typeof v==='number')return v; const n=parseFloat(v); return Number.isFinite(n)?n:NaN; }
function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// condition bands (your exact thresholds)
function conditionOf(floatVal){
  const f=parseFloatSafe(floatVal);
  if(!Number.isFinite(f)) return {label:'-',cls:'cond-unknown'};
  if(f<=0.0799)  return {label:'Factory New', cls:'cond-fn'};
  if(f<=0.1499)  return {label:'Minimal Wear',cls:'cond-mw'};
  if(f<=0.37999) return {label:'Field-Tested',cls:'cond-ft'};
  if(f<=0.4499)  return {label:'Well-Worn',   cls:'cond-ww'};
  return           {label:'Battle-Scarred',   cls:'cond-bs'};
}

// proportional mapping along wear bar (segments sum to 100%)
function floatToBarPct(fRaw){
  const f=Math.min(1,Math.max(0,parseFloatSafe(fRaw)));
  const LEN_FN=0.0799, LEN_MW=0.1499-0.08, LEN_FT=0.37999-0.15, LEN_WW=0.4499-0.38, LEN_BS=1-0.45;
  const P_FN=7.99, P_MW=6.99, P_FT=22.999, P_WW=6.99, P_BS=55.0;
  if(f<=0.0799)   return (f/LEN_FN)*P_FN;
  if(f<=0.1499)   return P_FN + ((f-0.08)/LEN_MW)*P_MW;
  if(f<=0.37999)  return P_FN+P_MW + ((f-0.15)/LEN_FT)*P_FT;
  if(f<=0.4499)   return P_FN+P_MW+P_FT + ((f-0.38)/LEN_WW)*P_WW;
  return P_FN+P_MW+P_FT+P_WW + ((f-0.45)/LEN_BS)*P_BS;
}

// -------------------- category + Kato14 --------------------
function getCategory(name){
  const n=(name||'').toLowerCase();

  // knives (families that may not include the literal word)
  const knifeKeywords=['knife','shadow daggers','karambit','bayonet','butterfly','stiletto','falchion','huntsman','nomad','skeleton','survival','tactical','classic','paracord','navaja','ursus','talon','gut','m9 bayonet','bowie'];
  if(knifeKeywords.some(k=>n.includes(k))) return 'Knives';

  // gloves (include hand wraps)
  const gloveKeywords=['glove','hand wraps','wraps'];
  if(gloveKeywords.some(k=>n.includes(k))) return 'Gloves';

  const guns=['ak-47','ak47','m4a1','m4a4','awp','usp','usp-s','p2000','p250','famas','galil','aug','ssg','scar','scar-20','mac-10','mac10','mp7','mp9','ump','p90','pp-bizon','bizon','nova','xm1014','mag-7','mag7','sawed-off','sawed off','negev','m249','desert eagle','deagle','dual berettas','dualies','five-seven','fiveseven','cz75','tec-9','tec9','glock','sg 553','sg553'];
  if(guns.some(g=>n.includes(g))) return 'Guns';

  return 'Other';
}
function isKato14(special){
  const s=(special||'').toLowerCase();
  return s.includes('kato14')||s.includes('kato')||s.includes('k14');
}

// -------------------- modal --------------------
function showModalImage(src){
  document.querySelector('.modal')?.remove();
  const modal=document.createElement('div'); modal.className='modal'; modal.addEventListener('click',()=>modal.remove());
  const img=document.createElement('img'); img.className='modal-img'; img.alt='Full image'; img.src=src||'assets/chicken.png'; img.addEventListener('click',e=>e.stopPropagation());
  modal.appendChild(img); document.body.appendChild(modal);
  const onKey=e=>{ if(e.key==='Escape'){ modal.remove(); document.removeEventListener('keydown',onKey);} }; document.addEventListener('keydown',onKey);
}

// -------------------- normalization --------------------
function normalizeItem(raw){
  return {
    name: raw.name ?? raw.Name ?? raw.Item ?? '',
    special: raw.special ?? raw['Special'] ?? raw['Special Characteristics'] ?? '',
    float: raw.float ?? raw.Float ?? raw['Float Value'] ?? raw['Wear'] ?? NaN,
    image: raw.image ?? raw.Image ?? raw['Image'] ?? raw['Image URL'] ?? 'assets/chicken.png',
    include: raw.include ?? raw.Include ?? raw.show ?? raw.Show ?? raw.F,
    status: raw.status ?? raw.Status ?? raw.G ?? '',
    purchaseDate: raw.purchaseDate ?? raw.Date ?? raw['Date of Purchase'] ?? raw['Purchased'] ?? ''
  };
}

// -------------------- card --------------------
function createCard(item){
  const cond=conditionOf(item.float);
  const countdown=countdownFromPurchase(item.purchaseDate);
  const locked=!!countdown;

  const card=document.createElement('div'); card.className='card';

  const title=document.createElement('h3'); title.className='card-title'; title.textContent=item.name||'-'; card.appendChild(title);

  const row=document.createElement('div'); row.className='card-row';
  const badge=document.createElement('span'); badge.className=`badge ${locked?'locked':'unlocked'}`; badge.textContent=locked?'Locked':'Unlocked'; row.appendChild(badge);
  const condEl=document.createElement('span'); condEl.className=`condition ${cond.cls}`; condEl.textContent=cond.label; row.appendChild(condEl);
  card.appendChild(row);

  const imgWrap=document.createElement('div'); imgWrap.className='image-container';
  const img=document.createElement('img'); img.loading='lazy'; img.decoding='async'; img.alt=item.name||'-'; img.src=item.image||'assets/chicken.png';
  const mag=document.createElement('button'); mag.className='magnify-btn'; mag.type='button'; mag.textContent='🔍'; mag.addEventListener('click',e=>{ e.stopPropagation(); showModalImage(img.src); });
  imgWrap.appendChild(img); imgWrap.appendChild(mag); card.appendChild(imgWrap);

  const wearWrap=document.createElement('div'); wearWrap.className='wear-wrapper';
  const wearBar=document.createElement('div'); wearBar.className='wear-bar';
  const pointer=document.createElement('div'); pointer.className='wear-pointer';
  const leftPct=Number.isFinite(parseFloatSafe(item.float))? floatToBarPct(item.float) : 0; pointer.style.left=`${leftPct}%`;
  wearBar.appendChild(pointer); wearWrap.appendChild(wearBar);
  const wearVal=document.createElement('div'); wearVal.className='wear-value';
  wearVal.textContent='Float: ' + (Number.isFinite(parseFloatSafe(item.float))? parseFloat(item.float).toFixed(10) : '-');
  wearWrap.appendChild(wearVal); card.appendChild(wearWrap);

  if(item.special){
    const specEl=document.createElement('div'); specEl.className='special';
    specEl.innerHTML=`<strong>Special:</strong> ${escapeHTML(item.special)}`; card.appendChild(specEl);
  }

  const trade=document.createElement('div'); trade.className='trade';
  if(locked){ trade.innerHTML=`<strong>Trade lock:</strong> ${countdown.days} days ${countdown.hours} hours remaining`; }
  else{ trade.innerHTML=`<strong>Trade lock:</strong> none`; }
  card.appendChild(trade);

  return card;
}

// -------------------- render with filters --------------------
function renderCards(rawData, filters){
  const grid=document.getElementById('cards-container'); grid.innerHTML='';

  let listRaw = Array.isArray(rawData)? rawData : [];
  const normalized = listRaw.map(normalizeItem);

  // diagnostics buckets
  let includeTrue=0, gBlank=0, hasName=0;

  // strict filter: F must be TRUE, G must be blank, must have a name
  let list = normalized.filter(it=>{
    const include = (it.include === true) || (typeof it.include === 'string' && it.include.trim().toLowerCase() === 'true');
    const gIsBlank = (it.status === '' || it.status === null || typeof it.status === 'undefined');
    const nameOk = !!it.name;

    if(include) includeTrue++;
    if(gIsBlank) gBlank++;
    if(nameOk) hasName++;

    return include && gIsBlank && nameOk;
  });

  // fallback if strict yielded zero
  if(list.length===0 && SAFE_MODE_IF_ZERO){
    list = normalized.filter(it=>{
      const include = (it.include === true) || (typeof it.include === 'string' && it.include.trim().toLowerCase() === 'true');
      const nameOk = !!it.name;
      return include && nameOk;
    });
    if(DIAG) console.warn('[coah] SAFE_MODE active: Column G blank requirement bypassed for rendering.');
  }

  // search
  if(filters.search){
    const q=filters.search.toLowerCase();
    list=list.filter(it=>
      (it.name||'').toLowerCase().includes(q) ||
      (it.special||'').toLowerCase().includes(q)
    );
  }

  // category & Kato14
  if(filters.category && filters.category!=='All'){
    list=list.filter(it=>{
      const cat=getCategory(it.name);
      const kato=isKato14(it.special);
      if(filters.category==='Kato14') return kato;
      return cat===filters.category;
    });
  }

  // only unlocked
  if(filters.onlyUnlocked){
    list=list.filter(it=>!countdownFromPurchase(it.purchaseDate));
  }

  // sort
  if(filters.sort==='Newest' || filters.sort==='Oldest'){
    list.sort((a,b)=>{
      const da=new Date(a.purchaseDate||0).getTime();
      const db=new Date(b.purchaseDate||0).getTime();
      return da-db;
    });
    if(filters.sort==='Newest') list.reverse();
  }

  // render
  for(const it of list) grid.appendChild(createCard(it));

  // count
  const countEl=document.getElementById('item-count');
  countEl.textContent=`Showing ${list.length} items`;

  // on-page hint if zero
  if(list.length===0){
    const hint=document.createElement('div');
    hint.className='error';
    hint.textContent='No items matched the filters (Include must be TRUE and Status blank).';
    grid.appendChild(hint);
  }

  // console diagnostics
  if(DIAG){
    console.log('[coah] diagnostics:', {
      rawCount: listRaw.length,
      normalizedCount: normalized.length,
      includeTrue, gBlank, hasName,
      renderedCount: list.length,
      sample: normalized[0]||null
    });
  }
}

// -------------------- fetch --------------------
async function fetchItems(){
  const res=await fetch(API_URL,{cache:'no-store'});
  if(!res.ok){
    console.error('[coah] fetch-items failed', res.status, await res.text());
    throw new Error('Could not load items');
  }
  const body=await res.json();
  if(Array.isArray(body)) return body;
  if(body?.items && Array.isArray(body.items)) return body.items;
  if(body?.data  && Array.isArray(body.data))  return body.data;
  if(body?.normalized && Array.isArray(body.normalized)) return body.normalized;
  if(body?.rows && Array.isArray(body.rows)) return body.rows;
  console.warn('[coah] Unexpected payload shape; returning []');
  return [];
}

// -------------------- init --------------------
(async function init(){
  try{
    const data=await fetchItems();

    const filters={ category:'All', sort:'Newest', onlyUnlocked:false, search:'' };
    const $=id=>document.getElementById(id);
    const categorySelect=$('category-filter');
    const sortSelect=$('sort-filter');
    const unlockedCheckbox=$('unlocked-filter');
    const searchInput=$('search-bar');

    categorySelect?.addEventListener('change',()=>{ filters.category=categorySelect.value; renderCards(data,filters); });
    sortSelect?.addEventListener('change', ()=>{ filters.sort=sortSelect.value; renderCards(data,filters); });
    unlockedCheckbox?.addEventListener('change', ()=>{ filters.onlyUnlocked=unlockedCheckbox.checked; renderCards(data,filters); });
    searchInput?.addEventListener('input', ()=>{ filters.search=searchInput.value; renderCards(data,filters); });

    renderCards(data,filters);
  }catch(err){
    console.error('[coah] init error:', err);
    const grid=document.getElementById('cards-container');
    if(grid) grid.innerHTML=`<div class="error">Could not load items. Please try again later.</div>`;
    const count=document.getElementById('item-count');
    if(count) count.textContent='Showing 0 items';
  }
})();
