/* fatality director */



function scream(h, loser) {
  h.audio.playClip(loser.voice === "female" ? "scream-f" : "scream-m", 1.25);
}

function kill(loser) {
  loser.hp = 0;
  loser.displayHp = 0;
}

function poseExec(winner) {
  winner.pose = "exec";
  winner.poseT = 1;
}

function tickFx(bits, dt) {
  for (const b of bits) {
    b.age += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    if (b.kind === "grenade" || b.kind === "statue") b.vy += 980 * dt;
  }
  return bits.filter((b) => b.age < b.life);
}

function drawFatalityFx(ctx, bits) {
  for (const b of bits) {
    const t = Math.min(1, b.age / Math.max(0.001, b.life));
    ctx.save();
    ctx.globalAlpha = b.alpha * (1 - t * 0.15);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.scale, b.scale);
    switch (b.kind) {
      case "shuriken": {
        ctx.fillStyle = "#d8d8e0";
        ctx.strokeStyle = "#3a3a44";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * 5, Math.sin(a + Math.PI / 4) * 5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "iceball": {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.4, "#7ad7ff");
        g.addColorStop(1, "rgba(40,120,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "grenade": {
        ctx.fillStyle = "#4a5a32";
        ctx.beginPath();
        ctx.ellipse(0, 4, 10, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c8c070";
        ctx.fillRect(-3, -12, 6, 8);
        break;
      }
      case "fireball": {
        const g = ctx.createRadialGradient(0, 8, 4, 0, 0, 48);
        g.addColorStop(0, "#fff4c0");
        g.addColorStop(0.35, "#ff6a00");
        g.addColorStop(1, "rgba(180,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 48, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "energy": {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.4, "#7af0ff");
        g.addColorStop(1, "rgba(0,80,180,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "slash": {
        ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, 0, 70, -0.9, 0.9);
        ctx.stroke();
        ctx.strokeStyle = "rgba(200,230,255,0.5)";
        ctx.lineWidth = 14;
        ctx.stroke();
        break;
      }
      case "lightning": {
        ctx.strokeStyle = "#e8f6ff";
        ctx.shadowColor = "#6cf";
        ctx.shadowBlur = 18;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, -220);
        ctx.lineTo(18, -140);
        ctx.lineTo(-14, -80);
        ctx.lineTo(10, -20);
        ctx.lineTo(-6, 40);
        ctx.lineTo(0, 90);
        ctx.stroke();
        break;
      }
      case "gas": {
        ctx.fillStyle = "rgba(80,200,70,0.35)";
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(Math.sin(i * 1.7) * 40, Math.cos(i * 1.3) * 24, 38 + (i % 3) * 10, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "muzzle": {
        ctx.fillStyle = "#ffe680";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(28, -8);
        ctx.lineTo(48, 0);
        ctx.lineTo(28, 8);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "statue": {
        ctx.fillStyle = "#8a8470";
        ctx.beginPath();
        ctx.ellipse(0, -90, 48, 42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-55, -70, 110, 140);
        ctx.beginPath();
        ctx.moveTo(-70, 80);
        ctx.lineTo(70, 80);
        ctx.lineTo(50, 20);
        ctx.lineTo(-50, 20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#6e6858";
        ctx.fillRect(-18, -40, 36, 50);
        break;
      }
      case "iceblock": {
        ctx.fillStyle = "rgba(160,220,255,0.45)";
        ctx.strokeStyle = "rgba(230,250,255,0.85)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(-50, -140, 100, 150);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-20, -140);
        ctx.lineTo(-8, 10);
        ctx.moveTo(15, -120);
        ctx.lineTo(4, 10);
        ctx.stroke();
        break;
      }
      default:
    }
    ctx.restore();
  }
}

// gasveil uses h.cw - that's a bug, drawFatalityFx doesn't have h.
// I'll hardcode large rect instead.

async function runFatality(h, winner, loser) {
  const home = winner.x;
  const homeY = winner.y;
  const dir = winner.flip ? -1 : 1;
  winner.hidden = false;
  loser.hidden = false;
  loser.slices = 0;
  loser.sliceSpread = 0;
  loser.tintAmt = 0;
  loser.scaleY = 1;
  kill(loser);

  const id = winner.modelId % 16;
  try {
    switch (id) {
      case 0:
        await fat00(h, winner, loser, dir);
        break;
      case 1:
        await fat01(h, winner, loser, dir);
        break;
      case 2:
        await fat02(h, winner, loser);
        break;
      case 3:
        await fat03(h, winner, loser, dir);
        break;
      case 4:
        await fat04(h, winner, loser, dir);
        break;
      case 5:
        await fat05(h, winner, loser);
        break;
      case 6:
        await fat06(h, winner, loser);
        break;
      case 7:
        await fat07(h, winner, loser, dir);
        break;
      case 8:
        await fat08(h, winner, loser);
        break;
      case 9:
        await fat09(h, winner, loser, dir);
        break;
      case 10:
        await fat10(h, winner, loser);
        break;
      case 11:
        await fat11(h, winner, loser, dir);
        break;
      case 12:
        await fat12(h, winner, loser);
        break;
      case 13:
        await fat13(h, winner, loser, dir);
        break;
      case 14:
        await fat14(h, winner, loser, dir);
        break;
      default:
        await fat15(h, winner, loser, dir);
        break;
    }
  } finally {
    winner.x = home;
    winner.y = homeY;
    winner.rot = 0;
    winner.scale = 1;
    winner.scaleY = 1;
    winner.hidden = false;
    winner.alpha = 1;
    winner.pose = "roundWin";
    winner.flip = false;
    loser.alpha = 0;
    loser.hidden = true;
    loser.slices = 0;
    loser.scaleY = 1;
    loser.rot = 0;
  }
}

function bit(kind, extra = {}) {
  return {
    kind,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
    scale: 1,
    alpha: 1,
    life: 0.8,
    age: 0,
    color: "#fff",
    ...extra,
  };
}

async function fat00(h, w, l, dir) {
  poseExec(w);
  h.audio.playClip("whoosh-air", 1.1);
  await tween(w, "y", w.y, -80, h.P(280), easeOutCubic);
  w.hidden = true;
  w.alpha = 0;
  for (let i = 0; i < 8; i++) {
    h.spawn(
      bit("shuriken", {
        x: l.x + rand(-30, 30),
        y: -20,
        vx: rand(-40, 40),
        vy: rand(520, 760),
        vr: dir * 14,
        life: 0.7,
      }),
    );
    h.audio.playClip("saber", 0.7);
    await wait(h.P(70));
  }
  h.shake(16);
  h.flash(0.45);
  l.slices = 4;
  scream(h, l);
  h.burst(l.x, l.y - 90, "#e8e8f0", 24, 280);
  await tween(l, "sliceSpread", 0, 48, h.P(280));
  await tween(l, "alpha", 1, 0, h.P(180));
}

async function fat01(h, w, l, dir) {
  poseExec(w);
  h.audio.playClip("firewoosh", 0.9);
  h.spawn(bit("iceball", { x: w.x + dir * 40, y: w.y - 140, vx: dir * 620, vy: 40, life: 0.45 }));
  await wait(h.P(180));
  l.tint = "#7ad7ff";
  await tween(l, "tintAmt", 0, 0.88, h.P(160));
  h.spawn(bit("iceblock", { x: l.x, y: l.y - 10, life: 0.7 }));
  await wait(h.P(320));
  h.audio.playClip("shatter", 1.3);
  scream(h, l);
  h.shake(14);
  l.slices = 5;
  h.burst(l.x, l.y - 80, "#c8f0ff", 36, 340);
  await tween(l, "sliceSpread", 0, 56, h.P(260));
  await tween(l, "alpha", 1, 0, h.P(160));
}

async function fat02(h, w, l) {
  poseExec(w);
  await wait(h.P(220));
  h.audio.playClip("whoosh-air", 1);
  h.spawn(bit("statue", { x: l.x, y: -160, vy: 0, life: 0.9, scale: 1.35 }));
  await wait(h.P(280));
  h.audio.playClip("impact", 1.4);
  h.audio.playClip("explode", 0.9);
  scream(h, l);
  h.shake(22);
  h.flash(0.5);
  await tween(l, "scaleY", 1, 0.18, h.P(160));
  l.y += 28;
  h.burst(l.x, l.y - 20, "#8a8470", 22, 220);
  await tween(l, "alpha", 1, 0, h.P(200));
}

async function fat03(h, w, l, dir) {
  const home = w.x;
  poseExec(w);
  await tween(w, "x", home, l.x - dir * 70, h.P(120));
  for (let i = 0; i < 3; i++) {
    w.poseT = 0;
    h.audio.playClip("slash", 1.05);
    h.spawn(bit("slash", { x: l.x, y: l.y - 110, rot: rand(-0.6, 0.6), life: 0.28, scale: 1.1 }));
    l.slices = i + 2;
    l.hitFlash = 1;
    h.shake(8);
    await tween(w, "poseT", 0, 1, h.P(90));
    await wait(h.P(50));
  }
  scream(h, l);
  h.burst(l.x, l.y - 90, "#3dcf6a", 20, 240);
  await tween(l, "sliceSpread", 0, 62, h.P(280));
  await tween(l, "alpha", 1, 0, h.P(160));
  await tween(w, "x", w.x, home, h.P(120));
}

async function fat04(h, w, l, dir) {
  poseExec(w);
  h.audio.playClip("whoosh-air", 0.9);
  h.spawn(
    bit("grenade", {
      x: w.x + dir * 30,
      y: w.y - 150,
      vx: dir * 340,
      vy: -220,
      vr: dir * 8,
      life: 0.7,
    }),
  );
  await wait(h.P(420));
  h.audio.playClip("bomb", 1.35);
  h.audio.playClip("explode", 1.1);
  scream(h, l);
  h.shake(24);
  h.flash(0.7);
  h.burst(l.x, l.y - 80, "#ff6a00", 40, 380);
  await tween(l, "alpha", 1, 0, h.P(180));
}

async function fat05(h, w, l) {
  poseExec(w);
  h.audio.playClip("firewoosh", 1.1);
  h.spawn(bit("fireball", { x: l.x, y: -40, vy: 720, life: 0.55, scale: 1.6 }));
  await wait(h.P(280));
  h.audio.playClip("fireball", 1.3);
  scream(h, l);
  h.shake(20);
  h.flash(0.6);
  l.tint = "#ff6a00";
  await tween(l, "tintAmt", 0, 0.8, h.P(120));
  h.burst(l.x, l.y - 90, "#ff6a00", 36, 320);
  await tween(l, "alpha", 1, 0, h.P(220));
}

async function fat06(h, w, l) {
  poseExec(w);
  await wait(h.P(80));
  w.hidden = true;
  w.alpha = 0;
  h.audio.playClip("whoosh-air", 1);
  for (let i = 0; i < 5; i++) {
    h.audio.playClip(i % 2 ? "slash" : "saber", 1.1);
    h.spawn(
      bit("slash", {
        x: l.x + rand(-12, 12),
        y: l.y - 100 + rand(-20, 20),
        rot: rand(-1.2, 1.2),
        life: 0.26,
        scale: 1.15,
      }),
    );
    l.slices = Math.min(5, i + 2);
    l.hitFlash = 1;
    h.shake(10);
    await wait(h.P(90));
  }
  scream(h, l);
  h.burst(l.x, l.y - 90, "#c46cff", 24, 260);
  await tween(l, "sliceSpread", 0, 58, h.P(240));
  await tween(l, "alpha", 1, 0, h.P(160));
}

async function fat07(h, w, l, dir) {
  poseExec(w);
  await wait(h.P(160));
  h.audio.playClip("energy", 1.25);
  h.spawn(bit("energy", { x: w.x + dir * 50, y: w.y - 130, vx: dir * 780, life: 0.4, scale: 1.3 }));
  await wait(h.P(180));
  h.audio.playClip("explode", 1.2);
  scream(h, l);
  h.shake(20);
  h.flash(0.65);
  h.burst(l.x, l.y - 90, "#7af0ff", 34, 340);
  await tween(l, "alpha", 1, 0, h.P(200));
}

async function fat08(h, w, l) {
  poseExec(w);
  await wait(h.P(200));
  h.audio.playClip("lightning", 1.4);
  h.spawn(bit("lightning", { x: l.x, y: l.y - 80, life: 0.45 }));
  h.flash(0.8);
  h.shake(18);
  l.hitFlash = 1;
  await wait(h.P(120));
  scream(h, l);
  h.burst(l.x, l.y - 90, "#9ad4ff", 28, 300);
  await tween(l, "alpha", 1, 0, h.P(200));
}

async function fat09(h, w, l, dir) {
  poseExec(w);
  await wait(h.P(120));
  for (let i = 0; i < 3; i++) {
    h.audio.playClip("gun", 1.2);
    h.spawn(bit("muzzle", { x: w.x + dir * 55, y: w.y - 150, rot: dir < 0 ? Math.PI : 0, life: 0.12 }));
    l.hitFlash = 1;
    h.shake(8);
    await wait(h.P(140));
  }
  scream(h, l);
  l.pose = "ko";
  await tween(l, "poseT", 0, 1, h.P(220));
  await tween(l, "alpha", 1, 0, h.P(180));
}

async function fat10(h, w, l) {
  poseExec(w);
  h.audio.playClip("whoosh-air", 1);
  await tween(w, "x", w.x, l.x, h.P(180));
  l.pose = "hurt";
  await Promise.all([tween(w, "y", w.y, -60, h.P(260)), tween(l, "y", l.y, -40, h.P(260))]);
  await wait(h.P(80));
  await Promise.all([tween(w, "y", w.y, h.ground, h.P(180)), tween(l, "y", l.y, h.ground + 24, h.P(180))]);
  h.audio.playClip("impact", 1.45);
  scream(h, l);
  h.shake(26);
  h.flash(0.4);
  await tween(l, "scaleY", 1, 0.2, h.P(140));
  h.burst(l.x, h.ground - 20, "#ff6b4a", 22, 240);
  await tween(l, "alpha", 1, 0, h.P(180));
}

async function fat11(h, w, l, dir) {
  poseExec(w);
  h.audio.playClip("firewoosh", 0.85);
  h.spawn(bit("iceball", { x: w.x + dir * 40, y: w.y - 140, vx: dir * 640, life: 0.4 }));
  await wait(h.P(180));
  l.tint = "#b8e4ff";
  await tween(l, "tintAmt", 0, 0.9, h.P(140));
  h.spawn(bit("iceblock", { x: l.x, y: l.y - 10, life: 0.55 }));
  await wait(h.P(200));
  w.pose = "punch";
  w.poseT = 0;
  await tween(w, "x", w.x, l.x - dir * 60, h.P(100));
  h.audio.playClip("shatter", 1.3);
  h.audio.playClip("impact", 1);
  scream(h, l);
  h.shake(16);
  l.slices = 4;
  h.burst(l.x, l.y - 90, "#d0f0ff", 30, 300);
  await tween(l, "sliceSpread", 0, 52, h.P(240));
  await tween(l, "alpha", 1, 0, h.P(150));
}

async function fat12(h, w, l) {
  poseExec(w);
  h.audio.playClip("whoosh-air", 0.8);
  h.spawn(bit("gas", { x: w.x, y: w.y - 40, life: 1.2, scale: 1.4 }));
  h.spawn(bit("gas", { x: l.x, y: l.y - 40, life: 1.2, scale: 1.6 }));
  await wait(h.P(200));
  h.spawn(bit("gas", { x: (w.x + l.x) / 2, y: h.ground - 80, life: 1.1, scale: 2.4 }));
  w.hidden = true;
  l.hidden = true;
  await wait(h.P(280));
  scream(h, l);
  h.audio.playClip("slash", 1);
  await wait(h.P(240));
  l.alpha = 0;
  l.hidden = true;
  w.hidden = false;
  w.alpha = 1;
  w.pose = "roundWin";
  await wait(h.P(200));
}

async function fat13(h, w, l, dir) {
  poseExec(w);
  await wait(h.P(160));
  h.audio.playClip("whoosh-air", 1.15);
  w.pose = "kick";
  await Promise.all([tween(w, "y", w.y, -40, h.P(160)), tween(w, "x", w.x, l.x - dir * 40, h.P(160))]);
  h.audio.playClip("impact", 1.2);
  scream(h, l);
  h.shake(16);
  await Promise.all([
    tween(l, "x", l.x, l.x + dir * 520, h.P(380)),
    tween(l, "y", l.y, l.y - 80, h.P(380)),
    tween(l, "rot", 0, dir * 2.8, h.P(380)),
    tween(l, "alpha", 1, 0, h.P(360)),
  ]);
  await tween(w, "y", w.y, h.ground, h.P(140));
}

async function fat14(h, w, l, dir) {
  poseExec(w);
  await wait(h.P(180));
  w.pose = "punch";
  h.audio.playClip("whoosh-air", 1);
  await tween(w, "x", w.x, l.x - dir * 55, h.P(110));
  h.audio.playClip("impact", 1.4);
  scream(h, l);
  h.shake(18);
  h.flash(0.35);
  h.burst(l.x, l.y - 140, "#ffd200", 18, 260);
  await Promise.all([
    tween(l, "y", l.y, -90, h.P(420)),
    tween(l, "rot", 0, dir * 2.2, h.P(420)),
    tween(l, "alpha", 1, 0, h.P(400)),
  ]);
}

async function fat15(h, w, l, dir) {
  const home = w.x;
  poseExec(w);
  await tween(w, "x", home, l.x - dir * 70, h.P(120));
  h.audio.playClip("slash", 1.25);
  h.spawn(bit("slash", { x: l.x, y: l.y - 110, life: 0.3, scale: 1.3 }));
  scream(h, l);
  h.shake(14);
  l.slices = 2;
  await tween(l, "sliceSpread", 0, 70, h.P(320));
  h.burst(l.x, l.y - 90, "#5cff9a", 18, 220);
  await tween(l, "alpha", 1, 0, h.P(180));
  await tween(w, "x", w.x, home, h.P(120));
}

window.runFatality = runFatality;
window.tickFx = tickFx;
window.drawFatalityFx = drawFatalityFx;
