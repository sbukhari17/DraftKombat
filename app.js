'use strict';

/* =========================================================================
   DRAFT KOMBAT
   A client-side fantasy draft order generator staged as an arcade fight.

   Everything here — music, hit sounds, and the fighters themselves — is
   generated in-browser (Web Audio oscillators/noise + canvas shapes).
   Nothing is fetched from a server and nothing is persisted: nix the tab
   and the draft order is gone, exactly like requirement #9 wants.
   ========================================================================= */

/* ------------------------------- Utilities ------------------------------ */

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Fisher-Yates. Unbiased, and it's the only source of randomness that
// determines the draft order.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Global time control so the "fast-forward" button can compress the
// remaining choreography instead of abruptly cutting it off — the fight
// still plays beat-for-beat, just faster, so a recording in progress still
// captures every elimination and pick reveal.
const clock = { timeScale: 1 };

function wait(ms) {
  return new Promise((resolve) => {
    const start = performance.now();
    const target = ms;
    function tick() {
      const elapsed = (performance.now() - start) * clock.timeScale;
      if (elapsed >= target) resolve();
      else requestAnimationFrame(tick);
    }
    tick();
  });
}

// Animate a numeric property on `obj` from `from` to `to` over `ms`,
// re-evaluated every frame so it respects live changes to clock.timeScale.
function tween(obj, prop, from, to, ms, easing = easeOutCubic, onUpdate = null) {
  return new Promise((resolve) => {
    const start = performance.now();
    let scaledElapsed = 0;
    let last = start;
    function frame(now) {
      scaledElapsed += (now - last) * clock.timeScale;
      last = now;
      const t = clamp(scaledElapsed / ms, 0, 1);
      obj[prop] = lerp(from, to, easing(t));
      if (onUpdate) onUpdate(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

/* ============================== Audio Engine ============================ */
/* Everything here is synthesized. No external audio files, no copyrighted
   music or voice clips — just oscillators and noise buffers, so the app is
   self-contained and safe to host as a static site. */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.recordDest = null;
    this.musicTimer = null;
    this.step = 0;
    this.nextStepTime = 0;
    this.muted = false;
    this.bpm = 150;
  }

  ensureStarted() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);

    this._noiseBuffer = this._makeNoiseBuffer();
  }

  // Route the master bus to an extra destination (used to feed MediaRecorder).
  connectRecording(destNode) {
    if (this.master) this.master.connect(destNode);
    this.recordDest = destNode;
  }
  disconnectRecording() {
    if (this.master && this.recordDest) {
      try { this.master.disconnect(this.recordDest); } catch (e) { /* already gone */ }
    }
    this.recordDest = null;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  _makeNoiseBuffer() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    return src;
  }

  /* ---- Background arcade fight loop: a small 16-step synth sequencer ---- */
  startMusic() {
    this.ensureStarted();
    if (this.musicTimer) return;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.musicTimer = setInterval(() => this._scheduler(), 25);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  _scheduler() {
    const stepDur = 60 / this.bpm / 4; // sixteenth notes
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      this._scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
  }

  _scheduleStep(step, time) {
    const kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
    const hatPattern  = [0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1];
    // A minor-ish pentatonic riff, gives it that tense arcade-fighter drive.
    const bassSeq = [55, 55, 58.27, 61.74];
    const leadSeq = [220, 261.63, 246.94, 220, 196, 220, 261.63, 293.66];

    if (kickPattern[step]) this._kick(time);
    if (hatPattern[step]) this._hat(time, step % 4 === 0 ? 0.5 : 0.25);
    if (step % 4 === 0) this._bassNote(time, bassSeq[(step / 4) % bassSeq.length], stepDurFor(this.bpm) * 3.5);
    if (step % 2 === 0 && Math.random() < 0.7) this._leadNote(time, leadSeq[randInt(0, leadSeq.length - 1)]);
  }

  _kick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  _hat(time, vol) {
    const src = this._noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(hp).connect(gain).connect(this.musicGain);
    src.start(time);
    src.stop(time + 0.06);
  }

  _bassNote(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.35, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filter).connect(gain).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  _leadNote(time, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(gain).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  /* ------------------------------ SFX ------------------------------ */

  playHit(kind = 'punch') {
    this.ensureStarted();
    const t = this.ctx.currentTime;
    const src = this._noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'kick' ? rand(300, 500) : rand(900, 1600);
    bp.Q.value = 1.2;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp).connect(ng).connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.15);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(kind === 'kick' ? 220 : 340, t);
    osc.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 60 : 90, t + 0.11);
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playWhoosh() {
    this.ensureStarted();
    const t = this.ctx.currentTime;
    const src = this._noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(bp).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.26);
  }

  // The stinger that plays under the on-screen "FATALITY" text. This part
  // IS captured in recordings (unlike the spoken-word announcer below).
  playFatalityStinger() {
    this.ensureStarted();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 1.15);

    const src = this._noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(150, t + 0.8);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(lp).connect(ng).connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.95);
  }

  playVictoryFanfare() {
    this.ensureStarted();
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      const t = this.ctx.currentTime + i * 0.16;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  // Briefly lower the music so a callout reads clearly, then restore it.
  async duck(duration = 900) {
    if (!this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(0.12, t, 0.05);
    await wait(duration);
    if (!this.musicGain) return;
    const t2 = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(0.5, t2, 0.2);
  }
}

function stepDurFor(bpm) { return 60 / bpm / 4; }

// Spoken "FATALITY" callout via the browser's built-in speech synthesis.
// NOTE: speechSynthesis audio is generated by the OS/browser outside the
// Web Audio graph, so it can't be captured by MediaRecorder. It plays live
// for whoever is watching, but downloaded videos rely on the synthesized
// stinger + on-screen text above to carry that moment instead.
let cachedVoices = [];
if ('speechSynthesis' in window) {
  const loadVoices = () => { cachedVoices = window.speechSynthesis.getVoices(); };
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function speakFatality() {
  if (!('speechSynthesis' in window) || appState.muted) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('FATALITY');
    u.pitch = 0.15;
    u.rate = 0.7;
    u.volume = 1;
    const deep = cachedVoices.find(v => /david|mark|daniel|male|fred/i.test(v.name));
    if (deep) u.voice = deep;
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech synthesis is best-effort */ }
}
function speakVictory(name) {
  if (!('speechSynthesis' in window) || appState.muted) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`${name} wins. First pick.`);
    u.pitch = 0.7;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch (e) { /* best-effort */ }
}

