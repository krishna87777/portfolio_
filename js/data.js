'use strict';
/* =====================================================================
   EDIT ME: everything personal lives here. Empty links show as dashed
   "not added yet" buttons instead of broken links.
   ===================================================================== */
const CONFIG = {
  name: 'Krishna Pandey',
  shortName: 'Krishna',
  role: 'ML Engineer',
  tagline: 'I train small models to do big things.',
  location: 'India',
  email: '',      // e.g. 'you@example.com'
  github: '',     // e.g. 'https://github.com/you'
  linkedin: '',   // e.g. 'https://linkedin.com/in/you'
  resume: '',     // e.g. 'resume.pdf'
};

/* Every number below comes from the project cards in ../TEMPLATE_PROMPT.md. */
const PROJECTS = [
  {
    id:'sql', title:'Text-to-SQL for a ClickHouse warehouse', short:'Text-to-SQL',
    problem:'Turn plain-English business questions into correct ClickHouse SQL over a warehouse with 1,872 columns (main fact table: 455 columns, 7.68M order lines).',
    tags:['Qwen2.5-Coder-1.5B','QLoRA · NF4','GRPO','Liger kernels','ClickHouse'],
    rail:[['Base · 1.54B · 28 layers','#9fb5aa'],['4-bit NF4 · 2.94→1.13 GB','#4af2a1'],['26,377 Q/SQL pairs','#ffc67b'],['QLoRA r16 α32','#7fe0b4'],['SFT · 81.2% EX','#5fd3a0'],['GRPO · 82.4% EX','#e6cc8a']],
    stats:[['0% → 82.4%','test execution accuracy'],['12.5% → 98.4%','executable SQL'],['6 GB','laptop GPU was enough to train']],
    metrics:[
      {label:'Test execution accuracy · base → SFT → GRPO', steps:[[0,'base'],[81.2,'SFT'],[82.4,'GRPO']], unit:'%'},
      {label:'Executable SQL', steps:[[12.5,'base'],[98.4,'tuned']], unit:'%'},
    ],
    curve:{label:'Learning curve · dev execution accuracy', pts:[29.3,45.0,66.3,74.3,80.3]},
    notes:[
      'Schema pruned from <b>15,374 → 2,262 tokens</b> (6.8x smaller) at 99.0% example-perfect recall.',
      'Liger fused cross-entropy cut a seq-1024 step from <b>3.40 GB → 1.57 GB</b>; max sequence 1024 → 6144.',
      'Laptop run: 14,852 samples on an RTX 4050 6 GB in 14.19 h → test EX 76.4%.',
      'GRPO with an execution-only reward, 6 rollouts per prompt, over 6,361 unseen prompts: <b>81.2% → 82.4%</b>.',
      'A fine-tuned 0.5B model beat a 120B prompt-only model 2–3x on hard / seen / unseen schemas (80/95/85 vs 20/30/40).',
    ],
  },
  {
    id:'ocr', title:'Multilingual OCR · 5 scripts, one model', short:'Multilingual OCR',
    problem:'Read English, Hindi, Bengali, Tamil and Telugu, printed and handwritten, fast on a plain CPU.',
    tags:['PP-OCRv6 small','SVTR + CTC','ONNX Runtime','Weight averaging','Synthetic data'],
    rail:[['Base · ~3.12M params','#9fb5aa'],['Head surgery 18,710→729','#4af2a1'],['683,172 line images','#ffc67b'],['Full FT v1→v6','#5fd3a0'],['v5+v6 averaged','#7fe0b4'],['ONNX · CPU','#ffffff']],
    stats:[['5% → 94.0%','handwritten Tamil word accuracy'],['12.5 MB','one model, 5 scripts'],['35–80x','faster than VLM OCR on CPU']],
    langs:[['Tamil','5','94.0'],['English','64.6','85.8'],['Hindi','8.3','77.5'],['Bengali',null,'84.8'],['Telugu',null,'75.3']], // strings keep the card's exact digits
    metrics:[{label:'Numbers read exactly', steps:[[84.3,'stock'],[98.5,'ours']], unit:'%'}],
    notes:[
      '683,172 real labelled images: 320,234 printed Indic + 362,938 handwritten, plus synthetic lines from 44+ fonts.',
      'Printed digital PDFs: <b>97.2–100%</b> across all 5 languages.',
      'Trained on an RTX 4050 Laptop 6 GB, peak 3.85 GB VRAM, ~1.4–2.7 h per version.',
      'CPU-only pipeline at <b>~1.66–2 s per page</b>, 35–80x faster than 0.9B-param VLM OCR on the same CPU.',
    ],
  },
];

