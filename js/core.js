'use strict';
/* =====================================================================
   UI core: toasts + achievements (shared by the city and the race)
   ===================================================================== */
function toast(text, {type='default', icon='◆', label='', dur=4200, sound=true} = {}){
  const el = document.createElement('div');
  el.className = 'toast frame is-' + type;
  el.innerHTML = `<div class="toast-bar" style="animation-duration:${dur}ms"></div><div class="toast-ico">${icon}</div><div>${label ? `<small>${label}</small>` : ''}${text}</div>`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  if (sound && type !== 'success') Sound.toast();
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 460); }, dur);
}

const achState = store.get('ach', {});
const achSets = {explore:new Set(store.get('ach.explore', [])), modes:new Set(store.get('ach.modes', [])), read:new Set(store.get('ach.read', [])), cubes:new Set()};
function achProgress(id){ return achState[id] || 0; }
function achDone(id){ const a = ACHIEVEMENTS.find(a => a.id === id); return achProgress(id) >= a.goal; }
function achieve(id, amount = 1, absolute = false){
  const a = ACHIEVEMENTS.find(a => a.id === id);
  if (!a || achDone(id)) return;
  const before = achProgress(id);
  achState[id] = Math.min(a.goal, absolute ? amount : before + amount);
  if (Math.floor(achState[id]) !== Math.floor(before) || achState[id] >= a.goal) store.set('ach', achState);
  if (achState[id] >= a.goal){
    Sound.achieve();
    toast(`<strong>${a.title}</strong>`, {type:'success', icon:'✓', label:'Achievement unlocked', dur:5000});
    if (typeof World !== 'undefined' && World) World.updateTrophy();
    if (currentTab === 'achievements') renderTab('achievements', true);
  }
}
const achCount = () => ACHIEVEMENTS.filter(a => achDone(a.id)).length;

/* Liquid emerald swirl (the theme's signature texture): bands of fine parallel
   bezier strokes, brightest in the middle of each band, with black gaps between. */
function makeSwirl(w, h, sd = 21, bands = 16){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const old = seed; seed = sd;
  g.lineCap = 'round';
  for (let r = 0; r < bands; r++){
    const x0 = rand()*w*1.3 - w*.15, y0 = rand()*h*1.3 - h*.15, ang = rand()*Math.PI*2, len = (.45 + rand()*.75)*w;
    const x3 = x0 + Math.cos(ang)*len, y3 = y0 + Math.sin(ang)*len*.6;
    const c1 = [x0 + (rand() - .5)*w*.9, y0 + (rand() - .5)*h], c2 = [x3 + (rand() - .5)*w*.9, y3 + (rand() - .5)*h];
    const n = 16 + Math.floor(rand()*28), spread = (.03 + rand()*.1)*h, peak = .3 + rand()*.7;
    const dx = x3 - x0, dy = y3 - y0, L = Math.hypot(dx, dy) || 1, px = -dy/L, py = dx/L;
    const curve = (o, k) => { g.beginPath(); g.moveTo(x0 + px*o, y0 + py*o); g.bezierCurveTo(c1[0] + px*o*k, c1[1] + py*o*k, c2[0] + px*o*k, c2[1] + py*o*k, x3 + px*o, y3 + py*o); };
    // soft glow under the band
    g.filter = 'blur(14px)'; g.strokeStyle = `rgba(20,170,95,${.18*peak})`; g.lineWidth = spread*2.2; curve(0, 1.6); g.stroke(); g.filter = 'none';
    for (let i = 0; i < n; i++){
      const t = i/(n - 1), o = (t - .5)*spread*2, b = Math.pow(Math.sin(t*Math.PI), 1.7)*peak*(.7 + rand()*.3);
      const col = a => `rgba(${Math.round(8 + 56*b)},${Math.round(48 + 207*b)},${Math.round(32 + 112*b)},${a})`;
      const gr = g.createLinearGradient(x0, y0, x3, y3);
      gr.addColorStop(0, col(0)); gr.addColorStop(.22, col(.95)); gr.addColorStop(.7, col(1)); gr.addColorStop(1, col(0));
      g.strokeStyle = gr; g.lineWidth = spread*2/n*.82;
      curve(o, 1.6); g.stroke();
    }
  }
  seed = old;
  return c;
}
// the same texture, faint, behind every panel
try { html.style.setProperty('--swirl', `url(${makeSwirl(900, 520, 5, 12).toDataURL('image/jpeg', .8)})`); } catch(e){}