/* ============================== Fighter visuals ========================== */

const ARCHETYPES = ['Brawler', 'Ninja', 'Warrior', 'Mage', 'Gunner', 'Monk',
  'Berserker', 'Ranger', 'Knight', 'Rogue', 'Titan', 'Phantom'];

function buildFighter(name, index, total) {
  const hue = Math.round((360 / total) * index) % 360;
  return {
    name,
    id: index,
    archetype: ARCHETYPES[index % ARCHETYPES.length],
    colorPrimary: `hsl(${hue}, 78%, 58%)`,
    colorDark: `hsl(${hue}, 70%, 32%)`,
    colorGlow: `hsl(${hue}, 95%, 70%)`,
    flip: false, // set true when facing left
    // live animation state, mutated during fights
    x: 0, y: 0, scale: 1, rot: 0,
    hp: 1, // 0..1
    hitFlash: 0, // 0..1 decays each frame
    pose: 'idle', // idle | approach | punch | kick | hurt | ko | victory
    poseT: 0,
    alpha: 1,
    shakeX: 0,
  };
}

// Draws one fighter as a simple original arcade silhouette (no likeness to
// any existing game character) at (f.x, f.y) with the current pose baked
// into limb offsets. Facing right by default; f.flip mirrors it.
function drawFighter(ctx, f) {
  ctx.save();
  ctx.translate(f.x + f.shakeX, f.y);
  ctx.scale((f.flip ? -1 : 1) * f.scale, f.scale);
  ctx.rotate(f.rot);
  ctx.globalAlpha = f.alpha;

  const t = f.poseT;
  let leanX = 0, armSwing = 0, legSpread = 10, crouch = 0, headBob = 0;

  if (f.pose === 'approach') { leanX = 6; legSpread = 18; }
  if (f.pose === 'punch') { armSwing = easeOutCubic(t) * 34; leanX = 10; }
  if (f.pose === 'kick') { legSpread = 16 + easeOutCubic(t) * 28; leanX = -6; crouch = 4; }
  if (f.pose === 'hurt') { leanX = -14 * (1 - t); headBob = 6 * Math.sin(t * 20); }
  if (f.pose === 'ko') { crouch = 30 * t; leanX = -20 * t; }
  if (f.pose === 'victory') { headBob = Math.sin(performance.now() / 140) * 4; armSwing = 20; }
  if (f.pose === 'idle') { headBob = Math.sin(performance.now() / 260 + f.id) * 3; }

  const glow = f.hitFlash > 0;

  // ground shadow
  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 96, 34, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.translate(0, crouch);

  // back leg
  ctx.strokeStyle = f.colorDark;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, 24);
  ctx.lineTo(-4 - legSpread * 0.6, 90 - crouch * 0.4);
  ctx.stroke();

  // front leg
  ctx.beginPath();
  ctx.moveTo(4, 24);
  ctx.lineTo(4 + legSpread, 90 - crouch * 0.4);
  ctx.stroke();

  // torso
  ctx.fillStyle = glow ? '#fff' : f.colorPrimary;
  ctx.beginPath();
  ctx.moveTo(-16 + leanX * 0.2, 24);
  ctx.quadraticCurveTo(0 + leanX, -30, 16 + leanX * 0.2, 24);
  ctx.closePath();
  ctx.fill();

  // back arm
  ctx.strokeStyle = f.colorDark;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-10 + leanX * 0.2, -10);
  ctx.lineTo(-26 + leanX * 0.2 - armSwing * 0.3, 6);
  ctx.stroke();

  // front arm (this is the one that "hits")
  ctx.strokeStyle = glow ? '#fff' : f.colorPrimary;
  ctx.beginPath();
  ctx.moveTo(10 + leanX * 0.2, -10);
  ctx.lineTo(10 + leanX * 0.2 + armSwing, -10 + (f.pose === 'punch' ? 0 : 8));
  ctx.stroke();

  // head
  ctx.translate(leanX * 0.35, -42 + headBob);
  ctx.fillStyle = glow ? '#fff' : f.colorPrimary;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();

  drawArchetypeAccessory(ctx, f);

  ctx.restore();
}