const SKILLS = ['QLoRA / LoRA','GRPO (RL)','4-bit NF4','Liger kernels','Text-to-SQL','ClickHouse','OCR','PaddleOCR','ONNX Runtime','CPU inference','Synthetic data','Weight averaging','S3 checkpoints','three.js','Web Audio'];

/* ---------------------------------------------------------------- utils */
const $ = s => document.querySelector(s);
const html = document.documentElement;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const damp = (a,b,k,dt) => lerp(a, b, 1 - Math.exp(-k*dt));
const store = {
  get(k, d){ try { const v = localStorage.getItem('ls.'+k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('ls.'+k, JSON.stringify(v)); } catch(e){} },
};
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fmtTime = s => s == null ? '—' : `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`;
const ordinal = n => ['th','st','nd','rd'][(n%100 > 10 && n%100 < 14) ? 0 : (n%10 < 4 ? n%10 : 0)] || 'th';

/* ---------------------------------------------------------------- world layout */
const R_ISLAND = 175;   // the floating city disc
const RING = 142;       // outer ring boulevard
const AREAS = [
  {id:'home',    label:'Landing',          tab:'home',         x:0,    z:0,   r:0,   cam:'CAM-00 // LANDING'},
  {id:'sql',     label:'Text-to-SQL',      tab:'projects', project:0, x:-62, z:-38, r:5, cam:'CAM-01 // TEXT-TO-SQL'},
  {id:'ocr',     label:'Multilingual OCR', tab:'projects', project:1, x:62,  z:-40, r:5, cam:'CAM-02 // OCR'},
  {id:'lab',     label:'Neural Core',      tab:'lab',          x:0,    z:-90, r:6,   cam:'CAM-03 // NEURAL CORE'},
  {id:'skills',  label:'Skill Ring',       tab:'skills',       x:-80,  z:46,  r:4.5, cam:'CAM-04 // SKILLS'},
  {id:'career',  label:'Career Terminal',  tab:'career',       x:78,   z:48,  r:4,   cam:'CAM-05 // CAREER'},
  {id:'trophy',  label:'Achievements',     tab:'achievements', x:0,    z:86,  r:4,   cam:'CAM-06 // TROPHIES'},
  {id:'contact', label:'Contact Beacon',   tab:'contact',      x:-118, z:-8,  r:3,   cam:'CAM-07 // BEACON'},
  {id:'race',    label:'Sky Race Arena',   tab:'race',         x:116,  z:-6,  r:10,  cam:'CAM-08 // SKY RACE'},
];
// extra road nodes on the ring boulevard
const NODES = AREAS.concat([
  {id:'rW', x:-RING, z:-8}, {id:'rE', x:RING, z:-6}, {id:'rN', x:0, z:-RING}, {id:'rS', x:0, z:RING},
]);
const ROADS = [['home','sql'],['home','ocr'],['home','lab'],['home','skills'],['home','career'],['home','trophy'],
  ['sql','contact'],['sql','lab'],['ocr','lab'],['ocr','race'],['skills','contact'],['career','race'],['skills','trophy'],['career','trophy'],
  ['contact','rW'],['race','rE'],['lab','rN'],['trophy','rS']];
const nodeById = id => NODES.find(a => a.id === id);
const areaById = id => AREAS.find(a => a.id === id);
function roadPath(a, b){ // 45-degree "PCB trace" routing
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.min(Math.abs(dx), Math.abs(dz));
  const mx = a.x + Math.sign(dx)*d, mz = a.z + Math.sign(dz)*d;
  return [[a.x,a.z],[mx,mz],[b.x,b.z]];
}
function distSeg(x, z, [x1,z1], [x2,z2]){ const dx = x2-x1, dz = z2-z1, l = dx*dx + dz*dz || 1; const t = clamp(((x-x1)*dx + (z-z1)*dz)/l, 0, 1); return Math.hypot(x - (x1 + t*dx), z - (z1 + t*dz)); }
function distToRoads(x, z){
  let d = Math.abs(Math.hypot(x, z) - RING);
  ROADS.forEach(([ia, ib]) => { const p = roadPath(nodeById(ia), nodeById(ib)); d = Math.min(d, distSeg(x, z, p[0], p[1]), distSeg(x, z, p[1], p[2])); });
  return d;
}

/* World modes: sky, fog, key light, shadow tint (shadows are tinted, never grey) and glow strength. */
const PRESETS = [
  {key:'emerald',  name:'Emerald',   reveal:'#3dff8f', skyTop:'#020a06', skyMid:'#0a2a1c', skyLow:'#1d5a3e', fog:'#123526', light:'#effff7', li:1.2, hemiSky:'#9fdcbc', shadow:'#163d2c', electric:1.15, bloom:.5,  thr:.7},
  {key:'jade',     name:'Jade Dusk', reveal:'#e6cc8a', skyTop:'#04100b', skyMid:'#16402f', skyLow:'#4a7a56', fog:'#1f4434', light:'#fff0d2', li:1.05, hemiSky:'#b8d8b8', shadow:'#1d4030', electric:1.05, bloom:.5,  thr:.72},
  {key:'obsidian', name:'Obsidian',  reveal:'#2cff88', skyTop:'#000201', skyMid:'#03110b', skyLow:'#0b2a1c', fog:'#06170f', light:'#8affc4', li:.7,  hemiSky:'#3f7a5e', shadow:'#082418', electric:1.6, bloom:.8,  thr:.5},
  {key:'aurora',   name:'Aurora',    reveal:'#7fffd4', skyTop:'#03101a', skyMid:'#0d4a3a', skyLow:'#2a9a6a', fog:'#18473a', light:'#e2fff6', li:1.0,  hemiSky:'#a8e8cc', shadow:'#164a3a', electric:1.1, bloom:.5,  thr:.72},
];

const ACHIEVEMENTS = [
  {id:'hello',   title:'Hello, World!',                  desc:'Initialize the simulation.', goal:1},
  {id:'explore', title:'Attention Is All You Need',      desc:'Discover every area.', goal:9},
  {id:'read',    title:'Peer Reviewed',                  desc:'Open both project deep-dives.', goal:2},
  {id:'boost',   title:'Learning Rate Too High',         desc:'Boost for 10 seconds in total.', goal:10},
  {id:'ping',    title:'Is This Thing On?',              desc:'Send 10 sonar pings.', goal:10},
  {id:'cubes',   title:'Data Augmentation',              desc:'Scatter 20 data cubes.', goal:20},
  {id:'laps',    title:'Overfitting',                    desc:'Circle the Neural Core 3 times.', goal:3},
  {id:'ring',    title:'Full Epoch',                     desc:'Drive one full lap of the ring boulevard.', goal:1},
  {id:'edge',    title:'Out of Distribution',            desc:'Reach the edge of the sky city.', goal:1},
  {id:'modes',   title:'Night Shift',                    desc:'See all 4 world modes.', goal:4},
  {id:'warp',    title:'Skip Connection',                desc:'Fast-travel from the map.', goal:1},
  {id:'air',     title:'Escape Velocity',                desc:'Hop 20 times.', goal:20},
  {id:'race',    title:'Converged',                      desc:'Finish a sky race.', goal:1},
  {id:'win',     title:'Global Minimum',                 desc:'Win a sky race against the optimizers.', goal:1},
  {id:'gates',   title:'Gradient Boosting',              desc:'Fly through 20 boost gates.', goal:20},
  {id:'music',   title:'Latent Vibes',                   desc:'Listen to the generated soundtrack for 2 minutes.', goal:120},
  {id:'debug',   title:"It's Not a Bug, It's a Feature", desc:'Open the debug overlay.', goal:1},
  {id:'halluc',  title:'Hallucination',                  desc:"This one can't be achieved.", goal:1},
];
