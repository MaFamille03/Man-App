/* ==========================================================================
   KEGEL CONTROL — Prototype web (PWA), 100% local (aucun serveur)
   Flux : Compte (inscription/connexion, local à l'appareil)
          -> Questionnaire -> Profil (4 dimensions)
          -> Exercice de Kegel quotidien (6 types de contraction, moteur piloté
             par données + vibrations + bips sonores) x2/jour, 2h d'écart mini
          -> Feedback (une fois, en fin d'exercice complet) -> Tableau de bord
   Tout est persisté en localStorage sur cet appareil. Aucune donnée ne quitte
   le téléphone : il n'y a pas de serveur pour la recevoir.
========================================================================== */

/* ============ 0. VISUELS — motif de marque, icônes de dimension, icônes œil ============ */
function brandMarkSvg(sizePx, color){
  color = color || '#DD1F2F';
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="28.1" fill="none" stroke="${color}" stroke-width="3.13"/>
    <circle cx="50" cy="50" r="5.9" fill="${color}"/>
  </svg>`;
}

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

const EYE_PATH_OPEN = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
const EYE_PATH_OFF = '<path d="M1 12s4-7 11-7c1.6 0 3 .3 4.3.8M23 12s-1.4 2.5-4 4.5M9.5 9.5a3 3 0 104 4"/><path d="M3 3l18 18"/>';
function eyeSvg(open, size){
  size = size || 18;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${open ? EYE_PATH_OPEN : EYE_PATH_OFF}</svg>`;
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
function lsRemoveExcept(keepShortKeys){
  Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => {
    const short = k.slice(LS_PREFIX.length);
    if(!keepShortKeys.includes(short)) localStorage.removeItem(k);
  });
}

/* ============ 2. COMPTE (local à l'appareil — prototype sans serveur) ============
   Il n'y a pas de backend : "créer un compte" enregistre e-mail + mot de passe
   (haché en SHA-256 via l'API Web Crypto, jamais stocké en clair) uniquement dans
   le stockage local de CE téléphone. Ce n'est pas un système de comptes sécurisé
   multi-appareils — juste le flux inscription/connexion demandé, appliqué à un
   prototype 100% local. */