// A handful of simple shape overlays so each archetype reads distinctly at
// a glance, without borrowing any real character's design.
function drawArchetypeAccessory(ctx, f) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeStyle = f.colorDark;
  ctx.lineWidth = 3;
  switch (f.archetype) {
    case 'Ninja':
      ctx.fillRect(-14, -3, 28, 6); // mask band
      break;
    case 'Warrior':
    case 'Knight':
      ctx.beginPath(); ctx.arc(0, -2, 15, Math.PI, Math.PI * 2); ctx.fill(); // helm
      break;
    case 'Mage':
      ctx.beginPath();
      ctx.moveTo(-14, -6); ctx.lineTo(0, -30); ctx.lineTo(14, -6);
      ctx.closePath(); ctx.fill(); // hood point
      break;
    case 'Gunner':
      ctx.fillRect(6, -16, 14, 6); // visor bar
      break;
    case 'Monk':
      ctx.beginPath(); ctx.arc(0, 4, 16, 0, Math.PI); ctx.fill(); // collar
      break;
    case 'Berserker':
      ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(-22, -10); ctx.lineTo(-8, 0); ctx.fill(); // shoulder fur
      break;
    case 'Ranger':
      ctx.beginPath(); ctx.ellipse(0, -8, 15, 8, 0, Math.PI, Math.PI * 2); ctx.fill(); // hood
      break;
    case 'Rogue':
      ctx.fillRect(-4, -18, 8, 8); // eye band
      break;
    case 'Titan':
      ctx.beginPath(); ctx.arc(0, 6, 19, 0, Math.PI * 2); ctx.stroke(); // heavy collar ring
      break;
    case 'Phantom':
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    default: // Brawler
      ctx.fillRect(-18, 6, 10, 5);
      ctx.fillRect(8, 6, 10, 5); // wraps on the arms area
  }
}

/* ============================== Particles ================================ */

function makeBurst(x, y, color, count = 16, spread = 220) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const ang = rand(0, Math.PI * 2);
    const speed = rand(spread * 0.3, spread);
    parts.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 60,
      life: rand(0.4, 0.9),
      age: 0,
      size: rand(2, 5),
      color,
    });
  }
  return parts;
}

/* ================================ App State =============================== */

const appState = {
  leagueName: '',
  teams: [],       // [{name}]
  fighters: [],    // built fighter objects
  draftOrder: [],  // fighter refs, index0 = pick1 ... last = pickN
  muted: false,
  recorder: null,
  recordedChunks: [],
  recordedMime: '',
  videoBlobUrl: null,
  videoExt: 'webm',
  running: false,
};

const audio = new AudioEngine();

/* ================================ Setup Screen ============================ */

