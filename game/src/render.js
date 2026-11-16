// NEON VOID's renderer: everything the player sees, drawn on a 2D canvas in
// arena coordinates through the letterbox transform. Background starfield and
// grid, pickups, the four enemy kinds as distinct glowing shapes, bullets,
// particles, floating text, the HUD, and the title, pause and game-over
// screens. It reads the world state and nothing else, and never calls
// Math.random: shake and twinkle are functions of the world's clock, so a
// staged frame is the same frame every time.
import { COLORS, COMBO, FIELD, PLAYER, computeView } from './config.js';

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
    // Stars drift slowly toward the player side; twinkle is a clock function.
    for (const star of state.stars) {
      const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.time * 1.7 + star.phase));
      ctx.globalAlpha = 0.25 + star.z * 0.55 * twinkle;
      ctx.fillStyle = '#bfe9ff';
      const r = star.z * 1.7;
      ctx.fillRect(star.x - r / 2, star.y - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
    // The arena rim.
    ctx.strokeStyle = 'rgba(90, 200, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
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
    if (enemy.hp < enemy.maxHp && (enemy.kind === 'bulwark' || enemy.kind === 'dasher')) {
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
    for (const bullet of state.bullets) {
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
    ctx.shadowBlur = 0;
    for (const particle of state.particles) {
      const t = particle.life / particle.maxLife;
      ctx.globalAlpha = t;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.4 + t * 0.6), 0, Math.PI * 2);
      ctx.fill();
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

  function drawTitle(state, best) {
    dim(0.52);
    centred('NEON VOID', 268, '900 104px system-ui, "Segoe UI", sans-serif', COLORS.player, 36);
    centred('A R E N A   S U R V I V A L', 312, '600 21px system-ui, "Segoe UI", sans-serif', COLORS.text);
    centred('Four kinds of hunter are coming through the dark. Chain your kills, raise the combo,', 386, '500 17px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    centred('and do not let them touch your hull.', 410, '500 17px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    centred('WASD / ARROWS — move        MOUSE — aim        HOLD CLICK / SPACE — fire', 462, '700 16px system-ui, "Segoe UI", sans-serif', COLORS.text);
    centred('P — pause        M — sound on/off', 488, '500 14px system-ui, "Segoe UI", sans-serif', COLORS.dim);
    if (best > 0) centred(`BEST  ${formatScore(best)}`, 540, '800 20px system-ui, "Segoe UI", sans-serif', COLORS.overdrive);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    centred('CLICK OR PRESS ENTER TO START', 606, '800 24px system-ui, "Segoe UI", sans-serif', COLORS.playerCore, 16, pulse);
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
    centred(`Wave reached ${state.wave} · ${state.kills} kills · best chain ${state.bestCombo}`, 396, '600 18px system-ui, "Segoe UI", sans-serif', COLORS.dim);
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
