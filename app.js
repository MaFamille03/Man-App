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

/* ============ 4. L'EXERCICE DE KEGEL — 3 MODULES, quotidien, x2/jour, roulement hebdo ============
   Moteur piloté par données. Types d'étape reconnus :
     CONTRACT / RELEASE / REST / HOLD / PULSE / RAMP_UP / RAMP_DOWN / LOOP / PAUSE / CHECKPOINT
   Structure d'une séance : Module 1 « Contraction » (6 types, tirés d'une réserve de
   10 et qui tournent chaque semaine — 2 retirés / 2 ajoutés — voir plus bas), un
   CHECKPOINT (propose de continuer ou de faire une pause), puis Module 2
   « Respiration » (1 technique parmi 4, qui tourne chaque semaine), un second
   CHECKPOINT, puis Module 3 « Contrôle de l'excitation » (3 exercices tirés d'une
   réserve de 6, qui tournent aussi chaque semaine, deux d'entre eux avec une tenue
   qui s'allonge progressivement). Des pauses de 9s ("Repos") séparent chaque bloc ;
   les relâchements À L'INTÉRIEUR d'un bloc s'appellent "Relâcher". Les 6 durées des
   blocs de contraction restent FIXES d'une semaine à l'autre (45/60/65/69/45/63 s,
   347s au total) : seul le TYPE de contraction affecté à chaque durée change, donc
   le temps d'exercice du module 1 ne bouge pas (idem pour les modules 2 et 3, sur
   leurs propres durées fixes). */
const PAUSE_BETWEEN_TYPES_MS = 9000;

// Construit une boucle de `unit` (motif de base, en durées nominales "durMs") pour
// atteindre EXACTEMENT targetMs, avec une répétition partielle finale si besoin —
// c'est ce qui garantissait déjà les totaux exacts (45s, 60s, ...) au tour précédent,
// généralisé ici pour n'importe quel motif et n'importe quelle cible.
function buildLoopToExact(unit, targetMs){
  const mk = (u, dur) => {
    const s = { action:u.action, duration:dur };
    if(u.intensity != null) s.intensity = u.intensity;
    if(u.from != null) s.from = u.from;
    if(u.to != null) s.to = u.to;
    if(u.count != null) s.count = u.count;
    return s;
  };
  const unitMs = unit.reduce((a,s) => a + s.durMs, 0);
  const loops = Math.max(0, Math.floor(targetMs / unitMs));
  let remaining = targetMs - loops * unitMs;
  const steps = [];
  for(let i=0;i<loops;i++) unit.forEach(u => steps.push(mk(u, u.durMs)));
  for(let i=0;i<unit.length && remaining > 0;i++){
    const take = Math.min(unit[i].durMs, remaining);
    if(take > 0) steps.push(mk(unit[i], take));
    remaining -= take;
  }
  return steps;
}

/* Réserve de types de contraction (les 5 fournis + 5 nouveaux construits sur le même
   principe : alternance rapide/lente, montée par paliers, maintien long, oscillation
   continue, salves — les grands classiques de la rééducation périnéale de type
   Kegel). Les noms des 5 premiers sont conservés tels quels (non traduits). */
const CONTRACTION_POOL = {
  'trembling-2': { name:'Trembling 2', category:'endurance', unit:[
    { action:'CONTRACT', durMs:1000, intensity:0.55 }, { action:'RELEASE', durMs:1000, intensity:0.55 }
  ]},
  'front-clamp': { name:'Front Clamp', category:'control', unit:[
    { action:'RAMP_UP', durMs:2000, from:0.3, to:1 }, { action:'RELEASE', durMs:500, intensity:1 }
  ]},
  'short-holding-2': { name:'Short Holding 2', category:'endurance', unit:[
    { action:'HOLD', durMs:6000, intensity:0.85 }, { action:'RELEASE', durMs:6000, intensity:0.85 }
  ]},
  'starter': { name:'Starter', category:'control', unit:[
    { action:'CONTRACT', durMs:500, intensity:0.5 }, { action:'RELEASE', durMs:500, intensity:0.5 },
    { action:'CONTRACT', durMs:4000, intensity:0.9 }, { action:'RELEASE', durMs:500, intensity:0.9 }
  ]},
  'steady-trembling': { name:'Steady trembling', category:'endurance', unit:[
    { action:'CONTRACT', durMs:4000, intensity:0.7 }, { action:'RELEASE', durMs:2000, intensity:0.7 }
  ]},
  'elevator': { name:'Elevator', category:'control', unit:[
    { action:'RAMP_UP', durMs:700, from:0, to:0.35 }, { action:'HOLD', durMs:600, intensity:0.35 },
    { action:'RAMP_UP', durMs:700, from:0.35, to:0.7 }, { action:'HOLD', durMs:600, intensity:0.7 },
    { action:'RAMP_UP', durMs:700, from:0.7, to:1 }, { action:'HOLD', durMs:1000, intensity:1 },
    { action:'RELEASE', durMs:1700, intensity:1 }
  ]}, // contraction "par étages", façon ascenseur, avant un relâchement complet
  'quick-flicks': { name:'Quick Flicks', category:'control', unit:[
    { action:'CONTRACT', durMs:300, intensity:0.8 }, { action:'RELEASE', durMs:300, intensity:0.8 }
  ]}, // contractions très brèves et rapides (fibres à contraction rapide)
  'long-hold': { name:'Long Hold', category:'endurance', unit:[
    { action:'RAMP_UP', durMs:1500, from:0, to:1 }, { action:'HOLD', durMs:8000, intensity:1 }, { action:'RELEASE', durMs:3000, intensity:1 }
  ]}, // un maintien long et soutenu, proche de la composante "Endurance" du PERFECT scheme
  'wave': { name:'Wave', category:'relaxation', unit:[
    { action:'RAMP_UP', durMs:2500, from:0.15, to:0.75 }, { action:'RAMP_DOWN', durMs:2500, from:0.75, to:0.15 }
  ]}, // oscillation continue, sans à-coup, pour travailler le contrôle en douceur
  'pulse-burst': { name:'Pulse Burst', category:'endurance', unit:[
    { action:'PULSE', durMs:2000, count:6, intensity:0.75 }, { action:'RELEASE', durMs:1500, intensity:0.75 }
  ]}
};
const CONTRACTION_POOL_ORDER = ['trembling-2','front-clamp','short-holding-2','starter','steady-trembling','elevator','quick-flicks','long-hold','wave','pulse-burst'];
const SLOT_DURATIONS_MS = [45000, 60000, 65000, 69000, 45000, 63000]; // fixes, 347000ms au total, chaque semaine

/* Roulement hebdomadaire : la toute première semaine reprend exactement la séquence
   fournie (avec Trembling 2 en double). À partir de la semaine 2, on fait glisser une
   fenêtre de 6 types sur la réserve de 10 (circulaire), décalée de 2 chaque semaine :
   ça retire mécaniquement les 2 types les plus anciens et en ajoute 2 nouveaux, tout
   en gardant les 6 mêmes durées ci-dessus (donc le temps total ne change jamais). */
function weeklyContractionIds(weekIdx){
  if(weekIdx <= 0) return ['trembling-2','front-clamp','short-holding-2','starter','trembling-2','steady-trembling'];
  const n = CONTRACTION_POOL_ORDER.length;
  const offset = (2 * weekIdx) % n;
  const ids = [];
  for(let i=0;i<6;i++) ids.push(CONTRACTION_POOL_ORDER[(offset + i) % n]);
  return ids;
}

/* ---- Module 2 — Respiration ---------------------------------------------------
   4 techniques de respiration réelles, une par semaine (rotation simple : pratiquer
   UNE technique de façon cohérente pendant la séance, comme en pratique clinique,
   plutôt que d'en mélanger plusieurs). Le halo/le son suivent le même signal que
   pour les contractions, mais avec une amplitude volontairement plus douce (on
   "sent" la respiration, on ne "serre" pas) : inspiration = REST (aucune tension,
   le plancher pelvien s'allonge), expiration = légère montée/descente (le plancher
   pelvien remonte doucement), conformément à la coordination souffle/plancher
   pelvien décrite en rééducation pelvienne. */