const screens = {
  setup: document.getElementById('screen-setup'),
  sim: document.getElementById('screen-sim'),
  results: document.getElementById('screen-results'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

const teamListEl = document.getElementById('team-list');
const addTeamBtn = document.getElementById('add-team-btn');
const startBtn = document.getElementById('start-btn');
const setupError = document.getElementById('setup-error');
const leagueNameInput = document.getElementById('league-name');

const MIN_TEAMS = 4;
const MAX_TEAMS = 16;

function addTeamRow(prefillName = '') {
  const rows = teamListEl.querySelectorAll('.team-row');
  if (rows.length >= MAX_TEAMS) return;

  const li = document.createElement('li');
  li.className = 'team-row';

  const idxSpan = document.createElement('span');
  idxSpan.className = 'team-index';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 30;
  input.autocomplete = 'off';
  input.value = prefillName;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-team-btn';
  removeBtn.setAttribute('aria-label', 'Remove team');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    li.remove();
    renumberTeamRows();
  });

  li.appendChild(idxSpan);
  li.appendChild(input);
  li.appendChild(removeBtn);
  teamListEl.appendChild(li);

  renumberTeamRows();
  input.placeholder = `Team ${teamListEl.querySelectorAll('.team-row').length} name`;
}

function renumberTeamRows() {
  const rows = teamListEl.querySelectorAll('.team-row');
  rows.forEach((row, i) => {
    row.querySelector('.team-index').textContent = `${i + 1}.`;
    row.querySelector('input').placeholder = `Team ${i + 1} name`;
    row.querySelector('.remove-team-btn').disabled = rows.length <= MIN_TEAMS;
  });
  addTeamBtn.disabled = rows.length >= MAX_TEAMS;
  addTeamBtn.style.opacity = rows.length >= MAX_TEAMS ? 0.4 : 1;
}

function resetSetupForm(prefillNames = []) {
  teamListEl.innerHTML = '';
  const names = prefillNames.length ? prefillNames : new Array(MIN_TEAMS).fill('');
  names.forEach(n => addTeamRow(n));
  setupError.hidden = true;
}

addTeamBtn.addEventListener('click', () => addTeamRow());

startBtn.addEventListener('click', () => {
  const league = leagueNameInput.value.trim() || 'Untitled League';
  const nameInputs = [...teamListEl.querySelectorAll('.team-row input')];
  const names = nameInputs.map((inp, i) => inp.value.trim() || `Team ${i + 1}`);

  if (names.length < MIN_TEAMS || names.length > MAX_TEAMS) {
    setupError.textContent = `Enter between ${MIN_TEAMS} and ${MAX_TEAMS} teams.`;
    setupError.hidden = false;
    return;
  }
  setupError.hidden = true;

  appState.leagueName = league;
  appState.teams = names;
  appState.fighters = names.map((n, i) => buildFighter(n, i, names.length));
  appState.draftOrder = shuffle(appState.fighters);

  launchSimulation();
});

resetSetupForm();

/* ================================ Mute toggle ============================= */

const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  appState.muted = !appState.muted;
  audio.setMuted(appState.muted);
  muteBtn.textContent = appState.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(appState.muted));
  if (appState.muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
});

/* ================================ Skip / fast-forward ====================== */

const skipBtn = document.getElementById('skip-btn');
skipBtn.addEventListener('click', () => {
  clock.timeScale = 12;
  skipBtn.disabled = true;
  skipBtn.textContent = 'Fast-forwarding…';
});

/* ================================ Canvas setup ============================= */

const canvas = document.getElementById('fight-canvas');
const ctx = canvas.getContext('2d');
const CW = canvas.width, CH = canvas.height;

let scene = null;
let particles = [];
let overlayText = null; // {text, sub, size, color, alpha, y}
let screenShake = 0;
let renderLoopActive = false;

function resetSceneVisuals() {
  particles = [];
  overlayText = null;
  screenShake = 0;
}

function drawBackground(t) {
  // arena gradient
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#1a1530');
  g.addColorStop(0.55, '#0f0c1e');
  g.addColorStop(1, '#050409');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);

  // distant skyline silhouettes, slow parallax
  ctx.fillStyle = 'rgba(30,20,50,0.8)';
  const offset = (t * 0.01) % 120;
  for (let i = -1; i < 12; i++) {
    const bx = i * 120 - offset;
    const bh = 90 + ((i * 47) % 140);
    ctx.fillRect(bx, CH * 0.62 - bh, 70, bh);
  }

  // neon horizon line
  const grad2 = ctx.createLinearGradient(0, CH * 0.62 - 4, 0, CH * 0.62 + 4);
  grad2.addColorStop(0, 'rgba(0,240,255,0)');
  grad2.addColorStop(0.5, 'rgba(0,240,255,0.55)');
  grad2.addColorStop(1, 'rgba(0,240,255,0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, CH * 0.62 - 4, CW, 8);

  // floor
  const floorG = ctx.createLinearGradient(0, CH * 0.62, 0, CH);
  floorG.addColorStop(0, '#171226');
  floorG.addColorStop(1, '#08060d');
  ctx.fillStyle = floorG;
  ctx.fillRect(0, CH * 0.62, CW, CH * 0.38);

  // floor grid lines for depth
  ctx.strokeStyle = 'rgba(255,46,99,0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const y = CH * 0.62 + i * ((CH * 0.38) / 10);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
  }
}

