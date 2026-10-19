'use strict';
/* =====================================================================
   CITY: procedural futuristic architecture (saucer towers on slender
   stalks, needle spires, pill-shaped glass skyscrapers, domes).
   Every part is collected per material and merged into one mesh, so a
   whole skyline costs three draw calls. Shared by the city and the race.
   ===================================================================== */
const City = (() => {
  let parts = null, baseY = 0;
  const frame = new THREE.Object3D(), local = new THREE.Object3D(), m4 = new THREE.Matrix4();
  const WT = '#7a8e84', WB = '#26332d'; // obsidian: graphite-green tops fading to black
  const ca = new THREE.Color(), cb = new THREE.Color(), cc = new THREE.Color();

  function begin(y = 0){ parts = {solid:[], glass:[], glow:[]}; baseY = y; }
  function setFrame(x, z, ry = 0){ frame.position.set(x, baseY, z); frame.rotation.set(0, ry, 0); frame.updateMatrix(); }

  // non-indexed, same attribute set everywhere (position, normal, uv, color) so they can merge
  function prep(geo, top, bottom, flat, uv){
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (flat || !g.attributes.normal) g.computeVertexNormals();
    Object.keys(g.attributes).forEach(k => { if (!['position','normal','uv'].includes(k)) g.deleteAttribute(k); });
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2), 2));
    if (uv){ const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i)*uv[0], a.getY(i)*uv[1]); }
    g.computeBoundingBox();
    const bb = g.boundingBox, p = g.attributes.position, col = new Float32Array(p.count*3), h = (bb.max.y - bb.min.y) || 1;
    ca.set(top); cb.set(bottom);
    for (let i = 0; i < p.count; i++){ cc.copy(cb).lerp(ca, (p.getY(i) - bb.min.y)/h); col[i*3] = cc.r; col[i*3+1] = cc.g; col[i*3+2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.groups = [];
    return g;
  }
  function part(kind, geo, {p = [0,0,0], r = [0,0,0], s = [1,1,1], top = WT, bottom = WB, flat = false, uv = null} = {}){
    if (kind !== 'solid' && top === WT && bottom === WB) bottom = top;
    const g = prep(geo, top, bottom, flat, uv);
    local.position.set(p[0], p[1], p[2]); local.rotation.set(r[0], r[1], r[2]); local.scale.set(s[0], s[1], s[2]); local.updateMatrix();
    m4.multiplyMatrices(frame.matrix, local.matrix);
    g.applyMatrix4(m4);
    parts[kind].push(g);
  }
  const lathe = (pts, segs = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segs);
  function radiusAt(profile, y){
    for (let i = 1; i < profile.length; i++){ const [r0, y0] = profile[i-1], [r1, y1] = profile[i]; if (y <= y1) return lerp(r0, r1, (y - y0)/((y1 - y0) || 1)); }
    return profile[profile.length - 1][0];
  }
  function spire(y, len, base = .18, tip = '#2cff88'){
    part('solid', lathe([[base, 0], [base*.55, len*.7], [0, len]], 10), {p:[0, y, 0]});
    part('glow', new THREE.SphereGeometry(.3, 8, 6), {p:[0, y + len, 0], top:tip, bottom:tip});
  }

  /* ---------- building types ---------- */
  // Space-needle style: flared base, slender stalk, a wide saucer with a glass band, a dome and a spire
  function saucerTower(x, z, {h = 40, R = 8, ry = 0, pod = false, tip = '#2cff88'} = {}){
    setFrame(x, z, ry);
    part('solid', lathe([[0,0],[R*.45,0],[R*.43,.7],[R*.3,1.8],[R*.16,3.6],[R*.1,5.5],[R*.085,h*.6],[R*.08,h-3.2],[R*.16,h-1.5],[R*.32,h-.4],[R*.4,h]], 28));
    part('solid', lathe([[R*.4,h],[R*.72,h+.55],[R,h+1.25],[R*.985,h+1.75],[R*.78,h+2.25],[R*.45,h+2.65],[R*.22,h+2.95],[0,h+3]], 44), {top:'#9aaea4', bottom:'#4a5a52'});
    part('glass', new THREE.CylinderGeometry(R*1.006, R*1.006, .46, 48, 1, true), {p:[0, h+1.5, 0], uv:[R*6.28/5, .25]});
    part('glass', new THREE.SphereGeometry(R*.24, 20, 8, 0, Math.PI*2, 0, Math.PI/2), {p:[0, h+2.85, 0], uv:[2, 1]});
    if (pod){
      part('solid', lathe([[0,-R*.55],[R*.12,-R*.42],[R*.22,-R*.15],[R*.26,0]], 20), {p:[0, h, 0]});
      part('glass', new THREE.CylinderGeometry(R*.24, R*.21, .5, 24, 1, true), {p:[0, h - R*.13, 0], uv:[2, .2]});
    }
    spire(h + 2.95, h*.28, R*.05 + .12, tip);
    return {r:R*.45 + .8, top:h + 3 + h*.28};
  }

  // tall tapered needle with blue glass slits and a collar
  function needleTower(x, z, {h = 60, r = 3, ry = 0, tip = '#4af2a1'} = {}){
    setFrame(x, z, ry);
    const prof = [[r*1.55,0],[r*1.5,1.2],[r*1.06,h*.12],[r*.9,h*.55],[r*.56,h*.8],[r*.22,h*.94],[.04,h]];
    part('solid', lathe(prof, 32));
    for (let k = 0; k < 3; k++){
      const th = k*Math.PI*2/3;
      part('glass', new THREE.CylinderGeometry(radiusAt(prof, h*.5) + .06, radiusAt(prof, h*.15) + .06, h*.35, 6, 1, true, th - .2, .4), {p:[0, h*.325, 0], uv:[.5, h*.35/5]});
    }
    part('solid', new THREE.TorusGeometry(radiusAt(prof, h*.62) + r*.12, r*.15, 8, 36), {p:[0, h*.62, 0], r:[Math.PI/2, 0, 0]});
    part('glass', new THREE.CylinderGeometry(radiusAt(prof, h*.66) + .05, radiusAt(prof, h*.64) + .05, h*.02, 24, 1, true), {p:[0, h*.65, 0], uv:[3, .2]});
    part('glow', new THREE.SphereGeometry(.35, 8, 6), {p:[0, h, 0], top:tip, bottom:tip});
    return {r:r*1.55 + .6, top:h};
  }

  function pill(w, d){
    const r = Math.min(w, d)*.49, s = new THREE.Shape(), hw = w/2, hd = d/2;
    s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.absarc(hw - r, -hd + r, r, -Math.PI/2, 0);
    s.lineTo(hw, hd - r); s.absarc(hw - r, hd - r, r, 0, Math.PI/2);
    s.lineTo(-hw + r, hd); s.absarc(-hw + r, hd - r, r, Math.PI/2, Math.PI);
    s.lineTo(-hw, -hd + r); s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI*1.5);
    return s;
  }
  // rounded "pill" skyscraper with full-height blue glass strips (front + back)
  function pillTower(x, z, {w = 12, h = 80, ry = 0, tip = '#2cff88'} = {}){
    setFrame(x, z, ry);
    const d = w*.6;
    part('solid', new THREE.ExtrudeGeometry(pill(w, d), {depth:h, bevelEnabled:false, curveSegments:10}), {r:[-Math.PI/2, 0, 0], bottom:'#2a3832'});
    [1, -1].forEach(sd => part('glass', new THREE.BoxGeometry(w*.2, h*.9, .3), {p:[0, h*.48, sd*d/2], uv:[w*.2/5, h*.9/5]}));
    part('glass', new THREE.BoxGeometry(w*.04, h*.7, d*1.02), {p:[w*.28, h*.42, 0], uv:[.2, h*.7/5]});
    part('solid', new THREE.ExtrudeGeometry(pill(w*.62, d*.62), {depth:4, bevelEnabled:false, curveSegments:8}), {p:[0, h, 0], r:[-Math.PI/2, 0, 0]});
    part('glass', new THREE.ExtrudeGeometry(pill(w*.64, d*.64), {depth:1, bevelEnabled:false, curveSegments:8}), {p:[0, h + 1.6, 0], r:[-Math.PI/2, 0, 0], uv:[.3, .3]});
    spire(h + 4, h*.16, .3, tip);
    return {r:w*.52 + .6, top:h + 4 + h*.16};
  }

  function domeHall(x, z, {r = 10} = {}){
    setFrame(x, z, 0);
    part('solid', new THREE.SphereGeometry(r, 36, 14, 0, Math.PI*2, 0, Math.PI/2), {s:[1, .5, 1], bottom:'#3a4a42'});
    part('glass', new THREE.CylinderGeometry(r*1.003, r*1.003, r*.1, 48, 1, true), {p:[0, r*.05, 0], uv:[r*6.28/5, .3]});
    part('glass', new THREE.SphereGeometry(r*.3, 20, 8, 0, Math.PI*2, 0, Math.PI/2), {p:[0, r*.46, 0], s:[1, .6, 1], uv:[2, 1]});
    part('solid', new THREE.TorusGeometry(r*1.06, .4, 6, 56), {p:[0, .2, 0], r:[Math.PI/2, 0, 0]});
    return {r:r*1.1, top:r*.5};
  }

  // stepped stack of rounded discs with glass bands between
  function stackTower(x, z, {r = 6, n = 6, tip = '#4af2a1'} = {}){
    setFrame(x, z, 0);
    let y = 0, ri = r;
    for (let i = 0; i < n; i++){
      ri = r*(1 - i*.11);
      part('solid', new THREE.CylinderGeometry(ri*.95, ri, 3.4, 36), {p:[0, y + 1.7, 0]});
      part('glass', new THREE.CylinderGeometry(ri*.88, ri*.88, 1.1, 36, 1, true), {p:[0, y + 3.95, 0], uv:[ri*6.28/5, .25]});
      y += 4.5;
    }
    part('solid', new THREE.CylinderGeometry(ri*.4, ri*.75, 1.6, 24), {p:[0, y + .8, 0]});
    spire(y + 1.6, 8 + r, .2, tip);
    return {r:r + .6, top:y + 9 + r};
  }

  // slender spire wrapped by floating light rings
  function ringSpire(x, z, {h = 34, c = '#4af2a1'} = {}){
    setFrame(x, z, 0);
    part('solid', lathe([[1.6,0],[1.3,1.2],[.55,h*.3],[.38,h*.9],[0,h]], 20));
    [[.42, 2.6], [.58, 2.1], [.74, 1.6]].forEach(([k, rr]) => part('glow', new THREE.TorusGeometry(rr, .06, 6, 48), {p:[0, h*k, 0], r:[Math.PI/2, 0, 0], top:c, bottom:c}));
    return {r:1.8, top:h};
  }

  // futuristic tree: white stalk with a faceted glowing-tinted canopy
  function bioTree(x, z, {s = 1, c1 = '#4af2a1', c2 = '#0b5a3a'} = {}){
    setFrame(x, z, rand()*6);
    part('solid', new THREE.CylinderGeometry(.12*s, .24*s, 3.2*s, 6), {p:[0, 1.6*s, 0]});
    part('solid', new THREE.IcosahedronGeometry(1.5*s, 1), {p:[0, 3.9*s, 0], s:[1, .78, 1], top:c1, bottom:c2, flat:true});
    part('solid', new THREE.IcosahedronGeometry(.8*s, 0), {p:[.9*s, 3.0*s, .3*s], top:c1, bottom:c2, flat:true});
    return {r:1.1*s, top:5*s};
  }

  function lamp(x, z, {ry = 0, c = '#4af2a1'} = {}){
    setFrame(x, z, ry);
    part('solid', lathe([[.2,0],[.12,.5],[.07,4.6],[0,4.75]], 8));
    part('solid', new THREE.BoxGeometry(.08, .08, 1.3), {p:[0, 4.45, .6]});
    part('glow', new THREE.CylinderGeometry(.28, .12, .18, 10), {p:[0, 4.3, 1.2], top:c, bottom:c});
    part('glow', new THREE.TorusGeometry(.32, .04, 4, 16), {p:[0, 4.75, 0], r:[Math.PI/2, 0, 0], top:c, bottom:c});
    return {r:.45, top:4.8};
  }

  function end(scene, mats, {shadow = true} = {}){
    const out = {};
    Object.keys(parts).forEach(k => {
      const list = parts[k]; if (!list.length) return;
      let geo = null;
      try { geo = THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeBufferGeometries(list, false) : null; } catch(e){ geo = null; }
      if (geo){
        const m = new THREE.Mesh(geo, mats[k]);
        if (k === 'solid' && shadow){ m.castShadow = true; m.receiveShadow = true; }
        scene.add(m); out[k] = m;
      } else {
        const g = new THREE.Group(); list.forEach(gg => { const m = new THREE.Mesh(gg, mats[k]); if (k === 'solid' && shadow){ m.castShadow = m.receiveShadow = true; } g.add(m); });
        scene.add(g); out[k] = g;
      }
    });
    parts = null;
    return out;
  }

  // blue curtain-wall glass: a grid of panes, a few warm lit windows
  function windowTexture(){
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#010805'; g.fillRect(0, 0, 256, 256);
    const tones = ['#06261a','#0a3a26','#0e5236','#137048','#1c9a5e','#2fd47a'];
    seed = 99;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++){
      const r = rand();
      g.fillStyle = r > .95 ? '#e6cc8a' : r > .9 ? '#9dffcb' : tones[Math.floor(rand()*tones.length)];
      g.fillRect(x*32 + 2, y*16 + 2, 28, 12);
      g.fillStyle = 'rgba(200,255,225,.10)'; g.fillRect(x*32 + 2, y*16 + 2, 28, 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  }

  return {begin, end, part, lathe, saucerTower, needleTower, pillTower, domeHall, stackTower, ringSpire, bioTree, lamp, windowTexture, setFrame};
})();
