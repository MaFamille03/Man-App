/* ==========================================================================
   KEGEL CONTROL — Prototype web (PWA), 100% local (aucun compte, aucun serveur)
   Flux : Questionnaire -> Profil (4 dimensions) -> Programme adaptatif (20 sem.)
          -> Séance guidée (moteur d'étapes piloté par données + vibrations)
          -> Feedback post-séance -> Tableau de bord / Progrès
   Tout est persisté en localStorage sur cet appareil.
========================================================================== */

/* ============ 0. VISUELS — motif de marque (cible) et icônes de dimension ============
   Motif de marque : anneau + point central rouge sur fond noir (identité visuelle choisie
   par l'utilisateur — mêmes proportions que l'icône PNG de l'app, voir make_icons.py),
   évoquant la précision/le contrôle plutôt qu'une image anatomique. Rendu en SVG inline
   (net à toutes les tailles). */
function brandMarkSvg(sizePx, color){
  color = color || '#DD1F2F';
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="28.1" fill="none" stroke="${color}" stroke-width="3.13"/>
    <circle cx="50" cy="50" r="5.9" fill="${color}"/>
  </svg>`;
}

/* Petites icônes de dimension — formes génériques simples (cible, flamme, feuille, bouclier),
   dessinées pour ce projet, en accord avec le style "line-icon" minimal du secteur. */
const DIM_ICON_PATHS = {
  control: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
  endurance: '<path d="M12 3c3.2 4.1 5.2 7 5.2 9.8a5.2 5.2 0 11-10.4 0C6.8 10 8.8 7.1 12 3z"/>',
  relaxation: '<path d="M4.5 19.5c8.5 0 15-6.5 15-15-8.5 0-15 6.5-15 15z"/><path d="M4.5 19.5c3-3 5.6-6 7.2-9.2"/>',
  arousalControl: '<path d="M12 3l7 2.6v5.9c0 5-3 8.4-7 9.9-4-1.5-7-4.9-7-9.9V5.6L12 3z"/>'
};
function dimIconSvg(key, size){
  size = size || 16;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${DIM_ICON_PATHS[key] || ''}</svg>`;
}

/* ============ 1. STOCKAGE ============ */
const LS_PREFIX = 'kc_v1_';
function lsGet(key, def){
  try{ const v = localStorage.getItem(LS_PREFIX + key); return v != null ? JSON.parse(v) : def; }
  catch(e){ return def; }
}
function lsSet(key, val){
  try{ localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); }catch(e){}
}
function lsRemoveAll(){
  Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k));
}

/* ============ 2. DONNÉES — dimensions, questionnaire, bibliothèque d'exercices ============ */
const DIMENSIONS = [
  { key:'control',       label:'Contrôle périnéal' },
  { key:'endurance',      label:'Endurance' },
  { key:'relaxation',     label:'Relâchement' },
  { key:'arousalControl', label:"Contrôle réflexe" }
];
const DIM_LABEL = Object.fromEntries(DIMENSIONS.map(d=>[d.key,d.label]));

const SCALE_LABELS = ['Pas du tout', 'Un peu', 'Moyennement', 'Bien', 'Tout à fait'];

const QUESTIONNAIRE = [
  { id:'c1', dim:'control', text:"Je sens clairement mon périnée se contracter quand je le sollicite." },
  { id:'c2', dim:'control', text:"Je peux déclencher une contraction du plancher pelvien à volonté, sans forcer sur les cuisses ou les fessiers." },
  { id:'c3', dim:'control', text:"J'arrive à isoler la contraction sans retenir ma respiration." },
  { id:'e1', dim:'endurance', text:"Je peux maintenir une contraction modérée plusieurs secondes sans qu'elle s'affaiblisse." },
  { id:'e2', dim:'endurance', text:"Après plusieurs contractions répétées, je ne ressens pas de fatigue excessive du périnée." },
  { id:'e3', dim:'endurance', text:"Je peux enchaîner plusieurs séries de contractions dans une même séance." },
  { id:'r1', dim:'relaxation', text:"Après une contraction, je sens mon périnée revenir complètement au repos." },
  { id:'r2', dim:'relaxation', text:"Je n'ai pas de tension permanente ou de gêne au niveau du périnée au quotidien." },
  { id:'r3', dim:'relaxation', text:"Je parviens à relâcher consciemment mon périnée quand je me concentre dessus." },
  { id:'a1', dim:'arousalControl', text:"Je me sens capable de retenir une envie pressante grâce à une contraction volontaire." },
  { id:'a2', dim:'arousalControl', text:"Je maîtrise les réactions involontaires de mon plancher pelvien lors d'un effort brusque (toux, éternuement, saut)." },
  { id:'a3', dim:'arousalControl', text:"Je me sens en contrôle de mon plancher pelvien dans les moments de forte intensité physique ou émotionnelle." }
];

/* Bibliothèque d'exercices — moteur piloté par données.
   Types d'étape reconnus par le moteur (voir SessionEngine) :
   CONTRACT / RELEASE / REST / HOLD / PULSE / RAMP_UP / RAMP_DOWN / LOOP */
