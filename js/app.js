'use strict';
/* =====================================================================
   INPUT
   ===================================================================== */
const KEYMAP = {KeyW:'up', ArrowUp:'up', KeyS:'down', ArrowDown:'down', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', ShiftLeft:'boost', ShiftRight:'boost'};
let modalOpen = false, currentTab = 'home', menuOpenedAt = 0;
function setMode(m){ html.classList.toggle('is-mode-touch', m === 'touch'); html.classList.toggle('is-mode-gamepad', m === 'gamepad'); }
addEventListener('keydown', e => {
  if (!World) return;
  if (e.target.closest && e.target.closest('input,textarea')) return;
  setMode('keyboard');
  if (!World.started){ if (e.code === 'Enter' || e.code === 'Space') startExperience(); return; }
  if (Race.active){
    if (KEYMAP[e.code]){ World.input[KEYMAP[e.code]] = 1; e.preventDefault(); if (KEYMAP[e.code] === 'boost' && !e.repeat) Sound.boost(); }
    if (e.repeat) return;
    if (e.code === 'Escape') Race.exit();
    if (e.code === 'KeyR') Race.restart();
    if (e.code === 'KeyM') Sound.toggleMute();
    if (e.code === 'KeyN') toggleMusic();
    if (e.code === 'Backquote') toggleDebug();
    return;
  }
  if (KEYMAP[e.code]){ World.input[KEYMAP[e.code]] = 1; if (KEYMAP[e.code] === 'boost' && !e.repeat && !modalOpen && World.input.up) Sound.boost(); if (e.code.startsWith('Arrow') && !modalOpen) e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'Escape'){ if (modalOpen) closeModals(); else openMenu('home'); }
  if (modalOpen) return;
  if (e.code === 'Space'){ e.preventDefault(); World.hop(); }
  if (e.code === 'Enter' || e.code === 'KeyE') interact();
  if (e.code === 'KeyH'){ Sound.ping(); achieve('ping'); }
  if (e.code === 'KeyT') World.cyclePreset();
  if (e.code === 'KeyR') openMenu('race');
  if (e.code === 'KeyM') Sound.toggleMute();
  if (e.code === 'KeyN') toggleMusic();
  if (e.code === 'Tab'){ e.preventDefault(); openMap(); }
  if (e.code === 'Backquote') toggleDebug();
});
addEventListener('keyup', e => { if (World && KEYMAP[e.code]) World.input[KEYMAP[e.code]] = 0; });
addEventListener('blur', () => World && Object.keys(World.input).forEach(k => World.input[k] = 0));
addEventListener('touchstart', () => setMode('touch'), {passive:true});

function openArea(a){ if (Race.active) return; if (a.tab === 'projects') openMenu('project:' + a.project); else openMenu(a.tab); }
// Enter works at the diamond or anywhere on an area's plaza
function interact(){ const p = World.nearPin, a = p ? p.area : World.nearArea(); if (a) openArea(a); }
function launchRace(){ closeModals(); Race.enter(); }

// gamepad: left stick steer, RT/LT throttle, A interact/hop, B boost, X ping, Y mode, Start menu
const padPrev = [];
function pollGamepad(){
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!gp) return;
  const b = i => gp.buttons[i] && gp.buttons[i].pressed, pressed = i => b(i) && !padPrev[i];
  const ax = Math.abs(gp.axes[0]) > .15 ? gp.axes[0] : 0;
  const thr = (gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0);
  if (ax || thr || gp.buttons.some(x => x.pressed)) setMode('gamepad');
  World.input.padX = ax; World.input.padThrottle = thr;
  World.input.padBoost = b(1) ? 1 : 0;
  if (!World.started && pressed(0)) startExperience();
  else if (Race.active){ if (pressed(1)) Sound.boost(); if (pressed(9)) Race.exit(); if (pressed(3)) Race.restart(); }
  else if (modalOpen){ if (pressed(1) || pressed(9)) closeModals(); }
  else {
    if (pressed(0)){ if (World.nearPin) interact(); else World.hop(); }
    if (pressed(1)) Sound.boost();
    if (pressed(2)){ Sound.ping(); achieve('ping'); }
    if (pressed(3)) World.cyclePreset();
    if (pressed(9)) openMenu('home');
    if (pressed(8)) openMap();
  }
  gp.buttons.forEach((x, i) => padPrev[i] = x.pressed);
}

