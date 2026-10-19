'use strict';
/* =====================================================================
   SKY RACE: a separate scene ("another window") reached through the
   portal in the city. 3 laps through light-gates among sky towers,
   against three AI ships named after optimizers.
   ===================================================================== */
const Race = (() => {
  const V3 = THREE.Vector3, Y = new V3(0, 1, 0);
  const N = 1400, LAPS = 3, HALF_W = 12, GATES = 44, GRID_S = -22;
  const TRACK = [[0,40,0],[150,46,-60],[280,64,0],[330,52,160],[240,34,290],[70,60,320],[-90,44,260],[-200,58,120],[-190,46,-40],[-90,30,-120]];
  const RIVALS = [
    {name:'ADAM',    c1:'#ffffff', c2:'#8d9cc0', glow:'#f2f6f4', max:70,   accel:30, freq:.011, amp:6},
    {name:'RMSPROP', c1:'#4af2a1', c2:'#1d4fb0', glow:'#4af2a1', max:68.5, accel:34, freq:.008, amp:8},
    {name:'SGD+M',   c1:'#ffb347', c2:'#9a3200', glow:'#ffc67b', max:72.5, accel:17, freq:.014, amp:5},
  ];
  let built = false, active = false, scene = null, camera = null, curve = null, L = 0;
  const pos = [], tan = [], side = [], up = [], curv = [];
  const ships = []; let player = null;
  let state = 'idle', stateT = 0, raceT = 0, lastCount = -1, lapStart = 0, prevRank = 1, resultsShown = false, finishedAt = 0;
  let bestLap = store.get('race.bestLap', null), bestRace = store.get('race.best', null);
  if (bestLap != null && bestLap < 8) bestLap = null; // guard against records from an older build
  if (bestRace != null && bestRace < 25) bestRace = null;
  const gateS = [], gateBoost = [];
  let speedPts = null, miniPath = null, miniBounds = null;
  const ui = {};
  ['Pos','Suf','Lap','Time','Best','Board','Speed','Boost','Count','Banner','Results','ResTitle','ResSub','Res','Mini'].forEach(k => ui[k] = $('#rh' + k));

  const fr = {p:new V3(), t:new V3(), sd:new V3(), up:new V3(), k:0};
  function frameAt(s, out = fr){
    const u = (((s % L) + L) % L)/L*N, i = Math.floor(u) % N, j = (i + 1) % N, f = u - Math.floor(u);
    out.p.lerpVectors(pos[i], pos[j], f); out.t.lerpVectors(tan[i], tan[j], f).normalize();
    out.sd.lerpVectors(side[i], side[j], f).normalize(); out.up.lerpVectors(up[i], up[j], f).normalize();
    out.k = lerp(curv[i], curv[j], f);
    return out;
  }
  const gradGeo = (geo, top, bottom) => {
    geo = geo.index ? geo.toNonIndexed() : geo; geo.computeBoundingBox();
    const bb = geo.boundingBox, p = geo.attributes.position, col = new Float32Array(p.count*3), a = new THREE.Color(top), b = new THREE.Color(bottom), c = new THREE.Color(), h = (bb.max.y - bb.min.y) || 1;
    for (let i = 0; i < p.count; i++){ c.copy(b).lerp(a, (p.getY(i) - bb.min.y)/h); col.set([c.r, c.g, c.b], i*3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals(); return geo;
  };

  /* ---------- ships ---------- */
  const shipMat = new THREE.MeshPhongMaterial({vertexColors:true, flatShading:true, shininess:80, specular:0x556688});
  function makeShip(c1, c2, glow){
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const body = new THREE.Mesh(gradGeo(new THREE.LatheGeometry([[0,-2.8],[.4,-1.8],[.66,-.3],[.62,1.1],[.44,1.9],[0,2.05]].map(([r, y]) => new THREE.Vector2(r, y)), 12), c1, c2), shipMat);
    body.rotation.x = Math.PI/2; inner.add(body);
    const wing = new THREE.Mesh(gradGeo(new THREE.BoxGeometry(5.4, .12, 1.3), c1, c2), shipMat); wing.position.set(0, -.1, .6); inner.add(wing);
    const fore = new THREE.Mesh(gradGeo(new THREE.BoxGeometry(2.2, .08, .6), c1, c2), shipMat); fore.position.set(0, -.05, -1.4); inner.add(fore);
    const glowMat = new THREE.MeshBasicMaterial({color:glow});
    [-1, 1].forEach(s => {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(.12, .7, 1.1), glowMat); tip.position.set(s*2.7, .2, .7); inner.add(tip);
      const eng = new THREE.Mesh(gradGeo(new THREE.CylinderGeometry(.3, .36, 1.3, 10), '#626262', '#262526'), shipMat); eng.rotation.x = Math.PI/2; eng.position.set(s*.85, -.05, 1.6); inner.add(eng);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.26, 12), glowMat); disc.position.set(s*.85, -.05, 2.26); inner.add(disc);
    });
    const canopy = new THREE.Mesh(gradGeo(new THREE.SphereGeometry(.45, 10, 8), '#d9fdff', '#2a7fb0'), shipMat); canopy.scale.set(1, .7, 1.9); canopy.position.set(0, .38, -.5); inner.add(canopy);
    const flameMat = new THREE.MeshBasicMaterial({color:glow, transparent:true, opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false});
    const flames = [-1, 1].map(s => { const f = new THREE.Mesh(new THREE.ConeGeometry(.24, 2, 8, 1, true), flameMat); f.rotation.x = Math.PI/2; f.position.set(s*.85, -.05, 3.2); inner.add(f); return f; });
    // light trail
    const TN = 34, tp = new Float32Array(TN*3), tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({color:glow, transparent:true, opacity:.7, blending:THREE.AdditiveBlending, depthWrite:false}));
    trail.frustumCulled = false;
    return {g, inner, flames, trail, tp, TN};
  }

  /* ---------- build the circuit ---------- */
  function build(){
    built = true;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, .5, 4000);
    const sw = makeSwirl(1024, 512, 63, 20);
    const bg = World.textTexture((g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000000'); gr.addColorStop(.5, '#03140c'); gr.addColorStop(.8, '#0b3a24'); gr.addColorStop(1, '#1a6a42'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'screen'; g.globalAlpha = .8; g.drawImage(sw, 0, 0, w, h); }, 1024, 512);
    scene.background = bg;
    scene.fog = new THREE.Fog(0x0e3324, 260, 1500);
    scene.add(new THREE.HemisphereLight(0xbff0d6, 0x163d2c, .9));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1); sun.position.set(-1, .7, -.5); scene.add(sun);
    // a big low sun on the horizon
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({map:World.textTexture((g, w) => { const r = g.createRadialGradient(w/2, w/2, 0, w/2, w/2, w/2); r.addColorStop(0, 'rgba(255,248,225,1)'); r.addColorStop(.28, 'rgba(230,204,138,.85)'); r.addColorStop(.32, 'rgba(230,204,138,.25)'); r.addColorStop(1, 'rgba(230,204,138,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, 256, 256), fog:false, transparent:true, depthWrite:false}));
    sunDisc.scale.set(420, 420, 1); sunDisc.position.set(-1600, 260, -900); scene.add(sunDisc);

    curve = new THREE.CatmullRomCurve3(TRACK.map(p => new V3(...p)), true, 'centripetal');
    L = curve.getLength();
    for (let i = 0; i < N; i++){
      const u = i/N, p = curve.getPointAt(u), t = curve.getTangentAt(u).normalize();
      const sd = new V3().crossVectors(t, Y).normalize(), u2 = new V3().crossVectors(sd, t).normalize();
      pos.push(p); tan.push(t); side.push(sd); up.push(u2);
    }
    const ds = L/N, raw = [];
    for (let i = 0; i < N; i++) raw.push(new V3().subVectors(tan[(i + 1) % N], tan[i]).dot(side[i])/ds);
    for (let i = 0; i < N; i++){ let a = 0; for (let k = -6; k <= 6; k++) a += raw[(i + k + N) % N]; curv.push(a/13); }

    // glowing track ribbon under the racing line
    const rib = new Float32Array((N + 1)*6), ruv = new Float32Array((N + 1)*4), idx = [];
    for (let i = 0; i <= N; i++){
      const k = i % N, c = pos[k].clone().addScaledVector(up[k], -3.4);
      const l = c.clone().addScaledVector(side[k], -HALF_W*1.1), r = c.clone().addScaledVector(side[k], HALF_W*1.1);
      rib.set([l.x, l.y, l.z, r.x, r.y, r.z], i*6); ruv.set([0, i*ds/22, 1, i*ds/22], i*4);
      if (i < N) idx.push(i*2, i*2 + 1, i*2 + 2, i*2 + 1, i*2 + 3, i*2 + 2);
    }
    const ribGeo = new THREE.BufferGeometry(); ribGeo.setAttribute('position', new THREE.BufferAttribute(rib, 3)); ribGeo.setAttribute('uv', new THREE.BufferAttribute(ruv, 2)); ribGeo.setIndex(idx);
    const ribTex = World.textTexture((g, w, h) => {
      g.fillStyle = 'rgba(4,30,18,.5)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(74,242,161,.95)'; g.fillRect(4, 0, 8, h); g.fillRect(w - 12, 0, 8, h);
      g.strokeStyle = 'rgba(230,204,138,.55)'; g.lineWidth = 10;
      g.beginPath(); g.moveTo(w*.3, h*.75); g.lineTo(w*.5, h*.45); g.lineTo(w*.7, h*.75); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 32; x < w; x += 32) g.fillRect(x, 0, 2, h);
    }, 256, 256);
    ribTex.wrapS = ribTex.wrapT = THREE.RepeatWrapping; ribTex.anisotropy = 8;
    const ribbon = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({map:ribTex, transparent:true, side:THREE.DoubleSide, depthWrite:false}));
    scene.add(ribbon);
    // side rails
    [-1, 1].forEach(sg => {
      const pts = []; for (let i = 0; i < N; i += 7) pts.push(pos[i].clone().addScaledVector(up[i], -3.2).addScaledVector(side[i], sg*HALF_W*1.1));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 900, .28, 6, true), new THREE.MeshBasicMaterial({color:sg < 0 ? 0x4af2a1 : 0xe6cc8a}));
      scene.add(tube);
    });

    // light gates; every 4th is a boost gate (fly through the gold centre)
    const ringGeo = gradGeo(new THREE.TorusGeometry(14, .55, 10, 56), '#6a7d74', '#141c18');
    const innerGeo = new THREE.TorusGeometry(13.3, .16, 6, 56);
    for (let g = 0; g < GATES; g++){
      const s = g*L/GATES, f = frameAt(s), boost = g % 4 === 2;
      gateS.push(s); gateBoost.push(boost);
      const grp = new THREE.Group(); grp.position.copy(f.p); grp.lookAt(f.p.clone().add(f.t));
      grp.add(new THREE.Mesh(ringGeo, shipMat));
      grp.add(new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({color:boost ? 0xe6cc8a : 0x4af2a1})));
      if (boost){
        const disc = new THREE.Mesh(new THREE.RingGeometry(3.2, 5.4, 40), new THREE.MeshBasicMaterial({color:0xe6cc8a, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false}));
        grp.add(disc); grp.userData.disc = disc;
      }
      scene.add(grp);
      if (g === 0){
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.4), new THREE.MeshBasicMaterial({map:World.textTexture((c, w, h) => {
          for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32){ c.fillStyle = ((x + y)/32) % 2 ? '#111' : '#fff'; c.fillRect(x, y, 32, 32); }
          c.fillStyle = 'rgba(4,12,9,.85)'; c.fillRect(w*.28, 10, w*.44, h - 20);
          c.font = '900 60px Michroma'; c.fillStyle = '#4af2a1'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('START · FINISH', w/2, h/2 + 3);
        }, 1024, 128), side:THREE.DoubleSide}));
        banner.position.y = 16.5; grp.add(banner);
      }
    }

    // sky towers along the course (same generator as the city)
    const mats = {
      solid: new THREE.MeshPhongMaterial({vertexColors:true, shininess:70, specular:0x554466}),
      glass: new THREE.MeshBasicMaterial({map:City.windowTexture(), vertexColors:true, color:0xffffff}),
      glow: new THREE.MeshBasicMaterial({vertexColors:true}),
    };
    mats.glass.color.setScalar(1.15); mats.glow.color.setScalar(1.3);
    City.begin(-70); seed = 314;
    const placed = [];
    for (let k = 0, made = 0; k < 900 && made < 80; k++){
      const s = rand()*L, f = frameAt(s), off = (rand() > .5 ? 1 : -1)*(30 + rand()*90);
      const x = f.p.x + f.sd.x*off, z = f.p.z + f.sd.z*off;
      let ok = true;
      for (let i = 0; i < N; i += 10) if (Math.hypot(pos[i].x - x, pos[i].z - z) < 26){ ok = false; break; }
      if (!ok || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 24)) continue;
      const alt = f.p.y + 70, r = rand();
      if (r < .45) City.saucerTower(x, z, {h:alt + (rand() - .5)*30, R:8 + rand()*7, pod:rand() > .5, tip:'#2cff88'});
      else if (r < .7) City.needleTower(x, z, {h:alt + 20 + rand()*50, r:2.6 + rand()*1.6});
      else if (r < .9) City.pillTower(x, z, {w:10 + rand()*6, h:alt - 10 + rand()*40, ry:rand()*Math.PI});
      else City.ringSpire(x, z, {h:alt + rand()*20, c:'#e6cc8a'});
      placed.push([x, z]); made++;
    }
    City.end(scene, mats, {shadow:false});

    // cloud floor
    const ctex = World.textTexture((g, S) => {
      g.clearRect(0, 0, S, S); seed = 12;
      for (let i = 0; i < 160; i++){ const x = rand()*S, y = rand()*S, r = 20 + rand()*80;
        [[0,0],[S,0],[0,S],[-S,0],[0,-S]].forEach(([ox, oy]) => { const gr = g.createRadialGradient(x+ox, y+oy, 0, x+ox, y+oy, r); gr.addColorStop(0, 'rgba(150,255,200,.35)'); gr.addColorStop(1, 'rgba(150,255,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x+ox, y+oy, r, 0, 7); g.fill(); }); }
    }, 512, 512);
    ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping; ctex.repeat.set(8, 8);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({map:ctex, transparent:true, depthWrite:false, color:0x1f8a5a}));
    cl.rotation.x = -Math.PI/2; cl.position.y = -60; scene.add(cl);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({color:0x010604}));
    floor.rotation.x = -Math.PI/2; floor.position.y = -75; scene.add(floor);

    // speed particles around the camera
    const SN = 700, sp = new Float32Array(SN*3);
    for (let i = 0; i < SN; i++) sp.set([(Math.random() - .5)*200, Math.random()*80, (Math.random() - .5)*200], i*3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    speedPts = new THREE.Points(sg, new THREE.PointsMaterial({color:0xb9ffe0, size:.16, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false}));
    speedPts.frustumCulled = false; scene.add(speedPts);

    // ships
    player = {name:CONFIG.shortName.toUpperCase(), you:true, glow:'#e6cc8a', ...makeShip('#1d2622', '#050807', '#4af2a1')};
    ships.push(player);
    RIVALS.forEach(r => ships.push({...r, ...makeShip(r.c1, r.c2, r.glow)}));
    ships.forEach(s => scene.add(s.g, s.trail));

    // minimap path
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    pos.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    miniBounds = {minX, minZ, k:300/Math.max(maxX - minX, maxZ - minZ), ox:(360 - (maxX - minX)*300/Math.max(maxX - minX, maxZ - minZ))/2, oz:(360 - (maxZ - minZ)*300/Math.max(maxX - minX, maxZ - minZ))/2};
    miniPath = pos.filter((_, i) => i % 8 === 0).map(p => toMini(p));
  }
  const toMini = p => [miniBounds.ox + (p.x - miniBounds.minX)*miniBounds.k, miniBounds.oz + (p.z - miniBounds.minZ)*miniBounds.k];

  /* ---------- race state ---------- */
  function reset(){
    const offs = [-6, 2, -2, 6];
    ships.forEach((s, i) => {
      Object.assign(s, {s:GRID_S - (i % 2)*10 - Math.floor(i/2)*2, x:offs[i], vx:0, speed:0, energy:1, roll:0, finishT:null, lapT:[], prevS:null, rel:0, phase:i*1.7});
      s.prevS = s.s;
      for (let k = 0; k < s.TN; k++){ const f = frameAt(s.s); s.tp.set([f.p.x, f.p.y, f.p.z], k*3); }
      s.trail.geometry.attributes.position.needsUpdate = true;
    });
    state = 'countdown'; stateT = -.8; raceT = 0; lastCount = -1; lapStart = 0; prevRank = 4; resultsShown = false;
    ui.Results.classList.remove('is-open');
    ui.Best.textContent = fmtTime(bestLap);
    const f = frameAt(player.s);
    camera.position.copy(f.p).addScaledVector(f.t, 30).addScaledVector(f.up, 6).addScaledVector(f.sd, 14);
  }

  function enter(){
    if (active) return;
    if (!built) build();
    const w = $('#warp'); w.classList.add('is-on'); Sound.warp();
    setTimeout(() => {
      active = true; html.classList.add('is-race');
      reset(); renderBoard();
      World.setBloom(.55, .68);
      setTimeout(() => w.classList.remove('is-on'), 150);
    }, 450);
  }
  function exit(){
    if (!active) return;
    const w = $('#warp'); w.classList.add('is-on'); Sound.warp();
    setTimeout(() => {
      active = false; state = 'idle'; html.classList.remove('is-race');
      ui.Results.classList.remove('is-open');
      World.placeAt('race'); World.refreshPreset();
      setTimeout(() => w.classList.remove('is-on'), 150);
      toast('Back in the city. The portal stays open.', {icon:'⟲', sound:false});
    }, 450);
  }

  function rankOrder(){
    return ships.slice().sort((a, b) => {
      if (a.finishT != null && b.finishT != null) return a.finishT - b.finishT;
      if (a.finishT != null) return -1; if (b.finishT != null) return 1;
      return b.s - a.s;
    });
  }
  function renderBoard(){
    ui.Board.innerHTML = rankOrder().map((s, i) => `<div class="${s.you ? 'is-you' : ''}"><b>${i + 1}</b><i style="background:${s.you ? '#4af2a1' : s.glow}"></i><span>${s.name}</span></div>`).join('');
  }
  function banner(text){ ui.Banner.textContent = text; ui.Banner.classList.remove('is-pop'); void ui.Banner.offsetWidth; ui.Banner.classList.add('is-pop'); }
  function countPop(text){ ui.Count.textContent = text; ui.Count.classList.remove('is-pop'); void ui.Count.offsetWidth; ui.Count.classList.add('is-pop'); }

  function crossed(prev, now, mark){ return Math.floor((prev - mark)/L) !== Math.floor((now - mark)/L) && now > prev; }

  function stepShip(s, dt, isPlayer){
    const racing = state === 'racing' || (state === 'finished');
    const f = frameAt(s.s);
    if (isPlayer){
      const inp = World.input, touch = html.classList.contains('is-mode-touch');
      let thr = clamp((inp.up - inp.down) + inp.padThrottle, -1, 1);
      if (touch) thr = inp.joyY > .45 ? -1 : 1;
      if (s.finishT != null) thr = .3;
      const steer = s.finishT != null ? -s.x*.1 : clamp((inp.right - inp.left) + inp.joyX + inp.padX, -1, 1);
      const boosting = racing && (inp.boost || inp.padBoost) && s.energy > 0 && thr > 0 && s.finishT == null;
      s.boosting = boosting;
      if (!racing){ s.speed = 0; s.thr = 0; return; }
      const maxV = boosting ? 104 : 72;
      if (thr > 0) s.speed += thr*(boosting ? 70 : 38)*dt; else if (thr < 0) s.speed += thr*60*dt; else s.speed *= Math.exp(-.45*dt);
      if (s.speed > maxV) s.speed = damp(s.speed, maxV, 2.5, dt);
      s.speed = clamp(s.speed, 0, 125);
      s.energy = clamp(s.energy + (boosting ? -.34 : .1)*dt, 0, 1);
      s.vx += steer*80*dt - f.k*s.speed*s.speed*.32*dt;
      s.vx *= Math.exp(-4.5*dt);
      s.thr = thr;
    } else {
      if (!racing){ s.speed = 0; return; }
      const lead = player.s - s.s, band = lead > 120 ? 1.1 : lead < -140 ? .92 : 1;
      const cap = s.max*band*(1 - Math.min(.16, Math.abs(f.k)*5));
      s.speed = s.speed < cap ? Math.min(cap, s.speed + s.accel*dt) : damp(s.speed, cap, 1.5, dt);
      const target = Math.sin(s.s*s.freq + s.phase)*s.amp - Math.sign(f.k)*Math.min(5, Math.abs(f.k)*600);
      s.vx = (clamp(target, -HALF_W + 1.5, HALF_W - 1.5) - s.x)*1.6;
      s.thr = 1; s.boosting = false;
    }
    s.x += s.vx*dt;
    if (Math.abs(s.x) > HALF_W){
      s.x = Math.sign(s.x)*HALF_W; s.vx = 0;
      if (isPlayer && s.speed > 10){ s.speed *= Math.exp(-1.6*dt); Sound.scrape(); s.shake = .5; }
    }
    s.prevS = s.s;
    s.s += s.speed*dt;
    // gates
    for (let g = 0; g < GATES; g++){
      if (!crossed(s.prevS, s.s, gateS[g])) continue;
      if (gateBoost[g] && Math.abs(s.x) < 5.6){
        if (isPlayer){ s.speed += 20; s.energy = clamp(s.energy + .35, 0, 1); Sound.boostGate(); achieve('gates'); }
        else if (Math.random() < .7) s.speed += 14;
      } else if (isPlayer) Sound.gate();
    }
    // laps
    for (let k = 1; k <= LAPS; k++){
      if (!(s.prevS < k*L && s.s >= k*L)) continue;
      if (k === LAPS && s.finishT == null){ s.finishT = raceT; }
      if (isPlayer){
        const lt = raceT - lapStart; lapStart = raceT; s.lapT.push(lt);
        if (bestLap == null || lt < bestLap){ bestLap = lt; store.set('race.bestLap', lt); ui.Best.textContent = fmtTime(bestLap); if (k < LAPS) banner('BEST LAP ' + fmtTime(lt)); }
        if (k === LAPS - 1){ banner('FINAL LAP'); Sound.finalLap(); }
        else if (k < LAPS){ Sound.lap(); if (bestLap !== lt) banner(`LAP ${k + 1} / ${LAPS}`); }
        if (k === LAPS) finishRace();
      }
    }
  }

  function finishRace(){
    state = 'finished'; finishedAt = raceT;
    const place = rankOrder().indexOf(player) + 1;
    Sound.finish(place);
    banner(place === 1 ? 'GLOBAL MINIMUM!' : `FINISHED ${place}${ordinal(place).toUpperCase()}`);
    achieve('race'); if (place === 1) achieve('win');
    if (bestRace == null || player.finishT < bestRace){ bestRace = player.finishT; store.set('race.best', bestRace); player.newRecord = true; } else player.newRecord = false;
  }
  function showResults(){
    resultsShown = true;
    const order = rankOrder(), place = order.indexOf(player) + 1;
    const est = s => s.finishT != null ? s.finishT : raceT + Math.max(0, LAPS*L - s.s)/Math.max(30, s.speed);
    ui.ResTitle.innerHTML = `${place}<span style="font-size:.6em">${ordinal(place)}</span> place`;
    ui.ResSub.innerHTML = place === 1 ? 'You beat all three optimizers. Global minimum reached.' : `${order[0].name} converged first this time. Hit boost gates through the gold centre and steer into the curves.`;
    ui.Res.innerHTML = order.map((s, i) => `<div class="${s.you ? 'is-you' : ''} ${i === 0 ? 'p1' : ''}" style="animation-delay:${i*.08}s"><b>${i + 1}</b><span>${s.name}${s.you ? ' (you)' : ''}</span><span>${s.finishT != null ? fmtTime(s.finishT) : '~' + fmtTime(est(s))}</span></div>`).join('')
      + `<p class="text-small" style="margin:8px 0 0">Best lap ${fmtTime(bestLap)} · Best race ${fmtTime(bestRace)}${player.newRecord ? ' · <b style="color:var(--lime)">new record</b>' : ''}</p>`;
    ui.Results.classList.add('is-open');
  }

  /* ---------- per-frame ---------- */
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion(), camT = new V3(), camL = new V3(), negT = new V3(), Z = new V3(0, 0, 1);
  function placeShip(s, t){
    const f = frameAt(s.s);
    const bob = Math.sin(t*2.2 + s.phase)*.35;
    s.g.position.copy(f.p).addScaledVector(f.sd, s.x).addScaledVector(f.up, bob);
    negT.copy(f.t).negate();
    m4.makeBasis(f.sd, f.up, negT); q.setFromRotationMatrix(m4);
    s.roll = damp(s.roll, -s.vx*.05 - (s.you ? 0 : 0), 6, 1/60);
    qr.setFromAxisAngle(Z, clamp(s.roll, -.9, .9)); s.g.quaternion.copy(q).multiply(qr);
    const k = .4 + (s.thr > 0 ? .5 : 0) + (s.boosting ? 1 : 0) + Math.random()*.15;
    s.flames.forEach(fl => { fl.scale.set(1, k, 1); fl.position.z = 2.26 + k; });
    // trail
    s.tp.copyWithin(3, 0, (s.TN - 1)*3);
    const tailPos = new V3(0, 0, 2.4).applyQuaternion(s.g.quaternion).add(s.g.position);
    s.tp.set([tailPos.x, tailPos.y, tailPos.z], 0);
    s.trail.geometry.attributes.position.needsUpdate = true;
  }

  function update(dt, t){
    stateT += dt;
    if (state === 'countdown'){
      const c = Math.floor(stateT);
      if (stateT >= 0 && c !== lastCount){
        lastCount = c;
        if (c < 3){ countPop(String(3 - c)); Sound.count(); }
        else { countPop('GO'); Sound.go(); state = 'racing'; raceT = 0; lapStart = 0; }
      }
    } else if (state === 'racing' || state === 'finished') raceT += dt;

    ships.forEach(s => stepShip(s, dt, s === player));
    // ship-to-ship contact
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++){
      const a = ships[i], b = ships[j], dsv = b.s - a.s, dx = b.x - a.x;
      if (Math.abs(dsv) < 4.5 && Math.abs(dx) < 3){
        const push = (3 - Math.abs(dx))*Math.sign(dx || 1)*.5;
        a.x -= push; b.x += push;
        if (a.you || b.you){ Sound.bump(); (a.you ? a : b).speed *= .985; }
      }
    }
    // whoosh when a rival passes (or is passed)
    ships.forEach(s => { if (s.you) return; const rel = Math.sign(s.s - player.s); if (s.rel && rel !== s.rel && Math.abs(s.s - player.s) < 20 && state === 'racing') Sound.whoosh((s.x - player.x)/HALF_W); s.rel = rel; });
    ships.forEach(s => placeShip(s, t));
    gateBoostPulse(t);

    // camera: chase cam that rolls with the track
    const f = frameAt(player.s), finished = player.finishT != null;
    const intro = clamp(1 - stateT/3, 0, 1);
    camT.copy(player.g.position).addScaledVector(f.t, -14 - intro*-40).addScaledVector(f.up, 4.6 + intro*6).addScaledVector(f.sd, player.x*-.25 + intro*16);
    if (finished){ const a = (raceT - finishedAt)*.5; camT.copy(player.g.position).addScaledVector(f.sd, Math.cos(a)*18).addScaledVector(f.t, Math.sin(a)*18).addScaledVector(f.up, 6); }
    camera.position.x = damp(camera.position.x, camT.x, 6, dt); camera.position.y = damp(camera.position.y, camT.y, 6, dt); camera.position.z = damp(camera.position.z, camT.z, 6, dt);
    if (player.shake){ camera.position.addScaledVector(f.up, (Math.random() - .5)*player.shake); camera.position.addScaledVector(f.sd, (Math.random() - .5)*player.shake); player.shake = Math.max(0, player.shake - dt*2); }
    camera.up.lerp(f.up, 1 - Math.exp(-4*dt)).normalize();
    camL.copy(player.g.position).addScaledVector(f.t, finished ? 0 : 22).addScaledVector(f.up, 1);
    camera.lookAt(camL);
    const fov = 66 + clamp(player.speed/104, 0, 1.2)*16 + (player.boosting ? 6 : 0);
    if (Math.abs(camera.fov - fov) > .05){ camera.fov = damp(camera.fov, fov, 4, dt); camera.updateProjectionMatrix(); }

    // speed particles stream past the camera
    const sp = speedPts.geometry.attributes.position.array, fwd = f.t;
    for (let i = 0; i < sp.length; i += 3){
      const dx = sp[i] - camera.position.x, dy = sp[i+1] - camera.position.y, dz = sp[i+2] - camera.position.z;
      if (dx*fwd.x + dy*fwd.y + dz*fwd.z < -8 || dx*dx + dy*dy + dz*dz > 160*160){
        const d = 40 + Math.random()*120;
        sp[i] = camera.position.x + fwd.x*d + (Math.random() - .5)*90; sp[i+1] = camera.position.y + fwd.y*d + (Math.random() - .5)*50; sp[i+2] = camera.position.z + fwd.z*d + (Math.random() - .5)*90;
      }
    }
    speedPts.geometry.attributes.position.needsUpdate = true;
    speedPts.material.opacity = clamp(player.speed/90, .1, .9);

    Sound.engine(clamp(player.speed/104, 0, 1), player.thr > 0, !!player.boosting, false);

    // HUD
    const order = rankOrder(), rank = order.indexOf(player) + 1;
    if (rank !== prevRank && state === 'racing'){ Sound.position(rank < prevRank); renderBoard(); }
    prevRank = rank;
    if (Math.floor(t*4) !== Math.floor((t - dt)*4)) renderBoard();
    ui.Pos.textContent = rank; ui.Suf.textContent = ordinal(rank);
    ui.Lap.textContent = `${clamp(Math.floor(Math.max(player.s, 0)/L) + 1, 1, LAPS)} / ${LAPS}`;
    ui.Time.textContent = fmtTime(finished ? player.finishT : raceT);
    ui.Speed.textContent = Math.round(player.speed*3.6);
    ui.Boost.style.transform = `scaleX(${player.energy})`;
    drawMini();
    if (finished && !resultsShown && raceT - finishedAt > 3) showResults();
  }
  function gateBoostPulse(t){ /* boost discs breathe */
    scene.children.forEach(o => { if (o.userData.disc){ o.userData.disc.rotation.z = t*2; o.userData.disc.material.opacity = .4 + Math.sin(t*6)*.2; } });
  }
  function drawMini(){
    const g = ui.Mini.getContext('2d');
    g.clearRect(0, 0, 360, 360);
    g.lineWidth = 8; g.strokeStyle = 'rgba(74,242,161,.25)'; g.lineJoin = 'round';
    g.beginPath(); miniPath.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(74,242,161,.9)'; g.stroke();
    const [sx, sy] = toMini(pos[0]); g.fillStyle = '#fff'; g.fillRect(sx - 6, sy - 2, 12, 4);
    ships.slice().reverse().forEach(s => { const [x, y] = toMini(frameAt(s.s).p); g.fillStyle = s.you ? '#4af2a1' : s.glow; g.beginPath(); g.arc(x, y, s.you ? 9 : 6, 0, 7); g.fill(); if (s.you){ g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); } });
  }

  function resize(){ if (camera){ camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); } }

  $('#rhExit').addEventListener('click', () => { Sound.click(); exit(); });
  $('#rhBack').addEventListener('click', () => { Sound.click(); exit(); });
  $('#rhAgain').addEventListener('click', () => { Sound.click(); reset(); });

  return {
    enter, exit, update, resize, restart(){ if (active) reset(); },
    get active(){ return active; }, get scene(){ return scene; }, get camera(){ return camera; },
    get debug(){ return {state, stateT, raceT, lastCount, s:player && player.s, speed:player && player.speed}; },
    get bestLap(){ return bestLap; }, get bestRace(){ return bestRace; },
  };
})();