async function hashPassword(pw){
  try{
    const enc = new TextEncoder().encode('kegelcontrol::' + pw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    return 'fallback:' + pw.length + ':' + pw.split('').reduce((a,c) => (a*31 + c.charCodeAt(0)) % 1000000007, 7);
  }
}
function getAccount(){ return lsGet('account', null); }
function isLoggedIn(){ return !!lsGet('loggedIn', false) && !!getAccount(); }

/* ============ 3. DONNÉES — dimensions, questionnaire ============
   Ce questionnaire est un AUTO-ÉVALUATION informelle (pas un outil diagnostique :
   il n'y a pas de palpation clinique ni de mesure instrumentale possible dans une
   app grand public). Pour s'en rapprocher autant que possible, les 4 dimensions et
   la formulation des items s'appuient sur des repères issus d'outils réellement
   utilisés en rééducation périnéale, transposés en questions d'auto-perception :
     - "control"  ≈ composante Power du PERFECT scheme (Laycock & Jerwood, 2001) et
       de l'échelle d'Oxford modifiée (0 Nil → 5 Strong, palpation digitale) : ici on
       demande à la personne si elle perçoit une contraction nette et isolée plutôt
       que de la mesurer, mais l'idée (aucune → franche contraction) est la même.
     - "endurance" ≈ composantes Endurance / Repetitions / Fast du PERFECT scheme :
       tenir l'effort, l'enchaîner, récupérer.
     - "relaxation" reprend un principe central du PERFECT scheme souvent négligé
       (Every Contraction Timed = relâchement complet entre les efforts) et de la
       littérature sur l'hyperactivité périnéale : un périnée qui ne relâche pas
       complètement est aussi un problème qu'un périnée trop faible.
     - "arousalControl" s'appuie sur la logique de la manœuvre dite "the knack"
       (contraction périnéale volontaire anticipée avant un effort brusque, utilisée
       en prévention de l'incontinence d'effort) et sur la littérature récente
       montrant un lien entre entraînement du plancher pelvien et meilleure maîtrise
       volontaire lors de sensations d'urgence ou d'excitation (continence d'urgence,
       mais aussi travaux sur le contrôle éjaculatoire).
   Le score reste un pourcentage d'auto-perception (0-100%) par dimension, PAS une
   valeur clinique. Sources consultées : PERFECT scheme (Laycock & Jerwood, 2001,
   Physiotherapy), échelle d'Oxford modifiée (revues de fiabilité inter-examinateurs,
   Physiotherapy 2011 / A Urologia 2019), ICIQ-UI SF et PFDI-20/PFIQ-7 (structure de
   score par sommation, consultées pour la méthode plutôt que pour un contenu
   directement transposable, ces deux outils visant l'incontinence et non un usage
   grand public généraliste), et littérature sur l'entraînement périnéal et le
   contrôle de l'excitation/éjaculation (Oxford Academic, Sexual Medicine, 2025). */
const DIMENSIONS = [
  { key:'control',       label:'Contrôle périnéal',  objective:"Évaluer votre capacité à isoler et déclencher une contraction nette du plancher pelvien — un principe proche de l'échelle de force utilisée en rééducation périnéale (d'« aucune contraction perceptible » à une contraction franche)." },
  { key:'endurance',      label:'Endurance',          objective:"Évaluer votre capacité à maintenir et répéter l'effort sans qu'il ne s'épuise trop vite — les volets « endurance » et « répétitions » d'une évaluation périnéale classique." },
  { key:'relaxation',     label:'Relâchement',        objective:"Évaluer votre capacité à relâcher complètement entre deux efforts : un relâchement incomplet freine la rééducation autant qu'un manque de force." },
  { key:'arousalControl', label:"Contrôle réflexe",   objective:"Évaluer votre capacité à mobiliser une contraction volontaire dans l'instant — face à une envie pressante, un effort brusque ou une sensation forte." }
];
const DIM_LABEL = Object.fromEntries(DIMENSIONS.map(d=>[d.key,d.label]));
const DIM_OBJECTIVE = Object.fromEntries(DIMENSIONS.map(d=>[d.key,d.objective]));

const SCALE_LABELS = ["Pas du tout d'accord", "Plutôt pas d'accord", "Neutre / incertain", "Plutôt d'accord", "Tout à fait d'accord"];

const QUESTIONNAIRE = [
  { id:'c1', dim:'control', text:"Quand je me concentre, je sens nettement mon périnée se contracter — comme si je passais d'aucune sensation à une contraction franche." },
  { id:'c2', dim:'control', text:"Je peux déclencher cette contraction à volonté, sans serrer les cuisses, les fessiers ou le ventre." },
  { id:'c3', dim:'control', text:"J'arrive à contracter mon périnée sans bloquer ma respiration." },
  { id:'e1', dim:'endurance', text:"Je peux maintenir une contraction moyenne pendant plusieurs secondes sans qu'elle ne faiblisse." },
  { id:'e2', dim:'endurance', text:"Je peux répéter plusieurs contractions à la suite sans ressentir une fatigue marquée." },
  { id:'e3', dim:'endurance', text:"Après une série d'exercices, mon périnée récupère rapidement plutôt que de rester fatigué toute la journée." },
  { id:'r1', dim:'relaxation', text:"Après chaque contraction, je sens mon périnée revenir complètement au repos, pas seulement à moitié relâché." },
  { id:'r2', dim:'relaxation', text:"Je n'ai pas de tension ou de gêne permanente au niveau du périnée en dehors des exercices." },
  { id:'r3', dim:'relaxation', text:"Quand je m'y concentre, j'arrive à relâcher consciemment mon périnée plutôt que de le laisser « se détendre tout seul »." },
  { id:'a1', dim:'arousalControl', text:"Face à une envie pressante, je me sens capable de la retenir quelques instants grâce à une contraction volontaire du périnée." },
  { id:'a2', dim:'arousalControl', text:"Avant un effort brusque prévisible (toux, éternuement, saut, port de charge), je pense à contracter mon périnée par anticipation." },
  { id:'a3', dim:'arousalControl', text:"Dans un moment de forte intensité physique ou émotionnelle, je garde une sensation de contrôle sur mon plancher pelvien plutôt que de le sentir m'échapper." }
];

/* ============ 4. L'EXERCICE DE KEGEL — protocole unique, quotidien, x2/jour ============
   Moteur piloté par données. Types d'étape reconnus :
     CONTRACT / RELEASE / REST / HOLD / PULSE / RAMP_UP / RAMP_DOWN / LOOP / PAUSE
   Structure exacte demandée : 5 types de contraction UNIQUES (le premier, "Trembling
   2", revient une seconde fois en position 5/6), séparés par des pauses de 9s
   ("Repos" — les relâchements À L'INTÉRIEUR d'un type s'appellent "Relâcher"). Le
   nom de chaque type est conservé tel quel (non traduit). L'ancien type "Démarrage"
   a été retiré (n'est plus nécessaire). Durée totale : 392s ≈ 6 min 32.
     1. Trembling 2        45s  — contraction/relâchement de 1s en alternance
     2. Front Clamp        60s  — contraction légère → forte (2s) puis relâchement (0.5s)
     3. Short Holding 2     65s — serrer et tenir 6s puis relâcher 6s, en boucle
     4. Starter             69s — 0.5s contract / 0.5s relâcher / 4s contract / 0.5s relâcher
     5. Trembling 2 (bis)   45s — identique au type 1
     6. Steady trembling    63s — contraction 4s / relâcher 2s, en boucle
   Chaque durée ci-dessous a été construite pour tomber EXACTEMENT sur le total en
   secondes fourni (ex. Trembling 2 : 22×[1000+1000] + 1000 = 45000ms). */
const PAUSE_BETWEEN_TYPES_MS = 9000;

function loopSteps(times, steps){
  const out = [];
  for(let i=0;i<times;i++) out.push(...steps);
  return out;
}

const CONTRACTION_DEFINITIONS = {
  'trembling-2': {
    id:'trembling-2', name:'Trembling 2', category:'endurance',
    steps:[
      ...loopSteps(22, [
        { action:'CONTRACT', duration:1000, intensity:0.55 },
        { action:'RELEASE', duration:1000 }
      ]),
      { action:'CONTRACT', duration:1000, intensity:0.55 }
    ] // 22*(1000+1000) + 1000 = 45000ms
  },
  'front-clamp': {
    id:'front-clamp', name:'Front Clamp', category:'control',
    steps: loopSteps(24, [
      { action:'RAMP_UP', duration:2000, from:0.3, to:1 },
      { action:'RELEASE', duration:500 }
    ]) // 24*(2000+500) = 60000ms
  },
  'short-holding-2': {
    id:'short-holding-2', name:'Short Holding 2', category:'endurance',
    steps:[
      ...loopSteps(5, [
        { action:'HOLD', duration:6000, intensity:0.85 },
        { action:'RELEASE', duration:6000 }
      ]),
      { action:'HOLD', duration:5000, intensity:0.85 }
    ] // 5*(6000+6000) + 5000 = 65000ms
  },
  'starter': {
    id:'starter', name:'Starter', category:'control',
    steps:[
      ...loopSteps(12, [
        { action:'CONTRACT', duration:500, intensity:0.5 },
        { action:'RELEASE', duration:500 },
        { action:'CONTRACT', duration:4000, intensity:0.9 },
        { action:'RELEASE', duration:500 }
      ]),
      { action:'CONTRACT', duration:500, intensity:0.5 },
      { action:'RELEASE', duration:500 },
      { action:'CONTRACT', duration:2000, intensity:0.9 }
    ] // 12*(500+500+4000+500) + (500+500+2000) = 66000 + 3000 = 69000ms
  },
  'steady-trembling': {
    id:'steady-trembling', name:'Steady trembling', category:'endurance',
    steps:[
      ...loopSteps(10, [
        { action:'CONTRACT', duration:4000, intensity:0.7 },
        { action:'RELEASE', duration:2000 }
      ]),
      { action:'CONTRACT', duration:3000, intensity:0.7 }
    ] // 10*(4000+2000) + 3000 = 63000ms
  }
};

// L'ordre exact demandé, avec "Trembling 2" répété en position 5.
const EXERCISE_SEQUENCE = ['trembling-2', 'front-clamp', 'short-holding-2', 'starter', 'trembling-2', 'steady-trembling'];

function buildDailyExercise(){
  const steps = [];
  const segments = [];
  EXERCISE_SEQUENCE.forEach((defId, i) => {
    const def = CONTRACTION_DEFINITIONS[defId];
    const flat = flattenSteps(def.steps);
    const blockTotalMs = flat.reduce((a,s) => a + s.duration, 0);
    const segIndex = segments.length;
    segments.push({ kind:'block', name: def.name });
    let cursor = blockTotalMs;
    flat.forEach((s, si) => {
      const remainingInBlockAtStepStart = cursor;
      cursor -= s.duration;
      steps.push(Object.assign({}, s, {
        blockId: i, blockPos: i + 1,
        typeName: def.name, typeCategory: def.category,
        blockTotalMs, remainingInBlockAtStepStart,
        segIndex, blockStart: si === 0
      }));
    });
    if(i < EXERCISE_SEQUENCE.length - 1){
      const pauseSegIndex = segments.length;
      segments.push({ kind:'pause', name:'Repos' });
      steps.push({
        action:'PAUSE', duration: PAUSE_BETWEEN_TYPES_MS,
        blockId:i, blockPos:i + 1, typeName: def.name, typeCategory: def.category,
        blockTotalMs: PAUSE_BETWEEN_TYPES_MS, remainingInBlockAtStepStart: PAUSE_BETWEEN_TYPES_MS,
        segIndex: pauseSegIndex, blockStart:false
      });
    }
  });
  return {
    id:'exercice-kegel', name:'Exercice de Kegel',
    objective:"5 types de contraction (Trembling 2 répété), séparés par des pauses de 9 secondes.",
    steps, segments
  };
}
const KEGEL_EXERCISE = buildDailyExercise();

const STEP_LABELS = {
  CONTRACT:'Contraction', RELEASE:'Relâchement', REST:'Relâcher', HOLD:'Maintien',
  PULSE:'Battements', RAMP_UP:'Montée en intensité', RAMP_DOWN:'Descente en intensité',
  PAUSE:'Repos'
};
const STEP_COACH = {
  CONTRACT:'Contractez', RELEASE:'Relâchez', REST:'Reposez-vous', HOLD:'Maintenez la contraction',
  PULSE:'Petites pulsations', RAMP_DOWN:'Relâchez progressivement', PAUSE:'Relâchez, respirez'
};
function coachTextFor(step, t){
  if(step.action === 'RAMP_UP') return (t != null && t < 0.5) ? 'Serrer légèrement' : 'Serrer fort';
  return STEP_COACH[step.action] || '';
}

const TOTAL_WEEKS = 20;
const DAILY_REQUIRED = 2;                       // 2 séances par jour, sans exception
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;      // 2h minimum entre les deux séances

/* ============ 5. PROFIL / NIVEAU / SÉANCES ============ */
function getProfile(){ return lsGet('profile', null); }
function getProgramLevel(){ return lsGet('programLevel', 1); }
function setProgramLevel(v){ lsSet('programLevel', Math.max(1, Math.min(4, v))); }
function getSessions(){ return lsGet('sessions', []); }
function addSessionRecord(rec){ const s = getSessions(); s.push(rec); lsSet('sessions', s); }

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
  const avg = DIMENSIONS.reduce((a,d) => a + scores[d.key], 0) / DIMENSIONS.length;
  setProgramLevel(levelFromScore(avg));
  if(!lsGet('programStart', null)) lsSet('programStart', Date.now());
  lsSet('programPainStreak', 0);
  return profile;
}

