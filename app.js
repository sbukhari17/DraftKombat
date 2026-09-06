'use strict';

/* =========================================================================
   DRAFT KOMBAT
   A client-side fantasy draft order generator staged as an arcade fight.

   Arcade gauntlet: original fighter sprites, punch/kick combat, MK-style
   music and announcer clips. Draft order is shuffled client-side and
   revealed one fatality at a time. Nothing is persisted.
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
/* Theme + announcer clips are original in-repo audio. Punch/kick hits are
   Mixkit royalty-free combat samples (with a synth fallback). */

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
    this.bpm = 138;
    this.theme = null;
    this.themeSource = null;
    this.clips = {};
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

  async preload() {
    this.ensureStarted();
    const decode = async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await this.ctx.decodeAudioData((await res.arrayBuffer()).slice(0));
      } catch (e) { return null; }
    };
    this.theme = await decode('audio/theme.mp3');
    this.clips = {
      fight: await decode('audio/fight.mp3'),
      fatality: await decode('audio/fatality.mp3'),
      finish: await decode('audio/finish-him.mp3'),
      wins: await decode('audio/wins.mp3'),
      outstanding: await decode('audio/outstanding.mp3'),
      punch: await decode('audio/punch.mp3'),
      'punch-2': await decode('audio/punch-2.mp3'),
      kick: await decode('audio/kick.mp3'),
      'kick-2': await decode('audio/kick-2.mp3'),
      'punch-f': await decode('audio/punch-f.mp3'),
      'punch-f2': await decode('audio/punch-f2.mp3'),
      'kick-f': await decode('audio/kick-f.mp3'),
      'kick-f2': await decode('audio/kick-f2.mp3'),
    };
  }

  playClip(name, gain = 1) {
    this.ensureStarted();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    const urls = {
      fight: 'audio/fight.mp3',
      fatality: 'audio/fatality.mp3',
      finish: 'audio/finish-him.mp3',
      wins: 'audio/wins.mp3',
      outstanding: 'audio/outstanding.mp3',
      punch: 'audio/punch.mp3',
      'punch-2': 'audio/punch-2.mp3',
      kick: 'audio/kick.mp3',
      'kick-2': 'audio/kick-2.mp3',
      'punch-f': 'audio/punch-f.mp3',
      'punch-f2': 'audio/punch-f2.mp3',
      'kick-f': 'audio/kick-f.mp3',
      'kick-f2': 'audio/kick-f2.mp3',
    };
    const buf = this.clips[name];
    if (this.ctx && this.sfxGain && buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.sfxGain);
      src.start();
      return buf.duration * 1000;
    }
    if (urls[name]) {
      const el = new Audio(urls[name]);
      el.volume = Math.min(1, Math.max(0.2, gain * 0.85));
      el.play().catch(() => {});
      return 1800;
    }
    return 0;
  }

  playAnnouncer(name, gain = 1.55) {
    const ms = this.playClip(name, gain);
    if (ms > 0) this.duck(Math.min(ms + 120, 4200));
    return ms;
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
    this.stopMusic();
    if (this.theme) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.theme;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this.themeSource = src;
      return;
    }
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.musicTimer = setInterval(() => this._scheduler(), 25);
  }

  stopMusic() {
    if (this.themeSource) {
      try { this.themeSource.stop(); } catch (e) {}
      this.themeSource.disconnect();
      this.themeSource = null;
    }
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

  playHit(kind = 'punch', voice = 'male') {
    this.ensureStarted();
    const pool = voice === 'female'
      ? (kind === 'kick' ? ['kick-f', 'kick-f2'] : ['punch-f', 'punch-f2'])
      : (kind === 'kick' ? ['kick', 'kick-2'] : ['punch', 'punch-2']);
    const name = pool[Math.floor(Math.random() * pool.length)];
    if (this.playClip(name, kind === 'kick' ? 1.2 : 1.08) > 0) return;
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
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
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
    this.playClip('fatality', 1.7);
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
    this.playClip('outstanding', 1);
    this.playClip('wins', 1);
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

/* ============================== Fighter visuals ========================== */
const ROSTER = [
  { title: 'Ember Wraith', voice: 'female' },
  { title: 'Rime Specter', voice: 'female' },
  { title: 'Ironpalm', voice: 'male' },
  { title: 'Scalebite', voice: 'male' },
  { title: 'Nightcoil', voice: 'male' },
  { title: 'Crimson Oracle', voice: 'female' },
  { title: 'Silkfang', voice: 'female' },
  { title: 'Chromejaw', voice: 'male' },
  { title: 'Stormcall', voice: 'female' },
  { title: 'Razorace', voice: 'male' },
  { title: 'Bonebreaker', voice: 'male' },
  { title: 'Glacierine', voice: 'female' },
  { title: 'Ashwraith', voice: 'female' },
  { title: 'Scarletmask', voice: 'female' },
  { title: 'Goldfist', voice: 'male' },
  { title: 'Thornkite', voice: 'female' },
];

const assets = { fighters: [], arena: null, fx: {}, ready: false };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

async function loadAssets() {
  if (assets.ready) return;
  assets.fighters = await Promise.all(ROSTER.map(async (_, i) => {
    const n = String(i).padStart(2, '0');
    return {
      idle: await loadImage(`fighters/${n}-idle.png`),
      punch: await loadImage(`fighters/${n}-punch.png`),
      kick: await loadImage(`fighters/${n}-kick.png`),
      win: await loadImage(`fighters/${n}-win.png`),
      tourney: await loadImage(`fighters/${n}-tourney.png`),
    };
  }));
  assets.arena = await loadImage('arena.jpg');
  assets.fx = {
    spark: await loadImage('fx/spark.png'),
    shock: await loadImage('fx/shock.png'),
    burst: await loadImage('fx/burst.png'),
  };
  assets.ready = true;
}

function buildFighter(name, index, total, modelId) {
  const hue = Math.round((360 / total) * index) % 360;
  const model = ROSTER[modelId % ROSTER.length];
  return {
    name,
    id: index,
    modelId: modelId % ROSTER.length,
    modelTitle: model.title,
    voice: model.voice || 'male',
    colorPrimary: `hsl(${hue}, 78%, 58%)`,
    colorDark: `hsl(${hue}, 70%, 32%)`,
    colorGlow: `hsl(${hue}, 95%, 70%)`,
    flip: false,
    x: 0, y: 0, scale: 1, rot: 0,
    hp: 1, displayHp: 1, chipHp: 1,
    hitFlash: 0,
    pose: 'idle',
    poseT: 0,
    alpha: 1,
    shakeX: 0,
  };
}

const DRAW_H = 318;

function drawFighter(ctx, f) {
  const sprites = assets.fighters[f.modelId];
  if (!sprites) return;
  let img = sprites.idle;
  if (f.pose === 'punch') img = sprites.punch;
  else if (f.pose === 'kick') img = sprites.kick;
  else if (f.pose === 'roundWin') img = sprites.win || sprites.idle;
  else if (f.pose === 'tourneyWin' || f.pose === 'victory') img = sprites.tourney || sprites.idle;

  const now = performance.now();
  const bob = f.pose === 'idle' ? Math.sin(now / 260 + f.id) * 4
    : f.pose === 'roundWin' ? Math.sin(now / 180 + f.id) * 5
    : (f.pose === 'victory' || f.pose === 'tourneyWin') ? Math.sin(now / 120) * 8 : 0;
  const hurtLean = f.pose === 'hurt' ? (1 - f.poseT) * -12 : 0;
  const koDrop = f.pose === 'ko' ? f.poseT * 48 : 0;
  const koRot = f.pose === 'ko' ? f.poseT * (f.flip ? 1.05 : -1.05) : 0;
  const punchBias = (f.pose === 'punch' || f.pose === 'kick') ? easeOutCubic(f.poseT) * 10 : 0;

  const aspect = img.width / img.height;
  const dh = DRAW_H * f.scale * ((f.pose === 'tourneyWin' || f.pose === 'victory') ? 1.06 : 1);
  const dw = dh * aspect;

  ctx.save();
  ctx.globalAlpha = f.alpha;
  ctx.translate(f.x + f.shakeX + hurtLean, f.y + bob + koDrop);
  const faceCamera = f.pose === 'roundWin' || f.pose === 'tourneyWin' || f.pose === 'victory';
  ctx.scale(faceCamera ? 1 : (f.flip ? -1 : 1), 1);
  ctx.rotate(f.rot + koRot);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 10, dw * 0.22, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  if (f.hitFlash > 0.05) {
    ctx.filter = `brightness(${1.4 + f.hitFlash * 1.6}) saturate(${1 - f.hitFlash * 0.7})`;
  }
  ctx.drawImage(img, -dw / 2 + punchBias, -dh + 12, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
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
  revealed: [],
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
const teamCountSlider = document.getElementById('team-count');
const teamCountLabel = document.getElementById('team-count-label');
const startBtn = document.getElementById('start-btn');
const setupError = document.getElementById('setup-error');
const leagueNameInput = document.getElementById('league-name');

const MIN_TEAMS = 4;
const MAX_TEAMS = 16;

function addTeamRow(prefillName = '') {
  const li = document.createElement('li');
  li.className = 'team-row';

  const idxSpan = document.createElement('span');
  idxSpan.className = 'team-index';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 30;
  input.autocomplete = 'off';
  input.value = prefillName;

  li.appendChild(idxSpan);
  li.appendChild(input);
  teamListEl.appendChild(li);
}

function currentTeamNames() {
  return [...teamListEl.querySelectorAll('.team-row input')].map((inp) => inp.value);
}

function setTeamCount(n, names) {
  n = clamp(Math.round(n), MIN_TEAMS, MAX_TEAMS);
  const existing = names || currentTeamNames();
  teamListEl.innerHTML = '';
  for (let i = 0; i < n; i++) addTeamRow(existing[i] || '');
  const rows = teamListEl.querySelectorAll('.team-row');
  rows.forEach((row, i) => {
    row.querySelector('.team-index').textContent = `${i + 1}.`;
    row.querySelector('input').placeholder = `Team ${i + 1} name`;
  });
  teamCountSlider.value = String(n);
  teamCountLabel.textContent = String(n);
}

function resetSetupForm(prefillNames = []) {
  const names = prefillNames.length ? prefillNames : new Array(MIN_TEAMS).fill('');
  setTeamCount(names.length, names);
  setupError.hidden = true;
}

teamCountSlider.addEventListener('input', () => {
  setTeamCount(Number(teamCountSlider.value), currentTeamNames());
});

function assignRandomFighters(names) {
  const ids = shuffle(ROSTER.map((_, i) => i));
  return names.map((n, i) => buildFighter(n, i, names.length, ids[i]));
}

startBtn.addEventListener('click', () => {
  const league = leagueNameInput.value.trim() || 'Untitled League';
  const nameInputs = [...teamListEl.querySelectorAll('.team-row input')];
  const names = nameInputs.map((inp) => inp.value.trim()).filter(Boolean);

  if (names.length < MIN_TEAMS || names.length > MAX_TEAMS) {
    setupError.textContent = `Enter between ${MIN_TEAMS} and ${MAX_TEAMS} team names.`;
    setupError.hidden = false;
    return;
  }
  setupError.hidden = true;

  appState.leagueName = league;
  appState.teams = names;
  appState.fighters = assignRandomFighters(names);
  appState.draftOrder = [];

  launchSimulation();
});

resetSetupForm();

startBtn.disabled = true;
startBtn.textContent = 'Loading arena…';
loadAssets()
  .then(() => { startBtn.disabled = false; startBtn.textContent = 'Start Draft Kombat'; })
  .catch(() => { startBtn.disabled = false; startBtn.textContent = 'Start Draft Kombat'; });

/* ================================ Mute toggle ============================= */

const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  appState.muted = !appState.muted;
  audio.setMuted(appState.muted);
  muteBtn.textContent = appState.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(appState.muted));
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
let showResultsBoard = false;
let showIntroBoard = false;

function resetSceneVisuals() {
  particles = [];
  overlayText = null;
  screenShake = 0;
}

function drawBackground(t) {
  if (assets.arena) {
    ctx.drawImage(assets.arena, 0, 0, CW, CH);
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  } else {
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, CW, CH);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(CW / 2, GROUND_Y + 18, 340, 22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHealthBar(f, x, alignRight) {
  const w = 260, h = 18;
  ctx.save();
  ctx.translate(x, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, w, h);
  const chipW = Math.max(0, w * (f.chipHp ?? f.hp));
  const hpW = Math.max(0, w * (f.displayHp ?? f.hp));
  const chipX = alignRight ? w - chipW : 0;
  const barX = alignRight ? w - hpW : 0;
  ctx.fillStyle = '#ffd200';
  ctx.fillRect(chipX, 2, chipW, h - 4);
  ctx.fillStyle = (f.displayHp ?? f.hp) > 0.32 ? '#e31b23' : '#ff4d3a';
  ctx.fillRect(barX, 2, hpW, h - 4);
  ctx.strokeStyle = '#ffd200';
  ctx.strokeRect(0, 0, w, h);
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

  if (showIntroBoard) {
    drawIntroRoster(ctx, CW, CH);
    requestAnimationFrame(renderFrame);
    return;
  }
  if (showResultsBoard) {
    drawPlacementBoard(ctx, CW, CH);
    requestAnimationFrame(renderFrame);
    return;
  }

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
      if (f.displayHp > f.hp) f.displayHp = Math.max(f.hp, f.displayHp - dt * 1.8);
      else f.displayHp = f.hp;
      if (f.chipHp > f.displayHp) f.chipHp = Math.max(f.displayHp, f.chipHp - dt * 0.55);
      else f.chipHp = f.displayHp;
      drawFighter(ctx, f);
    });
    if (scene.introAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = scene.introAlpha * 0.72;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, CH * 0.28, CW, CH * 0.28);
      ctx.globalAlpha = scene.introAlpha;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd200';
      ctx.font = '700 18px "Barlow Condensed", Orbitron, sans-serif';
      ctx.fillText(scene.roundLabel || '', CW / 2, CH * 0.35);
      ctx.fillStyle = '#f4ead5';
      ctx.font = '44px "Black Ops One", "Press Start 2P", Impact, sans-serif';
      ctx.fillText((scene.leftName || '').toUpperCase(), CW * 0.28, CH * 0.46);
      ctx.fillStyle = '#e31b23';
      ctx.font = '36px "Black Ops One", "Press Start 2P", Impact, sans-serif';
      ctx.fillText('VS', CW / 2, CH * 0.46);
      ctx.fillStyle = '#f4ead5';
      ctx.font = '44px "Black Ops One", "Press Start 2P", Impact, sans-serif';
      ctx.fillText((scene.rightName || '').toUpperCase(), CW * 0.72, CH * 0.46);
      ctx.restore();
    }
    if (scene.fightAlpha > 0.01) {
      ctx.save();
      ctx.translate(CW / 2, CH * 0.46);
      ctx.scale(scene.fightScale || 1, scene.fightScale || 1);
      ctx.globalAlpha = scene.fightAlpha;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#e31b23';
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#e31b23';
      ctx.strokeStyle = '#ffd200';
      ctx.lineWidth = 8;
      ctx.font = '92px "Black Ops One", "Press Start 2P", Impact, sans-serif';
      ctx.strokeText('FIGHT', 0, 0);
      ctx.fillText('FIGHT', 0, 0);
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

const GROUND_Y = CH * 0.78;
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
  await tween(overlayText, 'alpha', 0, 1, P(80));
  await wait(P(holdMs));
  await tween(overlayText, 'alpha', 1, 0, P(90));
  overlayText = null;
}

function splitHits(total, n) {
  const w = Array.from({ length: n }, () => rand(0.75, 1.25));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => total * (x / s));
}

function planBout(left, right) {
  const close = Math.random() < 0.45;
  let leftEnd;
  let rightEnd;
  if (close) {
    leftEnd = rand(0.08, 0.16);
    rightEnd = rand(0.08, 0.16);
  } else if (Math.random() < 0.45) {
    leftEnd = rand(0.08, 0.2);
    rightEnd = rand(0.32, 0.58);
    if (Math.random() < 0.5) [leftEnd, rightEnd] = [rightEnd, leftEnd];
  } else {
    leftEnd = rand(0.08, 0.18);
    rightEnd = rand(0.48, 0.74);
    if (Math.random() < 0.5) [leftEnd, rightEnd] = [rightEnd, leftEnd];
  }
  const leftTaken = splitHits(1 - leftEnd, 3);
  const rightTaken = splitHits(1 - rightEnd, 3);
  let attacker = Math.random() < 0.5 ? left : right;
  const seq = [];
  const landed = new Map([[left, 0], [right, 0]]);
  let li = 0;
  let ri = 0;
  for (let i = 0; i < 6; i++) {
    const defender = attacker === left ? right : left;
    const hitsBy = landed.get(attacker) || 0;
    const dmg = defender === left ? leftTaken[li++] : rightTaken[ri++];
    seq.push({ attacker, defender, dmg, kind: hitsBy === 2 ? 'kick' : 'punch' });
    landed.set(attacker, hitsBy + 1);
    attacker = defender;
  }
  return { close, seq };
}

async function exchangeBlows(left, right) {
  const { close, seq } = planBout(left, right);
  for (const step of seq) {
    const { attacker, defender, dmg, kind } = step;
    const dir = attacker.flip ? -1 : 1;
    const home = attacker.x;
    const lunge = kind === 'kick' ? 54 : 42;
    attacker.pose = kind;
    attacker.poseT = 0;
    audio.playWhoosh();
    await Promise.all([
      tween(attacker, 'x', home, home + dir * lunge, P(80)),
      tween(attacker, 'poseT', 0, 1, P(120)),
    ]);

    audio.playHit(kind, attacker.voice);
    defender.hitFlash = 1;
    defender.pose = 'hurt';
    defender.poseT = 0;
    defender.hp = Math.max(0.05, defender.hp - dmg);
    shakeScreen(kind === 'kick' ? 14 : 9);
    particles.push(...makeBurst(defender.x, defender.y - (kind === 'kick' ? 90 : 140), attacker.colorGlow, kind === 'kick' ? 14 : 10, 180));

    const defHome = defender.x;
    const knock = kind === 'kick' ? 26 : 16;
    await Promise.all([
      tween(defender, 'x', defHome, defHome + (defender.flip ? knock : -knock), P(50)),
      tween(defender, 'poseT', 0, 1, P(90)),
    ]);
    await Promise.all([
      tween(attacker, 'x', attacker.x, home, P(70)),
      tween(defender, 'x', defender.x, defHome, P(70)),
    ]);
    attacker.pose = 'idle';
    defender.pose = 'idle';
    await wait(P(30));
  }
  return close;
}

function resetFighter(f, side) {
  f.y = GROUND_Y;
  f.flip = side === 'right';
  f.hp = 1;
  f.displayHp = 1;
  f.chipHp = 1;
  f.pose = 'idle';
  f.alpha = 1;
  f.scale = 1;
  f.rot = 0;
  f.hitFlash = 0;
}

async function runBout({ left, right, pickNumber, round, totalRounds }) {
  scene = { champion: left, opponent: right, vsAlpha: 0, introAlpha: 0, fightAlpha: 0, fightScale: 1, leftName: left.name, rightName: right.name, roundLabel: '' };
  resetFighter(left, 'left');
  resetFighter(right, 'right');
  left.x = OFFSCREEN_LEFT;
  right.x = OFFSCREEN_RIGHT;
  audio.playWhoosh();
  await Promise.all([
    tween(left, 'x', OFFSCREEN_LEFT, CHAMPION_X, P(240)),
    tween(right, 'x', OFFSCREEN_RIGHT, OPPONENT_X, P(240)),
  ]);

  const isFinal = round >= totalRounds;
  scene.roundLabel = isFinal ? 'FINAL ROUND' : `ROUND ${round}`;
  scene.leftName = left.name;
  scene.rightName = right.name;
  const clipMs = audio.playAnnouncer('fight', 1.5) || 3530;
  await tween(scene, 'introAlpha', 0, 1, 90);
  await wait(Math.max(0, 1850 - 90));
  await tween(scene, 'introAlpha', 1, 0, 80);

  scene.fightAlpha = 1;
  scene.fightScale = 2.5;
  await tween(scene, 'fightScale', 2.5, 1, 140);
  const used = 90 + 1760 + 80 + 140;
  await wait(Math.max(400, clipMs - used + 120));
  await tween(scene, 'fightAlpha', 1, 0, 80);

  await exchangeBlows(left, right);

  const close = left.hp <= 0.22 && right.hp <= 0.22;
  const winner = left.hp === right.hp ? (Math.random() < 0.5 ? left : right) : (left.hp > right.hp ? left : right);
  const loser = winner === left ? right : left;

  if (close) {
    winner.pose = 'hurt';
    loser.pose = 'hurt';
    screenShake = 6;
  }
  const finishMs = audio.playAnnouncer('finish', 1.7);
  const extra = close ? rand(720, 1100) : 0;
  await flashOverlay('FINISH HIM', '', '#ffd200', Math.max(finishMs, 1600) + extra, 52);
  if (close) {
    winner.pose = 'idle';
    loser.pose = 'idle';
    await wait(P(160));
  }

  const home = winner.x;
  const dir = winner.flip ? -1 : 1;
  winner.pose = 'kick';
  winner.poseT = 0;
  await Promise.all([
    tween(winner, 'x', home, home + dir * 54, P(80)),
    tween(winner, 'poseT', 0, 1, P(120)),
  ]);
  audio.playHit('kick', winner.voice);
  loser.hp = 0;
  loser.displayHp = 0;
  loser.pose = 'ko';
  loser.poseT = 0;
  screenShake = 20;
  const fatMs = audio.playAnnouncer('fatality', 1.7);
  particles.push(...makeBurst(loser.x, loser.y - 40, '#e31b23', 28, 280));
  await tween(loser, 'poseT', 0, 1, P(220));
  await tween(loser, 'alpha', 1, 0.18, P(160));
  await tween(winner, 'x', winner.x, home, P(70));
  winner.pose = 'roundWin';
  winner.flip = false;
  winner.scale = 1.04;
  if (winner === left) scene.opponent = null;
  else scene.champion = null;

  await flashOverlay(`${winner.name.toUpperCase()} WINS!`, `${loser.name.toUpperCase()} — PICK #${pickNumber}`, '#ffd200', Math.min(Math.max(fatMs * 0.65, 700), 1400), winner.name.length > 12 ? 36 : 48);
  return { winner, loser };
}

async function walkOff(winner) {
  const off = winner.x < CW / 2 ? OFFSCREEN_LEFT : OFFSCREEN_RIGHT;
  await tween(winner, 'x', winner.x, off, P(220));
  winner.alpha = 0;
  if (scene && scene.champion === winner) scene.champion = null;
  if (scene && scene.opponent === winner) scene.opponent = null;
}

async function runVictorySequence(champion) {
  scene = { champion, opponent: null, vsAlpha: 0 };
  champion.x = CW / 2; champion.y = GROUND_Y; champion.flip = false;
  champion.pose = 'tourneyWin'; champion.hp = 1; champion.displayHp = 1; champion.chipHp = 1; champion.alpha = 1;
  champion.scale = 1.12;
  audio.playVictoryFanfare();
  particles.push(...makeBurst(CW * 0.3, CH * 0.5, '#ffb627', 30, 300));
  particles.push(...makeBurst(CW * 0.7, CH * 0.5, '#00f0ff', 30, 300));
  particles.push(...makeBurst(champion.x, champion.y - 220, champion.colorGlow, 40, 360));
  await flashOverlay('VICTORY!', `${champion.name.toUpperCase()} — 1ST OVERALL PICK`, '#ffb627', 2200, 44);
}

function computePacing(_fightCount) {
  return { exchanges: 4, pace: 1 };
}

async function runFullSimulation() {
  clock.timeScale = 1;
  skipBtn.disabled = false;
  skipBtn.textContent = 'Fast-forward ⏭';

  const remaining = shuffle(appState.fighters.slice());
  const n = remaining.length;
  const paced = computePacing(n - 1);
  pace = paced.pace;
  const byName = new Map(appState.fighters.map((f) => [f.name, f]));

  resetSceneVisuals();
  showResultsBoard = false;
  showIntroBoard = true;
  startRenderLoop();
  audio.startMusic();
  appState.revealed = [];
  renderDraftRail(n);
  await wait(4000);
  showIntroBoard = false;

  let nextPick = n;
  let round = 0;
  const totalRounds = n - 1;
  while (remaining.length > 1) {
    const i = Math.floor(Math.random() * remaining.length);
    let j = Math.floor(Math.random() * (remaining.length - 1));
    if (j >= i) j += 1;
    const a = remaining[i];
    const b = remaining[j];
    const left = Math.random() < 0.5 ? a : b;
    const right = left === a ? b : a;
    round += 1;
    const { winner, loser } = await runBout({ left, right, pickNumber: nextPick, round, totalRounds });
    const idx = remaining.indexOf(loser);
    if (idx >= 0) remaining.splice(idx, 1);
    appState.revealed.push({ pick: nextPick, name: loser.name });
    nextPick -= 1;
    renderDraftRail(n);
    if (remaining.length > 1) await walkOff(winner);
  }

  const champ = remaining[0];
  appState.revealed.push({ pick: 1, name: champ.name });
  appState.draftOrder = appState.revealed
    .slice()
    .sort((a, b) => a.pick - b.pick)
    .map((r) => byName.get(r.name))
    .filter(Boolean);
  renderDraftRail(n);
  await runVictorySequence(champ);
  showResultsBoard = true;
  await wait(3000);
  showResultsBoard = false;

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

async function launchSimulation() {
  showScreen('sim');
  appState.muted = false;
  muteBtn.textContent = '🔊';
  muteBtn.setAttribute('aria-pressed', 'false');
  audio.ensureStarted();
  audio.setMuted(false);
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  await Promise.all([loadAssets(), audio.preload()]);
  if (appState.teams && appState.teams.length) {
    appState.fighters = assignRandomFighters(appState.teams);
  }
  setupRecorder();
  runFullSimulation();
}

async function finishSimulation() {
  await stopRecorder();
  stopRenderLoop();
  renderResultsScreen();
  showScreen('results');
}

/* ============================== Draft rail ============================== */

const draftRailList = document.getElementById('draft-rail-list');

function renderDraftRail(teamCount) {
  if (!draftRailList) return;
  const byPick = new Map((appState.revealed || []).map((r) => [r.pick, r]));
  const n = teamCount || (appState.draftOrder && appState.draftOrder.length) || 0;
  draftRailList.innerHTML = '';
  for (let pick = 1; pick <= n; pick++) {
    const row = byPick.get(pick);
    const li = document.createElement('li');
    if (row) li.classList.add('filled');
    if (row && pick === 1) li.classList.add('pick-one');
    const num = document.createElement('span');
    num.className = 'pick-num';
    num.textContent = String(pick);
    const name = document.createElement('span');
    name.className = 'pick-name';
    name.textContent = row ? row.name : '—';
    li.appendChild(num);
    li.appendChild(name);
    draftRailList.appendChild(li);
  }
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
function boardTitle() {
  const n = (appState.leagueName || '').trim();
  if (!n || /^untitled league$/i.test(n)) return 'DRAFT KOMBAT';
  return n.toUpperCase();
}

function drawIntroRoster(ectx, W, H) {
  if (assets.arena) ectx.drawImage(assets.arena, 0, 0, W, H);
  ectx.fillStyle = 'rgba(7,7,10,0.82)';
  ectx.fillRect(0, 0, W, H);

  const title = boardTitle();
  const titleSize = title.length > 28 ? 26 : title.length > 18 ? 34 : 44;
  ectx.textAlign = 'center';
  ectx.fillStyle = '#e31b23';
  ectx.font = `${titleSize}px "Black Ops One", "Press Start 2P", Impact, sans-serif`;
  ectx.shadowBlur = 0;
  ectx.fillText(title, W / 2, 52);
  ectx.fillStyle = '#ffd200';
  ectx.font = '14px Orbitron, sans-serif';
  ectx.fillText('THE KOMBATANTS', W / 2, 76);

  const list = appState.fighters || [];
  const n = list.length;
  const cols = n <= 4 ? n : 4;
  const rows = Math.max(1, Math.ceil(n / cols));
  const padX = 36;
  const top = 96;
  const bottom = 18;
  const cellW = (W - padX * 2) / cols;
  const cellH = (H - top - bottom) / rows;

  const remainder = n % cols;
  list.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const colsThisRow = row === rows - 1 && remainder ? remainder : cols;
    const offset = ((cols - colsThisRow) * cellW) / 2;
    const x = padX + offset + col * cellW;
    const y = top + row * cellH;
    ectx.fillStyle = 'rgba(255,255,255,0.04)';
    ectx.fillRect(x + 6, y + 4, cellW - 12, cellH - 8);
    ectx.strokeStyle = 'rgba(255,210,0,0.28)';
    ectx.strokeRect(x + 6, y + 4, cellW - 12, cellH - 8);

    const sprites = assets.fighters[f.modelId];
    const img = (sprites && (sprites.win || sprites.idle)) || null;
    const nameH = 36;
    if (img) {
      const boxW = cellW - 24;
      const boxH = cellH - nameH - 16;
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = x + (cellW - dw) / 2;
      const dy = y + 10 + (boxH - dh);
      ectx.drawImage(img, dx, dy, dw, dh);
    }

    ectx.textAlign = 'center';
    ectx.fillStyle = '#f5f0e8';
    ectx.font = '16px Orbitron, sans-serif';
    ectx.fillText((f.name || '').toUpperCase(), x + cellW / 2, y + cellH - 18);
    ectx.fillStyle = '#9a8f7e';
    ectx.font = '11px Orbitron, sans-serif';
    ectx.fillText((f.modelTitle || '').toUpperCase(), x + cellW / 2, y + cellH - 6);
  });
}

function drawPlacementBoard(ectx, W, H) {
  if (assets.arena) ectx.drawImage(assets.arena, 0, 0, W, H);
  else {
    const g = ectx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1530');
    g.addColorStop(1, '#050409');
    ectx.fillStyle = g;
    ectx.fillRect(0, 0, W, H);
  }
  ectx.fillStyle = 'rgba(7,7,10,0.84)';
  ectx.fillRect(0, 0, W, H);

  ectx.textAlign = 'center';
  ectx.fillStyle = '#e31b23';
  ectx.font = '42px "Black Ops One", "Press Start 2P", Impact, sans-serif';
  ectx.shadowColor = 'transparent';
  ectx.shadowBlur = 0;
  ectx.fillText('DRAFT KOMBAT', W / 2, 58);
  ectx.fillStyle = '#ffd200';
  ectx.font = '20px Orbitron, sans-serif';
  ectx.fillText((appState.leagueName || '').toUpperCase(), W / 2, 88);
  ectx.fillStyle = '#9a8f7e';
  ectx.font = '14px Orbitron, sans-serif';
  ectx.fillText('FINAL DRAFT ORDER', W / 2, 110);

  const order = appState.draftOrder || [];
  const startY = 128;
  const rowH = Math.min(34, (H - startY - 28) / Math.max(1, order.length));
  order.forEach((f, i) => {
    const y = startY + i * rowH;
    ectx.fillStyle = i === 0 ? 'rgba(255,210,0,0.16)' : 'rgba(255,255,255,0.04)';
    ectx.fillRect(W * 0.1, y, W * 0.8, rowH - 5);
    ectx.strokeStyle = i === 0 ? '#ffd200' : '#2c2c36';
    ectx.strokeRect(W * 0.1, y, W * 0.8, rowH - 5);

    ectx.textAlign = 'left';
    ectx.fillStyle = i === 0 ? '#ffd200' : '#e31b23';
    ectx.font = '15px Orbitron, sans-serif';
    ectx.fillText(`PICK ${i + 1}`, W * 0.18, y + rowH / 2 + 4);
    ectx.fillStyle = '#f5f0e8';
    ectx.font = '18px Orbitron, sans-serif';
    ectx.fillText(f.name, W * 0.28, y + rowH / 2 + 4);
  });
}

function drawResultsExportImage() {
  const ectx = exportCanvas.getContext('2d');
  drawPlacementBoard(ectx, exportCanvas.width, exportCanvas.height);
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