const BREATHING_POOL = {
  'diaphragmatic-55': { name:'Respiration diaphragmatique 5-5', unit:[
    { action:'REST', durMs:5000 },
    { action:'RAMP_UP', durMs:2500, from:0, to:0.35 },
    { action:'RAMP_DOWN', durMs:2500, from:0.35, to:0 }
  ]}, // inspire 5s (ventre qui se gonfle) / expire 5s (légère remontée du plancher pelvien) — Hinge Health / APTA Pelvic Health
  'box-4444': { name:'Respiration carrée 4-4-4-4', unit:[
    { action:'REST', durMs:4000 },
    { action:'RAMP_UP', durMs:800, from:0, to:0.3 }, { action:'HOLD', durMs:3200, intensity:0.3 },
    { action:'RAMP_DOWN', durMs:4000, from:0.3, to:0 },
    { action:'REST', durMs:4000 }
  ]}, // inspire 4s / retenue 4s / expire 4s / retenue poumons vides 4s — "box breathing", régulation du système nerveux autonome
  '478': { name:'Respiration 4-7-8', unit:[
    { action:'REST', durMs:4000 },
    { action:'HOLD', durMs:7000, intensity:0.3 },
    { action:'RAMP_DOWN', durMs:8000, from:0.3, to:0 }
  ]}, // inspire 4s (nez) / retenue 7s / expire longue 8s (bouche) — méthode 4-7-8, le ratio compte plus que la durée exacte
  'coherent-55': { name:'Respiration cohérente (~5,5/min)', unit:[
    { action:'REST', durMs:5500 },
    { action:'RAMP_UP', durMs:1800, from:0, to:0.3 }, { action:'RAMP_DOWN', durMs:3700, from:0.3, to:0 }
  ]} // ~5,5 cycles/minute — respiration de cohérence cardiaque, favorise la régulation du système nerveux autonome
};
const BREATHING_POOL_ORDER = ['diaphragmatic-55','box-4444','478','coherent-55'];
const BREATHING_TARGET_MS = 56000;
function weeklyBreathingId(weekIdx){ return BREATHING_POOL_ORDER[weekIdx % BREATHING_POOL_ORDER.length]; }

/* ---- Module 3 — Contrôle de l'excitation ---------------------------------------
   Exercices informels inspirés de techniques comportementales reconnues pour le
   contrôle éjaculatoire — le "stop-start" (méthode Semans), la "squeeze technique"
   (Masters & Johnson) et l'entraînement du plancher pelvien pour ce même objectif
   (contractions rapides, tenues qui s'allongent progressivement sur plusieurs
   semaines). L'app ne simule pas d'activité sexuelle : elle entraîne le geste
   musculaire (serrage ferme, tenue, relâchement, rythme monter/stopper) que ces
   techniques utilisent, à appliquer ensuite dans la pratique réelle (seul ou en
   couple). Comme le module 1, la sélection tourne chaque semaine (fenêtre de 3 sur
   une réserve de 6) et deux exercices (tenue progressive, compression) voient leur
   temps de tenue s'allonger avec les semaines — écho direct à la progression citée
   dans la littérature (isolation semaines 1-2, force semaines 2-4, tenues prolongées
   semaines 8-12). Purement informel, non médical — comme précisé au questionnaire. */
const EXCITATION_POOL = {
  'quick-control': { name:'Contractions rapides de contrôle', category:'excitation', unit:[
    { action:'PULSE', durMs:5000, count:10, intensity:1 }, { action:'RELEASE', durMs:2000, intensity:1 }
  ]}, // 10 contractions rapides — le volet "quick contractions" de l'entraînement PFM pour l'éjaculation
  'compression': { name:'Compression', category:'excitation', unit:[
    { action:'CONTRACT', durMs:1500, intensity:1 }, { action:'HOLD', durMs:8000, intensity:1 },
    { action:'RELEASE', durMs:4000, intensity:1 }, { action:'REST', durMs:4000 }
  ]}, // inspiré de la squeeze technique : serrage ferme et soutenu, puis relâchement complet et pause
  'stop-go': { name:'Stop & Go', category:'excitation', unit:[
    { action:'RAMP_UP', durMs:6000, from:0, to:1 }, { action:'HOLD', durMs:1500, intensity:1 },
    { action:'RELEASE', durMs:1500, intensity:1 }, { action:'REST', durMs:9000 }
  ]}, // rythme du "stop-start" (Semans) : montée en intensité puis arrêt complet, le temps que ça redescende
  'progressive-hold': { name:'Tenue progressive', category:'excitation', unit:[
    { action:'RAMP_UP', durMs:1500, from:0, to:1 }, { action:'HOLD', durMs:5000, intensity:1 },
    { action:'RELEASE', durMs:2500, intensity:1 }, { action:'REST', durMs:2000 }
  ]}, // la tenue s'allonge de semaine en semaine (voir excitationUnitFor)
  'plateau': { name:'Plateau maîtrisé', category:'excitation', unit:[
    { action:'RAMP_UP', durMs:4000, from:0, to:1 }, { action:'HOLD', durMs:6000, intensity:1 },
    { action:'RAMP_DOWN', durMs:4000, from:1, to:0 }
  ]}, // rester "en haut" sans redescendre brutalement : la maîtrise du plateau plutôt que le pic
  'breath-anchor': { name:'Ancrage respiratoire', category:'excitation', unit:[
    { action:'REST', durMs:4000 }, { action:'CONTRACT', durMs:1000, intensity:0.7 },
    { action:'HOLD', durMs:3000, intensity:0.7 }, { action:'RELEASE', durMs:3000, intensity:0.7 }
  ]} // respire profondément (facteur clé cité pour le stop-start, active le système parasympathique) puis freine doucement
};
const EXCITATION_POOL_ORDER = ['quick-control','compression','stop-go','progressive-hold','plateau','breath-anchor'];
const EXCITATION_SLOT_DURATIONS_MS = [30000, 30000, 30000];
function weeklyExcitationIds(weekIdx){
  const n = EXCITATION_POOL_ORDER.length;
  const offset = weekIdx % n;
  const ids = [];
  for(let i=0;i<3;i++) ids.push(EXCITATION_POOL_ORDER[(offset + i) % n]);
  return ids;
}
function excitationUnitFor(id, weekIdx){
  const def = EXCITATION_POOL[id];
  const growth = Math.min(1, weekIdx / 16); // atteint son maximum vers la semaine 17
  if(id === 'progressive-hold'){
    const holdMs = Math.round(5000 + growth * 5000); // 5s (semaine 1) -> jusqu'à 10s
    return def.unit.map(s => s.action === 'HOLD' ? Object.assign({}, s, { durMs: holdMs }) : s);
  }
  if(id === 'compression'){
    const holdMs = Math.round(8000 + growth * 4000); // 8s -> jusqu'à 12s
    return def.unit.map(s => s.action === 'HOLD' ? Object.assign({}, s, { durMs: holdMs }) : s);
  }
  return def.unit;
}

function appendBlock(steps, segments, name, category, flatSteps, moduleIdx){
  const blockTotalMs = flatSteps.reduce((a,s) => a + s.duration, 0);
  const blockId = segments.filter(s => s.kind === 'block').length;
  const segIndex = segments.length;
  segments.push({ kind:'block', name });
  let cursor = blockTotalMs;
  flatSteps.forEach((s, si) => {
    const remainingInBlockAtStepStart = cursor;
    cursor -= s.duration;
    steps.push(Object.assign({}, s, {
      blockId, blockPos: blockId + 1, typeName: name, typeCategory: category, moduleIdx,
      blockTotalMs, remainingInBlockAtStepStart, segIndex, blockStart: si === 0
    }));
  });
}
function appendPause(steps, segments, blockPos, typeName, typeCategory, moduleIdx){
  const segIndex = segments.length;
  segments.push({ kind:'pause', name:'Repos' });
  steps.push({
    action:'PAUSE', duration: PAUSE_BETWEEN_TYPES_MS,
    blockId: blockPos - 1, blockPos, typeName, typeCategory, moduleIdx,
    blockTotalMs: PAUSE_BETWEEN_TYPES_MS, remainingInBlockAtStepStart: PAUSE_BETWEEN_TYPES_MS,
    segIndex, blockStart:false
  });
}
/* Point de synchronisation entre deux modules : durée 0, le moteur s'arrête et
   attend une décision explicite de l'utilisateur (voir SessionEngine.continueFromCheckpoint)
   plutôt que de continuer automatiquement — "on te propose de continuer ou de mettre
   une pause avant de passer au module suivant". */
function appendCheckpoint(steps, segments, moduleFrom, moduleTo, fromName, toName){
  const segIndex = Math.max(0, segments.length - 1);
  steps.push({
    action:'CHECKPOINT', duration:0, moduleFrom, moduleTo, fromName, toName,
    blockId:-1, blockPos:0, typeName:'', typeCategory:'checkpoint', moduleIdx: moduleFrom,
    blockTotalMs:0, remainingInBlockAtStepStart:0, segIndex, blockStart:false
  });
}