function drawHealthBar(f, x, alignRight) {
  const w = 260, h = 18;
  ctx.save();
  ctx.translate(x, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3a3555';
  ctx.strokeRect(0, 0, w, h);
  const hpW = Math.max(0, w * f.hp);
  const barX = alignRight ? w - hpW : 0;
  const hpColor = f.hp > 0.5 ? '#2ee6a8' : (f.hp > 0.2 ? '#ffb627' : '#e31b23');
  ctx.fillStyle = hpColor;
  ctx.fillRect(barX, 2, hpW, h - 4);
  ctx.fillStyle = '#f5f0e8';
  ctx.font = '13px Orbitron, sans-serif';
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.fillText(f.name.toUpperCase(), alignRight ? w : 0, -8);
  ctx.restore();
}

function drawParticles(dt) {
  ctx.save();
  particles.forEach(p => {
    p.age += dt;
    const lifeT = p.age / p.life;
    if (lifeT >= 1) return;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 500 * dt;
    ctx.globalAlpha = 1 - lifeT;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - lifeT * 0.5), 0, Math.PI * 2);
    ctx.fill();
  });
  particles = particles.filter(p => p.age < p.life);
  ctx.restore();
}

function drawOverlayText() {
  if (!overlayText) return;
  ctx.save();
  ctx.globalAlpha = overlayText.alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = overlayText.color;
  ctx.font = `${overlayText.size}px "Press Start 2P", monospace`;
  ctx.shadowColor = overlayText.color;
  ctx.shadowBlur = 24;
  ctx.fillText(overlayText.text, CW / 2, overlayText.y);
  if (overlayText.sub) {
    ctx.font = '20px Orbitron, sans-serif';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#f5f0e8';
    ctx.fillText(overlayText.sub, CW / 2, overlayText.y + 44);
  }
  ctx.restore();
}

let lastFrameTime = performance.now();
function renderFrame(now) {
  if (!renderLoopActive) return;
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  ctx.save();
  if (screenShake > 0.1) {
    ctx.translate(rand(-screenShake, screenShake), rand(-screenShake, screenShake));
    screenShake *= 0.88;
  } else {
    screenShake = 0;
  }

  drawBackground(now);

  if (scene) {
    if (scene.champion) drawHealthBar(scene.champion, 60, false);
    if (scene.opponent) drawHealthBar(scene.opponent, CW - 60 - 260, true);
    // draw whichever is "behind" first based on x, purely cosmetic
    const fighters = [scene.champion, scene.opponent].filter(Boolean);
    fighters.sort((a, b) => a.y - b.y);
    fighters.forEach(f => {
      if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt * 6);
      drawFighter(ctx, f);
    });
    if (scene.vsAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = scene.vsAlpha;
      ctx.fillStyle = '#fff';
      ctx.font = '48px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff2e63';
      ctx.shadowBlur = 20;
      ctx.fillText('VS', CW / 2, CH * 0.42);
      ctx.restore();
    }
  }

  drawParticles(dt);
  drawOverlayText();

  ctx.restore();
  requestAnimationFrame(renderFrame);
}

function startRenderLoop() {
  if (renderLoopActive) return;
  renderLoopActive = true;
  lastFrameTime = performance.now();
  requestAnimationFrame(renderFrame);
}
function stopRenderLoop() {
  renderLoopActive = false;
}

/* ============================== Fight choreography ========================= */

const GROUND_Y = CH * 0.72;
const CHAMPION_X = CW * 0.32;
const OPPONENT_X = CW * 0.68;
const OFFSCREEN_LEFT = -120;
const OFFSCREEN_RIGHT = CW + 120;

// Global tempo multiplier for a single simulation run. Unlike clock.timeScale
// (which only kicks in for the fast-forward button), this is set once up
// front so a 4-team league gets slower, more dramatic exchanges and a
// 16-team league gets a snappier highlight-reel pace — both landing
// somewhere in the neighborhood of the target runtime.
let pace = 1;
const P = (ms) => ms * pace;

async function shakeScreen(amount) {
  screenShake = amount;
}

