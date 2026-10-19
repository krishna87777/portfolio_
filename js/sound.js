'use strict';
/* =====================================================================
   SOUND: all synthesized with Web Audio. No audio files.
   ===================================================================== */
const Sound = (() => {
  let ctx = null, master, sfx, musicBus, verb, noiseBuf, delay;
  let muted = store.get('muted', false);
  let eng = null, musicOn = false, musicTimer = null, nextNote = 0, step = 0;
  const lastPlayed = {};
  html.classList.toggle('is-audio-muted', muted);

  function init(){
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.7; sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    // generated stereo impulse response = spacey reverb
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 3.2); }
    verb.buffer = ir;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.45; verb.connect(verbOut).connect(master);
    // ping-pong-ish delay for plucks and sonar
    delay = ctx.createDelay(1); delay.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.38; const dl = ctx.createBiquadFilter(); dl.frequency.value = 2400;
    delay.connect(dl).connect(fb).connect(delay); dl.connect(verb); dl.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random()*2-1;
  }
  const ok = () => ctx && ctx.state !== 'closed';
  const throttleKey = (k, ms) => { const n = performance.now(); if (lastPlayed[k] && n - lastPlayed[k] < ms) return false; lastPlayed[k] = n; return true; };

  // one-shot oscillator voice with envelope, optional pitch glide, filter, sends
  function tone({type='sine', f=440, f2=null, dur=.2, vol=.2, at=0, attack=.005, cutoff=null, q=1, rev=0, echo=0, detune=0, bus=null}){
    if (!ok()) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20,f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff){ const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = q; node.connect(fl); node = fl; }
    node.connect(g); g.connect(bus || sfx);
    if (rev){ const s = ctx.createGain(); s.gain.value = rev; g.connect(s).connect(verb); }
    if (echo){ const s = ctx.createGain(); s.gain.value = echo; g.connect(s).connect(delay); }
    o.start(t); o.stop(t + dur + .05);
  }
  function noise({dur=.3, vol=.2, at=0, type='bandpass', f=1200, f2=null, q=1, attack=.01, rev=0}){
    if (!ok()) return;
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(sfx);
    if (rev){ const r = ctx.createGain(); r.gain.value = rev; g.connect(r).connect(verb); }
    s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  const midi = n => 440 * Math.pow(2, (n - 69)/12);

  const api = {
    init,
    get muted(){ return muted; },
    toggleMute(){
      muted = !muted; store.set('muted', muted); html.classList.toggle('is-audio-muted', muted);
      if (ok()) master.gain.setTargetAtTime(muted ? 0 : .9, ctx.currentTime, .08);
      if (!muted) api.click();
    },
    // UI
    hover(){ if (throttleKey('hover', 45)) tone({type:'sine', f:2400, f2:2900, dur:.045, vol:.035}); },
    click(){ tone({type:'square', f:660, dur:.05, vol:.05, cutoff:3000}); tone({type:'square', f:990, at:.045, dur:.07, vol:.045, cutoff:3000}); },
    open(){ noise({dur:.35, vol:.12, f:400, f2:4200, q:2.5, attack:.05, rev:.4}); tone({type:'triangle', f:midi(81), at:.12, dur:.5, vol:.06, rev:.6, echo:.25}); tone({type:'triangle', f:midi(88), at:.18, dur:.5, vol:.04, rev:.6}); },
    close(){ noise({dur:.28, vol:.09, f:3600, f2:300, q:2.5, attack:.02, rev:.3}); tone({type:'sine', f:880, f2:440, dur:.18, vol:.05}); },
    tab(){ tone({type:'triangle', f:1320, dur:.06, vol:.05}); tone({type:'sine', f:1760, at:.03, dur:.08, vol:.03, rev:.3}); },
    toast(){ tone({type:'triangle', f:midi(84), dur:.25, vol:.07, rev:.4}); tone({type:'triangle', f:midi(91), at:.08, dur:.35, vol:.06, rev:.5, echo:.2}); },
    achieve(){ [72,76,79,84,88].forEach((n,i) => tone({type:'triangle', f:midi(n), at:i*.075, dur:.5, vol:.08, rev:.5, echo:.25})); tone({type:'sawtooth', f:midi(48), dur:1.2, vol:.05, cutoff:900, rev:.6}); noise({dur:.8, vol:.05, f:6000, type:'highpass', at:.3, rev:.8}); },
    type(){ if (throttleKey('type', 28)) tone({type:'square', f:1800 + Math.random()*600, dur:.018, vol:.018, cutoff:5000}); },
    // world
    boot(){
      if (!ok()) return;
      tone({type:'sawtooth', f:55, f2:220, dur:1.6, vol:.12, attack:.4, cutoff:1200, rev:.5});
      tone({type:'sawtooth', f:55.4, f2:221, dur:1.6, vol:.1, attack:.4, cutoff:1200, detune:12});
      noise({dur:1.6, vol:.14, f:200, f2:7000, q:1.4, attack:1.2, rev:.6});
      [57,64,69,72,76].forEach((n,i) => tone({type:'triangle', f:midi(n), at:1.25 + i*.06, dur:2.6, vol:.06, rev:.8, attack:.02}));
      tone({type:'sine', f:midi(33), at:1.25, dur:2.2, vol:.25});
    },
    boost(){ noise({dur:.6, vol:.18, f:500, f2:3000, q:1.5, attack:.03, rev:.3}); tone({type:'sawtooth', f:180, f2:520, dur:.5, vol:.07, cutoff:2000}); },
    jump(){ tone({type:'sine', f:260, f2:780, dur:.22, vol:.12}); noise({dur:.2, vol:.06, f:2000, f2:5000, q:2}); },
    land(v){ tone({type:'sine', f:120, f2:40, dur:.25, vol:clamp(v,.05,.28)}); noise({dur:.18, vol:clamp(v*.4,.02,.12), f:600, type:'lowpass'}); },
    ping(){ tone({type:'sine', f:1320, dur:.6, vol:.14, echo:.55, rev:.5}); tone({type:'sine', f:1980, dur:.3, vol:.04, echo:.4}); },
    hit(v=1){ if (!throttleKey('hit', 60)) return; noise({dur:.25, vol:.16*v, f:900, f2:200, q:.8, type:'lowpass'}); tone({type:'square', f:220 + Math.random()*80, f2:60, dur:.18, vol:.06*v, cutoff:1500}); tone({type:'triangle', f:midi(76 + Math.floor(Math.random()*5)*2), at:.02, dur:.2, vol:.03*v, rev:.4}); },
    bump(){ if (throttleKey('bump', 250)) { tone({type:'sine', f:90, f2:50, dur:.2, vol:.2}); noise({dur:.12, vol:.08, f:400, type:'lowpass'}); } },
    discover(){ [76,83,88].forEach((n,i) => tone({type:'sine', f:midi(n), at:i*.09, dur:.6, vol:.07, rev:.6, echo:.3})); },
    near(){ if (throttleKey('near', 400)) tone({type:'sine', f:1760, dur:.08, vol:.05, rev:.3}); },
    warp(){ noise({dur:1, vol:.18, f:150, f2:8000, q:3, attack:.6, rev:.7}); tone({type:'sawtooth', f:80, f2:1600, dur:.9, vol:.08, cutoff:3000, attack:.4}); tone({type:'sine', f:midi(84), at:.9, dur:1, vol:.1, rev:.8, echo:.3}); },
    mode(){ [60,67,74,79].forEach((n,i) => tone({type:'sawtooth', f:midi(n), at:i*.05, dur:.9, vol:.04, cutoff:1800, rev:.6})); noise({dur:.9, vol:.06, f:300, f2:5000, q:4, attack:.3}); },
    reveal(){ noise({dur:2.2, vol:.12, f:120, f2:2400, q:.7, attack:.2, rev:.8}); tone({type:'sine', f:midi(45), dur:2.4, vol:.18, attack:.1}); },
    edge(){ if (throttleKey('edge', 600)) { tone({type:'square', f:200, dur:.12, vol:.06, cutoff:900}); tone({type:'square', f:150, at:.13, dur:.18, vol:.06, cutoff:900}); } },

    // continuous hover-engine: sub sine + detuned saws through a lowpass, pitch follows speed
    engine(speed01, throttle, boosting, airborne){
      if (!ok()) return;
      if (!eng){
        const g = ctx.createGain(); g.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 6;
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
        o1.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 14; sub.type = 'sine';
        const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 5.5; lfoG.gain.value = 6;
        lfo.connect(lfoG); lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);
        const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuf; hiss.loop = true;
        const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2500; hf.Q.value = .8;
        const hg = ctx.createGain(); hg.gain.value = 0;
        hiss.connect(hf).connect(hg).connect(sfx);
        o1.connect(lp); o2.connect(lp); sub.connect(g); lp.connect(g); g.connect(sfx);
        [o1,o2,sub,lfo,hiss].forEach(n => n.start());
        eng = {g, lp, o1, o2, sub, hg, hf};
      }
      const t = ctx.currentTime, base = 48 + speed01*130 + (boosting ? 40 : 0);
      eng.o1.frequency.setTargetAtTime(base, t, .08);
      eng.o2.frequency.setTargetAtTime(base*1.5, t, .08);
      eng.sub.frequency.setTargetAtTime(base/2, t, .08);
      eng.lp.frequency.setTargetAtTime(300 + speed01*1800 + (throttle ? 400 : 0) + (airborne ? 900 : 0), t, .1);
      eng.g.gain.setTargetAtTime(.05 + speed01*.07 + (throttle ? .02 : 0), t, .1);
      eng.hg.gain.setTargetAtTime(boosting ? .07 : speed01*.02, t, .1);
      eng.hf.frequency.setTargetAtTime(1500 + speed01*3000, t, .1);
    },
    silenceEngine(){ if (eng && ok()) eng.g.gain.setTargetAtTime(0.0001, ctx.currentTime, .15), eng.hg.gain.setTargetAtTime(0.0001, ctx.currentTime, .15); },

    // generative ambient track: Am9 · Fmaj7 · Cmaj7 · G6, pad + arp + bass, scheduled ahead
    startMusic(){
      if (!ok() || musicOn) return; musicOn = true; nextNote = ctx.currentTime + .2; step = 0;
      const chords = [[57,60,64,67,71],[53,57,60,64,69],[48,55,59,64,67],[55,59,62,64,71]];
      const spb = 60/88/4; // 16th notes at 88 bpm
      musicTimer = setInterval(() => {
        while (nextNote < ctx.currentTime + .15){
          const bar = Math.floor(step/32) % 4, ch = chords[bar], s16 = step % 32;
          if (s16 === 0){
            ch.slice(0,4).forEach((n,i) => {
              tone({type:'sawtooth', f:midi(n), at:nextNote - ctx.currentTime, dur:spb*32 + .8, vol:.035, attack:1.2, cutoff:700 + i*90, detune:(i%2?-9:9), rev:.7, bus:musicBus});
            });
            tone({type:'sine', f:midi(ch[0]-24), at:nextNote - ctx.currentTime, dur:spb*30, vol:.18, attack:.3, bus:musicBus});
          }
          if (s16 % 2 === 0 && Math.random() > .28){
            const n = ch[(s16/2 * 3 + bar) % ch.length] + 12 + (Math.random() > .82 ? 12 : 0);
            tone({type:'triangle', f:midi(n), at:nextNote - ctx.currentTime, dur:.32, vol:.05, rev:.4, echo:.35, bus:musicBus});
          }
          if (s16 === 16 && Math.random() > .5) noise({at:nextNote - ctx.currentTime, dur:1.2, vol:.03, type:'highpass', f:5000, attack:.6, rev:.6});
          nextNote += spb; step++;
        }
      }, 30);
    },
    stopMusic(){ musicOn = false; clearInterval(musicTimer); },
    get musicOn(){ return musicOn; },

    // ---- sky race ----
    count(){ tone({type:'square', f:440, dur:.22, vol:.09, cutoff:2400}); tone({type:'sine', f:220, dur:.3, vol:.12}); },
    go(){ tone({type:'square', f:880, dur:.5, vol:.09, cutoff:3000, rev:.4}); [69,73,76,81].forEach((n,i) => tone({type:'sawtooth', f:midi(n), at:i*.03, dur:.9, vol:.035, cutoff:2400, rev:.5})); noise({dur:.8, vol:.12, f:400, f2:6000, q:1, attack:.05}); },
    gate(){ if (throttleKey('gate', 120)) { tone({type:'sine', f:1568, dur:.12, vol:.05}); tone({type:'sine', f:2093, at:.05, dur:.18, vol:.04, rev:.3}); } },
    boostGate(){ tone({type:'sawtooth', f:220, f2:880, dur:.35, vol:.08, cutoff:3000}); noise({dur:.5, vol:.15, f:600, f2:5000, q:1.5, attack:.02, rev:.3}); tone({type:'triangle', f:midi(88), at:.1, dur:.4, vol:.06, rev:.5, echo:.3}); },
    lap(){ [76,79,83].forEach((n,i) => tone({type:'triangle', f:midi(n), at:i*.08, dur:.4, vol:.08, rev:.5})); },
    finalLap(){ [0,.22,.44].forEach(t => tone({type:'square', f:988, at:t, dur:.14, vol:.06, cutoff:3000})); tone({type:'triangle', f:midi(91), at:.66, dur:.8, vol:.08, rev:.6, echo:.3}); },
    finish(place){
      const notes = place === 1 ? [72,76,79,84,88,91] : [69,72,76,81];
      notes.forEach((n,i) => tone({type:'triangle', f:midi(n), at:i*.11, dur:.9, vol:.09, rev:.6, echo:.25}));
      if (place === 1) [60,64,67].forEach(n => tone({type:'sawtooth', f:midi(n), at:.6, dur:2, vol:.04, cutoff:1800, rev:.7, attack:.2}));
      noise({dur:1.4, vol:.08, type:'highpass', f:5000, at:.3, rev:.8});
    },
    whoosh(pan = 0){
      if (!ok() || !throttleKey('whoosh', 300)) return;
      const t = ctx.currentTime, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      s.buffer = noiseBuf; fl.type = 'bandpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(300, t + .7);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.22, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .75);
      s.connect(fl).connect(g); if (p){ p.pan.value = clamp(pan, -1, 1); g.connect(p).connect(sfx); } else g.connect(sfx);
      s.start(t, Math.random()); s.stop(t + .8);
    },
    scrape(){ if (throttleKey('scrape', 110)) { noise({dur:.14, vol:.1, type:'highpass', f:2500}); tone({type:'square', f:90 + Math.random()*40, dur:.1, vol:.04, cutoff:800}); } },
    position(up){ tone({type:'sine', f:up ? 880 : 440, f2:up ? 1320 : 330, dur:.15, vol:.06}); },
  };
  return api;
})();