function buildFullExercise(weekIdx){
  const steps = [], segments = [];

  // ---- Module 1 : Contraction (Kegel) ----
  const ids = weeklyContractionIds(weekIdx);
  ids.forEach((id, i) => {
    const def = CONTRACTION_POOL[id];
    const flat = buildLoopToExact(def.unit, SLOT_DURATIONS_MS[i]);
    appendBlock(steps, segments, def.name, def.category, flat, 1);
    appendPause(steps, segments, i + 1, def.name, def.category, 1);
  });
  appendCheckpoint(steps, segments, 1, 2, 'Contraction', 'Respiration');

  // ---- Module 2 : Respiration ----
  const breathId = weeklyBreathingId(weekIdx);
  const breathDef = BREATHING_POOL[breathId];
  const breathFlat = buildLoopToExact(breathDef.unit, BREATHING_TARGET_MS);
  appendBlock(steps, segments, breathDef.name, 'breathing', breathFlat, 2);
  appendPause(steps, segments, ids.length + 1, breathDef.name, 'breathing', 2);
  appendCheckpoint(steps, segments, 2, 3, 'Respiration', "Contrôle de l'excitation");

  // ---- Module 3 : Contrôle de l'excitation ----
  const exIds = weeklyExcitationIds(weekIdx);
  exIds.forEach((id, i) => {
    const def = EXCITATION_POOL[id];
    const unit = excitationUnitFor(id, weekIdx);
    const flat = buildLoopToExact(unit, EXCITATION_SLOT_DURATIONS_MS[i]);
    appendBlock(steps, segments, def.name, def.category, flat, 3);
    if(i < exIds.length - 1) appendPause(steps, segments, ids.length + 1 + i + 1, def.name, def.category, 3);
  });

  const totalBlocks = segments.filter(s => s.kind === 'block').length;
  return {
    id:'exercice-kegel', name:'Exercice de Kegel',
    objective:`Semaine ${weekIdx+1} : ${ids.length} types de contraction, puis respiration (${breathDef.name}), puis contrôle de l'excitation (${exIds.length} exercices).`,
    steps, segments, totalBlocks,
    contractionBlockCount: ids.length,
    breathingBlockCount: 1,
    excitationBlockCount: exIds.length,
    weekIdx
  };
}
// Nom de phase pour l'affichage : chaque bloc "sait" dans quelle grande phase il se
// trouve. Le module Respiration occupe toujours EXACTEMENT un bloc, donc cette simple
// comparaison reste valable même si le nombre de blocs du module 3 varie.
function phaseNameForBlockId(blockId, contractionBlockCount){
  if(blockId < contractionBlockCount) return 'Contractions';
  if(blockId === contractionBlockCount) return 'Respiration';
  return "Contrôle de l'excitation";
}
function getTodayExercise(){ return buildFullExercise(programWeekIndex()); }

// Mini-exercice utilisé UNE fois, juste après le questionnaire, pour aider à
// identifier physiquement le bon muscle (module 1) avant de démarrer le programme —
// 3 contractions de 3s / relâchements de 3s, avec le même retour son+halo qu'une
// vraie séance. Ne compte pas comme une séance du jour (pas d'appel à addSessionRecord).
function buildCalibrationExercise(){
  const steps = [], segments = [];
  const unit = [{ action:'CONTRACT', durMs:3000, intensity:1 }, { action:'RELEASE', durMs:3000, intensity:1 }];
  const flat = buildLoopToExact(unit, 18000);
  appendBlock(steps, segments, 'Calibration', 'calibration', flat, 1);
  return {
    id:'calibration', name:'Contraction guidée',
    objective:'Identifiez la bonne contraction avant de commencer votre programme.',
    steps, segments, totalBlocks:1, contractionBlockCount:1, breathingBlockCount:0, excitationBlockCount:0
  };
}

