'use strict';
/* =====================================================================
   WORLD: the floating sky city you drive through
   ===================================================================== */
let World = null;
let started = false;
function createWorld(){ World = (() => {
  const container = $('#game');
  const isTouch = matchMedia('(pointer:coarse)').matches;
  const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 2));
  const Q = isTouch ? .65 : 1; // phones get a lighter city
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, .5, 1400);
  const fog = new THREE.Fog(0x05140e, 120, 520); scene.fog = fog;

  const bgCanvas = document.createElement('canvas'); bgCanvas.width = 512; bgCanvas.height = 256;
  const swirl = makeSwirl(1024, 512, 21, 18);
  const bgTex = new THREE.CanvasTexture(bgCanvas); scene.background = bgTex;

  const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x0f3a28, .5); scene.add(hemi);
  const amb = new THREE.AmbientLight(0x0f3a28, .15); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffffff, .85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {left:-90, right:90, top:90, bottom:-90, near:1, far:320});
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target);

  let composer = null, bloom = null, renderPass = null;
  if (THREE.EffectComposer && THREE.UnrealBloomPass){
    composer = new THREE.EffectComposer(renderer);
    renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth*(isTouch ? .5 : 1), innerHeight*(isTouch ? .5 : 1)), .4, .5, .9);
    composer.addPass(bloom);
  }
  function render(sc, cam){
    if (composer){ renderPass.scene = sc; renderPass.camera = cam; composer.render(); }
    else renderer.render(sc, cam);
  }

  /* ---------- reveal: fragments beyond the wave radius are discarded ---------- */
  const revealU = {value:34};
  function revealify(mat){
    mat.onBeforeCompile = sh => {
      sh.uniforms.uReveal = revealU;
      sh.vertexShader = 'varying vec3 vRWorld;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vRWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uReveal;\nvarying vec3 vRWorld;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (length(vRWorld.xz) > uReveal) discard;');
    };
    return mat;
  }

  /* ---------- materials ---------- */
  const solidMat = revealify(new THREE.MeshPhongMaterial({vertexColors:true, flatShading:true, shininess:50, specular:0x334466}));
  const glowMat = revealify(new THREE.MeshBasicMaterial({vertexColors:true}));
  const windowTex = City.windowTexture();
  const cityMats = {
    solid: revealify(new THREE.MeshPhongMaterial({vertexColors:true, shininess:95, specular:0x3c5a4c})),
    glass: revealify(new THREE.MeshBasicMaterial({map:windowTex, vertexColors:true})),
    glow: glowMat,
  };
  const scaledMats = [glowMat, cityMats.glass];
  function grad(geo, top, bottom){
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.computeBoundingBox();
    const bb = geo.boundingBox, p = geo.attributes.position, col = new Float32Array(p.count*3);
    const a = new THREE.Color(top), b = new THREE.Color(bottom), c = new THREE.Color(), h = (bb.max.y - bb.min.y) || 1;
    for (let i = 0; i < p.count; i++){ c.copy(b).lerp(a, (p.getY(i) - bb.min.y)/h); col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }
  function mesh(geo, top, bottom, glow = false){
    const m = new THREE.Mesh(grad(geo, top, bottom), glow ? glowMat : solidMat);
    if (!glow){ m.castShadow = true; m.receiveShadow = true; }
    return m;
  }
  const addMat = (color, opacity = 1) => revealify(new THREE.MeshBasicMaterial({color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
  function textTexture(draw, w, h){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  const ticks = [], revealables = [], obstacles = [], pins = [], buildings = [];
  function reveal(obj, x, z, target = 1){ revealables.push({obj, dist:Math.hypot(x, z), done:false, target}); obj.scale.setScalar(.0001); }
  const v3 = new THREE.Vector3();
  function faceCam(obj){ obj.getWorldPosition(v3); obj.lookAt(camera.position.x, v3.y, camera.position.z); }

  /* ---------- ground: a floating disc of polished black stone above an emerald mist ---------- */
  const paveTex = textTexture((g, S) => {
    g.fillStyle = '#1e2e26'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#24362d'; g.fillRect(0, 0, S/2, S/2); g.fillRect(S/2, S/2, S/2, S/2);
    g.strokeStyle = '#2e4239'; g.lineWidth = 3; g.strokeRect(0, 0, S, S); g.beginPath(); g.moveTo(S/2, 0); g.lineTo(S/2, S); g.moveTo(0, S/2); g.lineTo(S, S/2); g.stroke();
    g.fillStyle = 'rgba(74,242,161,.35)'; [[0,0],[S/2,S/2],[S/2,0],[0,S/2]].forEach(([x,y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
  }, 256, 256);
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping; paveTex.repeat.set(R_ISLAND*2/12, R_ISLAND*2/12); paveTex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R_ISLAND, 160), revealify(new THREE.MeshPhongMaterial({map:paveTex, shininess:90, specular:0x1f3a2e})));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
  const underside = mesh(City.lathe([[R_ISLAND, 0], [R_ISLAND*.97, -3], [R_ISLAND*.7, -14], [R_ISLAND*.35, -32], [R_ISLAND*.08, -52], [0, -58]], 96), '#1a2420', '#000302');
  underside.castShadow = false; underside.visible = false; scene.add(underside);
  const underRing = new THREE.Mesh(new THREE.TorusGeometry(R_ISLAND*.7, .8, 8, 160), new THREE.MeshBasicMaterial({color:0x4af2a1, transparent:true, opacity:.9, blending:THREE.AdditiveBlending, depthWrite:false}));
  underRing.rotation.x = Math.PI/2; underRing.position.y = -14; underRing.visible = false; scene.add(underRing);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R_ISLAND, .45, 8, 260), addMat(0x4af2a1, 1));
  rim.rotation.x = Math.PI/2; rim.position.y = .1; scene.add(rim);
  // white rim around the intro diorama (removed on start)
  const dioramaRim = new THREE.Mesh(new THREE.TorusGeometry(34, .25, 8, 120), new THREE.MeshBasicMaterial({color:0xe6cc8a, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
  dioramaRim.rotation.x = Math.PI/2; dioramaRim.position.y = .1; scene.add(dioramaRim);

  // sea of clouds below the city
  const cloudTex = textTexture((g, S) => {
    g.clearRect(0, 0, S, S); seed = 77;
    for (let i = 0; i < 140; i++){
      const x = rand()*S, y = rand()*S, r = 20 + rand()*70;
      [[0,0],[S,0],[0,S],[-S,0],[0,-S]].forEach(([ox, oy]) => {
        const gr = g.createRadialGradient(x+ox, y+oy, 0, x+ox, y+oy, r);
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x+ox, y+oy, r, 0, 7); g.fill();
      });
    }
  }, 512, 512);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(5, 5);
  const cloudMat = new THREE.MeshBasicMaterial({map:cloudTex, transparent:true, depthWrite:false, color:0xffffff});
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), cloudMat); clouds.rotation.x = -Math.PI/2; clouds.position.y = -90; scene.add(clouds);
  const clouds2 = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), cloudMat.clone()); clouds2.material.map = cloudTex.clone(); clouds2.material.map.needsUpdate = true; clouds2.material.map.repeat.set(3, 3); clouds2.material.opacity = .7;
  clouds2.rotation.x = -Math.PI/2; clouds2.position.y = -60; scene.add(clouds2);
  ticks.push((t) => { cloudTex.offset.set(t*.004, t*.002); clouds2.material.map.offset.set(-t*.003, t*.001); });

  // floating data motes
  const motes = (() => {
    const n = isTouch ? 200 : 500, g = new THREE.BufferGeometry(), p = new Float32Array(n*3);
    for (let i = 0; i < n; i++){ const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*R_ISLAND; p[i*3] = Math.cos(a)*r; p[i*3+1] = Math.random()*40; p[i*3+2] = Math.sin(a)*r; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({color:0x4af2a1, size:.3, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false}));
    scene.add(pts);
    ticks.push((t, dt) => { for (let i = 0; i < n; i++){ p[i*3+1] += dt*(.5 + (i%5)*.2); if (p[i*3+1] > 40) p[i*3+1] = 0; } g.attributes.position.needsUpdate = true; });
    return pts;
  })();

  /* ---------- city: roads, plazas, lamps, buildings, trees (merged) ---------- */
  City.begin(0);
  const P = City.part, ROAD_C = '#2c3d35';
  function roadSeg([x1, z1], [x2, z2]){
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz); if (L < .5) return;
    City.setFrame((x1 + x2)/2, (z1 + z2)/2, Math.atan2(dx, dz));
    P('solid', new THREE.BoxGeometry(10, .12, L), {p:[0, .06, 0], top:ROAD_C, bottom:ROAD_C});
    [-4.9, 4.9].forEach(x => P('glow', new THREE.BoxGeometry(.25, .06, L), {p:[x, .14, 0], top:'#1fd17a', bottom:'#1fd17a'}));
    for (let s = -L/2 + 3; s < L/2 - 3; s += 8) P('glow', new THREE.BoxGeometry(.22, .05, 3), {p:[0, .14, s], top:'#6f8a7c', bottom:'#6f8a7c'});
  }
  function joint(x, z){ City.setFrame(x, z, 0); P('solid', new THREE.CylinderGeometry(5, 5, .12, 24), {p:[0, .061, 0], top:ROAD_C, bottom:ROAD_C}); }
  ROADS.forEach(([ia, ib]) => { const p = roadPath(nodeById(ia), nodeById(ib)); roadSeg(p[0], p[1]); roadSeg(p[1], p[2]); p.forEach(([x, z]) => joint(x, z)); });
  for (let i = 0; i < 96; i++){
    const a0 = i/96*Math.PI*2, a1 = (i + 1)/96*Math.PI*2;
    roadSeg([Math.cos(a0)*RING, Math.sin(a0)*RING], [Math.cos(a1)*RING, Math.sin(a1)*RING]);
    joint(Math.cos(a0)*RING, Math.sin(a0)*RING);
  }
  // plazas
  const EX = 1.7; // exhibits are built small and scaled up
  const plazaR = a => a.id === 'home' ? 24 : a.id === 'race' ? 26 : (a.r + 4)*EX + 4;
  AREAS.forEach(a => {
    const r = plazaR(a);
    City.setFrame(a.x, a.z, 0);
    P('solid', new THREE.CylinderGeometry(r, r + .4, .2, 64), {p:[0, .1, 0], top:'#2a3a33', bottom:'#0d1411'});
    P('glow', new THREE.TorusGeometry(r - .6, .12, 4, 96), {p:[0, .22, 0], r:[Math.PI/2, 0, 0], top:'#1fd17a', bottom:'#1fd17a'});
    P('glow', new THREE.TorusGeometry(r*.72, .06, 4, 96), {p:[0, .22, 0], r:[Math.PI/2, 0, 0], top:'#e6cc8a', bottom:'#e6cc8a'});
  });
  // buildings
  function free(x, z, r){
    const d0 = Math.hypot(x, z);
    if (d0 + r > R_ISLAND - 5 || d0 < 30 + r) return false;
    if (distToRoads(x, z) < r + 7.5) return false;
    for (const a of AREAS) if (Math.hypot(x - a.x, z - a.z) < r + plazaR(a) + 6) return false;
    for (const b of buildings) if (Math.hypot(x - b.x, z - b.z) < r + b.r + 3.5) return false;
    return true;
  }
  function place(n, rMin, rMax, maker, tries = 1500){
    let made = 0;
    for (let k = 0; k < tries && made < n; k++){
      const ang = rand()*Math.PI*2, rr = rMin + rand()*(rMax - rMin), x = Math.cos(ang)*rr, z = Math.sin(ang)*rr;
      const spec = maker(rr);
      if (!free(x, z, spec.foot)) continue;
      const res = spec.build(x, z);
      buildings.push({x, z, r:res.r, type:spec.type, top:res.top});
      obstacles.push({x, z, r:res.r});
      made++;
    }
  }
  const tips = ['#1fd17a', '#e6cc8a', '#e6cc8a', '#bff7da'];
  seed = 2024;
  // skyline ring: the tallest towers stand at the edge so the city reads big from everywhere
  place(Math.round(30*Q), 150, 170, () => {
    const k = rand();
    if (k < .4){ const w = 10 + rand()*6; return {type:'pill', foot:w*.55, build:(x, z) => City.pillTower(x, z, {w, h:70 + rand()*60, ry:Math.atan2(x, z) + (rand() - .5)*.6, tip:tips[Math.floor(rand()*4)]})}; }
    if (k < .7){ const r = 2.6 + rand()*1.4; return {type:'needle', foot:r*1.6, build:(x, z) => City.needleTower(x, z, {h:75 + rand()*50, r, tip:tips[Math.floor(rand()*4)]})}; }
    const R = 10 + rand()*5; return {type:'saucer', foot:R*.95, build:(x, z) => City.saucerTower(x, z, {h:50 + rand()*30, R, pod:rand() > .5, tip:tips[Math.floor(rand()*4)]})};
  });
  // mid ring
  place(Math.round(55*Q), 95, 150, () => {
    const k = rand();
    if (k < .35){ const R = 6 + rand()*5; return {type:'saucer', foot:R*.95, build:(x, z) => City.saucerTower(x, z, {h:28 + rand()*24, R, pod:rand() > .55, tip:tips[Math.floor(rand()*4)]})}; }
    if (k < .55){ const r = 4.5 + rand()*2.5; return {type:'stack', foot:r, build:(x, z) => City.stackTower(x, z, {r, n:4 + Math.floor(rand()*5), tip:tips[Math.floor(rand()*4)]})}; }
    if (k < .7){ const r = 7 + rand()*6; return {type:'dome', foot:r*1.1, build:(x, z) => City.domeHall(x, z, {r})}; }
    if (k < .85){ const w = 8 + rand()*4; return {type:'pill', foot:w*.55, build:(x, z) => City.pillTower(x, z, {w, h:40 + rand()*40, ry:rand()*Math.PI, tip:tips[Math.floor(rand()*4)]})}; }
    return {type:'ring', foot:2, build:(x, z) => City.ringSpire(x, z, {h:26 + rand()*16, c:tips[Math.floor(rand()*4)]})};
  });
  // inner districts: lower, so the exhibits stay readable
  place(Math.round(55*Q), 30, 95, () => {
    const k = rand();
    if (k < .3){ const R = 4.5 + rand()*3; return {type:'saucer', foot:R*.95, build:(x, z) => City.saucerTower(x, z, {h:16 + rand()*14, R, pod:rand() > .6, tip:tips[Math.floor(rand()*4)]})}; }
    if (k < .5){ const r = 3.5 + rand()*2; return {type:'stack', foot:r, build:(x, z) => City.stackTower(x, z, {r, n:2 + Math.floor(rand()*4), tip:tips[Math.floor(rand()*4)]})}; }
    if (k < .68){ const r = 5 + rand()*4; return {type:'dome', foot:r*1.1, build:(x, z) => City.domeHall(x, z, {r})}; }
    if (k < .82){ const w = 6 + rand()*3; return {type:'pill', foot:w*.55, build:(x, z) => City.pillTower(x, z, {w, h:22 + rand()*22, ry:rand()*Math.PI, tip:tips[Math.floor(rand()*4)]})}; }
    return {type:'ring', foot:2, build:(x, z) => City.ringSpire(x, z, {h:18 + rand()*12, c:tips[Math.floor(rand()*4)]})};
  });
  const TREE_C = [['#4af2a1','#0b5a3a'], ['#2fd47a','#063a22'], ['#e6cc8a','#5a4a1a'], ['#9dffcb','#14614a']];
  place(Math.round(150*Q), 30, 168, () => { const s = .8 + rand()*.7, c = TREE_C[Math.floor(rand()*4)]; return {type:'tree', foot:1.2*s, build:(x, z) => City.bioTree(x, z, {s, c1:c[0], c2:c[1]})}; }, 4000);
  // lamps along every road
  ROADS.forEach(([ia, ib]) => {
    const p = roadPath(nodeById(ia), nodeById(ib));
    for (let s = 0; s < 2; s++){
      const [x1, z1] = p[s], [x2, z2] = p[s+1], L = Math.hypot(x2 - x1, z2 - z1); if (L < 20) continue;
      const nx = -(z2 - z1)/L, nz = (x2 - x1)/L, ang = Math.atan2(x2 - x1, z2 - z1);
      for (let d = 14; d < L - 10; d += 24){
        [1, -1].forEach(side => {
          const x = lerp(x1, x2, d/L) + nx*7*side, z = lerp(z1, z2, d/L) + nz*7*side;
          if (AREAS.some(a => Math.hypot(x - a.x, z - a.z) < plazaR(a) + 2)) return;
          City.lamp(x, z, {ry:ang + (side > 0 ? -Math.PI/2 : Math.PI/2)}); obstacles.push({x, z, r:.5});
        });
      }
    }
  });
  const cityMeshes = City.end(scene, cityMats);

  /* ---------- pins (diamond markers) ---------- */
  function addPin(area){
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.DoubleSide, fog:false}));
    d.rotation.z = Math.PI/4; d.position.z = .05;
    const border = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({color:0x0e1512, side:THREE.DoubleSide, fog:false}));
    border.rotation.z = Math.PI/4; border.position.z = -.1;
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 4), new THREE.MeshBasicMaterial({color:0x4af2a1, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false}));
    halo.rotation.z = Math.PI/4;
    g.add(border, d, halo);
    const off = area.pin || [0, (area.r + 2.6)*EX];
    const px = area.x + off[0], pz = area.z + off[1];
    g.position.set(px, 4.5, pz);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 4.5, 4), new THREE.MeshBasicMaterial({color:0x4af2a1, transparent:true, opacity:.6, blending:THREE.AdditiveBlending, depthWrite:false}));
    beam.position.set(px, 2.25, pz);
    scene.add(g, beam);
    const pin = {area, group:g, halo, beam, x:px, z:pz, near:0};
    pins.push(pin); reveal(g, px, pz); reveal(beam, px, pz);
    return pin;
  }

  /* ---------- exhibits (built at local 0,0 inside a scaled group per area) ---------- */
  let parent = scene;
  const add = (...o) => parent.add(...o);
  function platform(r, h = .5, sides = 6){
    const p = mesh(new THREE.CylinderGeometry(r, r + .4, h, sides), '#1d2924', '#0a110e'); p.position.y = h/2; add(p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .08, 4, sides), addMat(0x1fd17a, .95));
    ring.rotation.x = Math.PI/2; ring.rotation.z = sides === 6 ? Math.PI/6 : 0; ring.position.y = h + .02; add(ring);
    return h;
  }

  function buildHome(){
    platform(3.4, .25, 6);
    // that platform is the spawn pad, in front of the sign
    parent.children.slice(-2).forEach(o => o.position.z = 9.4);
    const tex = textTexture((g, w, h) => {
      g.fillStyle = 'rgba(4,12,9,.82)'; const r = 40; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
      g.strokeStyle = 'rgba(74,242,161,.8)'; g.lineWidth = 6; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 150px Michroma'; g.shadowColor = '#4af2a1'; g.shadowBlur = 30; g.fillStyle = '#eafff3';
      g.fillText(CONFIG.name.toUpperCase(), w/2, h*.4);
      g.shadowBlur = 0; g.font = '700 54px Michroma'; g.fillStyle = '#e6cc8a';
      g.fillText(('// ' + CONFIG.role + ' //').toUpperCase(), w/2, h*.74);
      g.fillStyle = 'rgba(74,242,161,.06)'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    }, 2048, 440);
    const signMat = new THREE.MeshBasicMaterial({map:tex, transparent:true, side:THREE.DoubleSide, fog:false});
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), signMat); sign.position.set(0, 4.2, -2.4); add(sign);
    const base = mesh(new THREE.BoxGeometry(11, .5, 1.2), '#2f3b35', '#0c120f'); base.position.set(0, .25, -2.4); add(base);
    [-5, 5].forEach(x => { const post = mesh(new THREE.CylinderGeometry(.18, .26, 5.6, 8), '#3a4842', '#060a08'); post.position.set(x*1.32, 2.8, -2.4); add(post); });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(10.6, .08, .12), addMat(0x1fd17a)); strip.position.set(0, .55, -1.82); add(strip);
    ticks.push(t => { signMat.opacity = Math.random() > .99 ? .55 : 1; sign.position.y = 4.2 + Math.sin(t*1.3)*.08; });
  }

  function buildSQL(){
    const h = platform(5, .6, 6);
    // the model: 28 transformer layers (Qwen2.5-Coder-1.5B), breathing like 4-bit quantization
    const g = new THREE.Group(); g.position.y = h + .3; add(g);
    const layers = [], cA = new THREE.Color('#1fd17a'), cB = new THREE.Color('#0b5a3a'), c = new THREE.Color();
    for (let i = 0; i < 28; i++){
      c.copy(cB).lerp(cA, i/27);
      const s = mesh(new THREE.BoxGeometry(3.4, .16, 3.4), '#' + c.getHexString(), '#2a2560');
      s.position.y = i*.3; g.add(s);
      s.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.42, .17, 3.42)), new THREE.LineBasicMaterial({color:c.clone()})));
      layers.push(s);
    }
    const tex = textTexture((x) => {
      x.fillStyle = 'rgba(4,12,9,.75)'; x.fillRect(0, 0, 512, 280);
      x.font = '700 44px "JetBrains Mono"'; x.fillStyle = '#4af2a1'; x.shadowColor = '#4af2a1'; x.shadowBlur = 14;
      ['SELECT region,', '  sum(revenue)', 'FROM orders', 'GROUP BY region;'].forEach((l, i) => x.fillText(l, 20, 60 + i*58));
    }, 512, 280);
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), new THREE.MeshBasicMaterial({map:tex, transparent:true, side:THREE.DoubleSide, opacity:.92}));
    holo.position.y = h + 11.2; add(holo);
    ticks.push(t => {
      g.rotation.y = t*.25;
      layers.forEach((s, i) => { const q = Math.pow(Math.max(0, Math.sin(t*1.1 - i*.22)), 10); s.scale.set(1 - q*.38, 1, 1 - q*.38); s.rotation.y = Math.sin(t*.6 + i*.18)*.12; });
      faceCam(holo); holo.position.y = h + 11.2 + Math.sin(t*1.4)*.2;
    });
  }

  function buildOCR(){
    const h = platform(5, .6, 8);
    const core = mesh(new THREE.OctahedronGeometry(1.3, 0), '#f3e2b0', '#6a5420', true); core.position.y = h + 3.2; add(core);
    const pillar = mesh(new THREE.CylinderGeometry(.5, .9, 1.6, 8), '#2f3b35', '#0c120f'); pillar.position.y = h + .8; add(pillar);
    const glyphs = [['A','600 200px "Manrope"'],['क','600 190px "Noto Sans Devanagari"'],['অ','600 190px "Noto Sans Bengali"'],['த','600 180px "Noto Sans Tamil"'],['తె','600 170px "Noto Sans Telugu"']];
    const panels = glyphs.map(([ch, font], i) => {
      const col = i % 2 ? '#e6cc8a' : '#4af2a1';
      const tex = textTexture((g, w, hh) => {
        g.fillStyle = 'rgba(4,12,9,.78)'; g.fillRect(10, 10, w-20, hh-20);
        g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(10, 10, w-20, hh-20);
        g.font = font; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 24; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ch, w/2, hh/2 + 10);
      }, 256, 256);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({map:tex, transparent:true, side:THREE.DoubleSide}));
      add(m); return m;
    });
    const scan = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.6, 48), addMat(0xe6cc8a, .9)); scan.rotation.x = -Math.PI/2; add(scan);
    ticks.push(t => {
      core.rotation.y = t*1.2; core.position.y = h + 3.2 + Math.sin(t*2)*.25;
      panels.forEach((p, i) => { const ang = t*.5 + i/panels.length*Math.PI*2; p.position.set(Math.cos(ang)*3.4, h + 3 + Math.sin(t*1.5 + i)*.4, Math.sin(ang)*3.4); faceCam(p); });
      scan.position.y = h + .2 + (Math.sin(t*1.3)*.5 + .5)*5;
    });
  }

  function buildLab(){
    const h = platform(6, .7, 6);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), revealify(new THREE.MeshBasicMaterial({color:0x1fd17a, wireframe:true, transparent:true, opacity:.8})));
    const inner = mesh(new THREE.IcosahedronGeometry(1.8, 0), '#4af2a1', '#0b5a3a', true);
    const g = new THREE.Group(); g.add(wire, inner); g.position.y = h + 5; add(g);
    const nodes = [], nodeGeo = new THREE.SphereGeometry(.22, 8, 6), nodeMat = mesh(new THREE.SphereGeometry(.1), '#1fd17a', '#1fd17a', true).material;
    [[7.2, 1.6, 10], [6.2, 4.4, 8], [7.2, 7.4, 10]].forEach(([r, y, n], L) => {
      for (let i = 0; i < n; i++){ const ang = i/n*Math.PI*2 + L*.3; const v = new THREE.Vector3(Math.cos(ang)*r*.75, h + y, Math.sin(ang)*r*.75); const m = new THREE.Mesh(grad(nodeGeo.clone(), '#bff8ff', '#1fd17a'), nodeMat); m.position.copy(v); add(m); nodes.push({v, L}); }
    });
    const edges = []; seed = 11;
    nodes.forEach(n1 => nodes.forEach(n2 => { if (n2.L === n1.L + 1 && n1.v.distanceTo(n2.v) < 5.2 && rand() > .25) edges.push([n1.v, n2.v]); }));
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges.flat()), new THREE.LineBasicMaterial({color:0x1f8a5a, transparent:true, opacity:.8}));
    add(lines);
    const sigs = Array.from({length:16}, (_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 4), addMat(0xe6cc8a)); add(m); return {m, e:edges[i*7 % edges.length], p:Math.random(), s:.6 + Math.random()*.8}; });
    ticks.push((t, dt) => {
      wire.rotation.y = t*.3; wire.rotation.x = t*.17; inner.rotation.y = -t*.8;
      inner.scale.setScalar(1 + Math.pow(Math.sin(t*2.2)*.5 + .5, 6)*.25);
      g.position.y = h + 5 + Math.sin(t)*.3;
      sigs.forEach(s => { s.p += dt*s.s; if (s.p > 1){ s.p = 0; s.e = edges[Math.floor(Math.random()*edges.length)]; } s.m.position.lerpVectors(s.e[0], s.e[1], s.p); });
    });
  }

  function buildSkills(){
    const h = platform(4.5, .5, 6);
    const pillar = mesh(new THREE.CylinderGeometry(.6, 1, 6, 6), '#e6cc8a', '#3a2e10'); pillar.position.y = h + 3; add(pillar);
    const cap = mesh(new THREE.OctahedronGeometry(.9, 0), '#e6cc8a', '#1f8a70', true); cap.position.y = h + 6.8; add(cap);
    const chips = SKILLS.map(s => {
      const tex = textTexture((g, w, hh) => {
        g.fillStyle = 'rgba(4,12,9,.9)'; g.fillRect(0, 0, w, hh);
        g.strokeStyle = '#4af2a1'; g.lineWidth = 4; g.strokeRect(6, 6, w-12, hh-12);
        g.font = '700 40px Michroma'; g.fillStyle = '#eafff3'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.toUpperCase(), w/2, hh/2 + 2);
      }, 512, 96);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true}));
      sp.scale.set(3.4, .64, 1); add(sp); return sp;
    });
    ticks.push(t => {
      cap.rotation.y = t*1.5;
      chips.forEach((c, i) => { const ang = t*.35 + i/chips.length*Math.PI*2, rr = 4.6 + (i%2)*.5; c.position.set(Math.cos(ang)*rr, h + 1.2 + (i % 5)*1.15 + Math.sin(t*1.2 + i)*.15, Math.sin(ang)*rr); });
    });
  }

  function buildCareer(){
    const h = platform(4, .5, 4);
    const body = mesh(new THREE.BoxGeometry(3.2, 3.4, 1.6), '#2f3b35', '#0f1613'); body.position.set(0, h + 1.7, -.4); add(body);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 320;
    const sx = canvas.getContext('2d'), stex = new THREE.CanvasTexture(canvas);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.75), new THREE.MeshBasicMaterial({map:stex, fog:false}));
    screen.position.set(0, h + 2.4, .41); screen.rotation.x = -.12; add(screen);
    const LOG = ['> qlora r=16 alpha=32 bits=4', '> schema 15,374 -> 2,262 tokens', '> dev EX 29.3 45.0 66.3 74.3 80.3', '> sft test EX 81.2%', '> grpo rollouts=6 prompts=6,361', '> grpo test EX 82.4%', '> ocr scripts=5 size=12.5MB', '> tamil hw 5% -> 94.0%', '> numbers exact 98.5%', '> status: open to ML/AI roles'];
    let li = 0; const lines = [];
    const draw = () => {
      sx.fillStyle = '#05140f'; sx.fillRect(0, 0, 512, 320);
      sx.font = '700 22px "JetBrains Mono"'; sx.fillStyle = '#e6cc8a'; sx.shadowColor = '#e6cc8a'; sx.shadowBlur = 8;
      lines.forEach((l, i) => sx.fillText(l, 16, 34 + i*30));
      sx.shadowBlur = 0; sx.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < 320; y += 4) sx.fillRect(0, y, 512, 2);
      stex.needsUpdate = true;
    };
    draw();
    setInterval(() => { lines.push(LOG[li++ % LOG.length]); if (lines.length > 9) lines.shift(); draw(); }, 900);
    const ant = mesh(new THREE.CylinderGeometry(.05, .05, 1.6, 4), '#ffffff', '#666666'); ant.position.set(1.2, h + 4.2, -.4); add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), addMat(0xff6a6a)); tip.position.set(1.2, h + 5.05, -.4); add(tip);
    ticks.push(t => { tip.material.opacity = Math.sin(t*4) > 0 ? 1 : .2; });
  }

  let trophyTex = null;
  function drawTrophyTex(){
    const c = trophyTex.image, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(4,12,9,.8)'; g.fillRect(40, 30, c.width - 80, c.height - 60);
    g.font = '900 110px Michroma'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e6cc8a'; g.shadowColor = '#e6cc8a'; g.shadowBlur = 24;
    g.fillText(`${achCount()}/${ACHIEVEMENTS.length}`, c.width/2, c.height/2);
    trophyTex.needsUpdate = true;
  }
  function buildTrophy(){
    const h = platform(4, .5, 4);
    const ob = mesh(new THREE.CylinderGeometry(.2, 1.4, 6.5, 4), '#f3e2b0', '#7a5a22'); ob.position.y = h + 3.25; ob.rotation.y = Math.PI/4; add(ob);
    const rings = [0,1,2].map(i => { const r = new THREE.Mesh(new THREE.TorusGeometry(2 + i*.5, .07, 4, 64), addMat(i === 1 ? 0xe6cc8a : 0xe6cc8a, .95)); r.position.y = h + 3.5; add(r); return r; });
    trophyTex = textTexture(() => {}, 512, 200); drawTrophyTex();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:trophyTex, transparent:true, fog:false}));
    sp.position.y = h + 8.6; sp.scale.set(3.2, 1.25, 1); add(sp);
    ticks.push(t => rings.forEach((r, i) => { r.rotation.x = t*(.6 + i*.3); r.rotation.y = t*(.4 + i*.2); }));
  }

  function buildContact(){
    const h = platform(3, .5, 6);
    const g = new THREE.Group(); g.position.y = h; add(g);
    for (let i = 0; i < 3; i++){ const leg = mesh(new THREE.CylinderGeometry(.08, .14, 9, 4), '#e6cc8a', '#4a3a14'); const ang = i/3*Math.PI*2; leg.position.set(Math.cos(ang)*.8, 4.5, Math.sin(ang)*.8); g.add(leg); }
    for (let y = 1.5; y < 9; y += 1.5){ const r = new THREE.Mesh(new THREE.TorusGeometry(.75 - y*.04, .04, 4, 3), addMat(0x1fd17a, .9)); r.rotation.x = Math.PI/2; r.position.y = y; g.add(r); }
    const orb = mesh(new THREE.IcosahedronGeometry(.6, 1), '#4af2a1', '#0b5a3a', true); orb.position.y = 9.4; g.add(orb);
    const waves = [0,1,2].map(() => { const w = new THREE.Mesh(new THREE.RingGeometry(.9, 1.05, 48), addMat(0x1fd17a, .8)); w.rotation.x = -Math.PI/2; w.position.y = .3; add(w); return w; });
    ticks.push(t => {
      orb.rotation.y = t; orb.scale.setScalar(1 + Math.sin(t*5)*.08);
      waves.forEach((w, i) => { const p = ((t*.45 + i/3) % 1); w.scale.setScalar(1 + p*6); w.material.opacity = (1 - p)*.8*(started ? 1 : 0); });
    });
  }

  // the portal to the sky race: a giant ring with a swirling event horizon
  function buildRace(){
    platform(9, .6, 8);
    const ring = mesh(new THREE.TorusGeometry(6, .75, 18, 72), '#e6cc8a', '#5a4214'); ring.position.y = 7.6; add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(5.3, .16, 8, 72), addMat(0x1fd17a)); inner.position.y = 7.6; add(inner);
    const swirl = textTexture((g, w) => {
      const c = w/2;
      const bg = g.createRadialGradient(c, c, 0, c, c, c); bg.addColorStop(0, 'rgba(255,255,255,.95)'); bg.addColorStop(.25, 'rgba(74,242,161,.7)'); bg.addColorStop(.7, 'rgba(18,140,80,.45)'); bg.addColorStop(1, 'rgba(31,209,122,.15)');
      g.fillStyle = bg; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
      g.lineWidth = 7;
      for (let arm = 0; arm < 6; arm++){
        g.strokeStyle = arm % 2 ? 'rgba(230,204,138,.8)' : 'rgba(255,255,255,.85)';
        g.beginPath();
        for (let k = 0; k < 120; k++){ const t = k/120, a = arm/6*Math.PI*2 + t*5, r = t*c; const x = c + Math.cos(a)*r, y = c + Math.sin(a)*r; k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    }, 512, 512);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 64), new THREE.MeshBasicMaterial({map:swirl, transparent:true, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false}));
    disc.position.y = 7.6; add(disc);
    [-1, 1].forEach(s => {
      const py = mesh(new THREE.CylinderGeometry(.5, 1.1, 12, 8), '#24302b', '#0a110e'); py.position.set(s*7.8, 6, 0); add(py);
      const cap = mesh(new THREE.OctahedronGeometry(.8, 0), '#e6cc8a', '#5a4214', true); cap.position.set(s*7.8, 12.8, 0); add(cap);
    });
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({map:textTexture((g, w, h) => {
      g.fillStyle = 'rgba(4,12,9,.85)'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e6cc8a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.font = '900 84px Michroma'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = '#12a862'; g.shadowBlur = 24; g.fillText('SKY RACE', w/2, h/2 + 4);
    }, 640, 150), transparent:true}));
    sign.position.set(0, 16.4, 0); sign.scale.set(8, 1.9, 1); add(sign);
    ticks.push(t => { disc.rotation.z = -t*1.6; inner.material.opacity = .7 + Math.sin(t*4)*.3; });
  }

  const builders = {home:buildHome, sql:buildSQL, ocr:buildOCR, lab:buildLab, skills:buildSkills, career:buildCareer, trophy:buildTrophy, contact:buildContact, race:buildRace};
  AREAS.forEach(a => {
    const g = new THREE.Group(); g.position.set(a.x, 0, a.z); g.scale.setScalar(EX);
    if (a.id === 'race'){ g.rotation.y = -Math.PI/2; a.pin = [-26, 0]; }
    scene.add(g); parent = g; builders[a.id](a); parent = scene;
    reveal(g, a.x, a.z, EX);
    if (a.id === 'home'){ obstacles.push({x:-6, z:-4, r:2.2}, {x:-2, z:-4, r:2.2}, {x:2, z:-4, r:2.2}, {x:6, z:-4, r:2.2}); }
    else if (a.id === 'race'){ [-13.3, 13.3].forEach(dz => obstacles.push({x:a.x, z:a.z + dz, r:2.2})); obstacles.push({x:a.x + 3, z:a.z, r:4}); }
    else obstacles.push({x:a.x, z:a.z, r:(a.r + .4)*EX});
    if (a.id !== 'home') addPin(a);
  });
  addPin({...areaById('home'), x:-9, z:2, r:0, pin:[0, 0]}).area = areaById('home');

  /* ---------- flying traffic ---------- */
  const traffic = [];
  {
    seed = 5;
    const bodyGeo = grad(new THREE.SphereGeometry(1, 12, 8), '#3a4842', '#060a08'), lightGeo = new THREE.SphereGeometry(.35, 6, 4);
    for (let i = 0; i < 42; i++){
      const g = new THREE.Group();
      const b = new THREE.Mesh(bodyGeo, solidMat); b.scale.set(.75, .35, 1.9); g.add(b);
      const c = [0x2cff88, 0x4af2a1, 0xe6cc8a, 0xffffff][i % 4];
      const l = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({color:c})); l.position.z = -1.8; g.add(l);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, .06, .5), solidMat); fin.geometry = grad(fin.geometry, '#e6cc8a', '#6a5a30'); fin.position.z = -.6; g.add(fin);
      g.visible = false; scene.add(g);
      traffic.push({g, cx:(rand() - .5)*140, cz:(rand() - .5)*140, rad:50 + rand()*100, h:28 + rand()*60, spd:(.05 + rand()*.07)*(rand() > .5 ? 1 : -1), ph:rand()*6.28, bob:rand()*6});
    }
    const pos = new THREE.Vector3(), nxt = new THREE.Vector3();
    ticks.push(t => traffic.forEach(c => {
      const a = c.ph + t*c.spd;
      pos.set(c.cx + Math.cos(a)*c.rad, c.h + Math.sin(t*.6 + c.bob)*1.5, c.cz + Math.sin(a)*c.rad);
      nxt.set(c.cx + Math.cos(a + c.spd*.2)*c.rad, pos.y, c.cz + Math.sin(a + c.spd*.2)*c.rad);
      c.g.position.copy(pos); c.g.lookAt(nxt);
    }));
  }

  /* ---------- data cubes (smashable), placed on the roads ---------- */
  const cubes = [];
  const cubeGeo = grad(new THREE.BoxGeometry(1.2, 1.2, 1.2), '#24332c', '#030605');
  const cubeEdge = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.21, 1.21, 1.21));
  const edgeMat = new THREE.LineBasicMaterial({color:0x4af2a1});
  ROADS.slice(0, 12).forEach(([ia, ib], ci) => {
    const p = roadPath(nodeById(ia), nodeById(ib)), [x1, z1] = p[1], [x2, z2] = p[2];
    const cx = lerp(x1, x2, .55), cz = lerp(z1, z2, .55);
    if (Math.hypot(x2 - x1, z2 - z1) < 15) return;
    [[0,0,0],[1.25,0,0],[-1.25,0,0],[.62,1.2,0],[-.62,1.2,0],[0,2.4,0],[0,0,1.25],[0,0,-1.25]].forEach(([dx, dy, dz], i) => {
      const m = new THREE.Mesh(cubeGeo, solidMat); m.castShadow = m.receiveShadow = true; m.add(new THREE.LineSegments(cubeEdge, edgeMat));
      m.position.set(cx + dx, .6 + dy, cz + dz); scene.add(m); reveal(m, cx, cz);
      cubes.push({m, v:new THREE.Vector3(), av:new THREE.Vector3(), id:ci*10 + i, sleeping:true});
    });
  });

  /* ---------- the vehicle: a hover-pod ---------- */
  const car = {pos:new THREE.Vector3(0, 0, 16), yaw:0, speed:0, vy:0, y:0, grounded:true, boosting:false, steer:0, roll:0, pitch:0};
  const pod = new THREE.Group(); scene.add(pod);
  const podBody = mesh(new THREE.CylinderGeometry(.55, .8, 2.8, 6), '#1d2622', '#050807'); podBody.rotation.x = -Math.PI/2; podBody.position.y = .1;
  const canopy = mesh(new THREE.SphereGeometry(.6, 8, 6, 0, Math.PI*2, 0, Math.PI/2), '#b9ffe0', '#0b5a3a'); canopy.position.set(0, .45, .1); canopy.scale.set(1, .8, 1.5);
  const finL = mesh(new THREE.BoxGeometry(.9, .12, 1.1), '#e6cc8a', '#7a6a3a'); finL.position.set(-.85, 0, .7); finL.rotation.z = .25;
  const finR = finL.clone(); finR.position.x = .85; finR.rotation.z = -.25;
  const tail = mesh(new THREE.BoxGeometry(.1, .7, .8), '#e6cc8a', '#7a6a3a'); tail.position.set(0, .55, 1.15);
  const thrusters = [-.55, .55].map(x => {
    const t = mesh(new THREE.CylinderGeometry(.26, .3, .9, 8), '#626262', '#262526'); t.rotation.x = Math.PI/2; t.position.set(x, -.05, 1.3);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(.22, 12), new THREE.MeshBasicMaterial({color:0x4af2a1})); glow.position.set(x, -.05, 1.76);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.2, 1.4, 8, 1, true), new THREE.MeshBasicMaterial({color:0x4af2a1, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false}));
    flame.rotation.x = Math.PI/2; flame.position.set(x, -.05, 2.4);
    pod.add(t, glow, flame); return flame;
  });
  const under = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({map:textTexture((g, w) => { const r = g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2); r.addColorStop(0,'rgba(74,242,161,.7)'); r.addColorStop(1,'rgba(74,242,161,0)'); g.fillStyle = r; g.fillRect(0,0,w,w); }, 64, 64), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
  under.rotation.x = -Math.PI/2; under.position.y = .25; scene.add(under);
  const podInner = new THREE.Group(); podInner.add(podBody, canopy, finL, finR, tail); pod.add(podInner);
  const podLight = new THREE.PointLight(0x4af2a1, 1.2, 8); podLight.position.set(0, -.3, .8); pod.add(podLight);
  pod.scale.setScalar(1.25);

  // reveal wave
  const waveMat = new THREE.MeshBasicMaterial({color:0x5f9dff, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
  const wave = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 160), waveMat); wave.rotation.x = -Math.PI/2; wave.position.y = .35; wave.visible = false; scene.add(wave);
  const waveFillMat = waveMat.clone(); waveFillMat.opacity = .12;
  const waveFill = new THREE.Mesh(new THREE.CircleGeometry(1, 120), waveFillMat); waveFill.rotation.x = -Math.PI/2; waveFill.position.y = .3; waveFill.visible = false; scene.add(waveFill);
  let revealT = -1, revealFull = false;
  // the landing diorama is visible before start
  revealables.forEach(r => { if (r.dist < 20){ r.obj.scale.setScalar(r.target); r.done = true; } });
  const hiddenBeforeStart = [motes, ...traffic.map(c => c.g)];
  hiddenBeforeStart.forEach(o => o.visible = false);

  /* ---------- presets / day cycle ---------- */
  let presetIndex = 0, presetFrom = PRESETS[0], presetT = 1, presetApplied = false;
  const COLS = ['skyTop','skyMid','skyLow','fog','light','hemiSky','shadow','reveal'], NUMS = ['li','electric','bloom','thr'];
  const cur = {}; COLS.forEach(k => cur[k] = new THREE.Color()); NUMS.forEach(k => cur[k] = 0);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  function applyPreset(dt){
    if (presetT >= 1 && presetApplied) return;
    presetT = Math.min(1, presetT + dt/1.6);
    presetApplied = presetT >= 1;
    const A = presetFrom, B = PRESETS[presetIndex], t = presetT*presetT*(3 - 2*presetT);
    COLS.forEach(k => cur[k].copy(tmpA.set(A[k])).lerp(tmpB.set(B[k]), t));
    NUMS.forEach(k => cur[k] = lerp(A[k], B[k], t));
    sun.color.copy(cur.light); sun.intensity = cur.li;
    hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.shadow); hemi.intensity = .75;
    amb.color.copy(cur.hemiSky); amb.intensity = .22;
    fog.color.copy(cur.fog);
    cityMats.glass.color.setScalar(cur.electric);
    glowMat.color.setScalar(cur.electric*1.15);
    edgeMat.color.set('#4af2a1').multiplyScalar(Math.min(1.4, cur.electric));
    cloudMat.color.copy(cur.fog).lerp(tmpA.set('#1fd17a'), .22); clouds2.material.color.copy(cloudMat.color);
    setBloom(cur.bloom, cur.thr);
    const g = bgCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + cur.skyTop.getHexString()); gr.addColorStop(.5, '#' + cur.skyMid.getHexString()); gr.addColorStop(1, '#' + cur.skyLow.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = .55; g.drawImage(swirl, 0, 0, 512, 256); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    bgTex.needsUpdate = true;
  }
  function setBloom(strength, threshold){ if (bloom){ bloom.strength = strength*(isTouch ? .8 : 1); bloom.threshold = threshold; } }
  function cyclePreset(){
    presetFrom = {}; COLS.forEach(k => presetFrom[k] = '#' + cur[k].getHexString()); NUMS.forEach(k => presetFrom[k] = cur[k]);
    presetIndex = (presetIndex + 1) % PRESETS.length; presetT = 0; presetApplied = false;
    const p = PRESETS[presetIndex];
    $('#modeName').textContent = p.name;
    Sound.mode();
    toast(`World mode · <strong>${p.name}</strong>`, {icon:'◐', sound:false});
    achSets.modes.add(p.key); store.set('ach.modes', [...achSets.modes]); achieve('modes', achSets.modes.size, true);
    waveMat.color.set(p.reveal); waveFillMat.color.set(p.reveal); revealT = 0; wave.visible = waveFill.visible = true; wave.position.x = waveFill.position.x = car.pos.x; wave.position.z = waveFill.position.z = car.pos.z;
  }
  applyPreset(1);

  /* ---------- camera & input ---------- */
  const camState = {yaw:0, pitch:1, dist:30, height:20, zoom:1, target:new THREE.Vector3(0, 1, 16)};
  let introAngle = 0, drag = null;
  renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = {x:e.clientX, y:e.clientY, yaw:camState.yaw, pitch:camState.pitch}; });
  addEventListener('pointermove', e => { if (drag){ camState.yaw = drag.yaw - (e.clientX - drag.x)*.006; camState.pitch = clamp(drag.pitch + (e.clientY - drag.y)*.004, .35, 1.8); } });
  addEventListener('pointerup', () => drag = null);
  renderer.domElement.addEventListener('wheel', e => { camState.zoom = clamp(camState.zoom + e.deltaY*.001, .55, 2); }, {passive:true});

  const input = {up:0, down:0, left:0, right:0, boost:0, padBoost:0, joyX:0, joyY:0, padX:0, padThrottle:0};
  let hopQueued = false;

  /* ---------- simulation ---------- */
  let lapAngle = null, lapAcc = 0, ringAngle = null, ringAcc = 0, edgeToast = false, nearPin = null;
  const fwd = new THREE.Vector3();
  function step(dt, t){
    const enabled = started && !modalOpen;
    let fThr = 0, fSteer = 0;
    if (enabled && input.finger){
      const gp = screenToGround(input.finger.x, input.finger.y);
      if (gp){
        const dx = gp.x - car.pos.x, dz = gp.z - car.pos.z, dist = Math.hypot(dx, dz);
        let diff = Math.atan2(-dx, -dz) - car.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        fSteer = clamp(diff*2.2, -1, 1);
        fThr = dist > 3 ? clamp(dist/12, .35, 1)*(Math.abs(diff) > 2 ? .45 : 1) : 0;
      }
    }
    const throttle = enabled ? clamp((input.up - input.down) + -input.joyY + input.padThrottle + fThr, -1, 1) : 0;
    const steer = enabled ? clamp((input.left - input.right) + -input.joyX + -input.padX + fSteer, -1, 1) : 0;
    const wantBoost = enabled && (input.boost > 0 || input.padBoost > 0) && throttle > 0;
    car.boosting = wantBoost;
    const maxV = wantBoost ? 42 : 24, accel = wantBoost ? 60 : 32;
    if (throttle) car.speed += throttle*accel*dt; else car.speed *= Math.exp(-2*dt);
    if (Math.abs(car.speed) > maxV) car.speed = damp(car.speed, Math.sign(car.speed)*maxV, 3, dt);
    car.speed = clamp(car.speed, -11, 46);
    car.steer = damp(car.steer, steer, 10, dt);
    car.yaw += car.steer*2.3*dt*clamp(car.speed/7, -1, 1);
    fwd.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
    car.pos.addScaledVector(fwd, car.speed*dt);
    if (wantBoost) achieve('boost', dt);

    if (hopQueued && car.grounded && enabled){ car.vy = 11; car.grounded = false; Sound.jump(); achieve('air'); }
    hopQueued = false;
    if (!car.grounded){
      car.vy -= 30*dt; car.y += car.vy*dt;
      if (car.y <= 0){ Sound.land(Math.abs(car.vy)/60); car.y = 0; car.vy = 0; car.grounded = true; }
    }

    for (const o of obstacles){
      const dx = car.pos.x - o.x, dz = car.pos.z - o.z;
      if (Math.abs(dx) > o.r + 2 || Math.abs(dz) > o.r + 2 || car.y > 3) continue;
      const d = Math.hypot(dx, dz), min = o.r + 1.1;
      if (d < min && d > 0){
        car.pos.x = o.x + dx/d*min; car.pos.z = o.z + dz/d*min;
        const n = (dx/d)*fwd.x + (dz/d)*fwd.z;
        if (n < -.3 && Math.abs(car.speed) > 4){ Sound.bump(); car.speed *= -.35; } else car.speed *= .97;
      }
    }
    const rr = Math.hypot(car.pos.x, car.pos.z);
    if (rr > R_ISLAND - 4){
      car.pos.multiplyScalar((R_ISLAND - 4)/rr);
      if (Math.abs(car.speed) > 3){ Sound.edge(); car.speed *= -.3; }
      achieve('edge');
      if (!edgeToast){ edgeToast = true; toast('Edge of the sky city. Below: only clouds and <strong>noise</strong>.', {icon:'!', type:'danger'}); }
    }

    cubes.forEach(c => {
      const dx = c.m.position.x - car.pos.x, dz = c.m.position.z - car.pos.z, dy = c.m.position.y - (car.y + .6), d = Math.hypot(dx, dz, dy*.5);
      if (d < 2.2 && Math.abs(car.speed) > 2){
        const k = Math.abs(car.speed);
        c.v.set(dx/d*k*.7 + fwd.x*k*.5, 3 + k*.35 + Math.random()*3, dz/d*k*.7 + fwd.z*k*.5);
        c.av.set(Math.random()*8-4, Math.random()*8-4, Math.random()*8-4); c.sleeping = false;
        Sound.hit(clamp(k/18, .3, 1));
        if (!achSets.cubes.has(c.id)){ achSets.cubes.add(c.id); achieve('cubes'); }
      }
      if (!c.sleeping){
        c.v.y -= 28*dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.av.x*dt; c.m.rotation.y += c.av.y*dt; c.m.rotation.z += c.av.z*dt;
        if (c.m.position.y < .6){ c.m.position.y = .6; c.v.y *= -.35; c.v.x *= .7; c.v.z *= .7; c.av.multiplyScalar(.6);
          if (c.v.lengthSq() < .3){ c.sleeping = true; c.m.rotation.set(0, c.m.rotation.y, 0); } }
        const cr = Math.hypot(c.m.position.x, c.m.position.z);
        if (cr > R_ISLAND - 1){ c.m.position.x *= (R_ISLAND - 1)/cr; c.m.position.z *= (R_ISLAND - 1)/cr; c.v.x *= -.5; c.v.z *= -.5; }
      }
    });

    // laps around the neural core / around the ring boulevard
    const lab = areaById('lab'), ldx = car.pos.x - lab.x, ldz = car.pos.z - lab.z;
    if (Math.hypot(ldx, ldz) < 26 && started){
      const ang = Math.atan2(ldz, ldx);
      if (lapAngle !== null){ let d = ang - lapAngle; if (d > Math.PI) d -= Math.PI*2; if (d < -Math.PI) d += Math.PI*2; lapAcc += d;
        if (Math.abs(lapAcc) >= Math.PI*2){ lapAcc = 0; achieve('laps'); if (!achDone('laps')) toast(`Lap <strong>${achProgress('laps')}/3</strong> around the core`, {icon:'↻'}); } }
      lapAngle = ang;
    } else { lapAngle = null; lapAcc = 0; }
    if (Math.abs(rr - RING) < 12 && started){
      const ang = Math.atan2(car.pos.z, car.pos.x);
      if (ringAngle !== null){ let d = ang - ringAngle; if (d > Math.PI) d -= Math.PI*2; if (d < -Math.PI) d += Math.PI*2; ringAcc += d; if (Math.abs(ringAcc) >= Math.PI*2){ ringAcc = 0; achieve('ring'); } }
      ringAngle = ang;
    } else { ringAngle = null; ringAcc = 0; }

    if (started) AREAS.forEach(a => {
      if (!achSets.explore.has(a.id) && Math.hypot(car.pos.x - a.x, car.pos.z - a.z) < plazaR(a) + 4){
        achSets.explore.add(a.id); store.set('ach.explore', [...achSets.explore]);
        if (a.id !== 'home'){ Sound.discover(); toast(`<strong>${a.label}</strong>`, {icon:'◆', label:'Area discovered', sound:false}); }
        achieve('explore', achSets.explore.size, true);
      }
    });
    let best = null, bestD = 10;
    pins.forEach(p => {
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      p.near = damp(p.near, d < bestD + 1 ? 1 : 0, 8, dt);
      if (d < bestD){ best = p; bestD = d; }
      const s = 1 + p.near*.45; p.group.children.forEach(ch => ch.scale.setScalar(s));
      p.group.position.y = 4.5 + Math.sin(t*2 + p.x)*.2 + p.near*.6;
      p.group.quaternion.copy(camera.quaternion);
      p.halo.material.opacity = .5 + p.near*.5;
    });
    if (best !== nearPin && best && started) Sound.near();
    nearPin = started ? best : null;

    if (started) Sound.engine(clamp(Math.abs(car.speed)/42, 0, 1), throttle !== 0, wantBoost, !car.grounded);

    const hover = 1 + Math.sin(t*3)*.08 + car.y;
    pod.position.set(car.pos.x, hover, car.pos.z);
    car.roll = damp(car.roll, car.steer*clamp(car.speed/12, -1, 1)*.4, 6, dt);
    car.pitch = damp(car.pitch, -throttle*.08 + (car.grounded ? 0 : -car.vy*.015), 5, dt);
    pod.rotation.set(0, car.yaw, 0); podInner.rotation.set(car.pitch, 0, car.roll);
    thrusters.forEach(f => { const k = .25 + Math.abs(throttle)*.6 + (wantBoost ? .9 : 0) + Math.random()*.15; f.scale.set(1, k, 1); f.position.z = 1.76 + .7*k; f.material.color.set(wantBoost ? 0xe6cc8a : 0x4af2a1); });
    under.position.set(car.pos.x, .25, car.pos.z); under.material.opacity = clamp(1 - car.y*.15, .2, 1);
  }

  function updateCamera(dt){
    if (!started){
      introAngle += dt*.1;
      camState.yaw = Math.sin(introAngle)*.55;
      const pf = camera.aspect < 1 ? clamp(.85/camera.aspect, 1, 1.9) : 1, D = 26*pf, H = 13*pf;
      camera.position.set(Math.sin(camState.yaw)*D, H, 14 + Math.cos(camState.yaw)*D);
      camera.lookAt(0, 3.5, 4);
      return;
    }
    // on touch the camera swings behind the pod, so stick-up always means "into the screen"
    if (html.classList.contains('is-mode-touch') && !drag){
      let d = car.yaw - camState.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      camState.yaw += d*(1 - Math.exp(-(car.speed < -1 ? .6 : 2.6)*dt));
    }
    const lead = Math.min(Math.abs(car.speed), 26)*.2;
    camState.target.x = damp(camState.target.x, car.pos.x + fwd.x*lead, 5, dt);
    camState.target.z = damp(camState.target.z, car.pos.z + fwd.z*lead, 5, dt);
    camState.target.y = damp(camState.target.y, 1.5 + car.y*.5, 5, dt);
    const z = camState.zoom*(car.boosting ? 1.1 : 1)*(camera.aspect < 1 ? clamp(.8/camera.aspect, 1, 1.6) : 1);
    camState.dist = damp(camState.dist, 30*z, 3, dt); camState.height = damp(camState.height, 19*z*camState.pitch, 3, dt);
    const tx = camState.target.x + Math.sin(camState.yaw)*camState.dist, tz = camState.target.z + Math.cos(camState.yaw)*camState.dist;
    camera.position.set(damp(camera.position.x, tx, 4, dt), damp(camera.position.y, camState.target.y + camState.height, 4, dt), damp(camera.position.z, tz, 4, dt));
    camera.lookAt(camState.target);
    sun.position.set(camState.target.x - 60, 110, camState.target.z + 40); sun.target.position.copy(camState.target);
  }

  const promptEl = $('#prompt'), promptArea = $('#promptArea'), pv = new THREE.Vector3();
  function updatePrompt(){
    const show = nearPin && !modalOpen;
    promptEl.classList.toggle('is-visible', !!show);
    html.classList.toggle('is-near', !!show);
    if (!show) return;
    pv.copy(nearPin.group.position); pv.y += 2; pv.project(camera);
    promptEl.style.left = ((pv.x*.5 + .5)*innerWidth) + 'px';
    promptEl.style.top = ((-pv.y*.5 + .5)*innerHeight) + 'px';
    promptArea.textContent = nearPin.area.label;
  }

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0, modalFrames = 0;
  function frame(){
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    pollGamepad();
    if (Race.active){
      Race.update(dt, t);
      render(Race.scene, Race.camera);
    } else if (modalOpen && ++modalFrames > 2){
      // a panel covers the city: freeze it instead of rendering frames nobody sees
    } else {
      if (!modalOpen) modalFrames = 0;
      applyPreset(dt);
      step(dt, t);
      ticks.forEach(f => f(t, dt));
      if (revealT >= 0){
        revealT += dt;
        const radius = Math.pow(revealT/2.6, 1.5)*260;
        wave.scale.setScalar(Math.max(radius, .01)); waveFill.scale.setScalar(Math.max(radius, .01));
        waveMat.opacity = clamp(1.6 - revealT*.5, 0, 1); waveFillMat.opacity = clamp(.16 - revealT*.05, 0, .16);
        if (!revealFull){
          revealU.value = Math.max(revealU.value, radius);
          revealables.forEach(r => { if (!r.done && r.dist < radius){ r.done = true; r.t0 = t; } });
          if (radius > R_ISLAND*.9){ underside.visible = underRing.visible = true; }
          if (radius > R_ISLAND + 40){ revealFull = true; revealU.value = 1e6; }
        }
        if (revealT > 3.6){ revealT = -1; wave.visible = waveFill.visible = false; }
      }
      revealables.forEach(r => { if (r.t0 !== undefined){ const k = clamp((t - r.t0)/.6, 0, 1); const e = k === 1 ? 1 : 1 - Math.pow(2, -10*k)*Math.cos(k*Math.PI*2.6); r.obj.scale.setScalar(Math.max(.0001, e*r.target)); if (k === 1) delete r.t0; } });
      updateCamera(dt);
      updatePrompt();
      render(scene, camera);
    }
    if (Sound.musicOn && started) achieve('music', dt);
    fpsAcc += dt; fpsN++; if (fpsAcc > .5){ $('#fps').textContent = `${Math.round(fpsN/fpsAcc)} fps · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles/1000).toFixed(0)}k tris`; fpsAcc = 0; fpsN = 0; }
    requestAnimationFrame(frame);
  }

  function start(){
    if (started) return;
    started = true;
    hiddenBeforeStart.forEach(o => o.visible = true);
    dioramaRim.visible = false;
    waveMat.color.copy(cur.reveal); waveFillMat.color.copy(cur.reveal);
    wave.visible = waveFill.visible = true; revealT = 0;
    camState.target.set(car.pos.x, 1, car.pos.z);
    // warm the menu previews in idle time once the reveal is done, one per idle slot
    const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
    setTimeout(() => { const ids = AREAS.map(a => a.id); const next = () => { const id = ids.shift(); if (!id) return; if (!modalOpen && !Race.active) snapshot(id); idle(next); }; idle(next); }, 6000);
  }

  /* ---------- area snapshots for the menu preview ---------- */
  const SW = 640, SH = 420, snapCam = new THREE.PerspectiveCamera(40, SW/SH, .5, 1400);
  const snapRT = new THREE.WebGLRenderTarget(SW, SH), snapPx = new Uint8Array(SW*SH*4);
  const snapCv = document.createElement('canvas'); snapCv.width = SW; snapCv.height = SH;
  const snapCtx = snapCv.getContext('2d'), snapImg = snapCtx.createImageData(SW, SH), snapCache = new Map();
  function snapshot(areaId){
    const a = areaById(areaId) || areaById('home');
    const key = a.id + ':' + presetIndex;
    if (snapCache.has(key)) return snapCache.get(key);
    const ang = a.id === 'home' ? 0 : a.id === 'race' ? -Math.PI/2 - .35 : Math.atan2(a.x, a.z) + .5;
    const dist = a.id === 'race' ? 52 : 22 + a.r*2.6;
    snapCam.position.set(a.x + Math.sin(ang)*dist, 9 + a.r*1.3, a.z + Math.cos(ang)*dist);
    snapCam.lookAt(a.x, a.id === 'home' ? 6 : 4 + a.r*.9, a.z);
    revealables.forEach(r => { if (!r.done){ r.done = true; r.obj.scale.setScalar(r.target); } });
    renderer.setRenderTarget(snapRT); renderer.render(scene, snapCam); renderer.readRenderTargetPixels(snapRT, 0, 0, SW, SH, snapPx); renderer.setRenderTarget(null);
    for (let y = 0; y < SH; y++) snapImg.data.set(snapPx.subarray((SH - 1 - y)*SW*4, (SH - y)*SW*4), y*SW*4); // GL rows are bottom-up
    snapCtx.putImageData(snapImg, 0, 0);
    const shot = {url:snapCv.toDataURL('image/jpeg', .85), coords:`X ${a.x.toFixed(1)} · Z ${a.z.toFixed(1)}`};
    snapCache.set(key, shot);
    return shot;
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function screenToGround(sx, sy){
    ndc.set(sx/innerWidth*2 - 1, -(sy/innerHeight)*2 + 1); ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(groundPlane, hit) ? hit : null;
  }
  // the pin (diamond) under a screen point, for tap-to-open
  function pinAt(sx, sy, radius = 56){
    let best = null, bd = radius;
    pins.forEach(p => { pv.copy(p.group.position).project(camera); if (pv.z > 1) return; const d = Math.hypot((pv.x*.5 + .5)*innerWidth - sx, (-pv.y*.5 + .5)*innerHeight - sy); if (d < bd){ bd = d; best = p; } });
    return best;
  }
  // the area whose plaza you are standing on (Enter works anywhere on a plaza)
  function nearArea(){
    let best = null, bd = 1e9;
    AREAS.forEach(a => { const d = Math.hypot(car.pos.x - a.x, car.pos.z - a.z); if (d < plazaR(a) + 6 && d < bd){ bd = d; best = a; } });
    return best;
  }
  function placeAt(areaId){
    const p = pins.find(p => p.area.id === areaId);
    const a = p.area, dx = p.x - a.x, dz = p.z - a.z, l = Math.hypot(dx, dz) || 1;
    car.pos.set(p.x + dx/l*6, 0, p.z + dz/l*6); car.yaw = Math.atan2(dx, dz); car.speed = 0;
    camState.target.set(car.pos.x, 1, car.pos.z);
    camera.position.set(car.pos.x + Math.sin(camState.yaw)*camState.dist, camState.height, car.pos.z + Math.cos(camState.yaw)*camState.dist);
  }
  function teleport(areaId){
    placeAt(areaId);
    waveMat.color.copy(cur.reveal); waveFillMat.color.copy(cur.reveal); revealT = 1.3; wave.visible = waveFill.visible = true;
    wave.position.x = waveFill.position.x = car.pos.x; wave.position.z = waveFill.position.z = car.pos.z;
    Sound.warp(); achieve('warp');
    toast(`Warped to <strong>${areaById(areaId).label}</strong>`, {icon:'⟿', sound:false});
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
    Race.resize();
  });

  return {
    frame, start, input, hop(){ hopQueued = true; }, pinAt, nearArea, zoomBy(f){ camState.zoom = clamp(camState.zoom*f, .55, 2); }, cyclePreset, snapshot, teleport, placeAt, car, pins, buildings,
    renderer, setBloom, refreshPreset(){ presetApplied = false; presetT = Math.max(presetT, .999); },
    get nearPin(){ return nearPin; }, get started(){ return started; },
    updateTrophy(){ if (trophyTex) drawTrophyTex(); },
    textTexture, isTouch, get scene(){ return scene; },
  };
})(); }