// touch: a floating PS5-style thumbstick appears wherever you put your thumb.
// push up = forward, pull down = reverse, left/right = steer. tap a diamond to open it,
// pinch with two fingers to zoom. in the race the same stick steers (pull down to brake).
(() => {
  const game = $('#game'), touches = new Map(), R = 62, DEAD = .14;
  const stick = $('#vstick'), knob = $('#vstickKnob');
  let pinch0 = 0, stickId = null, sx = 0, sy = 0;
  const showStick = (x, y) => { sx = x; sy = y; stick.style.left = x + 'px'; stick.style.top = y + 'px'; knob.style.transform = ''; stick.classList.add('is-active'); html.classList.add('used-stick'); };
  const hideStick = () => { stickId = null; stick.classList.remove('is-active'); knob.style.transform = ''; World.input.joyX = World.input.joyY = 0; };
  function moveStick(x, y){
    let dx = x - sx, dy = y - sy; const l = Math.hypot(dx, dy);
    if (l > R){ dx = dx/l*R; dy = dy/l*R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = v => Math.abs(v) < DEAD ? 0 : (v - Math.sign(v)*DEAD)/(1 - DEAD);
    World.input.joyX = k(dx/R); World.input.joyY = k(dy/R);
    stick.classList.toggle('is-back', dy/R > DEAD);
  }
  game.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !World || !World.started || modalOpen) return;
    setMode('touch'); e.preventDefault();
    const pin = Race.active ? null : World.pinAt(e.clientX, e.clientY);
    touches.set(e.pointerId, {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, pin});
    game.setPointerCapture && game.setPointerCapture(e.pointerId);
    if (touches.size === 2){ hideStick(); const [p1, p2] = [...touches.values()]; pinch0 = Math.hypot(p1.x - p2.x, p1.y - p2.y); return; }
    if (!pin && stickId === null){ stickId = e.pointerId; showStick(e.clientX, e.clientY); }
  });
  game.addEventListener('pointermove', e => {
    const tp = touches.get(e.pointerId); if (!tp) return;
    tp.x = e.clientX; tp.y = e.clientY;
    if (touches.size === 2){
      const [p1, p2] = [...touches.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (pinch0 > 0){ World.zoomBy(pinch0/d); pinch0 = d; }
      return;
    }
    if (e.pointerId === stickId) moveStick(e.clientX, e.clientY);
    // started on a diamond but dragged away: treat it as a stick after all
    else if (tp.pin && Math.hypot(tp.x - tp.x0, tp.y - tp.y0) > 18 && stickId === null){ tp.pin = null; stickId = e.pointerId; showStick(tp.x0, tp.y0); moveStick(tp.x, tp.y); }
  });
  const end = e => {
    const tp = touches.get(e.pointerId); touches.delete(e.pointerId);
    if (touches.size < 2) pinch0 = 0;
    if (e.pointerId === stickId) hideStick();
    // a touch that starts and ends on a diamond (without dragging) opens that area
    if (tp && tp.pin && !Race.active && Math.hypot(tp.x - tp.x0, tp.y - tp.y0) < 18) openArea(tp.pin.area);
  };
  game.addEventListener('pointerup', end); game.addEventListener('pointercancel', end);
  const hold = (el, on, off) => { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); on(); }); el.addEventListener('pointerup', off || (() => {})); el.addEventListener('pointerleave', off || (() => {})); el.addEventListener('pointercancel', off || (() => {})); };
  hold($('#tBoost'), () => { World.input.boost = 1; Sound.boost(); }, () => World.input.boost = 0);
  hold($('#tHop'), () => World.hop());
  hold($('#tOpen'), () => interact());
})();

/* =====================================================================
   MENU + CONTENT
   ===================================================================== */
const ICONS = {
  home:'<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  projects:'<rect x="4" y="4" width="16" height="4"/><rect x="4" y="10" width="16" height="4"/><rect x="4" y="16" width="16" height="4"/>',
  career:'<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M7 9l3 2-3 2M12 13h5M9 21h6"/>',
  skills:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  achievements:'<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
  lab:'<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M7 6l3 5M7 18l3-5M14 12h3"/>',
  controls:'<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>',
  contact:'<path d="M12 3v3M5 7l2 2M19 7l-2 2"/><path d="M8 21l4-11 4 11M9.5 17h5"/>',
  race:'<path d="M12 2l3 7h-6z"/><path d="M9 9l-6 6h6M15 9l6 6h-6M9 15v3l3 3 3-3v-3z"/>',
};
const TABS = ['home','projects','race','career','skills','achievements','lab','controls','contact'];
const TAB_AREA = {race:'race', home:'home', projects:'sql', career:'career', skills:'skills', achievements:'trophy', lab:'lab', controls:'home', contact:'contact'};
const TAB_NAMES = {race:'Sky Race', home:'Home', projects:'Projects', career:'Career', skills:'Skills', achievements:'Achievements', lab:'Behind the scene', controls:'Controls', contact:'Contact'};
$('#tabs').innerHTML = TABS.map(t => `<button class="tab frame" data-tab="${t}" aria-label="${TAB_NAMES[t]}" title="${TAB_NAMES[t]}"><svg viewBox="0 0 24 24">${ICONS[t]}</svg></button>`).join('');

const pct = v => `${v}%`;
const bar = (v, cls = '') => `<div class="bar ${cls}"><i data-w="${parseFloat(v)/100}"></i></div>`;
const linkBtn = (url, label, icon, tip) => url
  ? `<a class="button is-holo" href="${url}" target="_blank" rel="noopener">${icon}${label}</a>`
  : `<span class="button is-disabled" data-tip="${tip}">${icon}${label}</span>`;
const IC = {
  mail:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  code:'<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
  link:'<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></svg>',
  doc:'<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
};