// Coaching adapté à chaque module : le vocabulaire d'une contraction Kegel
// ("Contractez fort") n'a pas de sens pour une respiration ("Inspirez") ni pour un
// exercice de contrôle ("Freinez, gardez la maîtrise") — même vocabulaire d'action
// (CONTRACT/HOLD/RAMP_UP...), trois façons différentes de le dire au bon moment.
const STEP_COACH_M1 = {
  CONTRACT:'Contractez', RELEASE:'Relâchez', REST:'Reposez-vous', HOLD:'Maintenez la contraction',
  PULSE:'Petites pulsations', RAMP_DOWN:'Relâchez progressivement', PAUSE:'Relâchez, respirez'
};
const STEP_COACH_M2 = {
  REST:'Inspirez, laissez le ventre se gonfler', RAMP_UP:'Expirez, légère remontée',
  HOLD:'Retenez doucement', RAMP_DOWN:'Expirez lentement', RELEASE:'Expirez lentement',
  PAUSE:'Respirez librement'
};
const STEP_COACH_M3 = {
  CONTRACT:'Contractez fort, freinez', RELEASE:'Relâchez complètement', REST:'Respirez, laissez retomber',
  HOLD:'Maintenez la compression', PULSE:'Contractions rapides de contrôle',
  RAMP_DOWN:'Redescente maîtrisée', PAUSE:'Respirez, relâchez'
};
function coachTextFor(step, t){
  const m = step.moduleIdx;
  if(step.action === 'RAMP_UP'){
    if(m === 2) return STEP_COACH_M2.RAMP_UP;
    if(m === 3) return (t != null && t < 0.5) ? 'Serrez, montez en puissance' : 'Serrez fort, gardez le contrôle';
    return (t != null && t < 0.5) ? 'Serrer légèrement' : 'Serrer fort';
  }
  const table = m === 2 ? STEP_COACH_M2 : (m === 3 ? STEP_COACH_M3 : STEP_COACH_M1);
  return table[step.action] || '';
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

// Étape obligatoire, une seule fois par compte, entre le questionnaire et le
// tableau de bord : identifier le bon muscle (module 1) et comprendre les repères
// des modules 2/3 avant de commencer le programme.
function isCalibrationDone(){ return !!lsGet('calibrationDone', false); }
function setCalibrationDone(){ lsSet('calibrationDone', true); }

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

/* Toute la logique de semaine/jour ci-dessous s'appuie sur de VRAIES dates
   calendaires (lundi → dimanche), jamais sur un décalage "jour N depuis le
   début du programme" : une séance faite un samedi doit être comptée un
   samedi, pas glisser vers un autre jour selon le jour où le programme a
   démarré. Une journée ne "compte" dans les statistiques QUE si les deux
   séances obligatoires (espacées de 2h) ont bien été faites ce jour-là :
   une seule séance ce jour-là ne compte pour rien (pas de crédit partiel). */
function mondayOf(ts){
  const d = new Date(startOfDay(ts));
  const dow = d.getDay(); // 0=dimanche .. 6=samedi
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d.getTime();
}
function isDayComplete(ts){ return sessionsOnDay(ts).length >= DAILY_REQUIRED; }

function programDayIndex(){
  const start = lsGet('programStart', Date.now());
  return Math.max(0, Math.floor((startOfDay(Date.now()) - startOfDay(start)) / 86400000));
}
// Semaine réelle (lundi-dimanche) écoulée depuis la semaine calendaire de démarrage.
function programWeekIndex(){
  const start = lsGet('programStart', Date.now());
  const idx = Math.floor((mondayOf(Date.now()) - mondayOf(start)) / (7 * 86400000));
  return Math.max(0, Math.min(TOTAL_WEEKS - 1, idx));
}
// Bornes réelles (lundi 00:00 → dimanche 24:00) de la semaine de programme `weekIdx`.
function weekBounds(weekIdx){
  const start = lsGet('programStart', Date.now());
  const from = mondayOf(start) + weekIdx * 7 * 86400000;
  return { from, to: from + 7 * 86400000 };
}
function weekSessions(weekIdx){
  const { from, to } = weekBounds(weekIdx);
  return getSessions().filter(s => s.completed && s.date >= from && s.date < to);
}
// Nombre de jours PLEINEMENT complétés (2/2, espacés de 2h) dans cette semaine réelle.
function weekFullDaysCount(weekIdx){
  const { from } = weekBounds(weekIdx);
  let n = 0;
  for(let i=0;i<7;i++) if(isDayComplete(from + i*86400000)) n++;
  return n;
}
function weekCompletionRatio(weekIdx){ return weekFullDaysCount(weekIdx) / 7; }

// Moyenne (0-4) des 3 qualités ressenties par module pour une séance donnée — sert de
// résumé compact dans l'historique. Tolère l'ancien format ("quality" unique) pour
// des séances enregistrées avant l'introduction des 3 modules.
function avgModuleQuality(fb){
  if(!fb) return 0;
  const vals = [fb.qualityM1, fb.qualityM2, fb.qualityM3].filter(v => v != null);
  if(vals.length === 0) return fb.quality != null ? fb.quality : 0;
  return Math.round(vals.reduce((a,v) => a+v, 0) / vals.length);
}
// Moyenne (0-4) d'un module précis ('qualityM1'/'qualityM2'/'qualityM3') sur toutes
// les séances complètes d'une semaine réelle donnée — base de la "corrélation
// dynamique" demandée entre le programme et le progrès réellement constaté.
// Renvoie null si aucune donnée cette semaine-là (semaine pas encore vécue).
function weekModuleQualityAvg(weekIdx, key){
  const sessions = weekSessions(weekIdx).filter(s => s.feedback && s.feedback[key] != null);
  if(sessions.length === 0) return null;
  return sessions.reduce((a,s) => a + s.feedback[key], 0) / sessions.length;
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

// Assiduité "tout ou rien" : seuls les jours PLEINEMENT complétés (2 séances, 2h
// d'écart) comptent — un jour avec une seule séance ne rapporte rien, exactement
// comme demandé ("si je ne fais pas deux séances par jour... ça ne compte pas").
function adherencePct(){
  const startDay = startOfDay(lsGet('programStart', Date.now()));
  const todayDay = startOfDay(Date.now());
  const elapsedDays = Math.max(1, Math.round((todayDay - startDay) / 86400000) + 1);
  let fullDays = 0;
  for(let i=0;i<elapsedDays;i++) if(isDayComplete(startDay + i*86400000)) fullDays++;
  return Math.max(0, Math.min(100, Math.round((fullDays / elapsedDays) * 100)));
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

// La semaine affichée sur le tableau de bord est la VRAIE semaine calendaire en
// cours (lundi → dimanche), pas un décalage relatif au jour de démarrage du
// programme — sinon une séance faite un vrai samedi peut se retrouver affichée
// sous l'étiquette "lundi". dateNum/dow viennent directement de la vraie date.
function currentWeekDayStatuses(){
  const weekStart = mondayOf(Date.now());
  const todayStart = startOfDay(Date.now());
  const programStartDay = startOfDay(lsGet('programStart', Date.now()));
  const days = [];
  for(let i=0;i<7;i++){
    const dayTs = weekStart + i * 86400000;
    const dStart = startOfDay(dayTs);
    // Un jour avant le vrai début du programme n'est ni "à venir" ni "manqué" — le
    // programme n'existait pas encore ce jour-là, donc pas de rouge injustifié.
    const isBeforeStart = dStart < programStartDay;
    const isPast = dStart < todayStart && !isBeforeStart;
    days.push({
      dayTs, dateNum: new Date(dayTs).getDate(),
      count: (dStart > todayStart || isBeforeStart) ? 0 : sessionsOnDay(dayTs).length,
      isFuture: dStart > todayStart,
      isToday: dStart === todayStart,
      isPast, isBeforeStart,
      isFullyMissed: isPast && sessionsOnDay(dayTs).length < DAILY_REQUIRED
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
   installée) — le son synthétisé ici est donc le retour sensoriel fiable sur
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
function setSoundEnabled(v){ lsSet('soundOn', !!v); if(!v) silenceTone(); }
function beep(freq, durationMs, volume){
  if(!soundEnabled()) return;
  const ctx = ensureAudioCtx();
  if(!ctx) return;
  try{
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq || 440;
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

/* Son continu piloté par l'intensité de la contraction (computeContractionLevel,
   voir plus bas — le MÊME signal unique qui pilote aussi le halo visuel) : la hauteur
   ET le volume montent pendant la contraction, restent stables pendant un maintien —
   et coupent NET dès que le relâchement commence : aucun bip pendant le relâchement,
   ni pendant le repos. Le halo, lui, disparaît au même instant (même signal = 0) mais
   via une transition CSS plus lente (~200ms) pour rester lisible à l'œil comme un
   glissement doux plutôt qu'un saut — seul le son coupe aussi vite (~18ms). */
/* Plage de fréquences volontairement BASSE et resserrée (une octave, sol3~fa4) plutôt
   qu'aiguë : l'oreille humaine est naturellement bien plus sensible/fatigable entre
   2 et 5 kHz (voir les courbes isosoniques de Fletcher-Munson/ISO 226) — rester
   nettement en-dessous, sur un registre grave-médium chaud, rend le son confortable
   même pour une oreille sensible, sans perdre en clarté. Un filtre passe-bas doux
   arrondit encore le timbre (limite les harmoniques aiguës), et le volume plafond
   reste modéré (niveau conversationnel bas) — aucun risque auditif à l'usage prévu. */
let toneOsc = null, toneGain = null, toneFilter = null;
const TONE_FREQ_MIN = 190, TONE_FREQ_MAX = 360, TONE_VOL_MAX = 0.11;
function ensureTone(){
  const ctx = ensureAudioCtx();
  if(!ctx) return null;
  if(!toneOsc){
    try{
      toneOsc = ctx.createOscillator();
      toneFilter = ctx.createBiquadFilter();
      toneGain = ctx.createGain();
      toneOsc.type = 'sine';
      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 900;
      toneFilter.Q.value = 0.3;
      toneGain.gain.value = 0;
      toneOsc.connect(toneFilter);
      toneFilter.connect(toneGain);
      toneGain.connect(ctx.destination);
      toneOsc.start();
    }catch(e){ toneOsc = null; toneGain = null; toneFilter = null; return null; }
  }
  return { ctx, osc: toneOsc, gain: toneGain };
}
function setToneLevel(glow){
  const g = Math.max(0, Math.min(1, glow || 0));
  if(!soundEnabled() || g <= 0.001){ silenceTone(); return; }
  const t = ensureTone();
  if(!t) return;
  const freq = TONE_FREQ_MIN + (TONE_FREQ_MAX - TONE_FREQ_MIN) * g;
  const vol = TONE_VOL_MAX * (0.3 + 0.7 * g);
  const now = t.ctx.currentTime;
  try{
    t.osc.frequency.cancelScheduledValues(now);
    t.osc.frequency.setValueAtTime(t.osc.frequency.value, now);
    t.osc.frequency.linearRampToValueAtTime(freq, now + 0.04);
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(vol, now + 0.04);
  }catch(e){}
}
// Coupure NETTE (pas un fondu type "descend pendant le relâchement") : dès que
// computeContractionLevel repasse à 0 (RELEASE/REST/PAUSE), le gain rejoint 0 en
// ~18ms — juste assez pour éviter un "clic" audio, largement sous le seuil de
// perception d'un son qui "traîne". Aucun bip pendant le relâchement ou le repos.
function silenceTone(){
  if(toneGain){
    try{
      const ctx = toneGain.context, now = ctx.currentTime;
      toneGain.gain.cancelScheduledValues(now);
      toneGain.gain.setValueAtTime(toneGain.gain.value, now);
      toneGain.gain.linearRampToValueAtTime(0, now + 0.018);
    }catch(e){}
  }
}
function stopToneHard(){
  silenceTone();
  if(toneOsc){
    const osc = toneOsc, gain = toneGain;
    toneOsc = null; toneGain = null;
    setTimeout(() => { try{ osc.stop(); osc.disconnect(); gain.disconnect(); }catch(e){} }, 40);
  }
}

function cue(kind, intensity){
  const inten = intensity != null ? intensity : 0.6;
  switch(kind){
    case 'contract': vibrate(Math.round(140*inten)+40); break;
    case 'rampup': vibrate(30); break;
    case 'pause': vibrate(18); break; // repère haptique discret uniquement : aucun son pendant le repos
    case 'type-transition':
      // Signal distinct au changement de type de contraction, à l'instant précis où
      // la contraction reprend (jamais pendant le repos lui-même).
      vibrate([90,50,90]);
      // Carillon descendu d'une octave par rapport à l'ancienne version (740/988 Hz) :
      // même effet "transition" agréable, mais dans un registre grave, confortable.
      [370,494].forEach((f,i) => setTimeout(() => beep(f,130,0.14), i*130));
      break;
    case 'finish':
      vibrate([80,60,80]);
      [440,494,588].forEach((f,i) => setTimeout(() => beep(f,170,0.15), i*140));
      break;
    case 'checkpoint':
      // Marque la fin d'un module entier (plus qu'un simple changement de type) :
      // un repère haptique/sonore un peu plus marqué, dans le même registre grave.
      vibrate([100,50,100,50,100]);
      [330,415,494].forEach((f,i) => setTimeout(() => beep(f,180,0.15), i*150));
      break;
  }
}

/* Intensité UNIQUE (0..1) de la contraction en cours — pilote À LA FOIS le son (hauteur
   du bip) ET le halo visuel : les deux sont rattachés au même signal, comme demandé.
   Non nul uniquement pendant une contraction réelle qui progresse (CONTRACT, RAMP_UP,
   HOLD, PULSE, RAMP_DOWN — ce dernier reste une contraction active en cours d'évolution,
   ex. le type "Wave" qui oscille sans interruption nette). Zéro strict pendant
   RELEASE/REST/PAUSE : ni bip, ni halo, même transparent, pendant le relâchement ou le
   repos — le SAUT entre "0" et "valeur cible" au changement de pas est ensuite lissé
   séparément : côté son via la rampe de setToneLevel()/silenceTone() (très rapide,
   ~18-40ms, car une traînée sonore même brève s'entend comme "encore du bip"), côté
   visuel via une transition CSS sur .circle-halo (~200ms, un halo qui glisse en douceur
   de 0 à sa taille ou l'inverse, jamais un "coup" instantané). */
function computeContractionLevel(step, t){
  // Module 1 (Contraction/Kegel) : quel que soit le type choisi cette semaine-là, le
  // haut (1) et le bas (0) doivent TOUJOURS être atteints — seule la VITESSE pour y
  // arriver change (une contraction "immédiate" y monte en un éclair, une contraction
  // "progressive" y monte au fur et à mesure, sur toute la durée du pas) : on ignore
  // donc ici toute intensité/amplitude partielle définie dans le pool et on force la
  // pleine échelle 0..1, en gardant intacte la COURBE (donc la vitesse ressentie).
  if(step.moduleIdx === 1){
    switch(step.action){
      case 'CONTRACT': return t < 0.3 ? t/0.3 : 1; // montée rapide (~30% du pas) puis plein jusqu'au relâchement
      case 'HOLD': return 1; // maintien = toujours au maximum
      case 'PULSE': {
        const cyc = 1 / Math.max(1, step.count || 4);
        const local = (t % cyc) / cyc;
        return local < 0.5 ? local*2 : (1-local)*2; // pleine amplitude à chaque battement
      }
      case 'RAMP_UP': return t; // 0 -> 1 sur toute la durée du pas : vitesse = durée du pas
      case 'RAMP_DOWN': return 1 - t; // 1 -> 0 sur toute la durée du pas, contraction active en continu (ex. Wave)
      default: return 0; // RELEASE, REST, PAUSE : ni son ni halo
    }
  }
  // Modules 2/3 (respiration, contrôle de l'excitation) : intensité volontairement plus
  // douce, définie pas à pas dans leur propre pool — pas de normalisation forcée ici.
  const inten = step.intensity != null ? step.intensity : 0.6;
  switch(step.action){
    case 'CONTRACT': { const ease = t < 0.3 ? t/0.3 : 1; return ease * inten; }
    case 'HOLD': return inten;
    case 'PULSE': {
      const cyc = 1 / Math.max(1, step.count || 4);
      const local = (t % cyc) / cyc;
      const wave = local < 0.5 ? local*2 : (1-local)*2;
      return wave * inten;
    }
    case 'RAMP_UP': { const from = step.from!=null?step.from:0, to = step.to!=null?step.to:1; return from+(to-from)*t; }
    case 'RAMP_DOWN': { const from = step.from!=null?step.from:1, to = step.to!=null?step.to:0; return from+(to-from)*t; }
    default: return 0; // RELEASE, REST, PAUSE : ni son ni halo
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
    silenceTone();
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
    stopToneHard();
    if(this._raf) cancelAnimationFrame(this._raf);
    this._checkpointFinish = null;
    if(this._pendingResolve){
      const r = this._pendingResolve;
      this._pendingResolve = null;
      r();
    }
  }
  // Appelé par l'UI quand l'utilisateur choisit "Continuer" ou "Faire une pause" sur
  // l'écran de transition entre modules — reprend la progression au pas suivant.
  // pauseAfter=true ("Faire une pause") : le module suivant démarre puis se fige
  // IMMÉDIATEMENT (temps figé dès le 1er pas), prêt à être repris via le bouton pause
  // habituel — sans quoi la pause serait posée un cran trop tard (après reprise du fil).
  continueFromCheckpoint(pauseAfter){
    if(this._checkpointFinish){
      if(pauseAfter) this._pauseOnNextStep = true;
      const f = this._checkpointFinish;
      this._checkpointFinish = null;
      f();
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
      if(step.action === 'CHECKPOINT'){
        // Pas de minuteur : le moteur attend une décision explicite de l'utilisateur
        // (continueFromCheckpoint()) avant de passer au module suivant.
        this._checkpointFinish = finish;
        if(this.handlers.onCheckpoint) this.handlers.onCheckpoint(step);
        return;
      }
      if(this._pauseOnNextStep){
        this._pauseOnNextStep = false;
        this.paused = true;
        this._pauseStartTs = performance.now();
        if(this.handlers.onPause) this.handlers.onPause();
      }
      this._frame(step, 0, 0); // rendu immédiat du 1er pas, même si figé en pause juste au-dessus
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
    const glow = computeContractionLevel(step, t); // signal unique : pilote à la fois le son et le halo
    setToneLevel(glow); // le son ne joue QUE pendant la contraction, coupe net au relâchement
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
    else if(step.action === 'PAUSE') cue('pause'); // vibration seule : aucun son pendant le repos
  }

  _done(reason){
    stopToneHard();
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

/* Repositionne la barre de navigation du bas contre la vraie fenêtre VISIBLE
   (visualViewport), pas contre la fenêtre de mise en page — c'est ce qui évite
   qu'elle "saute" sur Safari iOS quand la barre d'adresse se rétracte ou
   réapparaît en changeant d'écran (Accueil/Programme/Progrès/Réglages n'ont pas
   tous la même hauteur de contenu, donc pas toujours le même état de la barre
   d'adresse). translateZ(0) est conservé dans la même transform pour garder la
   barre sur sa propre couche GPU (moins de tremblement pendant le scroll). */
function pinBottomNav(){
  const nav = document.querySelector('.bottom-nav');
  if(!nav) return;
  if(!window.visualViewport){ nav.style.transform = 'translateZ(0)'; return; }
  const vv = window.visualViewport;
  const gap = window.innerHeight - (vv.height + vv.offsetTop);
  nav.style.transform = gap > 0.5 ? `translateZ(0) translateY(-${gap}px)` : 'translateZ(0)';
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', pinBottomNav);
  window.visualViewport.addEventListener('scroll', pinBottomNav);
}
window.addEventListener('resize', pinBottomNav);

function render(){
  const app = document.getElementById('app');
  const loggedIn = isLoggedIn();
  const profile = getProfile();

  const calibrationDone = isCalibrationDone();

  if(!loggedIn && !['welcome','login','signup'].includes(STATE.view)) STATE.view = 'welcome';
  if(loggedIn && !profile && !['questionnaire','results'].includes(STATE.view)) STATE.view = 'questionnaire';
  // Étape obligatoire après le questionnaire, avant tout accès au tableau de bord :
  // identification du muscle (module 1) + repères pour les modules 2 et 3. On ne
  // redirige PAS depuis 'results' : l'écran de résultats doit s'afficher normalement,
  // c'est son propre bouton "Continuer" qui envoie vers la calibration.
  if(loggedIn && profile && !calibrationDone && !['calibration','results'].includes(STATE.view)) STATE.view = 'calibration';
  if(loggedIn && profile && ['welcome','login','signup'].includes(STATE.view)) STATE.view = 'dashboard';

  let html = '';
  switch(STATE.view){
    case 'welcome': html = renderWelcome(); break;
    case 'signup': html = renderSignup(); break;
    case 'login': html = renderLogin(); break;
    case 'questionnaire': html = renderQuestionnaire(); break;
    case 'results': html = renderResults(); break;
    case 'calibration': html = renderCalibration(); break;
    case 'dashboard': html = renderDashboard(); break;
    case 'programme': html = renderProgramme(); break;
    case 'progress': html = renderProgress(); break;
    case 'settings': html = renderSettings(); break;
    default: html = renderWelcome();
  }
  const showNav = ['dashboard','programme','progress','settings'].includes(STATE.view);
  app.innerHTML = html + (showNav ? renderBottomNav() : '');
  wireView();
  if(showNav) pinBottomNav();
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
  const ex = getTodayExercise();
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
        Un programme sur ${TOTAL_WEEKS} semaines vient d'être créé à partir de ces résultats. Chaque jour, deux séances identiques de l'Exercice de Kegel — 3 modules (Contraction, Respiration, Contrôle de l'excitation), environ ${estimateMinutes(ex)} minutes — espacées d'au moins 2h, sans exception et sans rattrapage possible en cas de séance manquée. Les exercices tournent chaque semaine pour varier le travail, sans changer la durée totale.
      </p>
    </div>
    <button class="btn btn-primary btn-block" id="goDashboardBtn" style="margin-top:14px;">Continuer</button>
  </div>`;
}

/* ---------- Calibration obligatoire (identification musculaire) ---------- */
function renderCalibration(){
  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Avant de commencer</h1></div>
    <div class="card">
      <h2>1. Identifiez le bon muscle (module Contraction)</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.6;">
        La façon la plus simple de le repérer : essayez de retenir un gaz, ou — une seule fois, pour sentir où ça se passe, sans en faire une habitude — d'arrêter le jet d'urine en cours de miction. Le bon muscle se contracte sans que vous serriez le ventre, les fesses ou les cuisses : si l'un de ces trois bouge, ce n'est pas le bon geste.
      </p>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.6;margin-top:8px;">
        Essayez maintenant une contraction guidée de 18 secondes (son + vibration, comme pendant une vraie séance) pour vous entraîner à isoler ce muscle avant de commencer le programme.
      </p>
      <button class="btn btn-primary btn-block" id="tryCalibrationBtn" style="margin-top:12px;">Essayer une contraction guidée</button>
    </div>
    <div class="card">
      <h2>2. Le module Respiration</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.6;">
        Une main sur le ventre, une sur la poitrine : à l'inspiration, c'est le ventre qui doit bouger le plus (le plancher pelvien s'allonge et se détend) ; à l'expiration, le plancher pelvien remonte doucement. Aucun effort à fournir — juste suivre le rythme affiché.
      </p>
    </div>
    <div class="card">
      <h2>3. Le module Contrôle de l'excitation</h2>
      <p style="font-size:13px;color:var(--text-soft);line-height:1.6;">
        Il entraîne le geste musculaire (serrage ferme, tenue, rythme monter/stopper) utilisé par des techniques comportementales reconnues (stop-start, squeeze) — à réutiliser ensuite dans votre pratique réelle, seul ou en couple. C'est un entraînement informel, pas un dispositif médical.
      </p>
    </div>
    <button class="btn btn-primary btn-block" id="calibrationDoneBtn" style="margin-top:14px;">C'est compris, commencer mon programme</button>
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
  const ex = getTodayExercise();

  let todayCardBody;
  if(todayCount >= DAILY_REQUIRED){
    todayCardBody = `<div class="done-note">Les deux séances d'aujourd'hui sont terminées ✅ Revenez demain — il n'y a pas de séance supplémentaire ni de rattrapage.</div>`;
  } else {
    todayCardBody = `<p>${escapeHtml(ex.objective)} · ${estimateMinutes(ex)} min environ</p>` + (
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
          <div class="day-pair ${d.isToday?'today':''} ${d.isFullyMissed?'fully-missed':''}">
            <div class="dow">${dow[i]}</div>
            <div class="dots">
              ${[0,1].map(slot => `<div class="day-dot ${slot<d.count?'done':((d.isFuture||d.isBeforeStart)?'future':(d.isToday?'pending':'missed'))}"></div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <p class="day-grid-note">Une journée ne compte dans votre assiduité que si les 2 séances (espacées de 2h) sont faites — sinon elle reste en rouge, définitivement.</p>
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
  const ex = getTodayExercise();
  const weeklyIds = weeklyContractionIds(wk);

  let weekGridHtml = '<div class="week-grid">';
  for(let w=0; w<TOTAL_WEEKS; w++){
    const isCurrent = w === wk;
    const isPast = w < wk;
    let cls = '';
    if(isCurrent) cls = 'current';
    else if(isPast){
      const ratio = weekCompletionRatio(w);
      cls = ratio >= 1 ? 'full' : (ratio > 0 ? 'partial' : '');
    }
    const fullDays = isPast || isCurrent ? weekFullDaysCount(w) : null;
    weekGridHtml += `<div class="week-cell ${cls}" title="${fullDays!=null?fullDays+'/7 jours complets':'À venir'}">${w+1}</div>`;
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
        <p class="unlocked-note">Déverrouillé pour aujourd'hui ✅ · ${weekFullDaysCount(wk)}/7 jours complets cette semaine</p>
        ${weekGridHtml}
      ` : `
        <div class="programme-lock-wrap">
          <div class="week-grid-blur">${weekGridHtml}</div>
          <div class="lock-banner">🔒 Validez vos ${DAILY_REQUIRED} séances du jour pour déverrouiller le programme complet (${todayCount}/${DAILY_REQUIRED} aujourd'hui)</div>
        </div>
      `}
      <p class="week-legend">🟩 semaine à 7/7 jours complets · 🟨 semaine partiellement complétée · ⬜ semaine sans aucun jour complet</p>
    </div>
    <div class="card">
      <h2>Cette semaine — semaine ${wk+1}</h2>
      <p style="font-size:12.5px;color:var(--text-soft);line-height:1.6;margin-bottom:10px;">
        Les types de contraction tournent chaque semaine (2 retirés, 2 ajoutés) pour varier le travail : voici les 6 de cette semaine, suivis du module Respiration puis du module Contrôle de l'excitation (lui aussi renouvelé chaque semaine) — ${estimateMinutes(ex)} min environ au total.
      </p>
      <div class="week-types-list">
        ${weeklyIds.map((id,i) => `<div class="week-type-chip"><span class="n">${i+1}</span>${escapeHtml(CONTRACTION_POOL[id].name)}</div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h2>Principe</h2>
      <p style="font-size:12.5px;color:var(--text-soft);line-height:1.6;">
        Chaque jour, deux séances identiques (mêmes 3 modules : Contraction, Respiration, Contrôle de l'excitation), espacées d'au moins 2h. Une séance non faite dans la journée est définitivement manquée — pas de rattrapage — et une journée avec une seule séance ne compte pour rien dans votre assiduité : il faut les 2.
      </p>
      <button class="btn btn-ghost btn-block" id="goDashFromProgBtn" style="margin-top:12px;">Voir l'exercice du jour</button>
    </div>
  </div>`;
}

/* ---------- Progrès ---------- */
function renderProgress(){
  const sessions = getSessions().slice().reverse();
  const weeksBack = 8;
  const wk = programWeekIndex();
  const weekIdxs = [];
  for(let i=weeksBack-1;i>=0;i--) weekIdxs.push(Math.max(0, wk-i));
  const counts = weekIdxs.map(w => weekFullDaysCount(w));
  const max = Math.max(1, 7, ...counts);

  // Évolution par module : moyenne de qualité ressentie (0-4), semaine par semaine,
  // calculée dynamiquement à partir des vraies séances enregistrées — pas de données
  // fictives. Une semaine sans séance complète affiche une barre vide (pas de donnée).
  const MODULES = [
    { key:'qualityM1', label:'Contraction' },
    { key:'qualityM2', label:'Respiration' },
    { key:'qualityM3', label:"Contrôle de l'excitation" }
  ];
  const moduleCharts = MODULES.map(m => {
    const vals = weekIdxs.map(w => weekModuleQualityAvg(w, m.key));
    return `
    <div class="module-trend">
      <div class="module-trend-label">${escapeHtml(m.label)}</div>
      <div class="chart chart-sm">
        ${vals.map(v => `<div class="chart-bar"><div class="fill ${v==null?'empty':''}" style="height:${v==null?'4':Math.max(6,(v/4)*100)}%"></div></div>`).join('')}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="wrap screen">
    <div class="topbar" style="padding-left:0;padding-right:0;"><h1>Progrès</h1></div>
    <div class="card">
      <h2>Jours complets / semaine (sur 7)</h2>
      <p style="font-size:11.5px;color:var(--text-soft);margin:-4px 0 10px;">Un jour ne compte que si les 2 séances du jour (espacées de 2h) ont été faites — reflète vos vraies dates, pas de rattrapage.</p>
      <div class="chart">
        ${counts.map(c => `<div class="chart-bar"><div class="fill" style="height:${Math.max(4,(c/max)*100)}%"></div></div>`).join('')}
      </div>
      <div class="chart-labels">${counts.map((_,i)=> `<span>${i===counts.length-1?'auj.':'-'+(counts.length-1-i)}</span>`).join('')}</div>
    </div>
    <div class="card">
      <h2>Évolution par module</h2>
      <p style="font-size:11.5px;color:var(--text-soft);margin:-4px 0 10px;">Qualité ressentie que vous avez indiquée après chaque séance, semaine par semaine (8 dernières semaines).</p>
      ${moduleCharts}
    </div>
    <div class="card">
      <h2>Historique des séances</h2>
      ${sessions.length===0 ? '<p class="empty-note">Aucune séance enregistrée pour l\'instant.</p>' : sessions.slice(0,60).map(s => `
        <div class="hist-item">
          <div class="hist-date">${formatDateShort(s.date)}</div>
          <div class="hist-info">
            <div class="name">${escapeHtml(s.exerciseName || 'Exercice de Kegel')}</div>
            <div class="meta">${s.completed ? 'Terminée' : 'Interrompue'}${s.feedback ? ' · qualité moyenne ' + (avgModuleQuality(s.feedback)+1) + '/5' : ''}</div>
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
      <h2>Sauvegarde</h2>
      <div class="settings-row">
        <div><div class="lbl">Exporter mes données</div><div class="desc">Tout est stocké uniquement sur cet appareil, sans serveur : téléchargez une copie (compte, profil, historique) pour ne rien perdre en changeant de téléphone ou de navigateur.</div></div>
        <button class="btn btn-ghost btn-sm" id="exportDataBtn">Exporter</button>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Importer une sauvegarde</div><div class="desc">Restaure un fichier exporté depuis Kegel Control. Remplace les données actuelles de cet appareil.</div></div>
        <button class="btn btn-ghost btn-sm" id="importDataBtn">Importer</button>
        <input type="file" id="importDataInput" accept="application/json" style="display:none;">
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

/* ---------- Export / import (sauvegarde locale, puisqu'il n'y a pas de serveur) ---------- */
function exportData(){
  const data = {};
  Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => { data[k.slice(LS_PREFIX.length)] = JSON.parse(localStorage.getItem(k)); });
  const blob = new Blob([JSON.stringify({ app:'kegel-control', exportedAt:Date.now(), data }, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kegel-control-sauvegarde-${formatDateShort(Date.now()).replace(/\s/g,'-')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Sauvegarde téléchargée ✅');
}
function importDataFromFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.data ? parsed.data : parsed;
      if(!data || typeof data !== 'object') throw new Error('format invalide');
      openConfirmModal({
        title: 'Importer cette sauvegarde ?',
        message: "Cela remplace les données actuelles de cet appareil (compte, profil, historique) par celles du fichier.",
        confirmLabel: 'Importer',
        danger: true,
        onConfirm: () => {
          lsRemoveAll();
          Object.keys(data).forEach(k => lsSet(k, data[k]));
          toast('Sauvegarde importée ✅');
          STATE.view = isLoggedIn() ? (getProfile() ? 'dashboard' : 'questionnaire') : 'welcome';
          render();
        }
      });
    }catch(e){ toast("Fichier de sauvegarde illisible."); }
  };
  reader.readAsText(file);
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
    document.getElementById('goDashboardBtn').addEventListener('click', () => navigate('calibration'));
  }

  if(STATE.view === 'calibration'){
    const tryBtn = document.getElementById('tryCalibrationBtn');
    if(tryBtn) tryBtn.addEventListener('click', () => launchCalibrationSession());
    const doneBtn = document.getElementById('calibrationDoneBtn');
    if(doneBtn) doneBtn.addEventListener('click', () => { setCalibrationDone(); navigate('dashboard'); });
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

    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    const importInput = document.getElementById('importDataInput');
    document.getElementById('importDataBtn').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      if(importInput.files && importInput.files[0]) importDataFromFile(importInput.files[0]);
      importInput.value = '';
    });
  }
}

/* ============ 10. ÉCRAN DE SÉANCE GUIDÉE ============ */
/* ---------- Écran allumé pendant la séance (Screen Wake Lock API) ----------
   Demandé explicitement : l'utilisateur pilote la séance au son seul, sans toucher
   au téléphone — l'écran ne doit donc jamais se verrouiller pendant ce temps.
   Supporté par Safari iOS 16.4+ (y compris en PWA installée) et par Chrome/Android ;
   sans échec bruyant sur les navigateurs qui ne le supportent pas. Le verrou est
   automatiquement relâché par le navigateur si l'onglet passe en arrière-plan : on
   le redemande alors dès que l'app redevient visible, tant qu'une séance tourne. */
let wakeLock = null;
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  }catch(e){ wakeLock = null; }
}
async function releaseWakeLock(){
  try{ if(wakeLock) await wakeLock.release(); }catch(e){}
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && activeEngine && !activeEngine.stopped) requestWakeLock();
});

/* Géométrie du halo rouge, mesurée sur le cercle réellement affiché : la taille
   MAXIMALE (à glow=1) est plafonnée à la fois par rapport au cercle et par rapport
   à la largeur d'écran, pour qu'il ne touche JAMAIS les bords, quel que soit le
   type de contraction ou la taille de l'appareil. */
let haloGeom = { basePx: 80, maxPx: 190 };
function measureHaloGeom(){
  const wrapEl = document.querySelector('.circle-wrap');
  if(!wrapEl) return;
  const wrapPx = wrapEl.getBoundingClientRect().width || 240;
  // Le plus BAS que le halo puisse atteindre pendant une contraction active correspond
  // exactement au contour blanc du cercle (.circle-ring, 52% du wrap) : jamais plus
  // petit que ça tant qu'une contraction est en cours, jamais "invisible" sauf au vrai
  // relâchement/repos (voir updateSessionFrame). Le plus HAUT reste plafonné à la fois
  // par rapport au cercle, à la largeur d'écran, ET à l'espace vertical réellement
  // disponible autour du cercle (pour ne jamais toucher ni les bords, ni l'étiquette
  // "Type X/6 · ..." au-dessus, ni le bandeau du bas).
  const basePx = wrapPx * 0.52;
  const capByViewport = window.innerWidth * 0.86;
  const capByWrap = wrapPx * 1.9;
  let capByHeight = capByViewport;
  const midEl = document.querySelector('.session-mid');
  if(midEl){
    const midH = midEl.getBoundingClientRect().height || capByViewport;
    capByHeight = midH * 0.82;
  }
  const maxPx = Math.max(basePx, Math.min(capByViewport, capByWrap, capByHeight));
  haloGeom = { basePx, maxPx };
}
window.addEventListener('resize', () => { if(document.querySelector('.circle-wrap')) measureHaloGeom(); });

let activeEngine = null;
let activeExercise = null;

function launchSession(){
  const cd = canStartSession();
  if(!cd.ok){
    if(cd.reason === 'done') toast('Vos 2 séances du jour sont déjà terminées.');
    else toast(`Pause requise : encore ${Math.ceil(cd.remainingMs/60000)} min avant la prochaine séance.`);
    return;
  }
  ensureAudioCtx(); // créé/débloqué ici, sur un vrai geste utilisateur (requis par iOS Safari)
  requestWakeLock(); // même geste utilisateur : l'écran ne se verrouille plus pendant la séance
  const ex = getTodayExercise();
  activeExercise = ex;
  renderSessionShell(ex);
  const engine = new SessionEngine(ex, {
    onStepStart: (step) => updateSessionPhase(step),
    onFrame: (info) => updateSessionFrame(info),
    onPause: () => setSessionButtonState(true),
    onResume: () => setSessionButtonState(false),
    onComplete: (reason) => onSessionComplete(reason),
    onCheckpoint: (step) => openCheckpointModal(step)
  });
  activeEngine = engine;
  engine.start();
}

// Séance courte et non comptabilisée, réutilisant le même écran/moteur qu'une vraie
// séance (mêmes retours son+halo) pour aider à identifier le bon muscle. Pas de
// vérification de canStartSession() (n'entre pas dans le quota des 2 séances/jour),
// pas de formulaire de ressenti à la fin, pas d'enregistrement dans l'historique.
function launchCalibrationSession(){
  ensureAudioCtx();
  requestWakeLock();
  const ex = buildCalibrationExercise();
  activeExercise = ex;
  renderSessionShell(ex);
  const engine = new SessionEngine(ex, {
    onStepStart: (step) => updateSessionPhase(step),
    onFrame: (info) => updateSessionFrame(info),
    onPause: () => setSessionButtonState(true),
    onResume: () => setSessionButtonState(false),
    onComplete: (reason) => {
      releaseWakeLock();
      document.getElementById('sessionRoot').innerHTML = '';
      activeEngine = null;
      if(reason === 'completed') cue('finish');
      navigate('calibration');
      toast(reason === 'completed' ? 'Essai terminé — vous pouvez recommencer ou continuer.' : 'Essai interrompu — vous pouvez recommencer.');
    }
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
  measureHaloGeom();
}

function openHelpModal(){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="helpOverlay">
      <div class="modal-card">
        <div class="modal-title">Comment lire l'écran de séance</div>
        <div class="modal-msg" style="text-align:left;">
          <p style="margin:0 0 10px;"><strong>3 modules</strong> — Contraction (Kegel), puis Respiration, puis Contrôle de l'excitation. Entre chaque module, on vous propose de continuer tout de suite ou de faire une pause avant d'attaquer le suivant.</p>
          <p style="margin:0 0 10px;"><strong>Halo rouge</strong> — rattaché au même signal que le son. Dès qu'une contraction est en cours, il reste toujours visible, entre son plus petit (le contour blanc du cercle) et son plus grand (sans jamais toucher les bords de l'écran) — seule la vitesse pour passer de l'un à l'autre change selon l'exercice. Il disparaît complètement dès le relâchement — rien du tout au repos, même transparent.</p>
          <p style="margin:0 0 10px;"><strong>Anneau et point</strong> — le point parcourt l'anneau pour montrer votre progression dans l'exercice en cours.</p>
          <p style="margin:0 0 10px;"><strong>Chiffre au centre</strong> — le temps restant, en secondes, pour l'exercice en cours (jusqu'à 0, puis 9s de repos avant le suivant).</p>
          <p style="margin:0 0 10px;"><strong>Bandeau du bas</strong> — la séquence complète : à gauche ce qui est fini, au centre l'exercice en cours, à droite ce qui arrive.</p>
          <p style="margin:0;"><strong>Le son</strong>, volontairement grave et doux (confortable même pour une oreille sensible), ne joue QUE pendant une contraction : il monte avec l'intensité, reste stable pendant un maintien — puis coupe net dès le relâchement, silence total au repos. Vous pouvez faire toute la séance au son seul, l'écran ne se verrouille pas pendant ce temps.</p>
        </div>
        <div class="modal-actions"><button class="btn btn-primary btn-block" id="helpCloseBtn">Compris</button></div>
      </div>
    </div>`;
  const overlay = document.getElementById('helpOverlay');
  const close = () => { root.innerHTML = ''; };
  overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });
  document.getElementById('helpCloseBtn').addEventListener('click', close);
}

// Transition entre deux modules ("Contraction -> Respiration", "Respiration ->
// Contrôle de l'excitation") : on propose explicitement de continuer ou de faire
// une pause avant d'attaquer le module suivant, plutôt que d'enchaîner tout seul.
function openCheckpointModal(step){
  cue('checkpoint');
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="checkpointOverlay">
      <div class="modal-card">
        <div class="modal-title">Module « ${escapeHtml(step.fromName)} » terminé ✅</div>
        <div class="modal-msg" style="text-align:left;">
          Prêt à enchaîner avec le module suivant : <strong>${escapeHtml(step.toName)}</strong> ?
          Vous pouvez continuer tout de suite, ou faire une pause avant de reprendre — la séance vous attend, rien n'est perdu.
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="checkpointPauseBtn">Faire une pause</button>
          <button class="btn btn-primary" id="checkpointContinueBtn">Continuer</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('checkpointContinueBtn').addEventListener('click', () => {
    close();
    if(activeEngine) activeEngine.continueFromCheckpoint();
  });
  document.getElementById('checkpointPauseBtn').addEventListener('click', () => {
    close();
    if(activeEngine) activeEngine.continueFromCheckpoint(true); // avance puis se fige aussitôt sur le 1er pas
  });
}

function setSessionButtonState(paused){
  const btn = document.getElementById('sessionPauseBtn');
  if(!btn) return;
  if(paused){ btn.className = 'session-btn resume'; btn.textContent = '▶ Reprendre'; }
  else { btn.className = 'session-btn pause'; btn.textContent = '⏸ Pause'; }
}

function updateSessionPhase(step){
  if(step.action === 'CHECKPOINT') return; // couvert par la modale de transition de module
  const tag = document.getElementById('sessionTypeTag');
  if(tag && activeExercise){
    const ccount = activeExercise.contractionBlockCount;
    const ecount = activeExercise.excitationBlockCount || 1;
    if(step.action === 'PAUSE'){
      const nextPhase = phaseNameForBlockId(step.blockId + 1, ccount);
      if(nextPhase === 'Contractions') tag.textContent = `Repos · avant type ${step.blockPos + 1}/${ccount}`;
      else if(nextPhase === 'Respiration') tag.textContent = `Repos · avant : Respiration`;
      else {
        const pos = (step.blockPos + 1) - ccount - 1;
        tag.textContent = `Repos · avant contrôle ${pos}/${ecount}`;
      }
    } else {
      const phase = phaseNameForBlockId(step.blockId, ccount);
      if(phase === 'Contractions') tag.textContent = `Type ${step.blockPos}/${ccount} · ${step.typeName || ''}`;
      else if(phase === 'Respiration') tag.textContent = step.typeName || phase;
      else {
        const pos = step.blockPos - ccount - 1;
        tag.textContent = `Contrôle ${pos}/${ecount} · ${step.typeName || ''}`;
      }
    }
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
    // Deux états bien distincts :
    // - Une contraction est active (CONTRACT/HOLD/PULSE/RAMP_UP/RAMP_DOWN) : le halo est
    //   TOUJOURS visible (opacité pleine), et sa TAILLE seule varie entre le plus bas —
    //   le contour blanc du cercle (haloGeom.basePx) — et le plus haut — la limite sûre
    //   par rapport à l'écran (haloGeom.maxPx). Peu importe le type de contraction, ces
    //   deux bornes sont TOUJOURS atteintes ; seule la vitesse pour y arriver change
    //   (voir computeContractionLevel). Aucun saut brutal : la transition CSS sur
    //   .circle-halo lisse chaque changement de taille en douceur.
    // - Aucune contraction (RELEASE/REST/PAUSE) : rien du tout, même transparent.
    const activeContraction = step.action === 'CONTRACT' || step.action === 'HOLD' ||
      step.action === 'PULSE' || step.action === 'RAMP_UP' || step.action === 'RAMP_DOWN';
    if(!activeContraction){
      haloEl.style.opacity = 0;
    } else {
      const g = Math.max(0, Math.min(1, glow || 0));
      const px = haloGeom.basePx + (haloGeom.maxPx - haloGeom.basePx) * g;
      haloEl.style.width = px + 'px';
      haloEl.style.height = px + 'px';
      haloEl.style.opacity = 1;
    }
  }
  if(rotorEl && step.blockTotalMs){
    const elapsedInBlock = Math.max(0, step.blockTotalMs - remainingTypeMs);
    const angle = (elapsedInBlock / step.blockTotalMs) * 360;
    rotorEl.style.transform = `rotate(${angle}deg)`;
  }
  if(totalEl) totalEl.textContent = `Temps restant : ${formatMMSS(info.remainingTotalMs)}`;
}

function onSessionComplete(reason){
  releaseWakeLock();
  if(reason === 'completed'){
    cue('finish');
    document.getElementById('sessionRoot').innerHTML = '';
    showFeedbackScreen();
  } else {
    addSessionRecord({ id:'sess_'+Date.now(), exerciseName: (activeExercise && activeExercise.name) || 'Exercice de Kegel', date: Date.now(), completed:false });
    document.getElementById('sessionRoot').innerHTML = '';
    activeEngine = null;
    render();
    toast('Séance interrompue — non comptabilisée, vous pouvez recommencer.');
  }
}

/* ---------- Feedback post-séance — une seule fois, après l'exercice complet ---------- */
function showFeedbackScreen(){
  const fb = { difficulty:2, fatigue:2, qualityM1:3, qualityM2:3, qualityM3:3, relaxation:3, pain:0 };
  const root = document.getElementById('sessionRoot');

  function draw(){
    root.innerHTML = `
    <div class="session-overlay" style="background:var(--bg);color:var(--text);">
      <div class="fb-wrap">
        <h1 style="font-size:19px;font-weight:800;margin-bottom:2px;">Séance terminée 🎉</h1>
        <p style="font-size:13px;color:var(--text-soft);margin-bottom:22px;">Exercice de Kegel complet — quelques questions pour ajuster la suite de votre programme.</p>

        ${fbScale('difficulty','Difficulté ressentie', ['Trop facile','Facile','Adaptée','Difficile','Trop difficile'], fb.difficulty)}
        ${fbScale('fatigue','Fatigue musculaire', ['Aucune','Légère','Modérée','Forte','Épuisante'], fb.fatigue)}
        <p class="lbl" style="margin:16px 0 2px;">Qualité ressentie, module par module</p>
        ${fbScale('qualityM1','Contraction', ['Faible','Passable','Correcte','Bonne','Excellente'], fb.qualityM1)}
        ${fbScale('qualityM2','Respiration', ['Faible','Passable','Correcte','Bonne','Excellente'], fb.qualityM2)}
        ${fbScale('qualityM3',"Contrôle de l'excitation", ['Faible','Passable','Correcte','Bonne','Excellente'], fb.qualityM3)}
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
    exerciseName: (activeExercise && activeExercise.name) || 'Exercice de Kegel',
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
    // Le niveau global reste piloté par le module 1 (Contraction/Kegel), comme avant.
    if(fb.difficulty <= 1 && fb.qualityM1 >= 3 && fb.fatigue <= 2) level = Math.min(4, level + 1);
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