async function flashOverlay(text, sub, color, holdMs, size = 46) {
  overlayText = { text, sub, color, alpha: 0, y: CH * 0.4, size };
  await tween(overlayText, 'alpha', 0, 1, P(180));
  await wait(P(holdMs));
  await tween(overlayText, 'alpha', 1, 0, P(260));
  overlayText = null;
}

async function exchangeBlows(champion, opponent, hitCount) {
  for (let i = 0; i < hitCount; i++) {
    const attackerIsChampion = i % 2 === 0 || i === hitCount - 1;
    const attacker = attackerIsChampion ? champion : opponent;
    const defender = attackerIsChampion ? opponent : champion;
    const kind = Math.random() < 0.5 ? 'punch' : 'kick';

    attacker.pose = kind;
    attacker.poseT = 0;
    await tween(attacker, 'poseT', 0, 1, P(260));

    // impact
    audio.playHit(kind);
    defender.hitFlash = 1;
    defender.pose = 'hurt';
    defender.poseT = 0;
    const dmg = rand(0.08, 0.16);
    // the loser (opponent) always ends up depleted; champion dips a little
    // for drama but never actually loses, matching the pre-rolled order.
    if (defender === opponent) {
      opponent.hp = Math.max(0.05, opponent.hp - dmg * 1.4);
    } else {
      champion.hp = Math.max(0.35, champion.hp - dmg * 0.5);
    }
    shakeScreen(10);
    const burstColor = attackerIsChampion ? champion.colorGlow : opponent.colorGlow;
    particles.push(...makeBurst(defender.x, defender.y - 20, burstColor, 10, 160));

    attacker.pose = 'idle';
    defender.pose = 'idle';
    await wait(P(140));
  }
}

// Runs a single bout between the persisting champion and the next
// challenger. `pickNumber` is the draft slot the loser will receive.
async function runBout({ champion, opponent, pickNumber, isFirstBout, exchanges }) {
  scene = { champion, opponent, vsAlpha: 0 };
  champion.x = CHAMPION_X; champion.y = GROUND_Y; champion.flip = false;
  champion.hp = isFirstBout ? 1 : Math.min(1, champion.hp + 0.35); // patch up a little between rounds
  champion.pose = 'idle'; champion.alpha = 1; champion.scale = 1; champion.rot = 0;

  opponent.y = GROUND_Y; opponent.flip = true; opponent.hp = 1;
  opponent.pose = 'idle'; opponent.alpha = 1; opponent.scale = 1; opponent.rot = 0;

  if (isFirstBout) {
    champion.x = OFFSCREEN_LEFT;
    opponent.x = OFFSCREEN_RIGHT;
    await Promise.all([
      tween(champion, 'x', OFFSCREEN_LEFT, CHAMPION_X, P(650)),
      tween(opponent, 'x', OFFSCREEN_RIGHT, OPPONENT_X, P(650)),
    ]);
  } else {
    opponent.x = OFFSCREEN_RIGHT;
    audio.playWhoosh();
    await tween(opponent, 'x', OFFSCREEN_RIGHT, OPPONENT_X, P(500));
  }

  scene.vsAlpha = 0;
  await tween(scene, 'vsAlpha', 0, 1, P(150));
  await wait(P(280));
  await tween(scene, 'vsAlpha', 1, 0, P(150));

  await exchangeBlows(champion, opponent, exchanges);

  // Fatality beat: opponent always loses (the outcome was decided the
  // instant the draft order was shuffled — this is just revealing it).
  opponent.hp = 0;
  opponent.pose = 'ko';
  opponent.poseT = 0;
  screenShake = 18;
  audio.playFatalityStinger();
  audio.duck(1000);
  speakFatality();
  particles.push(...makeBurst(opponent.x, opponent.y - 30, '#e31b23', 26, 260));
  await tween(opponent, 'poseT', 0, 1, P(380));
  await tween(opponent, 'alpha', 1, 0.25, P(380));

  await flashOverlay('FATALITY', `${opponent.name.toUpperCase()} — PICK #${pickNumber}`, '#e31b23', 1500, 44);

  await wait(P(150));
}

async function runVictorySequence(champion) {
  scene = { champion, opponent: null, vsAlpha: 0 };
  champion.x = CW / 2; champion.y = GROUND_Y; champion.flip = false;
  champion.pose = 'victory'; champion.hp = 1; champion.alpha = 1;
  audio.playVictoryFanfare();
  particles.push(...makeBurst(CW * 0.3, CH * 0.5, '#ffb627', 30, 300));
  particles.push(...makeBurst(CW * 0.7, CH * 0.5, '#00f0ff', 30, 300));
  speakVictory(champion.name);
  await flashOverlay('VICTORY!', `${champion.name.toUpperCase()} — 1ST OVERALL PICK`, '#ffb627', 2200, 44);
}