const CONTENT = {
  race: () => `
    <p class="eyebrow">// portal · sky race arena</p>
    <h2 class="title">Race the <span class="glow">optimizers</span></h2>
    <p>Step through the portal into an emerald sky circuit: 3 laps through light-gates, between floating towers, against three AI ships.</p>
    <div class="btn-row" style="margin:0 0 18px"><button class="button is-holo" data-action="race"><svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>Launch race</button></div>
    <div class="stats">
      <div class="stat frame"><div class="v" style="color:#e6cc8a">ADAM</div><div class="l">steady, adaptive, hard to shake</div></div>
      <div class="stat frame"><div class="v">RMSPROP</div><div class="l">quick off the line</div></div>
      <div class="stat frame"><div class="v" style="color:#ffc67b">SGD+M</div><div class="l">slow start, highest top speed</div></div>
    </div>
    <p class="text-small">▸ Fly through the <b style="color:#e6cc8a">gold centre</b> of a boost gate for a speed kick and boost energy.<br>▸ Curves push you outward. Steer into them or you'll scrape the rails.<br>▸ <span class="key">W</span> thrust · <span class="key">S</span> brake · <span class="key">A D</span> steer · <span class="key">SHIFT</span> boost · <span class="key">R</span> restart · <span class="key">ESC</span> back to city</p>
    <p class="text-small">Best lap <b class="mono">${fmtTime(Race.bestLap)}</b> · best race <b class="mono">${fmtTime(Race.bestRace)}</b></p>
    <div class="btn-row"><button class="button is-holo" data-action="race"><svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>Launch race</button></div>`,
  home: () => `
    <p class="eyebrow">// session initialized</p>
    <h1 class="title">Hi! I'm <span class="glow">${CONFIG.shortName}</span>.</h1>
    <p>I'm an <b>${CONFIG.role.toLowerCase()}</b> based in ${CONFIG.location}. ${CONFIG.tagline} I fine-tune, quantize and reinforce models until a laptop GPU is enough.</p>
    <p>This whole portfolio is a sky city you can drive through. Every plaza holds a piece of my work. Roll up to a diamond and press <span class="key">ENTER</span> to open it. Find the portal in the east to race spacecraft.</p>
    <p class="text-small">And please don't overfit anything.</p>
    <div class="stats">
      <div class="stat frame"><div class="v">82.4%</div><div class="l">test execution accuracy, Text-to-SQL</div></div>
      <div class="stat frame"><div class="v">94.0%</div><div class="l">handwritten Tamil word accuracy, OCR</div></div>
      <div class="stat frame"><div class="v">6 GB</div><div class="l">laptop GPU was enough to train</div></div>
    </div>
    <div class="btn-row">
      <button class="button is-holo" data-goto="projects">${IC.code}See projects</button>
      <button class="button" data-action="map">Open the map</button>
      <button class="button" data-goto="race">Sky race</button>
      <button class="button" data-action="music">${IC.play}<span data-music-label>${Sound.musicOn ? 'Stop' : 'Play'} soundtrack</span></button>
    </div>`,
  projects: () => `
    <p class="eyebrow">// 2 models shipped</p>
    <h2 class="title">Projects</h2>
    <p>Each one is told as a model's journey: base model → quantized → + dataset → fine-tuned → RL-tuned. Pick one.</p>
    ${PROJECTS.map((p, i) => `
      <button class="proj frame" data-goto="project:${i}">
        <h3>${p.title}</h3>
        <p>${p.problem}</p>
        <div class="chips" style="margin-bottom:10px">${p.tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>
        <span class="go">${p.stats[0][0]} · ${p.stats[0][1]} &nbsp;→ open deep-dive</span>
      </button>`).join('')}`,
  project: (i) => {
    const p = PROJECTS[i];
    achSets.read.add(p.id); store.set('ach.read', [...achSets.read]); achieve('read', achSets.read.size, true);
    let body = `
      <button class="back" data-goto="projects">← All projects</button>
      <p class="eyebrow">// project ${String(i + 1).padStart(2, '0')}</p>
      <h2 class="title">${p.title}</h2>
      <p>${p.problem}</p>
      <div class="rail">${p.rail.map(([t, c], k) => `${k ? '<span class="arr">→</span>' : ''}<span class="node" style="--c:${c};animation-delay:${k*.07}s">${t}</span>`).join('')}</div>
      <div class="stats">${p.stats.map(([v, l]) => `<div class="stat frame"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`;
    if (p.langs){
      body += `<h3 class="subtitle">Handwritten word accuracy</h3>
        <div class="legend"><span><i style="background:rgba(255,255,255,.28)"></i>stock PaddleOCR</span><span><i style="background:var(--holo)"></i>ours</span></div>
        ${p.langs.map(([l, b, a]) => `
          <div class="mini"><span>${l}</span>${b === null ? '<span class="text-small">not supported</span>' : bar(b, 'is-before')}<b>${b === null ? '—' : pct(b)}</b></div>
          <div class="mini" style="margin-bottom:12px"><span></span>${bar(a)}<b style="color:var(--holo)">${pct(a)}</b></div>`).join('')}`;
    }
    body += `<h3 class="subtitle">Before → after</h3>` + p.metrics.map(m => `
      <div class="metric"><div class="lbl text-small" style="margin-bottom:4px">${m.label}</div>
      ${m.steps.map(([v, l], k) => `<div class="row"><span>${l}</span><b style="color:${k === m.steps.length - 1 ? 'var(--lime)' : '#fff'}">${pct(v)}</b></div>${bar(v, k === m.steps.length - 1 ? 'is-lime' : (k === 0 ? 'is-before' : ''))}`).join('')}</div>`).join('');
    if (p.curve){
      const W = 400, H = 120, pts = p.curve.pts, x = k => 20 + k*(W - 40)/(pts.length - 1), y = v => H - 18 - v/100*(H - 30);
      body += `<h3 class="subtitle">${p.curve.label}</h3>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="${p.curve.label}: ${pts.join(', ')} percent">
          <line x1="20" x2="${W-20}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(255,255,255,.25)"/>
          <polyline fill="none" stroke="#4af2a1" stroke-width="2.5" points="${pts.map((v, k) => `${x(k)},${y(v)}`).join(' ')}" style="filter:drop-shadow(0 0 6px rgba(74,242,161,.7))"/>
          ${pts.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="4" fill="#040706" stroke="#4af2a1" stroke-width="2"/><text x="${x(k)}" y="${y(v) - 10}" fill="#fff" font-size="12" font-family="JetBrains Mono" text-anchor="middle">${v}%</text>`).join('')}
        </svg>`;
    }
    body += `<h3 class="subtitle">Engineering notes</h3>${p.notes.map(n => `<p class="text-small">▸ ${n}</p>`).join('')}`;
    return body;
  },
  career: () => `
    <p class="eyebrow">// career terminal</p>
    <h2 class="title">Career</h2>
    <p>Early-career ML engineer in ${CONFIG.location}. My work so far has been end-to-end model building: building datasets, parameter-efficient fine-tuning, reinforcement learning with execution rewards, and shipping models that run on modest hardware.</p>
    <h3 class="subtitle">What I've done</h3>
    <p class="text-small">▸ Took a 1.5B code model from <b>0% → 82.4%</b> test execution accuracy on a 1,872-column ClickHouse warehouse with QLoRA + GRPO.</p>
    <p class="text-small">▸ Fine-tuned one <b>12.5 MB</b> OCR model to read 5 scripts, printed and handwritten, on a plain CPU.</p>
    <p class="text-small">▸ Fit training into a <b>6 GB</b> laptop GPU with 4-bit NF4 and Liger fused kernels.</p>
    <h3 class="subtitle">Looking for</h3>
    <p>ML / AI engineering roles in India where I can train, evaluate and ship models.</p>
    <div class="btn-row">${linkBtn(CONFIG.resume, 'Resume', IC.doc, 'Resume link not added yet')}<button class="button" data-goto="contact">Get in touch</button></div>`,
  skills: () => `
    <p class="eyebrow">// skill ring</p>
    <h2 class="title">Skills</h2>
    <p>Everything here was used in the projects on this island.</p>
    <h3 class="subtitle">Training</h3><div class="chips">${['QLoRA / LoRA','GRPO (RL)','4-bit NF4','Liger kernels','Weight averaging','Synthetic data','S3 checkpoints'].map(s => `<span class="chip is-holo">${s}</span>`).join('')}</div>
    <h3 class="subtitle">Domains</h3><div class="chips">${['Text-to-SQL','ClickHouse','OCR · 5 scripts','PaddleOCR','Schema pruning'].map(s => `<span class="chip is-holo">${s}</span>`).join('')}</div>
    <h3 class="subtitle">Deployment</h3><div class="chips">${['ONNX Runtime','CPU inference','Model versioning'].map(s => `<span class="chip is-holo">${s}</span>`).join('')}</div>
    <h3 class="subtitle">This website</h3><div class="chips">${['three.js','Web Audio synthesis','WebGL'].map(s => `<span class="chip is-holo">${s}</span>`).join('')}</div>`,
  achievements: () => {
    const n = achCount();
    return `
    <p class="eyebrow">// trophy obelisk</p>
    <div class="ach-head"><h2 class="title">Achievements</h2><b class="mono" style="color:var(--holo)">${n} / ${ACHIEVEMENTS.length}</b></div>
    ${bar(n/ACHIEVEMENTS.length*100)}
    ${ACHIEVEMENTS.map(a => { const p = achProgress(a.id), done = p >= a.goal; return `
      <div class="ach ${done ? 'is-achieved' : ''}">
        <div class="ach-title"><svg class="check" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>${a.title}</div>
        <div class="ach-desc"><span>${a.desc}</span><b>${a.id === 'music' || a.id === 'boost' ? Math.floor(p) : p} / ${a.goal}</b></div>
        ${a.goal > 1 ? bar(p/a.goal*100, done ? 'is-lime' : '') : ''}
      </div>`; }).join('')}
    <div class="btn-row"><button class="button is-danger is-small" data-action="reset">Reset progress</button></div>`;
  },
  lab: () => `
    <p class="eyebrow">// behind the scene</p>
    <h2 class="title">How this was made</h2>
    <p>A single HTML file. No build step, no images, and <b>no audio files</b>.</p>
    <h3 class="subtitle">Rendering</h3>
    <p class="text-small">▸ three.js (WebGL) with an Unreal bloom pass on emissive materials.<br>▸ The city is procedural: saucer towers, needle spires, pill skyscrapers and domes are built from lathe and extrude profiles, then merged per material, so ~300 buildings cost three draw calls.<br>▸ Every mesh uses a two-stop vertex gradient instead of textures. Shadows are tinted blue, never grey.<br>▸ The reveal wave is a shader: fragments outside its radius are discarded.<br>▸ The sky race is a separate scene: a Catmull-Rom spline circuit with curvature-based drift and rubber-banded AI.<br>▸ Four world modes (T) blend sky, light, fog, shadow tint and glow strength.</p>
    <h3 class="subtitle">Sound</h3>
    <p class="text-small">▸ Every sound is synthesized live with the Web Audio API: oscillators, filtered noise, a generated reverb impulse and a feedback delay.<br>▸ The hover-engine pitch and filter follow your speed. Boost opens the hiss.<br>▸ In the race: countdown beeps, gate chimes, boost-gate sweeps, stereo whooshes when ships pass you, rail scrapes and a finish fanfare.<br>▸ The soundtrack is generative: an Am9 · Fmaj7 · Cmaj7 · G6 loop with random arpeggios, so it never plays the same way twice.</p>
    <h3 class="subtitle">Type</h3>
    <p class="text-small">▸ Michroma for display, Manrope for body, JetBrains Mono for numbers. Noto Sans for the Indic glyphs on the OCR tower.</p>
    <div class="btn-row"><button class="button is-holo" data-action="debug">Toggle debug overlay</button><button class="button" data-action="music">${IC.play}<span data-music-label>${Sound.musicOn ? 'Stop' : 'Play'} soundtrack</span></button></div>`,
  controls: () => `
    <p class="eyebrow">// input</p>
    <h2 class="title">Controls</h2>
    <div class="itabs" role="tablist">
      <button class="itab is-active" data-itab="0" aria-label="Keyboard and mouse"><svg viewBox="0 0 32 32"><rect x="3" y="9" width="20" height="14" rx="2"/><path d="M7 13h2M11 13h2M15 13h2M7 17h12"/><rect x="25" y="9" width="5" height="9" rx="2.5"/></svg></button>
      <button class="itab" data-itab="1" aria-label="Touch"><svg viewBox="0 0 32 32"><path d="M13 16V6a2 2 0 0 1 4 0v8l6 1a2 2 0 0 1 2 2l-1 8h-11l-4-6a2 2 0 0 1 3-2z"/></svg></button>
      <button class="itab" data-itab="2" aria-label="Gamepad"><svg viewBox="0 0 32 32"><rect x="3" y="10" width="26" height="13" rx="6.5"/><path d="M10 14v5M7.5 16.5h5"/><circle cx="21" cy="15" r="1.2"/><circle cx="24" cy="18" r="1.2"/></svg></button>
    </div>
    <div class="ipane is-active" data-ipane="0"><div class="kv">
      <span><span class="key">W A S D</span> / <span class="key">↑ ← ↓ →</span></span><span>Drive</span>
      <span class="key">SHIFT</span><span>Boost</span><span class="key">SPACE</span><span>Hop</span>
      <span class="key">ENTER</span><span>Open the nearby area</span><span class="key">H</span><span>Sonar ping</span>
      <span class="key">T</span><span>Cycle world mode</span><span class="key">TAB</span><span>Map</span>
      <span class="key">M</span><span>Mute</span><span class="key">N</span><span>Soundtrack on / off</span>
      <span class="key">ESC</span><span>Menu / close (in race: back to city)</span><span class="key">R</span><span>Restart race</span><span>drag · wheel</span><span>Orbit · zoom the camera</span>
    </div></div>
    <div class="ipane" data-ipane="1"><div class="kv">
      <span class="key">Left stick</span><span>Drive and steer</span><span class="key">BOOST</span><span>Hold to boost</span>
      <span class="key">HOP</span><span>Hop</span><span class="key">OPEN</span><span>Shows up near an area</span>
    </div></div>
    <div class="ipane" data-ipane="2"><div class="kv">
      <span><span class="key">RT</span> / <span class="key">LT</span></span><span>Throttle / reverse</span><span class="key">L-stick</span><span>Steer</span>
      <span><span class="key">A</span> / <span class="key">✕</span></span><span>Open area or hop</span><span><span class="key">B</span> / <span class="key">○</span></span><span>Boost</span>
      <span><span class="key">X</span> / <span class="key">□</span></span><span>Ping</span><span><span class="key">Y</span> / <span class="key">△</span></span><span>World mode</span>
      <span class="key">START</span><span>Menu</span><span class="key">SELECT</span><span>Map</span>
    </div></div>`,
  contact: () => `
    <p class="eyebrow">// contact beacon</p>
    <h2 class="title">Let's talk</h2>
    <p>Hiring for an ML / AI role, or just want to nerd out about tiny models? The beacon is always on.</p>
    <div class="cards">
      <div class="ccard"><h4>Email</h4><p>Best way to reach me. I usually reply within a day.</p>${linkBtn(CONFIG.email ? 'mailto:' + CONFIG.email : '', CONFIG.email || 'Email', IC.mail, 'Email not added yet')}</div>
      <div class="ccard"><h4>Code</h4><p>Training scripts, experiments, and the source of this world.</p>${linkBtn(CONFIG.github, 'GitHub', IC.code, 'GitHub link not added yet')}</div>
      <div class="ccard"><h4>Network</h4><p>Career updates and longer write-ups.</p>${linkBtn(CONFIG.linkedin, 'LinkedIn', IC.link, 'LinkedIn link not added yet')}</div>
    </div>`,
};

const menuEl = $('#menu'), contentEl = $('#content'), panelContent = $('#panelContent');
let previewFlip = false;
function setPreview(tab){
  const areaId = tab.startsWith('project:') ? PROJECTS[+tab.split(':')[1]].id : TAB_AREA[tab];
  const shot = World.snapshot(areaId);
  const a = $('#prevA'), b = $('#prevB'), inc = previewFlip ? a : b, out = previewFlip ? b : a;
  previewFlip = !previewFlip;
  inc.src = shot.url; inc.classList.remove('is-out'); out.classList.add('is-out');
  $('#camLabel').textContent = areaById(areaId).cam;
  $('#camCoords').textContent = shot.coords;
}
function renderTab(tab, silent){
  currentTab = tab.startsWith('project:') ? 'projects' : tab;
  document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('is-active', t.dataset.tab === currentTab));
  const fill = () => {
    contentEl.innerHTML = tab.startsWith('project:') ? CONTENT.project(+tab.split(':')[1]) : CONTENT[tab]();
    panelContent.scrollTop = 0;
    contentEl.classList.remove('is-swapping');
    requestAnimationFrame(() => requestAnimationFrame(() => contentEl.querySelectorAll('.bar i').forEach(i => i.style.transform = `scaleX(${clamp(+i.dataset.w, 0, 1)})`)));
  };
  if (silent){ fill(); return; }
  contentEl.classList.add('is-swapping');
  setTimeout(fill, 150);
  // the preview picture comes after the panel is open, so opening never stutters
  setTimeout(() => setPreview(tab), 200);
}
function openMenu(tab = 'home'){
  if (!World.started || Race.active) return;
  closeMap(true);
  const wasOpen = menuEl.classList.contains('is-open');
  modalOpen = true; html.classList.add('is-modal');
  if (!wasOpen) menuOpenedAt = performance.now();
  menuEl.classList.add('is-open'); menuEl.setAttribute('aria-hidden', 'false');
  if (!wasOpen) Sound.open(); else Sound.tab();
  Sound.silenceEngine();
  renderTab(tab);
}
function closeModals(){
  if (!modalOpen) return;
  modalOpen = false; html.classList.remove('is-modal');
  menuEl.classList.remove('is-open'); menuEl.setAttribute('aria-hidden', 'true');
  closeMap(true);
  Sound.close();
}
menuEl.addEventListener('click', e => {
  const goto = e.target.closest('[data-goto]'), tabBtn = e.target.closest('.tab[data-tab]'), act = e.target.closest('[data-action]'), it = e.target.closest('[data-itab]');
  if (tabBtn){ Sound.tab(); renderTab(tabBtn.dataset.tab); return; }
  if (goto){ Sound.click(); renderTab(goto.dataset.goto); return; }
  if (it){ Sound.tab(); contentEl.querySelectorAll('[data-itab]').forEach(x => x.classList.toggle('is-active', x === it)); contentEl.querySelectorAll('[data-ipane]').forEach(x => x.classList.toggle('is-active', x.dataset.ipane === it.dataset.itab)); return; }
  if (act){
    const a = act.dataset.action; Sound.click();
    if (a === 'race') launchRace();
    if (a === 'map') openMap();
    if (a === 'music') toggleMusic();
    if (a === 'debug') toggleDebug();
    if (a === 'reset'){ Object.keys(achState).forEach(k => delete achState[k]); ['explore','modes','read'].forEach(k => { achSets[k].clear(); store.set('ach.' + k, []); }); store.set('ach', {}); achieve('hello'); World.updateTrophy(); renderTab('achievements', true); toast('Progress reset. Fresh weights.', {icon:'↺'}); }
    return;
  }
  // ignore the click synthesized by the tap that opened the menu
  if (e.target === menuEl && performance.now() - menuOpenedAt > 400) closeModals();
});
$('#menuClose').addEventListener('click', closeModals);

