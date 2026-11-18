// NEON VOID's renderer: everything the player sees, drawn on a 2D canvas in
// arena coordinates through the letterbox transform. Nebula clouds and a
// starfield over the grid, pickups, the five enemy kinds as distinct glowing
// shapes, bullets and hostile orbs, shockwaves, sparks and particles,
// floating text, the HUD with its dreadnought bar, and the title, pause and
// game-over screens. It reads the world state and nothing else, and never calls
// Math.random: shake and twinkle are functions of the world's clock, so a
// staged frame is the same frame every time.
import { BOSS, COLORS, COMBO, FIELD, PLAYER, computeView } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** 1234567 -> "1,234,567", spelled by hand so it never depends on a locale. */
function formatScore(value) {
  return String(Math.floor(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A polygon path from points around a centre, rotated. */
function polygon(ctx, x, y, radius, sides, rotation, squash = 1) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** A heart path centred at x, y, about size pixels tall. */
function heartPath(ctx, x, y, size) {
  const s = size / 16;
  ctx.beginPath();
  ctx.moveTo(x, y + 6 * s);
  ctx.bezierCurveTo(x - 10 * s, y - 4 * s, x - 5 * s, y - 10 * s, x, y - 4 * s);
  ctx.bezierCurveTo(x + 5 * s, y - 10 * s, x + 10 * s, y - 4 * s, x, y + 6 * s);
  ctx.closePath();
}

/**
 * A renderer on a canvas. draw(state, screen, best, meta) paints one frame;
 * toLogical(clientX, clientY) maps a mouse position into arena coordinates
 * through the same transform the frame is drawn with.
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let view = computeView(1280, 800);
  let cssWidth = 1280;
  let cssHeight = 800;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = canvas.clientWidth || window.innerWidth;
    cssHeight = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = computeView(cssWidth, cssHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(FIELD.width, Math.max(0, (clientX - rect.left - view.ox) / view.scale)),
      y: Math.min(FIELD.height, Math.max(0, (clientY - rect.top - view.oy) / view.scale)),
    };
  }

  function drawBackground(state) {
    ctx.fillStyle = COLORS.space;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    // The arena floor: a faint perspective-less grid and a soft centre glow.
    const glow = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 80, FIELD.width / 2, FIELD.height / 2, 720);
    glow.addColorStop(0, 'rgba(38, 84, 140, 0.20)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Nebula clouds: vast soft colour drifting almost imperceptibly, seeded
    // with the world, so a seed's sky is always the same sky.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tints = ['124, 58, 237', '13, 148, 190', '219, 39, 119'];
    for (const neb of state.nebulae) {
      const cx = neb.x + Math.sin(state.time * 0.021 * neb.drift + neb.phase) * 26;
      const cy = neb.y + Math.cos(state.time * 0.017 * neb.drift + neb.phase) * 20;
      const pulse = 0.085 + 0.035 * (0.5 + 0.5 * Math.sin(state.time * 0.11 + neb.phase * 2));
      const cloud = ctx.createRadialGradient(cx, cy, 0, cx, cy, neb.r);
      cloud.addColorStop(0, `rgba(${tints[neb.hue]}, ${pulse})`);
      cloud.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cloud;
      ctx.fillRect(cx - neb.r, cy - neb.r, neb.r * 2, neb.r * 2);
    }
    ctx.restore();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    // Grid pulse nodes: the intersections breathe in a slow travelling wave.
    for (let gx = 0; gx <= FIELD.width; gx += 160) {
      for (let gy = 0; gy <= FIELD.height; gy += 160) {
        const pulse = 0.5 + 0.5 * Math.sin(state.time * 1.3 - (gx + gy) * 0.004);
        ctx.globalAlpha = 0.05 + pulse * 0.13;
        ctx.fillStyle = '#7fd8ff';
        ctx.beginPath();
        ctx.arc(gx, gy, 1.6 + pulse * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // The far parallax layer: tiny dim stars behind everything, crawling.
    for (const star of state.farStars) {
      const twinkle = 0.5 + 0.5 * Math.sin(state.time * 0.9 + star.phase);
      ctx.globalAlpha = 0.12 + star.z * twinkle * 0.5;
      ctx.fillStyle = '#9fd0e8';
      ctx.fillRect(star.x, star.y, 1.3, 1.3);
    }
    ctx.globalAlpha = 1;
    // Dust motes: soft motes drifting between the star layers.
    for (const mote of state.dust) {
      ctx.globalAlpha = 0.10 + 0.06 * Math.sin(state.time * 0.7 + mote.phase);
      ctx.fillStyle = '#cfeaff';
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Stars drift slowly toward the player side; twinkle is a clock function.
    for (const star of state.stars) {
      const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.time * 1.7 + star.phase));
      ctx.globalAlpha = 0.25 + star.z * 0.55 * twinkle;
      ctx.fillStyle = '#bfe9ff';
      const r = star.z * 1.7;
      ctx.fillRect(star.x - r / 2, star.y - r / 2, r, r);
      // The nearest stars carry a cross sparkle.
      if (star.z > 0.82) {
        const s = 2.5 + star.z * 3.2 * twinkle;
        ctx.strokeStyle = '#dff6ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(star.x - s, star.y);
        ctx.lineTo(star.x + s, star.y);
        ctx.moveTo(star.x, star.y - s);
        ctx.lineTo(star.x, star.y + s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // The arena rim.
    ctx.strokeStyle = 'rgba(90, 200, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
    // A vignette to seat the arena in the dark around it.
    const vignette = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 330, FIELD.width / 2, FIELD.height / 2, 790);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.restore();
  }

  function drawPickup(pickup, state) {
    const pulse = 1 + Math.sin(state.time * 5 + pickup.age * 2) * 0.12;
    const blink = pickup.life < 2 ? (Math.sin(state.time * 16) > 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = blink;
    if (pickup.kind === 'repair') {
      ctx.shadowColor = COLORS.repair;
      ctx.shadowBlur = 16;
      ctx.fillStyle = COLORS.repair;
      heartPath(ctx, 0, 1, 21);
      ctx.fill();
    } else {
      ctx.shadowColor = COLORS.overdrive;
      ctx.shadowBlur = 16;
      ctx.fillStyle = COLORS.overdrive;
      polygon(ctx, 0, 0, 12, 4, Math.PI / 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#231a00';
      ctx.beginPath();
      ctx.moveTo(2.5, -6.5);
      ctx.lineTo(-3.5, 1.5);
      ctx.lineTo(-0.5, 1.5);
      ctx.lineTo(-2.5, 6.5);
      ctx.lineTo(3.5, -1.5);
      ctx.lineTo(0.5, -1.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(enemy, state) {
    const color = COLORS[enemy.kind];
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.warp > 0) {
      const t = 1 - enemy.warp / 0.6;
      ctx.globalAlpha = 0.25 + t * 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + (1 - t) * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    const flash = enemy.flash > 0.45;
    if (flash) ctx.fillStyle = '#ffffff';
    if (enemy.kind === 'chaser') {
      polygon(ctx, 0, 0, enemy.radius, 4, enemy.angle);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'weaver') {
      ctx.rotate(enemy.angle);
      ctx.beginPath();
      ctx.moveTo(enemy.radius + 3, 0);
      ctx.lineTo(-enemy.radius, -enemy.radius * 0.78);
      ctx.lineTo(-enemy.radius * 0.45, 0);
      ctx.lineTo(-enemy.radius, enemy.radius * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(1, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'dasher') {
      if (enemy.mode === 'aim') {
        // The telegraph: a thin line down the dash path and a flashing body.
        const player = state.player;
        ctx.rotate(enemy.angle);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.hypot(player.x - enemy.x, player.y - enemy.y), 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 15;
        if (Math.sin(state.time * 42) > 0) ctx.fillStyle = '#ffffff';
      } else {
        ctx.rotate(enemy.angle);
      }
      ctx.beginPath();
      ctx.moveTo(enemy.radius + 4, 0);
      ctx.lineTo(-enemy.radius * 0.6, -enemy.radius * 0.85);
      ctx.lineTo(-enemy.radius * 0.25, 0);
      ctx.lineTo(-enemy.radius * 0.6, enemy.radius * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'dreadnought') {
      // The capital ship: counter-rotating hex plates over a dark hull, a
      // dashed targeting ring, gun blisters at the rim, and a core that
      // burns white as the hull fails.
      ctx.shadowBlur = 24;
      polygon(ctx, 0, 0, enemy.radius, 6, enemy.angle);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.setLineDash([10, 9]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 9, -enemy.angle * 0.7, -enemy.angle * 0.7 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#04160a';
      polygon(ctx, 0, 0, enemy.radius * 0.76, 6, -enemy.angle * 1.35);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      polygon(ctx, 0, 0, enemy.radius * 0.76, 6, -enemy.angle * 1.35);
      ctx.stroke();
      for (let i = 0; i < 6; i += 1) {
        const a = enemy.angle + (i / 6) * Math.PI * 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * enemy.radius * 0.58, Math.sin(a) * enemy.radius * 0.58, 4.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const corePulse = 8.6 + Math.sin(state.time * 5.2) * 1.3;
      ctx.fillStyle = flash ? '#ffffff' : '#eaffea';
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, corePulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (enemy.kind === 'orbiter') {
      // orbiter: a spiky gun-skiff inside a broken orbit ring, three
      // satellite blisters circling it the other way, mint on the dark.
      ctx.shadowBlur = 17;
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 7, enemy.angle * 0.8, enemy.angle * 0.8 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      polygon(ctx, 0, 0, enemy.radius, 8, enemy.angle);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#03251c';
      polygon(ctx, 0, 0, enemy.radius * 0.58, 8, -enemy.angle * 1.6);
      ctx.fill();
      for (let i = 0; i < 3; i += 1) {
        const a = -enemy.angle * 1.6 + (i / 3) * Math.PI * 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * enemy.radius * 0.82, Math.sin(a) * enemy.radius * 0.82, 3.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = flash ? '#ffffff' : '#eafffa';
      ctx.beginPath();
      ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // bulwark: a heavy rotating hexagon with a bright core and a hull ring.
      polygon(ctx, 0, 0, enemy.radius, 6, enemy.angle);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2;
      polygon(ctx, 0, 0, enemy.radius * 0.62, 6, -enemy.angle * 1.4);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // A hull sliver for the kinds tough enough to need one.
    if (enemy.hp < enemy.maxHp && (enemy.kind === 'bulwark' || enemy.kind === 'dasher' || enemy.kind === 'dreadnought' || enemy.kind === 'orbiter')) {
      const w = enemy.radius * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11, w, 3.5);
      ctx.fillStyle = color;
      ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11, (w * enemy.hp) / enemy.maxHp, 3.5);
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (!player.alive) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    const invulnerable = player.invulnTimer > 0;
    if (invulnerable) ctx.globalAlpha = 0.6 + 0.3 * Math.sin(state.time * 26);
    // Engine flame, longer with speed.
    const speed = Math.hypot(player.vx, player.vy);
    const flame = 8 + speed * 0.03 + Math.sin(state.time * 44) * 2.5;
    ctx.save();
    ctx.rotate(player.angle);
    ctx.fillStyle = 'rgba(120, 220, 255, 0.8)';
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(-PLAYER.radius - flame, 0);
    ctx.lineTo(-PLAYER.radius + 2, -4.4);
    ctx.lineTo(-PLAYER.radius + 2, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // The ship: a sleek arrow with a bright cockpit.
    ctx.rotate(player.angle);
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 18;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 6, 0);
    ctx.lineTo(-PLAYER.radius, -PLAYER.radius * 0.92);
    ctx.lineTo(-PLAYER.radius * 0.5, 0);
    ctx.lineTo(-PLAYER.radius, PLAYER.radius * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(2.5, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (invulnerable) {
      ctx.save();
      ctx.strokeStyle = 'rgba(140, 240, 255, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 8 + Math.sin(state.time * 9) * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (player.overdriveTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 231, 77, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 4.5, -Math.PI / 2, -Math.PI / 2 + (player.overdriveTimer / 6) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWorld(state) {
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    const shakeX = state.shake * 0.85 * Math.sin(state.time * 131.7);
    const shakeY = state.shake * 0.85 * Math.cos(state.time * 149.3);
    ctx.translate(shakeX, shakeY);
    for (const pickup of state.pickups) drawPickup(pickup, state);
    for (const enemy of state.enemies) drawEnemy(enemy, state);
    drawPlayer(state);
    // Bullets and particles burn additive, over everything that moves.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Hostile orbs: magenta fire with a hot core and a short comet tail.
    for (const orb of state.enemyBullets) {
      const pulse = 1 + Math.sin(state.time * 12 + orb.life * 3) * 0.16;
      ctx.strokeStyle = 'rgba(255, 110, 245, 0.4)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(orb.x - orb.vx * 0.03, orb.y - orb.vy * 0.03);
      ctx.lineTo(orb.x, orb.y);
      ctx.stroke();
      ctx.fillStyle = COLORS.enemyBullet;
      ctx.shadowColor = COLORS.enemyBullet;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, BOSS.bulletRadius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff0fe';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const bullet of state.bullets) {
      if (bullet.kind === 'laser') {
        // The piercing lance: a long violet beam with a white core.
        ctx.strokeStyle = 'rgba(232, 121, 255, 0.5)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.085, bullet.y - bullet.vy * 0.085);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
        ctx.strokeStyle = '#fdf4ff';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.085, bullet.y - bullet.vy * 0.085);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
        ctx.fillStyle = COLORS.laser;
        ctx.shadowColor = COLORS.laser;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (bullet.kind === 'spread') {
        // Spread pellets burn amber, shorter and hotter than the centre bolt.
        ctx.strokeStyle = 'rgba(255, 184, 77, 0.5)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.014, bullet.y - bullet.vy * 0.014);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
        ctx.fillStyle = COLORS.spread;
        ctx.shadowColor = COLORS.spread;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(120, 230, 255, 0.45)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
        ctx.fillStyle = COLORS.bullet;
        ctx.shadowColor = COLORS.bullet;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, PLAYER.bulletRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    for (const particle of state.particles) {
      const t = particle.life / particle.maxLife;
      if (particle.kind === 'flash') {
        // An explosion's first instant: a disc that swells as it fades.
        ctx.globalAlpha = t * 0.8;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (1.6 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.kind === 'ring') {
        // A shockwave: born at a point, gone at full stretch.
        ctx.globalAlpha = t * 0.85;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 1 + 3.5 * t;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (1 - t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.kind === 'spark') {
        ctx.globalAlpha = t;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.size;
        ctx.beginPath();
        ctx.moveTo(particle.x - particle.vx * 0.035, particle.y - particle.vy * 0.035);
        ctx.lineTo(particle.x, particle.y);
        ctx.stroke();
      } else {
        ctx.globalAlpha = t;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Floating score text.
    ctx.textAlign = 'center';
    for (const floater of state.floaters) {
      const t = floater.life / floater.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.font = `700 ${floater.size}px system-ui, "Segoe UI", sans-serif`;
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHud(state) {
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 12px system-ui, "Segoe UI", sans-serif';
    ctx.fillText('S C O R E', 22, 30);
    ctx.fillStyle = COLORS.text;
    ctx.font = '800 30px system-ui, "Segoe UI", sans-serif';
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 12;
    ctx.fillText(formatScore(state.score), 20, 62);
    ctx.shadowBlur = 0;
    // Hull hearts.
    for (let i = 0; i < PLAYER.hearts; i += 1) {
      ctx.save();
      ctx.translate(33 + i * 30, 88);
      if (i < state.hearts) {
        ctx.shadowColor = COLORS.repair;
        ctx.shadowBlur = 9;
        ctx.fillStyle = COLORS.repair;
      } else {
        ctx.fillStyle = 'rgba(255, 93, 143, 0.18)';
      }
      heartPath(ctx, 0, 0, 17);
      ctx.fill();
      ctx.restore();
    }
    // The combo chain and its draining window.
    if (state.combo > 1) {
      const multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.killsPerStep));
      ctx.fillStyle = COLORS.overdrive;
      ctx.font = '800 19px system-ui, "Segoe UI", sans-serif';
      ctx.fillText(`COMBO x${multiplier}`, 20, 122);
      ctx.fillStyle = COLORS.dim;
      ctx.font = '600 12px system-ui, "Segoe UI", sans-serif';
      ctx.fillText(`${state.combo} chain`, 128, 122);
      ctx.fillStyle = 'rgba(255, 231, 77, 0.25)';
      ctx.fillRect(20, 130, 150, 4);
      ctx.fillStyle = COLORS.overdrive;
      ctx.fillRect(20, 130, 150 * Math.max(0, state.comboTimer / COMBO.windowSeconds), 4);
    }
    if (state.player.overdriveTimer > 0) {
      ctx.fillStyle = COLORS.overdrive;
      ctx.font = '700 13px system-ui, "Segoe UI", sans-serif';
      ctx.fillText(`OVERDRIVE ${state.player.overdriveTimer.toFixed(1)}s`, 20, 152);
    }
    // Wave and hostiles, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 12px system-ui, "Segoe UI", sans-serif';
    ctx.fillText('W A V E', FIELD.width - 22, 30);
    ctx.fillStyle = COLORS.text;
    ctx.font = '800 30px system-ui, "Segoe UI", sans-serif';
    ctx.fillText(String(state.wave), FIELD.width - 20, 62);
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 13px system-ui, "Segoe UI", sans-serif';
    const hostiles = state.enemies.length + state.spawnQueue.length;
    ctx.fillText(`HOSTILES ${hostiles}`, FIELD.width - 20, 86);
    // While the dreadnought lives, its hull is the arena's headline.
    const boss = state.enemies.find((enemy) => enemy.kind === 'dreadnought');
    if (boss) {
      const barWidth = 360;
      const barX = FIELD.width / 2 - barWidth / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.dreadnought;
      ctx.font = '700 13px system-ui, "Segoe UI", sans-serif';
      ctx.shadowColor = COLORS.dreadnought;
      ctx.shadowBlur = 8;
      ctx.fillText('☠  D R E A D N O U G H T  ☠', FIELD.width / 2, 34);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(89, 255, 107, 0.18)';
      ctx.fillRect(barX, 42, barWidth, 7);
      ctx.fillStyle = COLORS.dreadnought;
      ctx.fillRect(barX, 42, barWidth * Math.max(0, boss.hp / boss.maxHp), 7);
    }
    // The arsenal, named so a glance shows both guns are live.
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = COLORS.spread;
    ctx.font = '700 12.5px system-ui, "Segoe UI", sans-serif';
    ctx.fillText('ARSENAL — TRI-SPREAD CANNON  ·  PIERCING LASER EVERY 4TH VOLLEY', FIELD.width / 2, FIELD.height - 34);
    ctx.globalAlpha = 1;
    // Controls, a whisper at the bottom.
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.5;
    ctx.font = '500 13px system-ui, "Segoe UI", sans-serif';
    ctx.fillText('WASD move · mouse aim · hold click or Space to fire · P pause · M mute', FIELD.width / 2, FIELD.height - 14);
    ctx.globalAlpha = 1;
    // The wave banner.
    if (state.bannerTimer > 0) {
      const t = state.bannerTimer / 1.7;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle = COLORS.text;
      ctx.font = '800 44px system-ui, "Segoe UI", sans-serif';
      ctx.shadowColor = COLORS.player;
      ctx.shadowBlur = 22;
      ctx.fillText(state.banner, FIELD.width / 2, 150);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(3, 4, 14, ${alpha})`;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  function centred(text, y, font, color, glow = 0, alpha = 1) {
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.textAlign = 'center';
    ctx.globalAlpha = alpha;
    ctx.font = font;
    if (glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, FIELD.width / 2, y);
    ctx.restore();
  }

  /** The six hunter kinds, standing in a row on the title screen as a warning. */
  function drawShowcase(state) {
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    const kinds = [
      ['chaser', 'CHASER'],
      ['weaver', 'WEAVER'],
      ['dasher', 'DASHER'],
      ['bulwark', 'BULWARK'],
      ['orbiter', 'ORBITER'],
      ['dreadnought', 'DREADNOUGHT'],
    ];
    kinds.forEach(([kind, label], i) => {
      const fake = {
        id: 0,
        kind,
        x: 148 + i * 197,
        y: 664,
        vx: 0,
        vy: 0,
        hp: 1,
        maxHp: 1,
        radius: kind === 'dreadnought' ? 36 : kind === 'bulwark' ? 27 : 15,
        age: 0,
        warp: 0,
        flash: 0,
        phase: 0,
        mode: 'stalk',
        modeTimer: 0,
        dashX: 0,
        dashY: 0,
        angle: state.time * 0.6 + i,
        shotTimer: 9,
      };
      drawEnemy(fake, state);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.dim;
      ctx.font = '600 11.5px system-ui, "Segoe UI", sans-serif';
      ctx.fillText(label, fake.x, 664 + fake.radius + 24);
    });
    ctx.restore();
  }

  function drawTitle(state, best) {
    dim(0.52);
    // Two slow rings turning behind the name, like a station waking up.
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.strokeStyle = 'rgba(77, 243, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([26, 18]);
    ctx.lineDashOffset = -state.time * 14;
    ctx.beginPath();
    ctx.arc(FIELD.width / 2, 252, 178, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(178, 107, 255, 0.13)';
    ctx.lineDashOffset = state.time * 9;
    ctx.beginPath();
    ctx.arc(FIELD.width / 2, 252, 216, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    centred('NEON VOID', 268, '900 104px system-ui, "Segoe UI", sans-serif', COLORS.player, 36);
    centred('A R E N A   S U R V I V A L', 312, '600 21px system-ui, "Segoe UI", sans-serif', COLORS.text);
    centred('Six kinds of hunter are coming through the dark. Chain your kills, raise the combo,', 386, '500 17px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    centred('mind the Dreadnought every fifth wave, and do not let them touch your hull.', 410, '500 17px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    centred('YOUR GUNS — TRI-SPREAD CANNON  ·  PIERCING LASER LANCE', 436, '700 14.5px system-ui, "Segoe UI", sans-serif', COLORS.laser);
    centred('WASD / ARROWS — move        MOUSE — aim        HOLD CLICK / SPACE — fire', 462, '700 16px system-ui, "Segoe UI", sans-serif', COLORS.text);
    centred('P — pause        M — sound on/off', 488, '500 14px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    if (best > 0) centred(`BEST  ${formatScore(best)}`, 540, '800 20px system-ui, "Segoe UI", sans-serif', COLORS.overdrive);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    centred('CLICK OR PRESS ENTER TO START', 584, '800 24px system-ui, "Segoe UI", sans-serif', COLORS.playerCore, 16, pulse);
    drawShowcase(state);
  }

  function drawPaused() {
    dim(0.55);
    centred('PAUSED', 380, '900 64px system-ui, "Segoe UI", sans-serif', COLORS.text, 24);
    centred('Press P or click to fly again', 428, '500 17px system-ui, "Segoe UI", sans-serif', COLORS.dim);
  }

  function drawOver(state, best, meta) {
    dim(0.6);
    centred('GAME OVER', 250, '900 84px system-ui, "Segoe UI", sans-serif', COLORS.danger, 32);
    centred(`SCORE  ${formatScore(state.score)}`, 348, '800 44px system-ui, "Segoe UI", sans-serif', COLORS.text, 14);
    centred(`Wave reached ${state.wave} · ${state.kills} kills · best chain ${state.bestCombo}${state.bossesDown > 0 ? ` · ${state.bossesDown} dreadnought${state.bossesDown > 1 ? 's' : ''} downed` : ''}`, 396, '600 18px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    if (meta.newBest && state.score > 0) {
      centred('★ NEW BEST ★', 448, '800 24px system-ui, "Segoe UI", sans-serif', COLORS.overdrive, 16);
    } else if (best > 0) {
      centred(`BEST  ${formatScore(best)}`, 448, '700 19px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    }
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    centred('CLICK OR PRESS ENTER TO FLY AGAIN', 540, '800 23px system-ui, "Segoe UI", sans-serif', COLORS.playerCore, 16, pulse);
  }

  function draw(state, screen, best, meta = {}) {
    drawBackground(state);
    drawWorld(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state);
    // The hurt flash and the last-heart warning live over the world.
    if (state.hurtFlash > 0) {
      const gradient = ctx.createRadialGradient(cssWidth / 2, cssHeight / 2, cssHeight * 0.32, cssWidth / 2, cssHeight / 2, cssHeight * 0.75);
      gradient.addColorStop(0, 'rgba(255, 30, 60, 0)');
      gradient.addColorStop(1, `rgba(255, 30, 60, ${0.42 * state.hurtFlash})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best, meta);
  }

  return { draw, toLogical, resize };
}