// Works out pacing so the whole thing lands roughly in a 2-3 minute
// neighborhood regardless of how many teams are in the league: fewer
// fights (small leagues) get slower, more dramatic exchanges; more fights
// (big leagues) get a snappier highlight-reel tempo. This is inherently
// approximate — a 4-team gauntlet and a 16-team gauntlet have a very
// different number of discrete events to show.
function computePacing(fightCount) {
  const targetTotalMs = 170000; // ~2.83 min baseline, before pace scaling
  const victoryOverheadMs = 3200;
  let perFight = (targetTotalMs - victoryOverheadMs) / Math.max(1, fightCount);
  perFight = clamp(perFight, 5500, 70000);

  // Fewer total fights -> a few more exchanges per bout for variety.
  const exchanges = clamp(Math.round(10 / Math.sqrt(fightCount)) + 2, 3, 9);

  const overheadBaseMs = 4010; // non-hit choreography per bout, unscaled
  const perHitBaseMs = 400;    // one punch/kick exchange, unscaled
  const unscaledBout = overheadBaseMs + exchanges * perHitBaseMs;
  const paceValue = clamp(perFight / unscaledBout, 0.55, 5.5);

  return { exchanges, pace: paceValue };
}

async function runFullSimulation() {
  clock.timeScale = 1;
  skipBtn.disabled = false;
  skipBtn.textContent = 'Fast-forward ⏭';

  const order = appState.draftOrder; // index0 = pick1 ... last = pickN
  const n = order.length;
  const champion = order[0];
  const challengers = order.slice(1).reverse(); // first = pickN (eliminated first)
  const paced = computePacing(challengers.length);
  const exchanges = paced.exchanges;
  pace = paced.pace;

  resetSceneVisuals();
  startRenderLoop();
  audio.startMusic();

  for (let i = 0; i < challengers.length; i++) {
    const opponent = challengers[i];
    const pickNumber = n - i;
    await runBout({ champion, opponent, pickNumber, isFirstBout: i === 0, exchanges });
  }

  await runVictorySequence(champion);
  await wait(P(600));

  audio.stopMusic();
  finishSimulation();
}

/* ============================== Recording setup ============================ */

function setupRecorder() {
  appState.recordedChunks = [];
  appState.videoBlobUrl = null;

  let stream;
  try {
    stream = canvas.captureStream(30);
  } catch (e) {
    appState.recorder = null;
    return;
  }

  audio.ensureStarted();
  const audioDest = audio.ctx.createMediaStreamDestination();
  audio.connectRecording(audioDest);

  const combined = new MediaStream([
    ...stream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  let mimeType = '';
  if (window.MediaRecorder) {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
    }
  }

  if (!window.MediaRecorder) {
    appState.recorder = null;
    return;
  }

  const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) appState.recordedChunks.push(e.data); };
  recorder._mimeType = mimeType || 'video/webm';
  appState.recorder = recorder;
  appState.videoExt = recorder._mimeType.includes('mp4') ? 'mp4' : 'webm';

  recorder.start(250);
}

function stopRecorder() {
  return new Promise((resolve) => {
    const rec = appState.recorder;
    if (!rec || rec.state === 'inactive') { resolve(); return; }
    rec.onstop = () => {
      const blob = new Blob(appState.recordedChunks, { type: rec._mimeType });
      appState.videoBlobUrl = URL.createObjectURL(blob);
      audio.disconnectRecording();
      resolve();
    };
    rec.stop();
  });
}

/* ============================== Screen transitions ========================== */

function launchSimulation() {
  showScreen('sim');
  appState.muted = false;
  muteBtn.textContent = '🔊';
  muteBtn.setAttribute('aria-pressed', 'false');
  audio.setMuted(false);
  setupRecorder();
  runFullSimulation();
}

async function finishSimulation() {
  await stopRecorder();
  stopRenderLoop();
  renderResultsScreen();
  showScreen('results');
}

/* ============================== Results screen ============================== */

const resultsList = document.getElementById('results-list');
const resultsLeagueSub = document.getElementById('results-league-sub');
const videoNote = document.getElementById('video-note');
const exportCanvas = document.getElementById('export-canvas');