/* ---------- map ---------- */
const mapModal = $('#mapModal'), mapCanvas = $('#mapCanvas'), mctx = mapCanvas.getContext('2d');
let mapOpenT = 0, mapRAF = null;
const mapHit = [];
function drawMap(){
  const S = mapCanvas.width, k = S/(2*R_ISLAND*1.06), c = S/2, P = (x, z) => [c + x*k, c + z*k];
  const t = (performance.now() - mapOpenT)/1000;
  mctx.clearRect(0, 0, S, S);
  const rg = mctx.createRadialGradient(c, c, 0, c, c, c);
  rg.addColorStop(0, '#221d4a'); rg.addColorStop(1, '#040706');
  mctx.fillStyle = rg; mctx.beginPath(); mctx.arc(c, c, c, 0, 7); mctx.fill();
  // radar rings + sweep
  mctx.strokeStyle = 'rgba(74,242,161,.1)'; mctx.lineWidth = 2;
  for (let r = 1; r <= 4; r++){ mctx.beginPath(); mctx.arc(c, c, c*r/4.2, 0, 7); mctx.stroke(); }
  const sweep = t*1.4;
  const sg = mctx.createConicGradient ? mctx.createConicGradient(sweep, c, c) : null;
  if (sg){ sg.addColorStop(0, 'rgba(74,242,161,.22)'); sg.addColorStop(.12, 'rgba(74,242,161,0)'); sg.addColorStop(1, 'rgba(74,242,161,0)'); mctx.fillStyle = sg; mctx.beginPath(); mctx.arc(c, c, c, 0, 7); mctx.fill(); }
  // island
  mctx.strokeStyle = '#4af2a1'; mctx.lineWidth = 4; mctx.shadowColor = '#4af2a1'; mctx.shadowBlur = 16;
  mctx.beginPath(); mctx.arc(c, c, R_ISLAND*k, 0, 7); mctx.stroke(); mctx.shadowBlur = 0;
  // roads
  mctx.lineJoin = 'round'; mctx.lineCap = 'round';
  mctx.strokeStyle = 'rgba(74,242,161,.45)'; mctx.lineWidth = 10*k;
  ROADS.forEach(([ia, ib]) => { const pts = roadPath(nodeById(ia), nodeById(ib)); mctx.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? mctx.lineTo(px, py) : mctx.moveTo(px, py); }); mctx.stroke(); });
  mctx.beginPath(); mctx.arc(c, c, RING*k, 0, 7); mctx.stroke();
  // buildings (footprints)
  World.buildings.forEach(b => { const [px, py] = P(b.x, b.z); mctx.fillStyle = b.type === 'tree' ? 'rgba(143,245,230,.35)' : 'rgba(220,232,255,.55)'; mctx.beginPath(); mctx.arc(px, py, Math.max(2, b.r*k), 0, 7); mctx.fill(); });
  // areas
  mapHit.length = 0;
  mctx.font = '700 22px Michroma'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  AREAS.forEach(a => {
    const [px, py] = P(a.x, a.z);
    mctx.save(); mctx.translate(px, py); mctx.rotate(Math.PI/4);
    mctx.fillStyle = '#0e1512'; mctx.fillRect(-14, -14, 28, 28);
    mctx.fillStyle = achSets.explore.has(a.id) ? '#ffffff' : 'rgba(255,255,255,.35)'; mctx.fillRect(-9, -9, 18, 18);
    mctx.restore();
    const label = a.label.toUpperCase(), w = mctx.measureText(label).width + 24;
    mctx.fillStyle = 'rgba(0,0,0,.85)'; mctx.fillRect(px - w/2, py + 22, w, 34);
    mctx.strokeStyle = 'rgba(74,242,161,.5)'; mctx.lineWidth = 1.5; mctx.strokeRect(px - w/2 + 3, py + 25, w - 6, 28);
    mctx.fillStyle = '#fff'; mctx.fillText(label, px, py + 40);
    mapHit.push({id:a.id, x:px, y:py + 20, r:46});
  });
  // player (bounces when the map opens)
  const [cx, cy] = P(World.car.pos.x, World.car.pos.z);
  const bt = t - .5, bounce = bt > 0 && bt < 1 ? 1 + .2*Math.abs(Math.sin(bt*Math.PI*2)) : 1;
  mctx.save(); mctx.translate(cx, cy); mctx.rotate(-World.car.yaw); mctx.scale(bounce*1.4, bounce*1.4);
  mctx.fillStyle = '#12a862'; mctx.shadowColor = '#12a862'; mctx.shadowBlur = 20;
  mctx.beginPath(); mctx.moveTo(0, -14); mctx.lineTo(10, 12); mctx.lineTo(0, 6); mctx.lineTo(-10, 12); mctx.closePath(); mctx.fill();
  mctx.restore();
  mapRAF = requestAnimationFrame(drawMap);
}
function openMap(){
  if (!World.started || Race.active) return;
  menuEl.classList.remove('is-open');
  modalOpen = true; html.classList.add('is-modal');
  mapModal.classList.add('is-open'); mapModal.setAttribute('aria-hidden', 'false');
  Sound.open(); Sound.silenceEngine();
  mapOpenT = performance.now(); cancelAnimationFrame(mapRAF); drawMap();
}
function closeMap(silent){
  if (!mapModal.classList.contains('is-open')) return;
  mapModal.classList.remove('is-open'); mapModal.setAttribute('aria-hidden', 'true');
  cancelAnimationFrame(mapRAF);
  if (!silent){ modalOpen = false; html.classList.remove('is-modal'); Sound.close(); }
}
mapCanvas.addEventListener('click', e => {
  const r = mapCanvas.getBoundingClientRect(), sx = (e.clientX - r.left)/r.width*mapCanvas.width, sy = (e.clientY - r.top)/r.height*mapCanvas.height;
  const hit = mapHit.find(h => Math.hypot(h.x - sx, h.y - sy) < h.r);
  if (hit){ closeMap(); World.teleport(hit.id); }
});
let lastHover = null;
mapCanvas.addEventListener('mousemove', e => {
  const r = mapCanvas.getBoundingClientRect(), sx = (e.clientX - r.left)/r.width*mapCanvas.width, sy = (e.clientY - r.top)/r.height*mapCanvas.height;
  const hit = mapHit.find(h => Math.hypot(h.x - sx, h.y - sy) < h.r);
  mapCanvas.style.cursor = hit ? 'pointer' : 'crosshair';
  if (hit && hit.id !== lastHover) Sound.hover();
  lastHover = hit ? hit.id : null;
});
mapModal.addEventListener('click', e => { if (e.target === mapModal) closeMap(); });
$('#mapClose').addEventListener('click', () => closeMap());