const EXERCISES = [
  {
    id:'demarrage', name:'Démarrage', category:'control', level:1,
    objective:"Premier contact en douceur avec la contraction et le relâchement volontaires.",
    steps:[
      { action:'REST', duration:4000 },
      { action:'LOOP', times:4, steps:[
        { action:'RAMP_UP', duration:1500, from:0, to:0.5 },
        { action:'HOLD', duration:2000, intensity:0.5 },
        { action:'RAMP_DOWN', duration:1500, from:0.5, to:0 },
        { action:'REST', duration:2500 }
      ]},
      { action:'REST', duration:3000 }
    ]
  },
  {
    id:'pince-avant', name:'Pince avant', category:'control', level:2,
    objective:"Travailler la précision et la rapidité d'activation du plancher pelvien.",
    steps:[
      { action:'REST', duration:3000 },
      { action:'LOOP', times:6, steps:[
        { action:'RAMP_UP', duration:700, from:0, to:0.9 },
        { action:'HOLD', duration:1200, intensity:0.9 },
        { action:'RAMP_DOWN', duration:700, from:0.9, to:0 },
        { action:'REST', duration:1000 }
      ]},
      { action:'REST', duration:3000 }
    ]
  },
  {
    id:'tremblement-stable', name:'Tremblement stable', category:'control', level:4,
    objective:"Combiner rapidité et régularité pour affiner le contrôle fin.",
    steps:[
      { action:'REST', duration:3000 },
      { action:'LOOP', times:3, steps:[
        { action:'PULSE', duration:4000, count:8, intensity:0.7 },
        { action:'REST', duration:2000 }
      ]},
      { action:'REST', duration:3000 }
    ]
  },
  {
    id:'tremblement-2', name:'Tremblement 2', category:'endurance', level:2,
    objective:"Développer l'endurance par de petites contractions rapides et répétées.",
    steps:[
      { action:'REST', duration:3000 },
      { action:'LOOP', times:8, steps:[
        { action:'CONTRACT', duration:600, intensity:0.6 },
        { action:'RELEASE', duration:600 }
      ]},
      { action:'REST', duration:3000 }
    ]
  },
  {
    id:'maintien-court-2', name:'Maintien court 2', category:'endurance', level:3,
    objective:"Renforcer la capacité à maintenir une contraction modérée dans la durée.",
    steps:[
      { action:'REST', duration:3000 },
      { action:'LOOP', times:5, steps:[
        { action:'CONTRACT', duration:1000, intensity:0.75 },
        { action:'HOLD', duration:5000, intensity:0.75 },
        { action:'RELEASE', duration:1500 },
        { action:'REST', duration:2000 }
      ]},
      { action:'REST', duration:3000 }
    ]
  },
  {
    id:'respiration-relachement', name:'Respiration & relâchement', category:'relaxation', level:1,
    objective:"Apprendre à relâcher consciemment et complètement après chaque contraction.",
    steps:[
      { action:'REST', duration:4000 },
      { action:'LOOP', times:4, steps:[
        { action:'RAMP_UP', duration:2000, from:0, to:0.55 },
        { action:'HOLD', duration:2500, intensity:0.55 },
        { action:'RAMP_DOWN', duration:2500, from:0.55, to:0 },
        { action:'REST', duration:3500 }
      ]},
      { action:'REST', duration:3000 }
    ]
  },
  {
    id:'ancrage', name:'Ancrage', category:'arousalControl', level:3,
    objective:"Travailler le maintien du contrôle pelvien face à une sollicitation soutenue.",
    steps:[
      { action:'REST', duration:3000 },
      { action:'LOOP', times:4, steps:[
        { action:'RAMP_UP', duration:1000, from:0, to:0.85 },
        { action:'HOLD', duration:4000, intensity:0.85 },
        { action:'PULSE', duration:2000, count:4, intensity:0.6 },
        { action:'RELEASE', duration:1500 },
        { action:'REST', duration:2000 }
      ]},
      { action:'REST', duration:3000 }
    ]
  }
];

const STEP_LABELS = {
  CONTRACT:'Contraction', RELEASE:'Relâchement', REST:'Repos', HOLD:'Maintien',
  PULSE:'Battements', RAMP_UP:'Montée en intensité', RAMP_DOWN:'Descente en intensité'
};

const TOTAL_WEEKS = 20;
const SESSIONS_PER_WEEK = 4;
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h minimum entre deux séances

/* ============ 3. PROFIL / PROGRAMME / NIVEAUX ============ */
function getProfile(){ return lsGet('profile', null); }
function getLevels(){ return lsGet('levels', { control:1, endurance:1, relaxation:1, arousalControl:1 }); }
function setLevels(l){ lsSet('levels', l); }
function getSessions(){ return lsGet('sessions', []); }
function addSessionRecord(rec){ const s = getSessions(); s.push(rec); lsSet('sessions', s); }
function getPainStreak(){ return lsGet('painStreak', { control:0, endurance:0, relaxation:0, arousalControl:0 }); }
function setPainStreak(p){ lsSet('painStreak', p); }

function levelFromScore(score){
  if(score < 35) return 1;
  if(score < 55) return 2;
  if(score < 75) return 3;
  return 4;
}

function computeScores(answers){
  const scores = {};
  DIMENSIONS.forEach(d => {
    const qs = QUESTIONNAIRE.filter(q => q.dim === d.key);
    const sum = qs.reduce((acc,q) => acc + (answers[q.id] != null ? answers[q.id] : 2), 0);
    scores[d.key] = Math.round((sum / (qs.length * 4)) * 100);
  });
  return scores;
}

function finalizeQuestionnaire(answers){
  const scores = computeScores(answers);
  const profile = { scores, answers, createdAt: Date.now() };
  lsSet('profile', profile);
  const levels = {};
  DIMENSIONS.forEach(d => levels[d.key] = levelFromScore(scores[d.key]));
  setLevels(levels);
  if(!lsGet('programStart', null)) lsSet('programStart', Date.now());
  setPainStreak({ control:0, endurance:0, relaxation:0, arousalControl:0 });
  return profile;
}

function programDayIndex(){
  const start = lsGet('programStart', Date.now());
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}
function programWeekIndex(){ return Math.min(TOTAL_WEEKS - 1, Math.floor(programDayIndex() / 7)); }