function renderResultsScreen() {
  resultsLeagueSub.textContent = appState.leagueName;
  resultsList.innerHTML = '';
  appState.draftOrder.forEach((f, i) => {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'pick-num';
    num.textContent = `PICK ${i + 1}`;
    const name = document.createElement('span');
    name.className = 'pick-name';
    name.textContent = f.name;
    li.appendChild(num);
    li.appendChild(name);
    resultsList.appendChild(li);
  });

  const downloadVideoBtn = document.getElementById('download-video-btn');
  if (appState.videoBlobUrl) {
    downloadVideoBtn.disabled = false;
    videoNote.textContent = appState.videoExt === 'mp4'
      ? 'Video will download as MP4.'
      : 'Your browser recorded this as WebM (plays everywhere; convert to MP4 with a tool like ffmpeg if you need that exact format).';
  } else {
    downloadVideoBtn.disabled = true;
    videoNote.textContent = 'Video recording is not supported in this browser.';
  }

  drawResultsExportImage();
}

// Renders a clean, static "final draft order" card to the hidden export
// canvas so the PNG download always looks the same regardless of whatever
// is animating on the live fight canvas.
function drawResultsExportImage() {
  const ectx = exportCanvas.getContext('2d');
  const W = exportCanvas.width, H = exportCanvas.height;

  const g = ectx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1530');
  g.addColorStop(1, '#050409');
  ectx.fillStyle = g;
  ectx.fillRect(0, 0, W, H);

  ectx.textAlign = 'center';
  ectx.fillStyle = '#f5f0e8';
  ectx.font = '38px "Press Start 2P", monospace';
  ectx.shadowColor = '#00f0ff';
  ectx.shadowBlur = 14;
  ectx.fillText('DRAFT KOMBAT', W / 2, 80);

  ectx.shadowBlur = 0;
  ectx.font = '22px Orbitron, sans-serif';
  ectx.fillStyle = '#b9b4c9';
  ectx.fillText(appState.leagueName, W / 2, 118);

  const order = appState.draftOrder;
  const startY = 160;
  const rowH = Math.min(46, (H - startY - 40) / order.length);
  order.forEach((f, i) => {
    const y = startY + i * rowH;
    ectx.fillStyle = i === 0 ? 'rgba(255,182,39,0.14)' : 'rgba(255,255,255,0.03)';
    ectx.fillRect(W * 0.16, y, W * 0.68, rowH - 8);
    ectx.strokeStyle = i === 0 ? '#ffb627' : '#2a2740';
    ectx.strokeRect(W * 0.16, y, W * 0.68, rowH - 8);

    ectx.textAlign = 'left';
    ectx.fillStyle = i === 0 ? '#ffb627' : '#00f0ff';
    ectx.font = '16px "Press Start 2P", monospace';
    ectx.fillText(`PICK ${i + 1}`, W * 0.19, y + rowH / 2 + 6);

    ectx.textAlign = 'right';
    ectx.fillStyle = '#f5f0e8';
    ectx.font = '20px Orbitron, sans-serif';
    ectx.fillText(f.name, W * 0.81, y + rowH / 2 + 7);
  });

  ectx.textAlign = 'center';
  ectx.fillStyle = '#5c5875';
  ectx.font = '13px Orbitron, sans-serif';
  ectx.fillText('draftkombat — generated client-side, never saved', W / 2, H - 20);
}

/* ============================== Export buttons ============================== */

document.getElementById('download-video-btn').addEventListener('click', () => {
  if (!appState.videoBlobUrl) return;
  const a = document.createElement('a');
  a.href = appState.videoBlobUrl;
  const safe = appState.leagueName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'draft-kombat';
  a.download = `${safe}.${appState.videoExt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.getElementById('download-png-btn').addEventListener('click', () => {
  drawResultsExportImage();
  const url = exportCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  const safe = appState.leagueName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'draft-kombat';
  a.download = `${safe}-draft-order.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.getElementById('replay-btn').addEventListener('click', () => {
  // Same draft order, same fight sequence — just watch it again.
  appState.fighters.forEach(f => { f.hp = 1; f.alpha = 1; f.hitFlash = 0; f.pose = 'idle'; });
  if (appState.videoBlobUrl) { URL.revokeObjectURL(appState.videoBlobUrl); appState.videoBlobUrl = null; }
  launchSimulation();
});

document.getElementById('new-draft-btn').addEventListener('click', () => {
  if (appState.videoBlobUrl) { URL.revokeObjectURL(appState.videoBlobUrl); appState.videoBlobUrl = null; }
  resetSetupForm(appState.teams);
  leagueNameInput.value = appState.leagueName === 'Untitled League' ? '' : appState.leagueName;
  showScreen('setup');
});