/* ---------- HUD ---------- */
$('#btnMenu').addEventListener('click', () => openMenu('home'));
$('#btnMap').addEventListener('click', openMap);
$('#btnRace').addEventListener('click', () => openMenu('race'));
$('#btnSound').addEventListener('click', () => Sound.toggleMute());
document.addEventListener('mouseover', e => { const t = e.target.closest('.button,.tab,.trigger,.proj,.itab,.back'); if (t && !t.contains(e.relatedTarget)) Sound.hover(); });

function toggleMusic(){
  if (Sound.musicOn){ Sound.stopMusic(); toast('Soundtrack paused', {icon:'♪', type:'music', sound:false}); }
  else { Sound.startMusic(); toast('<strong>Latent Drift</strong> · generated live by Web Audio', {icon:'♪', type:'music', label:'Now playing', sound:false}); }
  document.querySelectorAll('[data-music-label]').forEach(el => el.textContent = (Sound.musicOn ? 'Stop' : 'Play') + ' soundtrack');
}
function toggleDebug(){ html.classList.toggle('is-debug'); achieve('debug'); }

/* ---------- start ---------- */
function startExperience(){
  if (World.started || !ready) return;
  Sound.init(); Sound.boot();
  html.classList.add('is-started');
  setTimeout(() => { World.start(); Sound.reveal(); }, 700);
  setTimeout(() => {
    achieve('hello');
    toast(`Welcome to <strong>${CONFIG.shortName}'s sky city</strong>. Drive to a diamond and press ENTER.`, {icon:'◆', dur:6000});
    Sound.startMusic();
    setTimeout(() => toast('<strong>Latent Drift</strong> · generated live by Web Audio', {icon:'♪', type:'music', label:'Now playing', sound:false}), 1800);
  }, 2300);
}
let ready = false;
$('#intro').addEventListener('click', startExperience);