function pickExerciseForIndex(idx, profile, levels){
  const dims = DIMENSIONS.map(d => d.key);
  const sorted = [...dims].sort((a,b) => profile.scores[a] - profile.scores[b]);
  const pattern = [sorted[0], sorted[1], sorted[0], sorted[2], sorted[1], sorted[3]];
  const dim = pattern[idx % pattern.length];
  const lvl = Math.min(4, Math.max(1, levels[dim] || 1));
  const pool = EXERCISES.filter(e => e.category === dim && e.level <= lvl);
  return (pool.length ? pool[pool.length - 1] : EXERCISES.find(e => e.category === dim)) || EXERCISES[0];
}

function getTodayExercise(){
  const profile = getProfile();
  if(!profile) return EXERCISES[0];
  return pickExerciseForIndex(programDayIndex(), profile, getLevels());
}

function unlockedExercises(){
  const levels = getLevels();
  return EXERCISES.map(e => ({ ex:e, unlocked: e.level <= Math.min(4, Math.max(1, levels[e.category] || 1)) }));
}

function canStartSession(){
  const last = lsGet('lastSessionEnd', 0);
  const remaining = MIN_INTERVAL_MS - (Date.now() - last);
  return remaining > 0 ? { ok:false, remainingMs: remaining } : { ok:true, remainingMs:0 };
}

function weekSessions(weekIdx){
  const start = lsGet('programStart', Date.now());
  const from = start + weekIdx * 7 * 86400000;
  const to = from + 7 * 86400000;
  return getSessions().filter(s => s.date >= from && s.date < to);
}

function adherencePct(){
  const dayIdx = programDayIndex();
  const plannedSoFar = Math.max(1, Math.round((dayIdx + 1) * SESSIONS_PER_WEEK / 7));
  const completed = getSessions().filter(s => s.completed).length;
  return Math.max(0, Math.min(100, Math.round((completed / plannedSoFar) * 100)));
}

