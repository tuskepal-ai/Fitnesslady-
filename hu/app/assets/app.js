const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function getJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.json();
}

function bindTapGlow(){
  $$('.interactive').forEach(el=>{
    el.addEventListener('touchstart', ()=>{
      el.classList.add('is-active');
      clearTimeout(el.__t);
      el.__t = setTimeout(()=>el.classList.remove('is-active'), 650);
    }, {passive:true});
  });
}

function modal(){
  const overlay = $('#overlay');
  const titleEl = $('#modalTitle');
  const bodyEl = $('#modalBody');
  const closeBtn = $('#close');

  function open(title, html){
    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    overlay.classList.add('open');
  }
  function close(){ overlay.classList.remove('open'); }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  document.addEventListener('keydown', (e)=>{ if(overlay.classList.contains('open') && e.key==='Escape') close(); });
  return { open, close };
}

function fmtDate(iso){
  try{
    const d = new Date(iso);
    const p = (n)=>String(n).padStart(2,'0');
    return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())}`;
  }catch{ return iso; }
}

function buildTabs(weeks){
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  for(let i=1;i<=weeks;i++){
    const b = document.createElement('button');
    b.className = 'tab' + (i===1 ? ' is-active' : '');
    b.dataset.week = String(i);
    b.type = 'button';
    b.textContent = `Hét ${i}`;
    tabs.appendChild(b);
  }
}

function videoById(lib, id){
  return lib.videos.find(v=>v.id===id);
}

function renderWeeklyGrid(lib, weekVideoIds){
  const grid = $('#weeklyGrid');
  grid.innerHTML = '';
  for(const vid of weekVideoIds){
    const v = videoById(lib, vid);
    if(!v) continue;
    const card = document.createElement('article');
    card.className = 'card interactive';
    card.innerHTML = `
      <div class="thumb" aria-hidden="true"></div>
      <b>${esc(v.title)}</b>
      <div class="meta">${esc(String(v.durationMin))} perc • Szint ${esc(String(v.level))} • ${esc(v.type)}</div>
      <div class="playrow">
        <button class="btn primary interactive play" type="button" data-id="${esc(v.id)}">Lejátszás</button>
        <button class="btn interactive details" type="button" data-id="${esc(v.id)}">Részletek</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