// wait for fonts so the canvas textures (sign, glyphs, chips) render in the right faces
Promise.race([
  Promise.all(['900 40px Michroma','700 40px Michroma','700 20px "JetBrains Mono"','600 40px "Noto Sans Devanagari"','600 40px "Noto Sans Bengali"','600 40px "Noto Sans Tamil"','600 40px "Noto Sans Telugu"','600 40px "Manrope"'].map(f => document.fonts.load(f, f.includes('Noto') ? 'कঅதతె' : 'A'))),
  new Promise(r => setTimeout(r, 3000)),
]).catch(() => {}).then(() => { createWorld(); World.frame(); ready = true; $('#loading').textContent = 'Ready · press Enter or click'; });

/* ---------- minimap: north-up, centred on the pod, always on in the city ---------- */
(() => {
  const cv = $('#minimap'), g = cv.getContext('2d'), here = $('#mmHere'), S = cv.width, VIEW = 95;
  let base = null, bk = 1, last = 0;
  const BS = 1400;
  function buildBase(){
    base = document.createElement('canvas'); base.width = base.height = BS;
    const b = base.getContext('2d'); bk = BS/(2*R_ISLAND*1.08);
    const P = (x, z) => [BS/2 + x*bk, BS/2 + z*bk];
    b.fillStyle = '#020805'; b.fillRect(0, 0, BS, BS);
    b.fillStyle = '#10261c'; b.beginPath(); b.arc(BS/2, BS/2, R_ISLAND*bk, 0, 7); b.fill();
    b.strokeStyle = 'rgba(74,242,161,.9)'; b.lineWidth = 3; b.stroke();
    b.lineCap = b.lineJoin = 'round'; b.strokeStyle = 'rgba(74,242,161,.42)'; b.lineWidth = 10*bk;
    ROADS.forEach(([ia, ib]) => { b.beginPath(); roadPath(nodeById(ia), nodeById(ib)).forEach(([x, z], i) => { const [px, py] = P(x, z); i ? b.lineTo(px, py) : b.moveTo(px, py); }); b.stroke(); });
    b.beginPath(); b.arc(BS/2, BS/2, RING*bk, 0, 7); b.stroke();
    AREAS.forEach(a => { const [px, py] = P(a.x, a.z); b.strokeStyle = 'rgba(230,204,138,.6)'; b.lineWidth = 2; b.beginPath(); b.arc(px, py, (a.id === 'home' ? 24 : a.id === 'race' ? 26 : (a.r + 4)*1.7 + 4)*bk, 0, 7); b.stroke(); });
    World.buildings.forEach(bd => { const [px, py] = P(bd.x, bd.z); b.fillStyle = bd.type === 'tree' ? 'rgba(74,242,161,.28)' : 'rgba(190,215,200,.45)'; b.beginPath(); b.arc(px, py, Math.max(1.5, bd.r*bk), 0, 7); b.fill(); });
  }
  function draw(now){
    requestAnimationFrame(draw);
    if (now - last < 33 || !World || !World.started || Race.active || modalOpen) return;
    last = now;
    if (!base) buildBase();
    const car = World.car.pos, k = S/(2*VIEW), c = S/2;
    g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(c, c, c - 1, 0, 7); g.clip();
    g.fillStyle = '#020805'; g.fillRect(0, 0, S, S);
    const sw = 2*VIEW*bk;
    g.drawImage(base, BS/2 + car.x*bk - VIEW*bk, BS/2 + car.z*bk - VIEW*bk, sw, sw, 0, 0, S, S);
    // range ring
    g.strokeStyle = 'rgba(230,204,138,.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, c*.5, 0, 7); g.stroke();
    // areas: diamonds inside the view, edge arrows for the ones beyond it
    let nearest = null, nd = 1e9;
    g.font = '700 17px Manrope'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    AREAS.forEach(a => {
      const dWorld = Math.hypot(a.x - car.x, a.z - car.z);
      if (dWorld < nd){ nd = dWorld; nearest = a; }
      let x = c + (a.x - car.x)*k, y = c + (a.z - car.z)*k;
      const d = Math.hypot(x - c, y - c), lim = c - 16, inside = d <= lim;
      if (!inside){ x = c + (x - c)/d*lim; y = c + (y - c)/d*lim; }
      const seen = achSets.explore.has(a.id), s = inside ? 10 : 7;
      g.save(); g.translate(x, y); g.rotate(Math.PI/4);
      g.fillStyle = '#050a07'; g.fillRect(-s - 3, -s - 3, (s + 3)*2, (s + 3)*2);
      g.fillStyle = a.id === 'race' ? '#e6cc8a' : seen ? '#ffffff' : 'rgba(230,204,138,.85)'; g.fillRect(-s, -s, s*2, s*2);
      g.restore();
      if (inside){
        const label = a.label.toUpperCase(), w = g.measureText(label).width + 12;
        g.fillStyle = 'rgba(2,8,5,.8)'; g.fillRect(x - w/2, y - 38, w, 22);
        g.fillStyle = '#e8fff3'; g.fillText(label, x, y - 18);
      }
    });
    g.restore();
    // you: arrow in the centre, pointing where the pod faces
    g.save(); g.translate(c, c); g.rotate(-World.car.yaw);
    g.fillStyle = '#4af2a1'; g.shadowColor = '#4af2a1'; g.shadowBlur = 16;
    g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 13); g.lineTo(0, 6); g.lineTo(-11, 13); g.closePath(); g.fill();
    g.shadowBlur = 0; g.strokeStyle = '#04100a'; g.lineWidth = 2; g.stroke();
    g.restore();
    // where am I
    const inPlaza = nearest && nd < (nearest.id === 'home' ? 24 : nearest.id === 'race' ? 30 : (nearest.r + 4)*1.7 + 8);
    here.textContent = nearest ? (inPlaza ? `At ${nearest.label}` : `${nearest.label} · ${Math.round(nd)} m`) : '';
  }
  requestAnimationFrame(draw);
  $('#minimapWrap').addEventListener('click', () => { Sound.click(); openMap(); });
})();