function currentStreak(){
  const sessions = getSessions().filter(s => s.completed);
  if(!sessions.length) return 0;
  const days = new Set(sessions.map(s => new Date(s.date).toDateString()));
  let streak = 0;
  let cur = new Date();
  while(days.has(cur.toDateString())){
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

/* ============ 4. MOTEUR DE SÉANCE (données -> exécution) ============ */
function flattenSteps(steps){
  const out = [];
  (function walk(list){
    list.forEach(s => {
      if(s.action === 'LOOP'){
        for(let i=0;i<s.times;i++) walk(s.steps);
      } else {
        out.push(Object.assign({}, s));
      }
    });
  })(steps);
  return out;
}

function vibrate(ms){
  try{ if('vibrate' in navigator) navigator.vibrate(ms); }catch(e){}
}

function computeVisual(step, t){
  const REST_SCALE = 1, MIN_SCALE = 0.55;
  const ease = x => x < 0.3 ? (x/0.3) : 1;
  let scale = REST_SCALE, glow = 0.12, restish = false;
  const inten = step.intensity != null ? step.intensity : 0.6;
  switch(step.action){
    case 'REST':
      scale = REST_SCALE; glow = 0.08; restish = true; break;
    case 'CONTRACT':
      scale = REST_SCALE - (REST_SCALE-MIN_SCALE) * ease(t) * inten;
      glow = 0.3 + 0.7*inten; break;
    case 'RELEASE':
      scale = MIN_SCALE + (REST_SCALE-MIN_SCALE) * t;
      glow = 0.3*(1-t) + 0.08; break;
    case 'HOLD':
      scale = REST_SCALE - (REST_SCALE-MIN_SCALE) * inten;
      glow = 0.3 + 0.6*inten; break;
    case 'PULSE': {
      const cyc = 1 / Math.max(1, step.count || 4);
      const local = (t % cyc) / cyc;
      const wave = local < 0.5 ? local*2 : (1-local)*2;
      scale = REST_SCALE - (REST_SCALE-MIN_SCALE) * wave * inten;
      glow = 0.25 + 0.6*wave; break;
    }
    case 'RAMP_UP': {
      const from = step.from != null ? step.from : 0, to = step.to != null ? step.to : 1;
      const v = from + (to-from)*t;
      scale = REST_SCALE - (REST_SCALE-MIN_SCALE) * v;
      glow = 0.2 + 0.6*v; break;
    }
    case 'RAMP_DOWN': {
      const from = step.from != null ? step.from : 1, to = step.to != null ? step.to : 0;
      const v = from + (to-from)*t;
      scale = REST_SCALE - (REST_SCALE-MIN_SCALE) * v;
      glow = 0.2 + 0.6*v; break;
    }
    default: scale = REST_SCALE; restish = true;
  }
  return { scale, glow, restish };
}

class SessionEngine{
  constructor(exercise, handlers){
    this.exercise = exercise;
    this.flat = flattenSteps(exercise.steps);
    this.totalDuration = this.flat.reduce((a,s) => a + s.duration, 0);
    this.handlers = handlers || {};
    this.stepIndex = -1;
    this.paused = false;
    this.stopped = false;
    this._raf = null;
    this._stepStartTs = 0;
    this._pausedAccum = 0;
    this._pauseStartTs = 0;
    this._lastTick = -1;
    this._pendingResolve = null;
  }

  async start(){
    for(let i=0;i<this.flat.length;i++){
      if(this.stopped){ this._done('stopped'); return; }
      this.stepIndex = i;
      await this._runStep(this.flat[i]);
      if(this.stopped){ this._done('stopped'); return; }
    }
    this._done('completed');
  }

  pause(){
    if(this.paused || this.stopped) return;
    this.paused = true;
    this._pauseStartTs = performance.now();
    if(this.handlers.onPause) this.handlers.onPause();
  }
  resume(){
    if(!this.paused) return;
    this.paused = false;
    this._pausedAccum += performance.now() - this._pauseStartTs;
    if(this.handlers.onResume) this.handlers.onResume();
  }
  stop(){
    this.stopped = true;
    if(this._raf) cancelAnimationFrame(this._raf);
    // Le tick programmé vient d'être annulé : il ne pourra jamais résoudre
    // la promesse de l'étape en cours. On la résout donc nous-mêmes ici,
    // sinon start() reste bloqué indéfiniment sur son "await" et onComplete
    // n'est jamais appelé (la séance interrompue ne serait jamais enregistrée).
    if(this._pendingResolve){
      const r = this._pendingResolve;
      this._pendingResolve = null;
      r();
    }
  }

  _runStep(step){
    return new Promise((resolve) => {
      this._pendingResolve = resolve;
      this._stepStartTs = performance.now();
      this._pausedAccum = 0;
      this._lastTick = -1;
      if(this.handlers.onStepStart) this.handlers.onStepStart(step, this.stepIndex, this.flat);
      this._vibrateForStep(step);
      const finish = () => {
        this._pendingResolve = null;
        resolve();
      };
      const tick = () => {
        if(this.stopped){ finish(); return; }
        if(this.paused){ this._raf = requestAnimationFrame(tick); return; }
        const now = performance.now();
        const elapsed = now - this._stepStartTs - this._pausedAccum;
        const t = step.duration > 0 ? Math.min(1, elapsed/step.duration) : 1;
        this._frame(step, t, elapsed);
        if(t >= 1){ finish(); return; }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    });
  }

  _frame(step, t, elapsedInStep){
    const info = computeVisual(step, t);
    if(step.action === 'PULSE'){
      const cyc = step.duration / Math.max(1, step.count || 4);
      const tickIdx = Math.floor(elapsedInStep / cyc);
      if(tickIdx !== this._lastTick && (elapsedInStep % cyc) < cyc*0.5){
        this._lastTick = tickIdx;
        vibrate(Math.round(60*(step.intensity || 0.6)) + 30);
      }
    } else if(step.action === 'HOLD' && step.duration >= 2500){
      const period = 1500;
      const tickIdx = Math.floor(elapsedInStep / period);
      if(tickIdx > 0 && tickIdx !== this._lastTick && (elapsedInStep % period) < 40){
        this._lastTick = tickIdx;
        vibrate(22);
      }
    }
    const elapsedTotal = this._elapsedTotalMs(elapsedInStep);
    if(this.handlers.onFrame){
      this.handlers.onFrame({
        step, t, scale: info.scale, glow: info.glow, restish: info.restish,
        remainingStepMs: Math.max(0, step.duration - elapsedInStep),
        remainingTotalMs: Math.max(0, this.totalDuration - elapsedTotal),
        elapsedTotalMs: elapsedTotal,
        totalDurationMs: this.totalDuration
      });
    }
  }

  _elapsedTotalMs(elapsedInStep){
    let sum = 0;
    for(let i=0;i<this.stepIndex;i++) sum += this.flat[i].duration;
    return sum + Math.min(elapsedInStep, this.flat[this.stepIndex] ? this.flat[this.stepIndex].duration : 0);
  }

  _vibrateForStep(step){
    if(step.action === 'CONTRACT') vibrate(Math.round(140*(step.intensity || 0.6)) + 40);
    else if(step.action === 'RAMP_UP') vibrate(30);
  }

  _done(reason){
    if(this.handlers.onComplete) this.handlers.onComplete(reason, this.totalDuration);
  }
}

/* ============ 5. UI — helpers génériques (toast, modale) ============ */
function toast(msg){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2400);
}

function openConfirmModal({ title, message, confirmLabel, cancelLabel, danger, onConfirm }){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="confirmOverlay">
      <div class="modal-card">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-msg">${escapeHtml(message)}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="confirmCancelBtn">${escapeHtml(cancelLabel || 'Annuler')}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmOkBtn" style="${danger ? 'background:#E5484D;color:#fff;border:none;' : ''}">${escapeHtml(confirmLabel || 'Confirmer')}</button>
        </div>
      </div>
    </div>`;
  const overlay = document.getElementById('confirmOverlay');
  const close = () => { root.innerHTML = ''; };
  overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
  document.getElementById('confirmCancelBtn').addEventListener('click', close);
  document.getElementById('confirmOkBtn').addEventListener('click', () => { close(); if(onConfirm) onConfirm(); });
}

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatMMSS(ms){
  const total = Math.max(0, Math.round(ms/1000));
  const m = Math.floor(total/60), s = total%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function formatDateShort(ts){
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
}
function estimateMinutes(ex){
  return Math.max(1, Math.round(flattenSteps(ex.steps).reduce((a,s)=>a+s.duration,0) / 60000));
}

/* ============ 6. ROUTAGE / RENDU ============ */
const STATE = {
  view: 'welcome',
  qIndex: 0,
  qAnswers: {}
};

function navigate(view){ STATE.view = view; render(); window.scrollTo(0,0); }

function render(){
  const app = document.getElementById('app');
  const profile = getProfile();
  if(!profile && STATE.view !== 'welcome' && STATE.view !== 'questionnaire' && STATE.view !== 'results'){
    STATE.view = 'welcome';
  }
  let html = '';
  switch(STATE.view){
    case 'welcome': html = renderWelcome(); break;
    case 'questionnaire': html = renderQuestionnaire(); break;
    case 'results': html = renderResults(); break;
    case 'dashboard': html = renderDashboard(); break;
    case 'programme': html = renderProgramme(); break;
    case 'progress': html = renderProgress(); break;
    case 'settings': html = renderSettings(); break;
    default: html = renderWelcome();
  }
  const showNav = ['dashboard','programme','progress','settings'].includes(STATE.view);
  app.innerHTML = html + (showNav ? renderBottomNav() : '');
  wireView();
}

function renderBottomNav(){
  const tabs = [
    { id:'dashboard', ic:'🏠', label:'Accueil' },
    { id:'programme', ic:'📋', label:'Programme' },
    { id:'progress', ic:'📈', label:'Progrès' },
    { id:'settings', ic:'⚙️', label:'Réglages' }
  ];
  return `<nav class="bottom-nav">${tabs.map(t => `
    <button class="nav-tab ${STATE.view===t.id?'active':''}" data-nav="${t.id}">
      <span class="ic">${t.ic}</span><span>${t.label}</span>
    </button>`).join('')}</nav>`;
}

/* ---------- Écran d'accueil ---------- */
function renderWelcome(){
  return `
  <div class="hero-screen screen">
    <div class="hero-mark">${brandMarkSvg(46)}</div>
    <h1>Kegel Control</h1>
    <p>Un coaching guidé pour renforcer et rééduquer votre plancher pelvien : un court questionnaire, un programme qui s'adapte à vous, et des séances guidées pas à pas.</p>
    <button class="btn btn-primary btn-block" id="startQuestionnaireBtn">Commencer le questionnaire</button>
    <p class="hero-note">Ce prototype fonctionne entièrement sur votre appareil, sans compte ni connexion. Il ne remplace pas un avis médical : en cas de douleur ou de doute, consultez un professionnel de santé (sage-femme, kinésithérapeute spécialisé, médecin).</p>
  </div>`;
}

/* ---------- Questionnaire ---------- */
function renderQuestionnaire(){
  const q = QUESTIONNAIRE[STATE.qIndex];
  const pct = Math.round((STATE.qIndex / QUESTIONNAIRE.length) * 100);
  const selected = STATE.qAnswers[q.id];
  return `
  <div class="wrap screen">
    <div class="q-progress"><div class="q-progress-fill" style="width:${pct}%"></div></div>
    <span class="q-dim-tag">${DIM_LABEL[q.dim]} · ${STATE.qIndex+1}/${QUESTIONNAIRE.length}</span>
    <div class="q-text">${escapeHtml(q.text)}</div>
    <div class="q-options">
      ${SCALE_LABELS.map((lbl,i) => `
        <div class="q-option ${selected===i?'selected':''}" data-answer="${i}">
          <span>${lbl}</span>${selected===i?'<span>✓</span>':''}
        </div>`).join('')}
    </div>
    <div class="q-nav">
      ${STATE.qIndex>0 ? '<button class="btn btn-ghost" id="qPrevBtn">Précédent</button>' : ''}
      <button class="btn btn-primary" id="qNextBtn" ${selected==null?'disabled':''}>${STATE.qIndex===QUESTIONNAIRE.length-1?'Terminer':'Suivant'}</button>
    </div>
  </div>`;
}

/* ---------- Résultats du profil ---------- */
function renderResults(){
  const profile = getProfile();
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;">
      <div class="brand"><div class="brand-mark">${brandMarkSvg(20)}</div><h1>Votre profil</h1></div>
    </div>
    <div class="card">
      <h2>Résultats du questionnaire</h2>
      ${DIMENSIONS.map(d => `
        <div class="dim-row">
          <div class="dim-ic">${dimIconSvg(d.key, 15)}</div>
          <div class="dim-label">${d.label}</div>
          <div class="dim-bar"><div class="dim-bar-fill" style="width:${profile.scores[d.key]}%"></div></div>
          <div class="dim-pct">${profile.scores[d.key]}%</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <h2>Votre programme</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.55;">
        Un programme sur ${TOTAL_WEEKS} semaines vient d'être créé à partir de ces résultats. Il commence au niveau adapté à chaque dimension, et évolue séance après séance en fonction de votre ressenti (difficulté, fatigue, douleur).
      </p>
    </div>
    <button class="btn btn-primary btn-block" id="goDashboardBtn" style="margin-top:14px;">Voir mon programme</button>
  </div>`;
}

/* ---------- Tableau de bord ---------- */
function renderDashboard(){
  const profile = getProfile();
  const levels = getLevels();
  const today = getTodayExercise();
  const cooldown = canStartSession();
  const wk = programWeekIndex();
  const weekS = weekSessions(wk);
  const completedThisWeek = weekS.filter(s => s.completed).length;
  const streak = currentStreak();
  const painStreak = getPainStreak();
  const painAlert = Object.entries(painStreak).find(([,v]) => v >= 2);

  return `
  <div class="wrap screen">
    <div class="brand" style="margin-bottom:14px;">
      <div class="brand-mark">${brandMarkSvg(20)}</div>
      <div><div class="greet">Bonjour</div><div class="greet-sub" style="margin-bottom:0;">Semaine ${wk+1} / ${TOTAL_WEEKS}</div></div>
    </div>

    ${painAlert ? `
    <div class="card" style="border-color:rgba(229,72,77,.35);background:rgba(229,72,77,.06);margin-bottom:12px;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:18px;">⚠️</span>
        <p style="font-size:12.5px;line-height:1.55;color:#8a1f22;">
          Une douleur a été signalée sur plusieurs séances récentes (${DIM_LABEL[painAlert[0]]}). La progression a été mise en pause sur cette dimension. Nous vous recommandons de consulter un professionnel de santé avant de continuer.
        </p>
      </div>
    </div>` : ''}

    <div class="today-card">
      <div class="tag">Séance du jour</div>
      <h3>${escapeHtml(today.name)}</h3>
      <p>${escapeHtml(today.objective)} · ${estimateMinutes(today)} min environ</p>
      ${cooldown.ok
        ? `<button class="btn" id="startTodayBtn" data-exo="${today.id}">Commencer la séance</button>`
        : `<div class="cooldown-note">Prochaine séance disponible dans ${Math.ceil(cooldown.remainingMs/60000)} min (pause de 2h entre deux séances).</div>`}
    </div>

    <div class="stat-grid">
      <div class="stat-box"><div class="num">${completedThisWeek}/${SESSIONS_PER_WEEK}</div><div class="lbl">Séances cette semaine</div></div>
      <div class="stat-box"><div class="num">${adherencePct()}%</div><div class="lbl">Assiduité globale</div></div>
      <div class="stat-box"><div class="num">${streak}</div><div class="lbl">Jours d'affilée</div></div>
      <div class="stat-box"><div class="num">${getSessions().filter(s=>s.completed).length}</div><div class="lbl">Séances au total</div></div>
    </div>

    <div class="card">
      <h2>Cette semaine</h2>
      <div class="week-dots">
        ${Array.from({length:SESSIONS_PER_WEEK}).map((_,i) => `<div class="week-dot ${i<completedThisWeek?'done':''}">${i<completedThisWeek?'✓':i+1}</div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>Vos dimensions</h2>
      <div class="mini-dims">
        ${DIMENSIONS.map(d => `
          <div class="mini-dim-row">
            <div class="dim-ic">${dimIconSvg(d.key, 14)}</div>
            <div class="lbl">${d.label}</div>
            <div class="lvl">${[1,2,3,4].map(n => `<div class="lvl-pip ${n<=levels[d.key]?'on':''}"></div>`).join('')}</div>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

/* ---------- Programme ---------- */
function renderProgramme(){
  const wk = programWeekIndex();
  const list = unlockedExercises();
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;">
      <h1>Programme</h1><span class="sub">Semaine ${wk+1}/${TOTAL_WEEKS}</span>
    </div>
    <div class="card">
      <h2>Focus de la semaine</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.55;">
        ${SESSIONS_PER_WEEK} séances recommandées par semaine, choisies parmi les exercices débloqués ci-dessous, en priorité sur vos dimensions les plus faibles.
      </p>
    </div>
    <div class="divider-label">Séance suggérée aujourd'hui</div>
    ${renderExoItem(getTodayExercise(), true)}
    <div class="divider-label">Bibliothèque d'exercices</div>
    ${list.map(({ex,unlocked}) => renderExoItem(ex, unlocked)).join('')}
  </div>`;
}

function renderExoItem(ex, unlocked){
  return `
  <div class="exo-item ${unlocked?'':'locked'}" ${unlocked?`data-exo="${ex.id}"`:''}>
    <div class="exo-ic">${unlocked ? 'N'+ex.level : '🔒'}</div>
    <div class="exo-info">
      <div class="name">${escapeHtml(ex.name)}</div>
      <div class="meta">${DIM_LABEL[ex.category]} · niveau ${ex.level} · ${estimateMinutes(ex)} min</div>
    </div>
    <div class="exo-go">${unlocked ? '›' : ''}</div>
  </div>`;
}

/* ---------- Progrès ---------- */
function renderProgress(){
  const sessions = getSessions().slice().reverse();
  const weeksBack = 8;
  const counts = [];
  for(let i=weeksBack-1;i>=0;i--){
    const c = weekSessions(Math.max(0, programWeekIndex()-i)).filter(s=>s.completed).length;
    counts.push(c);
  }
  const max = Math.max(1, ...counts);
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Progrès</h1></div>
    <div class="card">
      <h2>Séances complétées / semaine</h2>
      <div class="chart">
        ${counts.map(c => `<div class="chart-bar"><div class="fill" style="height:${Math.max(4,(c/max)*100)}%"></div></div>`).join('')}
      </div>
      <div class="chart-labels">${counts.map((_,i)=> `<span>${i===counts.length-1?'auj.':'-'+(counts.length-1-i)}</span>`).join('')}</div>
    </div>
    <div class="card">
      <h2>Historique des séances</h2>
      ${sessions.length===0 ? '<p class="empty-note">Aucune séance enregistrée pour l\'instant.</p>' : sessions.slice(0,40).map(s => `
        <div class="hist-item">
          <div class="hist-date">${formatDateShort(s.date)}</div>
          <div class="hist-info">
            <div class="name">${escapeHtml(s.exerciseName)}</div>
            <div class="meta">${s.completed ? 'Terminée' : 'Interrompue'}${s.feedback ? ' · qualité ' + (s.feedback.quality+1) + '/5' : ''}</div>
          </div>
          ${s.feedback && s.feedback.pain>=2 ? '<span class="hist-flag" title="Douleur signalée">⚠️</span>' : ''}
        </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- Réglages ---------- */
function renderSettings(){
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Réglages</h1></div>
    <div class="card">
      <div class="settings-row">
        <div><div class="lbl">Refaire le questionnaire</div><div class="desc">Recalcule votre profil et vos niveaux de départ.</div></div>
        <button class="btn btn-ghost btn-sm" id="retakeBtn">Refaire</button>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Réinitialiser les données</div><div class="desc">Efface le profil, le programme et l'historique de cet appareil.</div></div>
        <button class="btn btn-danger btn-sm" id="resetBtn">Réinitialiser</button>
      </div>
    </div>
    <div class="card">
      <h2>À propos</h2>
      <p class="disclaimer">
        Kegel Control est un prototype d'entraînement du plancher pelvien fonctionnant entièrement sur cet appareil, sans compte ni envoi de données. Il propose un accompagnement progressif mais ne constitue pas un avis médical. En cas de douleur, d'incontinence sévère, de descente d'organe ou de doute, consultez un professionnel de santé (sage-femme, kinésithérapeute spécialisé en rééducation périnéale, médecin) avant de poursuivre.
      </p>
    </div>
  </div>`;
}

/* ============ 7. ÉVÉNEMENTS DE VUE ============ */
function wireView(){
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-nav')));
  });

  if(STATE.view === 'welcome'){
    const b = document.getElementById('startQuestionnaireBtn');
    if(b) b.addEventListener('click', () => { STATE.qIndex=0; STATE.qAnswers={}; navigate('questionnaire'); });
  }

  if(STATE.view === 'questionnaire'){
    document.querySelectorAll('.q-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const q = QUESTIONNAIRE[STATE.qIndex];
        STATE.qAnswers[q.id] = parseInt(opt.getAttribute('data-answer'), 10);
        render();
      });
    });
    const prev = document.getElementById('qPrevBtn');
    if(prev) prev.addEventListener('click', () => { STATE.qIndex--; render(); });
    const next = document.getElementById('qNextBtn');
    if(next) next.addEventListener('click', () => {
      if(STATE.qIndex < QUESTIONNAIRE.length-1){ STATE.qIndex++; render(); }
      else { finalizeQuestionnaire(STATE.qAnswers); navigate('results'); }
    });
  }

  if(STATE.view === 'results'){
    const b = document.getElementById('goDashboardBtn');
    if(b) b.addEventListener('click', () => navigate('dashboard'));
  }

  if(STATE.view === 'dashboard'){
    const b = document.getElementById('startTodayBtn');
    if(b) b.addEventListener('click', () => launchSession(b.getAttribute('data-exo')));
  }

  if(STATE.view === 'programme'){
    document.querySelectorAll('.exo-item[data-exo]').forEach(el => {
      el.addEventListener('click', () => {
        const cd = canStartSession();
        if(!cd.ok){ toast(`Pause requise : encore ${Math.ceil(cd.remainingMs/60000)} min avant la prochaine séance.`); return; }
        launchSession(el.getAttribute('data-exo'));
      });
    });
  }

  if(STATE.view === 'settings'){
    const retake = document.getElementById('retakeBtn');
    if(retake) retake.addEventListener('click', () => {
      openConfirmModal({
        title: 'Refaire le questionnaire ?',
        message: "Votre profil et vos niveaux de départ seront recalculés. L'historique de vos séances est conservé.",
        confirmLabel: 'Refaire',
        onConfirm: () => { STATE.qIndex=0; STATE.qAnswers={}; navigate('questionnaire'); }
      });
    });
    const reset = document.getElementById('resetBtn');
    if(reset) reset.addEventListener('click', () => {
      openConfirmModal({
        title: 'Réinitialiser toutes les données ?',
        message: "Cette action efface définitivement votre profil, votre programme et l'historique de vos séances sur cet appareil. Elle est irréversible.",
        confirmLabel: 'Réinitialiser',
        danger: true,
        onConfirm: () => { lsRemoveAll(); toast('Données réinitialisées'); navigate('welcome'); }
      });
    });
  }
}

/* ============ 8. ÉCRAN DE SÉANCE GUIDÉE ============ */
let activeEngine = null;

function launchSession(exerciseId){
  const cd = canStartSession();
  if(!cd.ok){ toast(`Pause requise : encore ${Math.ceil(cd.remainingMs/60000)} min avant la prochaine séance.`); return; }
  const ex = EXERCISES.find(e => e.id === exerciseId);
  if(!ex) return;
  renderSessionShell(ex);
  const engine = new SessionEngine(ex, {
    onStepStart: (step) => updateSessionPhase(step),
    onFrame: (info) => updateSessionFrame(info),
    onPause: () => setSessionButtonState(true),
    onResume: () => setSessionButtonState(false),
    onComplete: (reason) => onSessionComplete(ex, reason)
  });
  activeEngine = engine;
  engine.start();
}

function renderSessionShell(ex){
  const flat = flattenSteps(ex.steps);
  const root = document.getElementById('sessionRoot');
  root.innerHTML = `
  <div class="session-overlay">
    <div class="session-top">
      <div class="session-exo-name">${escapeHtml(ex.name)}</div>
      <button class="session-close" id="sessionCloseBtn">✕</button>
    </div>
    <div class="session-mid">
      <div class="session-timer" id="sessionTimer">${formatMMSS(flat.reduce((a,s)=>a+s.duration,0))}</div>
      <div class="session-phase" id="sessionPhase">Préparation</div>
      <div class="circle-wrap">
        <div class="circle-ring"></div>
        <div class="circle-core rest" id="sessionCircle"></div>
      </div>
      <div class="session-sets" id="sessionSets"></div>
    </div>
    <div class="timeline-wrap">
      <div class="timeline" id="sessionTimeline">
        ${flat.map((s,i) => `<div class="tl-step ${s.action==='REST'?'rest-step':''}" data-idx="${i}"></div>`).join('')}
      </div>
    </div>
    <div class="session-bottom">
      <button class="session-btn pause" id="sessionPauseBtn">⏸ Pause</button>
    </div>
  </div>`;

  document.getElementById('sessionCloseBtn').addEventListener('click', () => {
    openConfirmModal({
      title: 'Quitter la séance ?',
      message: "La progression de cette séance ne sera pas comptée comme terminée.",
      confirmLabel: 'Quitter',
      danger: true,
      onConfirm: () => { if(activeEngine) activeEngine.stop(); }
    });
  });
  document.getElementById('sessionPauseBtn').addEventListener('click', () => {
    if(!activeEngine) return;
    if(activeEngine.paused) activeEngine.resume(); else activeEngine.pause();
  });
}

function setSessionButtonState(paused){
  const btn = document.getElementById('sessionPauseBtn');
  if(!btn) return;
  if(paused){ btn.className = 'session-btn resume'; btn.textContent = '▶ Reprendre'; }
  else { btn.className = 'session-btn pause'; btn.textContent = '⏸ Pause'; }
}

function updateSessionPhase(step){
  const phaseEl = document.getElementById('sessionPhase');
  if(phaseEl) phaseEl.textContent = STEP_LABELS[step.action] || step.action;
}

function updateSessionFrame(info){
  const timerEl = document.getElementById('sessionTimer');
  const circleEl = document.getElementById('sessionCircle');
  const timeline = document.getElementById('sessionTimeline');
  if(timerEl) timerEl.textContent = formatMMSS(info.remainingTotalMs);
  if(circleEl){
    circleEl.style.transform = `scale(${info.scale.toFixed(3)})`;
    circleEl.classList.toggle('rest', info.restish);
    circleEl.style.boxShadow = info.restish ? 'none' : `0 0 ${Math.round(20+60*info.glow)}px rgba(108,99,255,${(0.3+0.6*info.glow).toFixed(2)})`;
  }
  if(timeline && activeEngine){
    const nodes = timeline.querySelectorAll('.tl-step');
    nodes.forEach((n,i) => {
      n.classList.toggle('done', i < activeEngine.stepIndex);
      n.classList.toggle('current', i === activeEngine.stepIndex);
    });
    const current = timeline.querySelector('.tl-step.current');
    if(current) current.scrollIntoView({ inline:'center', behavior:'smooth', block:'nearest' });
  }
}

function onSessionComplete(ex, reason){
  const record = {
    id: 'sess_' + Date.now(),
    exerciseId: ex.id,
    exerciseName: ex.name,
    category: ex.category,
    date: Date.now(),
    completed: reason === 'completed'
  };
  lsSet('lastSessionEnd', Date.now());
  if(reason === 'completed'){
    document.getElementById('sessionRoot').innerHTML = '';
    showFeedbackScreen(ex, record);
  } else {
    addSessionRecord(record);
    document.getElementById('sessionRoot').innerHTML = '';
    activeEngine = null;
    render();
    toast('Séance interrompue — enregistrée comme incomplète');
  }
}

/* ---------- Feedback post-séance ---------- */
function showFeedbackScreen(ex, record){
  const fb = { difficulty:2, fatigue:2, quality:3, relaxation:3, pain:0 };
  const root = document.getElementById('sessionRoot');

  function draw(){
    root.innerHTML = `
    <div class="session-overlay" style="background:var(--bg);color:var(--text);">
      <div class="fb-wrap">
        <h1 style="font-size:19px;font-weight:800;margin-bottom:2px;">Séance terminée 🎉</h1>
        <p style="font-size:13px;color:var(--text-soft);margin-bottom:22px;">${escapeHtml(ex.name)} — quelques questions pour ajuster la suite de votre programme.</p>

        ${fbScale('difficulty','Difficulté ressentie', ['Trop facile','Facile','Adaptée','Difficile','Trop difficile'], fb.difficulty)}
        ${fbScale('fatigue','Fatigue musculaire', ['Aucune','Légère','Modérée','Forte','Épuisante'], fb.fatigue)}
        ${fbScale('quality',"Qualité d'exécution", ['Faible','Passable','Correcte','Bonne','Excellente'], fb.quality)}
        ${fbScale('relaxation','Relâchement après l\'effort', ['Difficile','Partiel','Moyen','Bon','Complet'], fb.relaxation)}
        ${fbScale('pain','Douleur pendant la séance', ['Aucune','Légère','Modérée','Forte','Très forte'], fb.pain, true)}

        ${fb.pain>=2 ? `
        <div class="safety-banner">
          <span class="ic">⚠️</span>
          <p>Une douleur modérée à forte a été signalée. Pour votre sécurité, la progression sera mise en pause sur cette dimension. Si la douleur persiste, nous vous recommandons de consulter un professionnel de santé avant de poursuivre les séances.</p>
        </div>` : ''}

        <button class="btn btn-primary btn-block" id="fbSubmitBtn">Valider</button>
      </div>
    </div>`;

    document.querySelectorAll('.fb-pip').forEach(pip => {
      pip.addEventListener('click', () => {
        const field = pip.getAttribute('data-field');
        fb[field] = parseInt(pip.getAttribute('data-val'), 10);
        draw();
      });
    });
    document.getElementById('fbSubmitBtn').addEventListener('click', () => submitFeedback(ex, record, fb));
  }

  function fbScale(field, label, labels, val, isPain){
    return `
    <div class="fb-q">
      <label class="lbl">${label}</label>
      <div class="fb-scale">
        ${labels.map((l,i) => `<div class="fb-pip ${val===i?(isPain&&i>=2?'pain-selected':'selected'):''}" data-field="${field}" data-val="${i}">${i}</div>`).join('')}
      </div>
    </div>`;
  }

  draw();
}

function submitFeedback(ex, record, fb){
  record.feedback = fb;
  record.painFlag = fb.pain >= 2;
  addSessionRecord(record);

  const levels = getLevels();
  const painStreak = getPainStreak();
  const cat = ex.category;

  if(record.painFlag){
    levels[cat] = Math.max(1, levels[cat] - 1);
    painStreak[cat] = (painStreak[cat] || 0) + 1;
  } else {
    painStreak[cat] = 0;
    if(fb.difficulty <= 1 && fb.quality >= 3 && fb.fatigue <= 2){
      levels[cat] = Math.min(4, levels[cat] + 1);
    }
  }
  setLevels(levels);
  setPainStreak(painStreak);

  document.getElementById('sessionRoot').innerHTML = '';
  activeEngine = null;
  navigate('dashboard');
  toast(record.painFlag ? 'Séance enregistrée — douleur notée' : 'Séance enregistrée ✅');
  if(painStreak[cat] >= 2){
    setTimeout(() => toast('⚠️ Pensez à consulter un professionnel de santé'), 1200);
  }
}

/* ============ 9. INITIALISATION ============ */
function init(){
  const profile = getProfile();
  STATE.view = profile ? 'dashboard' : 'welcome';
  render();

  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Enregistrement du service worker impossible :', err);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