function startOfDay(ts){ const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
function sessionsOnDay(ts){
  const from = startOfDay(ts), to = from + 86400000;
  return getSessions().filter(s => s.completed && s.date >= from && s.date < to);
}
function todaySessionsCount(){ return sessionsOnDay(Date.now()).length; }

function programDayIndex(){
  const start = lsGet('programStart', Date.now());
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}
function programWeekIndex(){ return Math.min(TOTAL_WEEKS - 1, Math.floor(programDayIndex() / 7)); }

function weekSessions(weekIdx){
  const start = lsGet('programStart', Date.now());
  const from = start + weekIdx * 7 * 86400000;
  const to = from + 7 * 86400000;
  return getSessions().filter(s => s.completed && s.date >= from && s.date < to);
}
function weekCompletionRatio(weekIdx){
  return weekSessions(weekIdx).length / (7 * DAILY_REQUIRED);
}

/* "Pas de rattrapage" : une séance non faite le jour même est définitivement perdue —
   il n'existe tout simplement aucun mécanisme pour enregistrer une séance à une date
   passée, donc un jour incomplet reste incomplet pour toujours dans les statistiques. */
function canStartSession(){
  if(todaySessionsCount() >= DAILY_REQUIRED) return { ok:false, reason:'done' };
  const last = lsGet('lastSessionEnd', 0);
  const remaining = MIN_INTERVAL_MS - (Date.now() - last);
  if(remaining > 0) return { ok:false, reason:'cooldown', remainingMs: remaining };
  return { ok:true };
}

function adherencePct(){
  const dayIdx = programDayIndex();
  const plannedSoFar = Math.max(1, (dayIdx + 1) * DAILY_REQUIRED);
  const completed = getSessions().filter(s => s.completed).length;
  return Math.max(0, Math.min(100, Math.round((completed / plannedSoFar) * 100)));
}

function currentStreak(){
  let streak = 0;
  let cur = new Date();
  if(sessionsOnDay(cur.getTime()).length < DAILY_REQUIRED){
    cur.setDate(cur.getDate() - 1); // aujourd'hui pas encore fini : ne casse pas la série en cours
  }
  while(sessionsOnDay(cur.getTime()).length >= DAILY_REQUIRED){
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function currentWeekDayStatuses(){
  const wk = programWeekIndex();
  const start = lsGet('programStart', Date.now());
  const weekStart = start + wk * 7 * 86400000;
  const todayStart = startOfDay(Date.now());
  const days = [];
  for(let i=0;i<7;i++){
    const dayTs = weekStart + i * 86400000;
    const dStart = startOfDay(dayTs);
    days.push({
      dayTs, dateNum: new Date(dayTs).getDate(),
      count: dStart > todayStart ? 0 : sessionsOnDay(dayTs).length,
      isFuture: dStart > todayStart,
      isToday: dStart === todayStart
    });
  }
  return days;
}

/* ============ 6. MOTEUR DE SÉANCE (données -> exécution) ============ */
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

/* Retour sonore (Web Audio API) : navigator.vibrate() n'est PAS supporté par Safari
   iOS (aucune implémentation de la Vibration API dans WebKit, y compris en PWA
   installée) — les bips synthétisés ici sont donc le retour sensoriel fiable sur
   iPhone, en plus des vibrations qui fonctionnent sur Android. */
let audioCtx = null;
function ensureAudioCtx(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; }
  }
  if(audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().catch(()=>{}); }
  return audioCtx;
}
function soundEnabled(){ return lsGet('soundOn', true); }
function setSoundEnabled(v){ lsSet('soundOn', !!v); }
function beep(freq, durationMs, volume){
  if(!soundEnabled()) return;
  const ctx = ensureAudioCtx();
  if(!ctx) return;
  try{
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq || 660;
    const now = ctx.currentTime;
    const vol = volume != null ? volume : 0.16;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.015);
    gain.gain.linearRampToValueAtTime(0, now + durationMs/1000);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs/1000 + 0.02);
  }catch(e){}
}
function cue(kind, intensity){
  const inten = intensity != null ? intensity : 0.6;
  switch(kind){
    case 'contract': vibrate(Math.round(140*inten)+40); beep(880, 110, 0.15); break;
    case 'rampup': vibrate(30); beep(760, 90, 0.11); break;
    case 'release': beep(500, 140, 0.09); break;
    case 'pause': beep(380, 220, 0.13); break;
    case 'pulse-tick': vibrate(Math.round(60*inten)+30); beep(700, 55, 0.09); break;
    case 'hold-tick': vibrate(22); beep(620, 45, 0.06); break;
    case 'type-transition':
      // Signal distinct au changement de type de contraction (différent du "pause"
      // qui marque l'entrée en repos) : repère fiable sans regarder l'écran.
      vibrate([90,50,90]);
      [740,988].forEach((f,i) => setTimeout(() => beep(f,130,0.15), i*130));
      break;
    case 'finish':
      vibrate([80,60,80]);
      [880,988,1175].forEach((f,i) => setTimeout(() => beep(f,170,0.16), i*140));
      break;
  }
}