function renderSlots(lib, slots){
  const grid = $('#slotsGrid');
  grid.innerHTML = '';
  for(const key of ['slot1','slot2','slot3']){
    const s = slots[key];
    const v = videoById(lib, s.videoId);
    const card = document.createElement('article');
    card.className = 'card interactive';
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <b>${esc(s.label)}</b>
        <span style="font-size:12px;color:rgba(255,255,255,.85);padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06)">SLOT</span>
      </div>
      <p style="margin:8px 0 10px;color:var(--muted);font-size:13.5px;line-height:1.55">${esc(s.note || '')}</p>
      <div class="meta">${v ? `${esc(v.title)} • ${esc(v.type)} • Szint ${esc(String(v.level))}` : '—'}</div>
      <div class="playrow">
        <button class="btn primary interactive play" type="button" data-id="${esc(s.videoId)}">Lejátszás</button>
        <button class="btn interactive details" type="button" data-id="${esc(s.videoId)}">Részletek</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

function bindActions(customer, m){
  const openDiet = () => m.open('Étrend (teszt)', `
    <p>Egyszerű, tartható étrend rendszer. (Később: képes receptek, bevásárlólista, makrók.)</p>
    <p><b>Most:</b> csak demo tartalom.</p>
  `);

  const openCheckin = () => m.open('Check-in / Célom (teszt)', `
    <p><b>Cél:</b> ${esc(customer.track)} (F=Forma, Z=Zsírvesztés, E=Erő)</p>
    <label>Mi ment jól?</label>
    <textarea placeholder="Pl. 3 edzést megcsináltam..."></textarea>
    <label>Mi volt nehéz?</label>
    <textarea placeholder="Pl. kevés idő..."></textarea>
    <div style="height:10px"></div>
    <button class="btn primary interactive" type="button" onclick="alert('Demo: elküldve')">Küldés</button>
  `);

  $('#btnDiet').addEventListener('click', openDiet);
  $('#btnCheckin').addEventListener('click', openCheckin);

  $('#btnTech').addEventListener('click', ()=> m.open('Technika tár (teszt)', `
    <p>Örökre elérhető technikai anyagok (demo).</p>
    <p><button class="btn primary interactive" type="button" onclick="alert('Demo: technika 1')">Farizom aktiváció</button></p>
    <p><button class="btn interactive" type="button" onclick="alert('Demo: technika 2')">Térd-csípő vonal</button></p>
  `));

  const renewFlow = () => m.open('Megújítás (teszt)', `
    <p><b>Megújítás</b> – demo folyamat.</p>
    <button class="btn primary interactive" type="button" onclick="alert('Demo: megújítva')">Fizetés szimulálása</button>
  `);

  $('#btnRenew').addEventListener('click', renewFlow);
  $('#btnRenewTop').addEventListener('click', renewFlow);

  $('#btnUpgrade').addEventListener('click', ()=> m.open('Upgrade (teszt)', `
    <p><b>Upgrade</b> – demo.</p>
    <button class="btn primary interactive" type="button" onclick="alert('Demo: upgrade kész')">Upgrade szimulálása</button>
  `));

  $('#btnHelp').addEventListener('click', ()=> m.open('Súgó', `
    <p>Ez egy demo vevő app.</p>
    <p>• Hetek váltása</p>
    <p>• Heti videók + 3 slot</p>
    <p>• Étrend / Check-in / Technika modalok</p>
  `));
}

function setupWeekTabs(onChange){
  const tabs = $$('#tabs .tab');
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('is-active'));
      t.classList.add('is-active');
      onChange(Number(t.dataset.week));
    });
  });
}

async function bootstrap(){
  const m = modal();
  bindTapGlow();

  const base = new URL('.', window.location.href);
  const dataBase = new URL('data/', base);

  const [templates, lib, customer, program] = await Promise.all([
    getJSON(new URL('templates.v1.json', dataBase)),
    getJSON(new URL('videos.v1.json', dataBase)),
    getJSON(new URL('demo.customer.json', dataBase)),
    getJSON(new URL('demo.program.json', dataBase)),
  ]);

  $('#custName').textContent = customer.name;
  $('#custPkg').textContent = `${customer.package.toUpperCase()} • ${templates.packages[customer.package].weeks} hét`;
  $('#range').textContent = `${fmtDate(customer.period.from)} – ${fmtDate(customer.period.to)}`;
  $('#goal').textContent = customer.track === 'F' ? 'Forma' : (customer.track === 'Z' ? 'Zsírvesztés' : 'Erő');

  const weeks = templates.packages[customer.package].weeks;
  buildTabs(weeks);

  const renderWeek = (n)=>{
    const ids = program.weeks[String(n)] || [];
    renderWeeklyGrid(lib, ids);
    renderSlots(lib, program.slots);
    bindTapGlow();
  };

  setupWeekTabs(renderWeek);
  renderWeek(customer.activeWeek || 1);

  bindActions(customer, m);

  // placeholder upgrade
  try{ await import(new URL('upgrades/u001-placeholder.js', base)); }catch{}
}

bootstrap().catch(err=>{
  console.error(err);
  const box = document.createElement('div');
  box.className = 'glass';
  box.style.width = 'min(900px, 92vw)';
  box.style.margin = '22px auto';
  box.style.padding = '16px';
  box.innerHTML = `<b>Hiba a vevő app betöltésekor</b><p style="color:rgba(255,255,255,.75)">`+esc(String(err))+`</p>`;
  document.body.appendChild(box);
});