/* Renvoie l'intensité de teinte rouge (0..1) à appliquer sur la bordure du cercle. */
function computeGlow(step, t){
  const inten = step.intensity != null ? step.intensity : 0.6;
  switch(step.action){
    case 'REST': case 'PAUSE': return 0.03;
    case 'CONTRACT': { const ease = t < 0.3 ? t/0.3 : 1; return ease * inten; }
    case 'RELEASE': return Math.max(0, (1-t)) * 0.6;
    case 'HOLD': return inten;
    case 'PULSE': {
      const cyc = 1 / Math.max(1, step.count || 4);
      const local = (t % cyc) / cyc;
      const wave = local < 0.5 ? local*2 : (1-local)*2;
      return wave * inten;
    }
    case 'RAMP_UP': { const from = step.from!=null?step.from:0, to = step.to!=null?step.to:1; return from+(to-from)*t; }
    case 'RAMP_DOWN': { const from = step.from!=null?step.from:1, to = step.to!=null?step.to:0; return from+(to-from)*t; }
    default: return 0.03;
  }
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
      this._cueForStep(step);
      const finish = () => { this._pendingResolve = null; resolve(); };
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
    const glow = computeGlow(step, t);
    if(step.action === 'PULSE'){
      const cyc = step.duration / Math.max(1, step.count || 4);
      const tickIdx = Math.floor(elapsedInStep / cyc);
      if(tickIdx !== this._lastTick && (elapsedInStep % cyc) < cyc*0.5){
        this._lastTick = tickIdx;
        cue('pulse-tick', step.intensity);
      }
    } else if(step.action === 'HOLD' && step.duration >= 2500){
      const period = 1500;
      const tickIdx = Math.floor(elapsedInStep / period);
      if(tickIdx > 0 && tickIdx !== this._lastTick && (elapsedInStep % period) < 40){
        this._lastTick = tickIdx;
        cue('hold-tick');
      }
    }
    const elapsedTotal = this._elapsedTotalMs(elapsedInStep);
    if(this.handlers.onFrame){
      this.handlers.onFrame({
        step, t, glow,
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

  _cueForStep(step){
    if(step.blockStart) cue('type-transition'); // nouveau type de contraction : repère distinct
    if(step.action === 'CONTRACT') cue('contract', step.intensity);
    else if(step.action === 'RAMP_UP') cue('rampup', step.to);
    else if(step.action === 'RELEASE') cue('release');
    else if(step.action === 'PAUSE') cue('pause');
  }

  _done(reason){
    if(this.handlers.onComplete) this.handlers.onComplete(reason, this.totalDuration);
  }
}

/* ============ 7. UI — helpers génériques (toast, modale, mot de passe) ============ */
function toast(msg){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2600);
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
function pwField(id, placeholder){
  return `<div class="pw-field">
    <input type="password" id="${id}" class="text-input" placeholder="${escapeHtml(placeholder)}" autocomplete="new-password">
    <button type="button" class="pw-eye" data-target="${id}" aria-label="Afficher le mot de passe">${eyeSvg(false,18)}</button>
  </div>`;
}
function showAuthError(msg){
  // Affiche l'erreur sans tout re-rendre : un render() complet régénère les champs
  // depuis le template HTML et efface ce que la personne venait de taper.
  STATE.authError = msg;
  const form = document.getElementById('signupForm') || document.getElementById('loginForm');
  if(!form) return;
  let el = form.querySelector('.form-error');
  if(!el){
    el = document.createElement('div');
    el.className = 'form-error';
    form.insertBefore(el, form.lastElementChild);
  }
  el.textContent = msg;
}
function wirePwEyes(){
  document.querySelectorAll('.pw-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.getAttribute('data-target'));
      if(!inp) return;
      const willShow = inp.type === 'password';
      inp.type = willShow ? 'text' : 'password';
      btn.innerHTML = eyeSvg(!willShow, 18);
      btn.setAttribute('aria-label', willShow ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
}

/* ============ 8. ROUTAGE / RENDU ============ */
const STATE = {
  view: 'welcome',
  qIndex: 0,
  qAnswers: {},
  authError: ''
};

function navigate(view){ STATE.view = view; render(); window.scrollTo(0,0); }

function render(){
  const app = document.getElementById('app');
  const loggedIn = isLoggedIn();
  const profile = getProfile();

  if(!loggedIn && !['welcome','login','signup'].includes(STATE.view)) STATE.view = 'welcome';
  if(loggedIn && !profile && !['questionnaire','results'].includes(STATE.view)) STATE.view = 'questionnaire';
  if(loggedIn && profile && ['welcome','login','signup'].includes(STATE.view)) STATE.view = 'dashboard';

  let html = '';
  switch(STATE.view){
    case 'welcome': html = renderWelcome(); break;
    case 'signup': html = renderSignup(); break;
    case 'login': html = renderLogin(); break;
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

function renderDimBars(scores){
  return DIMENSIONS.map(d => `
    <div class="dim-row">
      <div class="dim-ic">${dimIconSvg(d.key, 15)}</div>
      <div class="dim-label">${d.label}</div>
      <div class="dim-bar"><div class="dim-bar-fill" style="width:${scores[d.key]}%"></div></div>
      <div class="dim-pct">${scores[d.key]}%</div>
    </div>`).join('');
}

/* ---------- Écran d'accueil ---------- */
function renderWelcome(){
  return `
  <div class="hero-screen screen">
    <div class="hero-mark">${brandMarkSvg(46)}</div>
    <h1>Kegel Control</h1>
    <p>Un coaching guidé pour renforcer et rééduquer votre plancher pelvien : un court questionnaire, puis un exercice quotidien guidé pas à pas, deux fois par jour.</p>
    <button class="btn btn-primary btn-block" id="goSignupBtn">Créer un compte</button>
    <p class="auth-switch">Déjà un compte ? <button type="button" id="goLoginBtn">Se connecter</button></p>
    <p class="hero-note">Ce prototype fonctionne entièrement sur votre appareil : il n'y a pas de serveur, vos données (y compris votre compte) restent uniquement sur ce téléphone. Il ne remplace pas un avis médical : en cas de douleur ou de doute, consultez un professionnel de santé (sage-femme, kinésithérapeute spécialisé, médecin).</p>
  </div>`;
}

/* ---------- Inscription / Connexion ---------- */
function renderSignup(){
  return `
  <div class="wrap screen">
    <div class="hero-mark" style="margin:10px auto 18px;">${brandMarkSvg(34)}</div>
    <div class="auth-title">Créer un compte</div>
    <div class="auth-sub">Stocké uniquement sur cet appareil — aucun serveur.</div>
    <form id="signupForm">
      <div class="form-group">
        <label class="form-label" for="signupEmail">Adresse e-mail</label>
        <input type="email" id="signupEmail" class="text-input" placeholder="vous@exemple.com" autocomplete="email" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="signupPw">Mot de passe</label>
        ${pwField('signupPw', '8 caractères minimum')}
      </div>
      <div class="form-group">
        <label class="form-label" for="signupPw2">Confirmer le mot de passe</label>
        ${pwField('signupPw2', 'Retapez le mot de passe')}
      </div>
      ${STATE.authError ? `<div class="form-error">${escapeHtml(STATE.authError)}</div>` : ''}
      <button type="submit" class="btn btn-primary btn-block">Créer mon compte</button>
    </form>
    <p class="auth-switch">Déjà un compte ? <button type="button" id="switchToLoginBtn">Se connecter</button></p>
  </div>`;
}

function renderLogin(){
  return `
  <div class="wrap screen">
    <div class="hero-mark" style="margin:10px auto 18px;">${brandMarkSvg(34)}</div>
    <div class="auth-title">Se connecter</div>
    <div class="auth-sub">Avec l'e-mail et le mot de passe de ce compte.</div>
    <form id="loginForm">
      <div class="form-group">
        <label class="form-label" for="loginEmail">Adresse e-mail</label>
        <input type="email" id="loginEmail" class="text-input" placeholder="vous@exemple.com" autocomplete="email" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="loginPw">Mot de passe</label>
        ${pwField('loginPw', 'Votre mot de passe')}
      </div>
      ${STATE.authError ? `<div class="form-error">${escapeHtml(STATE.authError)}</div>` : ''}
      <button type="submit" class="btn btn-primary btn-block">Se connecter</button>
    </form>
    <p class="auth-switch">Pas encore de compte ? <button type="button" id="switchToSignupBtn">Créer un compte</button></p>
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
    <p class="q-objective">${escapeHtml(DIM_OBJECTIVE[q.dim])}</p>
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
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Votre profil</h1></div>
    <div class="card">
      <h2>Résultats du questionnaire</h2>
      ${renderDimBars(profile.scores)}
    </div>
    <div class="card">
      <h2>Votre exercice</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.55;">
        Un programme sur ${TOTAL_WEEKS} semaines vient d'être créé à partir de ces résultats. Chaque jour, deux séances identiques de l'Exercice de Kegel (6 types de contraction, environ ${estimateMinutes(KEGEL_EXERCISE)} minutes), espacées d'au moins 2h — sans exception, et sans rattrapage possible en cas de séance manquée.
      </p>
    </div>
    <button class="btn btn-primary btn-block" id="goDashboardBtn" style="margin-top:14px;">Voir mon programme</button>
  </div>`;
}

/* ---------- Tableau de bord ---------- */
function renderDashboard(){
  const profile = getProfile();
  const level = getProgramLevel();
  const cd = canStartSession();
  const wk = programWeekIndex();
  const todayCount = todaySessionsCount();
  const streak = currentStreak();
  const painStreak = lsGet('programPainStreak', 0);
  const days = currentWeekDayStatuses();
  const dow = ['L','M','M','J','V','S','D'];

  let todayCardBody;
  if(todayCount >= DAILY_REQUIRED){
    todayCardBody = `<div class="done-note">Les deux séances d'aujourd'hui sont terminées ✅ Revenez demain — il n'y a pas de séance supplémentaire ni de rattrapage.</div>`;
  } else {
    todayCardBody = `<p>${escapeHtml(KEGEL_EXERCISE.objective)} · ${estimateMinutes(KEGEL_EXERCISE)} min environ</p>` + (
      cd.ok
        ? `<button class="btn" id="startTodayBtn">Commencer la séance ${todayCount+1}/${DAILY_REQUIRED}</button>`
        : `<div class="cooldown-note">Prochaine séance dans ${Math.ceil(cd.remainingMs/60000)} min (pause de 2h obligatoire entre les deux séances).</div>`
    );
  }

  return `
  <div class="wrap screen">
    <div class="dash-header">
      <div class="greet">Exercice de Kegel</div>
      <div class="greet-sub">Semaine ${wk+1} / ${TOTAL_WEEKS}</div>
    </div>

    ${painStreak >= 2 ? `
    <div class="card" style="border-color:rgba(229,72,77,.35);background:rgba(229,72,77,.06);margin-bottom:12px;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:18px;">⚠️</span>
        <p style="font-size:12.5px;line-height:1.55;color:#8a1f22;">
          Une douleur a été signalée sur plusieurs séances récentes. La progression a été mise en pause. Nous vous recommandons de consulter un professionnel de santé avant de continuer.
        </p>
      </div>
    </div>` : ''}

    <div class="today-card">
      <div class="tag">Séance ${Math.min(todayCount+1,DAILY_REQUIRED)}/${DAILY_REQUIRED} du jour · Niveau ${level}/4</div>
      <h3>Exercice de Kegel</h3>
      ${todayCardBody}
    </div>

    <div class="stat-grid">
      <div class="stat-box"><div class="num">${todayCount}/${DAILY_REQUIRED}</div><div class="lbl">Aujourd'hui</div></div>
      <div class="stat-box"><div class="num">${adherencePct()}%</div><div class="lbl">Assiduité globale</div></div>
      <div class="stat-box"><div class="num">${streak}</div><div class="lbl">Jours d'affilée</div></div>
      <div class="stat-box"><div class="num">${getSessions().filter(s=>s.completed).length}</div><div class="lbl">Séances au total</div></div>
    </div>

    <div class="card">
      <h2>Cette semaine</h2>
      <div class="day-pair-grid">
        ${days.map((d,i) => `
          <div class="day-pair ${d.isToday?'today':''}">
            <div class="dow">${dow[i]}</div>
            <div class="dots">
              ${[0,1].map(slot => `<div class="day-dot ${slot<d.count?'done':(d.isFuture?'future':(d.isToday?'pending':'missed'))}"></div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>Votre profil initial</h2>
      ${renderDimBars(profile.scores)}
    </div>
  </div>`;
}

/* ---------- Programme : vue d'ensemble 20 semaines, verrouillée tant que le jour n'est pas complet ---------- */
function renderProgramme(){
  const wk = programWeekIndex();
  const todayCount = todaySessionsCount();
  const unlocked = todayCount >= DAILY_REQUIRED;

  let weekGridHtml = '<div class="week-grid">';
  for(let w=0; w<TOTAL_WEEKS; w++){
    const isCurrent = w === programWeekIndex();
    const isPast = w < programWeekIndex();
    let cls = '';
    if(isCurrent) cls = 'current';
    else if(isPast){
      const ratio = weekCompletionRatio(w);
      cls = ratio >= 1 ? 'full' : (ratio > 0 ? 'partial' : '');
    }
    weekGridHtml += `<div class="week-cell ${cls}">${w+1}</div>`;
  }
  weekGridHtml += '</div>';

  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;">
      <h1>Programme</h1><span class="sub">Semaine ${wk+1}/${TOTAL_WEEKS}</span>
    </div>
    <div class="card">
      <h2>Vue d'ensemble (${TOTAL_WEEKS} semaines)</h2>
      ${unlocked ? `
        <p class="unlocked-note">Déverrouillé pour aujourd'hui ✅</p>
        ${weekGridHtml}
      ` : `
        <div class="programme-lock-wrap">
          <div class="week-grid-blur">${weekGridHtml}</div>
          <div class="lock-banner">🔒 Validez vos ${DAILY_REQUIRED} séances du jour pour déverrouiller le programme complet (${todayCount}/${DAILY_REQUIRED} aujourd'hui)</div>
        </div>
      `}
    </div>
    <div class="card">
      <h2>Principe</h2>
      <p style="font-size:12.5px;color:var(--text-soft);line-height:1.6;">
        Chaque jour, deux séances identiques de l'Exercice de Kegel (6 types de contraction, environ ${estimateMinutes(KEGEL_EXERCISE)} minutes), espacées d'au moins 2h. Une séance non faite dans la journée est définitivement manquée : il n'y a pas de rattrapage.
      </p>
      <button class="btn btn-ghost btn-block" id="goDashFromProgBtn" style="margin-top:12px;">Voir l'exercice du jour</button>
    </div>
  </div>`;
}

/* ---------- Progrès ---------- */
function renderProgress(){
  const sessions = getSessions().slice().reverse();
  const weeksBack = 8;
  const counts = [];
  for(let i=weeksBack-1;i>=0;i--){
    counts.push(weekSessions(Math.max(0, programWeekIndex()-i)).length);
  }
  const max = Math.max(1, DAILY_REQUIRED*7, ...counts);
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Progrès</h1></div>
    <div class="card">
      <h2>Séances complétées / semaine (sur ${DAILY_REQUIRED*7})</h2>
      <div class="chart">
        ${counts.map(c => `<div class="chart-bar"><div class="fill" style="height:${Math.max(4,(c/max)*100)}%"></div></div>`).join('')}
      </div>
      <div class="chart-labels">${counts.map((_,i)=> `<span>${i===counts.length-1?'auj.':'-'+(counts.length-1-i)}</span>`).join('')}</div>
    </div>
    <div class="card">
      <h2>Historique des séances</h2>
      ${sessions.length===0 ? '<p class="empty-note">Aucune séance enregistrée pour l\'instant.</p>' : sessions.slice(0,60).map(s => `
        <div class="hist-item">
          <div class="hist-date">${formatDateShort(s.date)}</div>
          <div class="hist-info">
            <div class="name">${escapeHtml(s.exerciseName || 'Exercice de Kegel')}</div>
            <div class="meta">${s.completed ? 'Terminée' : 'Interrompue'}${s.feedback ? ' · qualité ' + (s.feedback.quality+1) + '/5' : ''}</div>
          </div>
          ${s.feedback && s.feedback.pain>=2 ? '<span class="hist-flag" title="Douleur signalée">⚠️</span>' : ''}
        </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- Réglages ---------- */
function renderSettings(){
  const account = getAccount();
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Réglages</h1></div>
    <div class="card">
      <div class="settings-row">
        <div><div class="lbl">Compte</div><div class="desc">${escapeHtml(account ? account.email : '—')}</div></div>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Son pendant la séance</div><div class="desc">Bips sonores en plus des vibrations (utiles sur iPhone, où les vibrations web ne fonctionnent pas).</div></div>
        <button class="btn ${soundEnabled()?'btn-teal':'btn-ghost'} btn-sm" id="soundToggleBtn">${soundEnabled()?'Activé':'Désactivé'}</button>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Refaire le questionnaire</div><div class="desc">Recalcule votre profil et votre niveau de départ. L'historique est conservé.</div></div>
        <button class="btn btn-ghost btn-sm" id="retakeBtn">Refaire</button>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Réinitialiser les données</div><div class="desc">Efface le profil, le programme et l'historique de cet appareil (le compte est conservé).</div></div>
        <button class="btn btn-danger btn-sm" id="resetBtn">Réinitialiser</button>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Se déconnecter</div><div class="desc">Vos données restent sur cet appareil ; reconnectez-vous avec le même e-mail.</div></div>
        <button class="btn btn-ghost btn-sm" id="logoutBtn">Déconnexion</button>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Supprimer mon compte</div><div class="desc">Efface définitivement le compte et toutes les données de cet appareil.</div></div>
        <button class="btn btn-danger btn-sm" id="deleteAccountBtn">Supprimer</button>
      </div>
    </div>
    <div class="card">
      <h2>À propos</h2>
      <p class="disclaimer">
        Kegel Control est un prototype d'entraînement du plancher pelvien fonctionnant entièrement sur cet appareil, sans serveur. Il propose un accompagnement progressif mais ne constitue pas un avis médical. En cas de douleur, d'incontinence sévère, de descente d'organe ou de doute, consultez un professionnel de santé (sage-femme, kinésithérapeute spécialisé en rééducation périnéale, médecin) avant de poursuivre.
      </p>
    </div>
  </div>`;
}

/* ============ 9. ÉVÉNEMENTS DE VUE ============ */
function wireView(){
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-nav')));
  });

  if(STATE.view === 'welcome'){
    document.getElementById('goSignupBtn').addEventListener('click', () => { STATE.authError=''; navigate('signup'); });
    document.getElementById('goLoginBtn').addEventListener('click', () => { STATE.authError=''; navigate('login'); });
  }

  if(STATE.view === 'signup'){
    wirePwEyes();
    document.getElementById('switchToLoginBtn').addEventListener('click', () => { STATE.authError=''; navigate('login'); });
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signupEmail').value.trim().toLowerCase();
      const pw = document.getElementById('signupPw').value;
      const pw2 = document.getElementById('signupPw2').value;
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showAuthError('Adresse e-mail invalide.'); return; }
      if(pw.length < 8){ showAuthError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
      if(pw !== pw2){ showAuthError('Les deux mots de passe ne correspondent pas.'); return; }
      if(getAccount()){ showAuthError('Un compte existe déjà sur cet appareil. Connectez-vous.'); return; }
      const hash = await hashPassword(pw);
      lsSet('account', { email, hash, createdAt: Date.now() });
      lsSet('loggedIn', true);
      STATE.authError = '';
      toast('Compte créé ✅');
      navigate(getProfile() ? 'dashboard' : 'questionnaire');
    });
  }

  if(STATE.view === 'login'){
    wirePwEyes();
    document.getElementById('switchToSignupBtn').addEventListener('click', () => { STATE.authError=''; navigate('signup'); });
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const pw = document.getElementById('loginPw').value;
      const account = getAccount();
      if(!account){ showAuthError('Aucun compte trouvé sur cet appareil. Créez-en un.'); return; }
      const hash = await hashPassword(pw);
      if(account.email !== email || account.hash !== hash){ showAuthError('E-mail ou mot de passe incorrect.'); return; }
      lsSet('loggedIn', true);
      STATE.authError = '';
      navigate(getProfile() ? 'dashboard' : 'questionnaire');
    });
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
    document.getElementById('goDashboardBtn').addEventListener('click', () => navigate('dashboard'));
  }

  if(STATE.view === 'dashboard'){
    const b = document.getElementById('startTodayBtn');
    if(b) b.addEventListener('click', () => launchSession());
  }

  if(STATE.view === 'programme'){
    const b = document.getElementById('goDashFromProgBtn');
    if(b) b.addEventListener('click', () => navigate('dashboard'));
  }

  if(STATE.view === 'settings'){
    document.getElementById('soundToggleBtn').addEventListener('click', () => { setSoundEnabled(!soundEnabled()); render(); });

    document.getElementById('retakeBtn').addEventListener('click', () => {
      openConfirmModal({
        title: 'Refaire le questionnaire ?',
        message: "Votre profil et votre niveau de départ seront recalculés. L'historique de vos séances est conservé.",
        confirmLabel: 'Refaire',
        onConfirm: () => { STATE.qIndex=0; STATE.qAnswers={}; navigate('questionnaire'); }
      });
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      openConfirmModal({
        title: 'Réinitialiser toutes les données ?',
        message: "Cette action efface définitivement votre profil, votre programme et l'historique de vos séances sur cet appareil (votre compte reste actif). Elle est irréversible.",
        confirmLabel: 'Réinitialiser',
        danger: true,
        onConfirm: () => {
          lsRemoveExcept(['account','loggedIn','soundOn']);
          STATE.qIndex=0; STATE.qAnswers={};
          toast('Données réinitialisées');
          navigate('questionnaire');
        }
      });
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      lsSet('loggedIn', false);
      navigate('login');
    });

    document.getElementById('deleteAccountBtn').addEventListener('click', () => {
      openConfirmModal({
        title: 'Supprimer votre compte ?',
        message: "Cette action efface définitivement votre compte et toutes vos données sur cet appareil. Elle est irréversible.",
        confirmLabel: 'Supprimer',
        danger: true,
        onConfirm: () => { lsRemoveAll(); toast('Compte supprimé'); navigate('welcome'); }
      });
    });
  }
}

/* ============ 10. ÉCRAN DE SÉANCE GUIDÉE ============ */
let activeEngine = null;

function launchSession(){
  const cd = canStartSession();
  if(!cd.ok){
    if(cd.reason === 'done') toast('Vos 2 séances du jour sont déjà terminées.');
    else toast(`Pause requise : encore ${Math.ceil(cd.remainingMs/60000)} min avant la prochaine séance.`);
    return;
  }
  ensureAudioCtx(); // créé/débloqué ici, sur un vrai geste utilisateur (requis par iOS Safari)
  renderSessionShell(KEGEL_EXERCISE);
  const engine = new SessionEngine(KEGEL_EXERCISE, {
    onStepStart: (step) => updateSessionPhase(step),
    onFrame: (info) => updateSessionFrame(info),
    onPause: () => setSessionButtonState(true),
    onResume: () => setSessionButtonState(false),
    onComplete: (reason) => onSessionComplete(reason)
  });
  activeEngine = engine;
  engine.start();
}

function renderSessionShell(ex){
  const flat = flattenSteps(ex.steps);
  const segments = ex.segments || [];
  const root = document.getElementById('sessionRoot');
  root.innerHTML = `
  <div class="session-overlay">
    <div class="session-top">
      <div>
        <div class="session-exo-name">${escapeHtml(ex.name)}</div>
        <div class="session-total-remaining" id="sessionTotalRemaining">Temps restant : ${formatMMSS(flat.reduce((a,s)=>a+s.duration,0))}</div>
      </div>
      <button class="session-close" id="sessionCloseBtn">✕</button>
    </div>
    <div class="session-mid">
      <div class="session-type-tag" id="sessionTypeTag">Préparation</div>
      <div class="circle-wrap">
        <div class="circle-halo" id="sessionHalo"></div>
        <div class="circle-ring">
          <div class="ring-tick"></div>
          <div class="ring-rotor" id="sessionRingRotor"><div class="ring-dot"></div></div>
        </div>
        <div class="circle-core">
          <div class="circle-count" id="sessionCount">–</div>
          <div class="circle-coach" id="sessionCoachLabel"></div>
        </div>
      </div>
    </div>
    <div class="strip-area">
      <button class="strip-help-btn" id="sessionHelpBtn" aria-label="Aide sur l'écran de séance">?</button>
      <div class="type-strip-wrap">
        <div class="type-strip" id="sessionTypeStrip">
          ${segments.map((seg,i) => `<div class="seg ${seg.kind==='pause'?'seg-pause':''}" data-idx="${i}">${escapeHtml(seg.name)}</div>`).join('')}
        </div>
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
  document.getElementById('sessionHelpBtn').addEventListener('click', openHelpModal);
}

function openHelpModal(){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="helpOverlay">
      <div class="modal-card">
        <div class="modal-title">Comment lire l'écran de séance</div>
        <div class="modal-msg" style="text-align:left;">
          <p style="margin:0 0 10px;"><strong>Halo rouge</strong> — s'élargit pendant une contraction et revient à rien au relâchement : plus il est large, plus la contraction en cours est intense.</p>
          <p style="margin:0 0 10px;"><strong>Anneau et point</strong> — le point parcourt l'anneau pour montrer votre progression dans le type de contraction en cours.</p>
          <p style="margin:0 0 10px;"><strong>Chiffre au centre</strong> — le temps restant, en secondes, pour le type de contraction en cours (jusqu'à 0, puis 9s de repos avant le type suivant).</p>
          <p style="margin:0 0 10px;"><strong>Bandeau du bas</strong> — la séquence complète : à gauche ce qui est fini, au centre le type en cours, à droite ce qui arrive.</p>
          <p style="margin:0;">Un bip et une vibration marquent chaque contraction, chaque relâchement et chaque changement de type, pour suivre la séance sans regarder l'écran.</p>
        </div>
        <div class="modal-actions"><button class="btn btn-primary btn-block" id="helpCloseBtn">Compris</button></div>
      </div>
    </div>`;
  const overlay = document.getElementById('helpOverlay');
  const close = () => { root.innerHTML = ''; };
  overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
  document.getElementById('helpCloseBtn').addEventListener('click', close);
}

function setSessionButtonState(paused){
  const btn = document.getElementById('sessionPauseBtn');
  if(!btn) return;
  if(paused){ btn.className = 'session-btn resume'; btn.textContent = '▶ Reprendre'; }
  else { btn.className = 'session-btn pause'; btn.textContent = '⏸ Pause'; }
}

function updateSessionPhase(step){
  const tag = document.getElementById('sessionTypeTag');
  if(tag){
    tag.textContent = step.action === 'PAUSE'
      ? `Repos · avant type ${step.blockPos + 1}/${EXERCISE_SEQUENCE.length}`
      : `Type ${step.blockPos}/${EXERCISE_SEQUENCE.length} · ${step.typeName || ''}`;
  }
  const strip = document.getElementById('sessionTypeStrip');
  if(strip){
    strip.querySelectorAll('.seg').forEach(n => {
      const idx = parseInt(n.getAttribute('data-idx'), 10);
      n.classList.toggle('done', idx < step.segIndex);
      n.classList.toggle('current', idx === step.segIndex);
      n.classList.toggle('upcoming', idx > step.segIndex);
    });
    const current = strip.querySelector('.seg.current');
    if(current) current.scrollIntoView({ inline:'center', behavior:'smooth', block:'nearest' });
  }
}

function updateSessionFrame(info){
  const { step, t, glow } = info;
  const countEl = document.getElementById('sessionCount');
  const coachEl = document.getElementById('sessionCoachLabel');
  const haloEl = document.getElementById('sessionHalo');
  const rotorEl = document.getElementById('sessionRingRotor');
  const totalEl = document.getElementById('sessionTotalRemaining');

  // Décompte affiché au centre : le temps restant pour le TYPE de contraction en
  // cours dans son ensemble (pas le micro-pas), jusqu'à 0.
  const elapsedInStep = Math.max(0, step.duration - info.remainingStepMs);
  const remainingTypeMs = Math.max(0, (step.remainingInBlockAtStepStart != null ? step.remainingInBlockAtStepStart : info.remainingStepMs) - elapsedInStep);
  if(countEl) countEl.textContent = Math.max(0, Math.ceil(remainingTypeMs/1000));
  if(coachEl) coachEl.textContent = coachTextFor(step, t);

  if(haloEl){
    const scale = (1 + glow*1.55).toFixed(3);
    const opacity = Math.min(1, 0.1 + glow*0.95).toFixed(2);
    haloEl.style.transform = `scale(${scale})`;
    haloEl.style.opacity = opacity;
  }
  if(rotorEl && step.blockTotalMs){
    const elapsedInBlock = Math.max(0, step.blockTotalMs - remainingTypeMs);
    const angle = (elapsedInBlock / step.blockTotalMs) * 360;
    rotorEl.style.transform = `rotate(${angle}deg)`;
  }
  if(totalEl) totalEl.textContent = `Temps restant : ${formatMMSS(info.remainingTotalMs)}`;
}

function onSessionComplete(reason){
  if(reason === 'completed'){
    cue('finish');
    document.getElementById('sessionRoot').innerHTML = '';
    showFeedbackScreen();
  } else {
    addSessionRecord({ id:'sess_'+Date.now(), exerciseName: KEGEL_EXERCISE.name, date: Date.now(), completed:false });
    document.getElementById('sessionRoot').innerHTML = '';
    activeEngine = null;
    render();
    toast('Séance interrompue — non comptabilisée, vous pouvez recommencer.');
  }
}

/* ---------- Feedback post-séance — une seule fois, après l'exercice complet ---------- */
function showFeedbackScreen(){
  const fb = { difficulty:2, fatigue:2, quality:3, relaxation:3, pain:0 };
  const root = document.getElementById('sessionRoot');

  function draw(){
    root.innerHTML = `
    <div class="session-overlay" style="background:var(--bg);color:var(--text);">
      <div class="fb-wrap">
        <h1 style="font-size:19px;font-weight:800;margin-bottom:2px;">Séance terminée 🎉</h1>
        <p style="font-size:13px;color:var(--text-soft);margin-bottom:22px;">Exercice de Kegel complet — quelques questions pour ajuster la suite de votre programme.</p>

        ${fbScale('difficulty','Difficulté ressentie', ['Trop facile','Facile','Adaptée','Difficile','Trop difficile'], fb.difficulty)}
        ${fbScale('fatigue','Fatigue musculaire', ['Aucune','Légère','Modérée','Forte','Épuisante'], fb.fatigue)}
        ${fbScale('quality',"Qualité d'exécution", ['Faible','Passable','Correcte','Bonne','Excellente'], fb.quality)}
        ${fbScale('relaxation','Relâchement après l\'effort', ['Difficile','Partiel','Moyen','Bon','Complet'], fb.relaxation)}
        ${fbScale('pain','Douleur pendant la séance', ['Aucune','Légère','Modérée','Forte','Très forte'], fb.pain, true)}

        ${fb.pain>=2 ? `
        <div class="safety-banner">
          <span class="ic">⚠️</span>
          <p>Une douleur modérée à forte a été signalée. Pour votre sécurité, la progression sera mise en pause. Si la douleur persiste, nous vous recommandons de consulter un professionnel de santé avant de poursuivre les séances.</p>
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
    document.getElementById('fbSubmitBtn').addEventListener('click', () => submitFeedback(fb));
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

function submitFeedback(fb){
  const record = {
    id: 'sess_' + Date.now(),
    exerciseName: KEGEL_EXERCISE.name,
    date: Date.now(),
    completed: true,
    feedback: fb,
    painFlag: fb.pain >= 2
  };
  addSessionRecord(record);
  lsSet('lastSessionEnd', Date.now());

  let level = getProgramLevel();
  let painStreak = lsGet('programPainStreak', 0);
  if(record.painFlag){
    level = Math.max(1, level - 1);
    painStreak += 1;
  } else {
    painStreak = 0;
    if(fb.difficulty <= 1 && fb.quality >= 3 && fb.fatigue <= 2) level = Math.min(4, level + 1);
  }
  setProgramLevel(level);
  lsSet('programPainStreak', painStreak);

  document.getElementById('sessionRoot').innerHTML = '';
  activeEngine = null;
  navigate('dashboard');
  toast(record.painFlag ? 'Séance enregistrée — douleur notée' : 'Séance enregistrée ✅');
  if(painStreak >= 2){
    setTimeout(() => toast('⚠️ Pensez à consulter un professionnel de santé'), 1300);
  }
}

/* ============ 11. INITIALISATION ============ */
function init(){
  const loggedIn = isLoggedIn();
  const profile = getProfile();
  STATE.view = !loggedIn ? 'welcome' : (!profile ? 'questionnaire' : 'dashboard');
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
