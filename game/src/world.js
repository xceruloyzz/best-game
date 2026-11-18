// NEON VOID's world: the whole simulation in fixed steps — the player ship
// (tri-spread cannon plus a piercing laser lance), bullets, six kinds of
// enemy (the fifth a dreadnought boss with guns of its own, the sixth an
// orbiter gun-skiff that strafes and shoots), particles, floating score text, pickups, the wave director and
// the combo chain. It knows nothing of the DOM, the canvas
// or sound: main feeds it a plain control object {x, y, aimX, aimY, firing}
// each step and it answers with an event bitmask main turns into sound and
// announcements. All chance flows from the seeded rng, so a seed replays a
// game exactly.
import { BOSS, COLORS, COMBO, ENEMIES, FIELD, ORBITER, PICKUPS, PLAYER, WEAPONS } from './config.js';

export const EV_SHOT = 1;
export const EV_KILL = 2;
export const EV_SPLIT = 4;
export const EV_HURT = 8;
export const EV_OVER = 16;
export const EV_WAVE_START = 32;
export const EV_WAVE_CLEAR = 64;
export const EV_PICKUP = 128;
export const EV_DASH = 256;
export const EV_BOSS_DOWN = 512;

/** How long a spawning enemy is a harmless warp ghost, seconds. */
const WARP_SECONDS = 0.6;
/** Seconds between one enemy warping in and the next. */
const SPAWN_INTERVAL = 0.65;
/** Most enemies alive at once; the rest wait in the wave's queue. */
const MAX_ALIVE = 16;
/** Seconds of calm between a cleared wave and the next one's banner. */
const BREATHER_SECONDS = 2.4;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The wave's shopping list: kinds bought from a points budget that grows per wave. */
function buildWaveQueue(rng, wave) {
  // Every fifth wave is a dreadnought wave: the capital ship warps in first
  // and a thin escort screen is bought with what budget remains.
  if (wave % BOSS.everyWaves === 0) {
    let budget = 6 + wave * 4 - ENEMIES.dreadnought.cost;
    const escorts = ['chaser', 'chaser', 'weaver', 'orbiter'];
    const queue = ['dreadnought'];
    while (budget >= ENEMIES.chaser.cost) {
      const affordable = escorts.filter((kind) => ENEMIES[kind].cost <= budget);
      const kind = rng.pick(affordable);
      queue.push(kind);
      budget -= ENEMIES[kind].cost;
    }
    return queue;
  }
  let budget = 6 + wave * 4;
  const kinds = ['chaser'];
  if (wave >= 2) kinds.push('weaver', 'weaver', 'orbiter');
  if (wave >= 3) kinds.push('dasher', 'orbiter');
  if (wave >= 4) kinds.push('bulwark');
  kinds.push('chaser', 'chaser');
  const queue = [];
  while (budget >= ENEMIES.chaser.cost) {
    const affordable = kinds.filter((kind) => ENEMIES[kind].cost <= budget);
    const kind = rng.pick(affordable);
    queue.push(kind);
    budget -= ENEMIES[kind].cost;
  }
  // Shuffle so the expensive kinds are not all first or all last.
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

/** A spawn point on an arena edge, kept away from the player so nothing lands on them. */
function spawnPoint(rng, player) {
  for (let tries = 0; tries < 12; tries += 1) {
    const edge = rng.int(0, 3);
    const point =
      edge === 0
        ? { x: rng.range(30, FIELD.width - 30), y: 30 }
        : edge === 1
          ? { x: rng.range(30, FIELD.width - 30), y: FIELD.height - 30 }
          : edge === 2
            ? { x: 30, y: rng.range(30, FIELD.height - 30) }
            : { x: FIELD.width - 30, y: rng.range(30, FIELD.height - 30) };
    if (Math.hypot(point.x - player.x, point.y - player.y) > 280) return point;
  }
  return { x: 40, y: 40 };
}

/**
 * A world and its state. reset(demo) starts a fresh run (in demo the ship
 * cannot be hurt and kills score nothing: the title screen's attract mode);
 * step(dt, control) advances one fixed step and returns the EV_* events that
 * happened in it.
 */
export function createWorld(rng) {
  const state = {
    time: 0,
    demo: false,
    over: false,
    wave: 0,
    phase: 'combat',
    breatherTimer: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    kills: 0,
    hearts: PLAYER.hearts,
    shake: 0,
    hurtFlash: 0,
    banner: '',
    bannerTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    floaters: [],
    pickups: [],
    stars: [],
    farStars: [],
    dust: [],
    nebulae: [],
    nextEnemyId: 1,
    nextBulletId: 1,
    bossesDown: 0,
  };

  function burst(x, y, color, count, speed, size = 3) {
    for (let i = 0; i < count; i += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const v = rng.range(speed * 0.25, speed);
      const life = rng.range(0.3, 0.8);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        maxLife: life,
        size: rng.range(size * 0.5, size * 1.4),
        color,
        drag: 2.6,
        kind: 'dot',
        grow: 0,
      });
    }
    // A third of the burst leaves as sparks: fast streaks that outrun the dots.
    const sparks = Math.floor(count / 3);
    for (let i = 0; i < sparks; i += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const v = rng.range(speed * 0.9, speed * 1.7);
      const life = rng.range(0.18, 0.42);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        maxLife: life,
        size: rng.range(1.2, 2.2),
        color,
        drag: 1.4,
        kind: 'spark',
        grow: 0,
      });
    }
  }

  /** An expanding shockwave ring, the visible punch of a heavy death. */
  function ring(x, y, color, maxRadius) {
    state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.55,
      maxLife: 0.55,
      size: maxRadius,
      color,
      drag: 0,
      kind: 'ring',
      grow: 0,
    });
  }

  /** A white-hot flash disc: the first instant of an explosion, before the sparks. */
  function flash(x, y, color, size) {
    state.particles.push({
      x, y, vx: 0, vy: 0, life: 0.16, maxLife: 0.16, size, color, drag: 0, kind: 'flash', grow: 0,
    });
  }

  function floater(x, y, text, color, size = 17) {
    state.floaters.push({ x, y, vy: -46, life: 1.1, maxLife: 1.1, text, color, size });
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildWaveQueue(rng, wave);
    state.spawnTimer = 0.4;
    state.phase = 'combat';
    state.banner = wave % BOSS.everyWaves === 0 ? '⚠ DREADNOUGHT ⚠' : `WAVE ${wave}`;
    state.bannerTimer = 1.7;
  }

  function reset(demo = false) {
    state.time = 0;
    state.demo = demo;
    state.over = false;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.bestCombo = 0;
    state.kills = 0;
    state.hearts = PLAYER.hearts;
    state.shake = 0;
    state.hurtFlash = 0;
    state.bullets = [];
    state.enemyBullets = [];
    state.enemies = [];
    state.particles = [];
    state.floaters = [];
    state.pickups = [];
    state.bossesDown = 0;
    state.player = {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      fireTimer: 0,
      shotCounter: 0,
      invulnTimer: 0,
      overdriveTimer: 0,
      alive: true,
    };
    state.stars = [];
    for (let i = 0; i < 130; i += 1) {
      state.stars.push({
        x: rng.range(0, FIELD.width),
        y: rng.range(0, FIELD.height),
        z: rng.range(0.25, 1),
        phase: rng.range(0, Math.PI * 2),
      });
    }
    state.farStars = [];
    for (let i = 0; i < 90; i += 1) {
      state.farStars.push({
        x: rng.range(0, FIELD.width),
        y: rng.range(0, FIELD.height),
        z: rng.range(0.06, 0.3),
        phase: rng.range(0, Math.PI * 2),
      });
    }
    state.dust = [];
    for (let i = 0; i < 46; i += 1) {
      state.dust.push({
        x: rng.range(0, FIELD.width),
        y: rng.range(0, FIELD.height),
        drift: rng.range(2, 7),
        phase: rng.range(0, Math.PI * 2),
      });
    }
    // The nebula layer: a handful of vast soft clouds seeded with the world,
    // so every seed's sky is its own and a replay shows the same one.
    state.nebulae = [];
    for (let i = 0; i < 5; i += 1) {
      state.nebulae.push({
        x: rng.range(0, FIELD.width),
        y: rng.range(0, FIELD.height),
        r: rng.range(280, 540),
        hue: i % 3,
        phase: rng.range(0, Math.PI * 2),
        drift: rng.range(1.5, 4),
      });
    }
    startWave(1);
  }

  function spawnEnemy(kind) {
    const spec = ENEMIES[kind];
    const point = spawnPoint(rng, state.player);
    const hpBonus = kind === 'chaser' || kind === 'weaver' ? Math.floor((state.wave - 1) / 5) : 0;
    const hp = kind === 'dreadnought' ? BOSS.hpBase + state.wave * BOSS.hpPerWave : spec.hp + hpBonus;
    state.enemies.push({
      id: state.nextEnemyId++,
      kind,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      radius: spec.radius,
      age: 0,
      warp: WARP_SECONDS,
      flash: 0,
      phase: rng.range(0, Math.PI * 2),
      mode: 'stalk',
      modeTimer: 0,
      dashX: 0,
      dashY: 0,
      angle: 0,
      radialTimer: BOSS.radialEvery * 0.6,
      aimedTimer: BOSS.aimedEvery,
      escortTimer: BOSS.spawnEvery,
      shotTimer: rng.range(0.9, ORBITER.shootEvery),
    });
  }

  function killEnemy(enemy, events) {
    const spec = ENEMIES[enemy.kind];
    if (enemy.kind === 'dreadnought') {
      flash(enemy.x, enemy.y, '#ffffff', 64);
      // The capital ship dies in stages of light: layered bursts, twin
      // shockwaves and a shake the whole arena feels.
      burst(enemy.x, enemy.y, COLORS.dreadnought, 46, 380, 4.5);
      burst(enemy.x, enemy.y, COLORS.enemyBullet, 22, 300, 3.5);
      burst(enemy.x, enemy.y, '#ffffff', 14, 220, 3);
      ring(enemy.x, enemy.y, COLORS.dreadnought, 190);
      ring(enemy.x, enemy.y, COLORS.enemyBullet, 120);
      state.shake = 22;
      events |= EV_BOSS_DOWN;
      if (!state.demo) {
        state.bossesDown += 1;
        // A capital ship always leaves both cells in its wreck.
        state.pickups.push({ kind: 'repair', x: enemy.x - 26, y: enemy.y, vx: -36, vy: 12, age: 0, life: PICKUPS.lifeSeconds });
        state.pickups.push({ kind: 'overdrive', x: enemy.x + 26, y: enemy.y, vx: 36, vy: -12, age: 0, life: PICKUPS.lifeSeconds });
      }
    } else {
      flash(enemy.x, enemy.y, COLORS[enemy.kind], enemy.radius * 1.15);
      burst(enemy.x, enemy.y, COLORS[enemy.kind], enemy.kind === 'bulwark' ? 30 : 16, 300, enemy.kind === 'bulwark' ? 4 : 3);
      if (enemy.kind === 'bulwark') ring(enemy.x, enemy.y, COLORS.bulwark, 95);
      state.shake = Math.min(16, state.shake + (enemy.kind === 'bulwark' ? 7 : 2.5));
    }
    if (enemy.kind === 'bulwark') {
      events |= EV_SPLIT;
      for (let i = 0; i < 2; i += 1) {
        spawnEnemyNear('chaser', enemy.x + (i === 0 ? -22 : 22), enemy.y + (i === 0 ? -10 : 14));
      }
    } else if (enemy.kind !== 'dreadnought') {
      events |= EV_KILL;
    }
    if (state.demo) return events;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.windowSeconds;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.killsPerStep));
    const points = spec.score * multiplier;
    state.score += points;
    floater(enemy.x, enemy.y - 10, multiplier > 1 ? `+${points} x${multiplier}` : `+${points}`, COLORS[enemy.kind]);
    if (enemy.kind !== 'dreadnought' && rng.chance(PICKUPS.dropChance)) {
      const kind = state.hearts < PLAYER.hearts && rng.chance(0.45) ? 'repair' : 'overdrive';
      state.pickups.push({ kind, x: enemy.x, y: enemy.y, vx: rng.range(-30, 30), vy: rng.range(-30, 30), age: 0, life: PICKUPS.lifeSeconds });
    }
    return events;
  }

  function spawnEnemyNear(kind, x, y) {
    const spec = ENEMIES[kind];
    state.enemies.push({
      id: state.nextEnemyId++,
      kind,
      x: clamp(x, 24, FIELD.width - 24),
      y: clamp(y, 24, FIELD.height - 24),
      vx: 0,
      vy: 0,
      hp: spec.hp,
      maxHp: spec.hp,
      radius: spec.radius,
      age: 0,
      warp: 0.3,
      flash: 0,
      phase: rng.range(0, Math.PI * 2),
      mode: 'stalk',
      modeTimer: 0,
      dashX: 0,
      dashY: 0,
      angle: 0,
      radialTimer: 0,
      aimedTimer: 0,
      escortTimer: 0,
      shotTimer: 1.2,
    });
  }

  function damagePlayer(x, y, color) {
    let events = EV_HURT;
    burst(x, y, color, 16, 300);
    if (state.demo) return events;
    state.hearts -= 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = 15;
    state.hurtFlash = 1;
    state.player.invulnTimer = PLAYER.invulnerableSeconds;
    burst(state.player.x, state.player.y, COLORS.player, 22, 340, 3.5);
    floater(state.player.x, state.player.y - 26, 'HULL BREACH', COLORS.danger, 19);
    if (state.hearts <= 0) {
      state.player.alive = false;
      state.over = true;
      state.shake = 24;
      burst(state.player.x, state.player.y, COLORS.player, 42, 420, 4);
      burst(state.player.x, state.player.y, COLORS.bullet, 24, 260, 3);
      events |= EV_OVER;
    }
    return events;
  }

  function hurtPlayer(enemy) {
    return damagePlayer(enemy.x, enemy.y, COLORS[enemy.kind]);
  }

  function stepPlayer(dt, control) {
    const player = state.player;
    if (!player.alive) return 0;
    let events = 0;
    const length = Math.hypot(control.x, control.y);
    const nx = length > 0 ? control.x / length : 0;
    const ny = length > 0 ? control.y / length : 0;
    player.vx += nx * PLAYER.accel * dt;
    player.vy += ny * PLAYER.accel * dt;
    const damp = Math.exp(-6.2 * dt);
    player.vx *= damp;
    player.vy *= damp;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.maxSpeed) {
      player.vx = (player.vx / speed) * PLAYER.maxSpeed;
      player.vy = (player.vy / speed) * PLAYER.maxSpeed;
    }
    player.x = clamp(player.x + player.vx * dt, PLAYER.radius, FIELD.width - PLAYER.radius);
    player.y = clamp(player.y + player.vy * dt, PLAYER.radius, FIELD.height - PLAYER.radius);
    if (control.aimX !== player.x || control.aimY !== player.y) {
      player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
    }
    player.fireTimer -= dt;
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
    player.overdriveTimer = Math.max(0, player.overdriveTimer - dt);
    // Engine trail: a soft cyan exhaust while the ship moves.
    if (speed > 40 && state.particles.length < 900) {
      state.particles.push({
        x: player.x - Math.cos(player.angle) * 12,
        y: player.y - Math.sin(player.angle) * 12,
        vx: -player.vx * 0.25 + rng.range(-14, 14),
        vy: -player.vy * 0.25 + rng.range(-14, 14),
        life: 0.32,
        maxLife: 0.32,
        size: rng.range(1.6, 3.2),
        color: COLORS.player,
        drag: 1.2,
        kind: 'dot',
        grow: 0,
      });
    }
    if (control.firing && player.fireTimer <= 0) {
      player.fireTimer = player.overdriveTimer > 0 ? PLAYER.overdriveInterval : PLAYER.fireInterval;
      player.shotCounter += 1;
      const noseX = player.x + Math.cos(player.angle) * (PLAYER.radius + 6);
      const noseY = player.y + Math.sin(player.angle) * (PLAYER.radius + 6);
      // The tri-spread cannon: a centre bolt and two angled pellets, so a
      // volley paints a fan of cyan and amber across the arena.
      for (const [offset, kind] of [[-WEAPONS.spreadAngle, 'spread'], [0, 'blaster'], [WEAPONS.spreadAngle, 'spread']]) {
        const a = player.angle + offset;
        const speed = kind === 'spread' ? WEAPONS.spreadSpeed : PLAYER.bulletSpeed;
        state.bullets.push({
          id: state.nextBulletId++,
          kind,
          pierce: 0,
          hitIds: null,
          x: noseX,
          y: noseY,
          vx: Math.cos(a) * speed + player.vx * 0.25,
          vy: Math.sin(a) * speed + player.vy * 0.25,
          life: PLAYER.bulletLife,
        });
      }
      // Every fourth volley the lance fires too: one long violet beam that
      // pierces a line of hulls instead of dying on the first.
      if (player.shotCounter % WEAPONS.laserEvery === 0) {
        state.bullets.push({
          id: state.nextBulletId++,
          kind: 'laser',
          pierce: WEAPONS.laserPierce,
          hitIds: new Set(),
          x: noseX,
          y: noseY,
          vx: Math.cos(player.angle) * WEAPONS.laserSpeed + player.vx * 0.25,
          vy: Math.sin(player.angle) * WEAPONS.laserSpeed + player.vy * 0.25,
          life: WEAPONS.laserLife,
        });
      }
      // Muzzle flash: two short-lived sparks at the nose.
      for (let i = 0; i < 2; i += 1) {
        state.particles.push({
          x: noseX, y: noseY,
          vx: Math.cos(player.angle) * 120 + rng.range(-40, 40),
          vy: Math.sin(player.angle) * 120 + rng.range(-40, 40),
          life: 0.12, maxLife: 0.12, size: rng.range(1.4, 2.6),
          color: COLORS.bullet, drag: 2, kind: 'dot', grow: 0,
        });
      }
      state.shake = Math.min(16, state.shake + 0.35);
      events |= EV_SHOT;
    }
    return events;
  }

  /** One hostile orb from a dreadnought gun, on a straight fixed course. */
  function fireEnemyBullet(x, y, angle, speed = BOSS.bulletSpeed) {
    state.enemyBullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: BOSS.bulletLife,
    });
  }

  function stepEnemies(dt) {
    let events = 0;
    const player = state.player;
    const speedScale = 1 + (state.wave - 1) * 0.03;
    for (const enemy of state.enemies) {
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt * 6);
      if (enemy.warp > 0) {
        enemy.warp -= dt;
        continue;
      }
      const spec = ENEMIES[enemy.kind];
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      if (enemy.kind === 'chaser') {
        const wobble = Math.sin(enemy.age * 3.1 + enemy.phase) * 0.38;
        enemy.vx = (ux - uy * wobble) * spec.speed * speedScale;
        enemy.vy = (uy + ux * wobble) * spec.speed * speedScale;
        enemy.angle = Math.atan2(enemy.vy, enemy.vx);
      } else if (enemy.kind === 'weaver') {
        const sway = Math.sin(enemy.age * 4.4 + enemy.phase);
        enemy.vx = (ux - uy * sway * 0.95) * spec.speed * speedScale;
        enemy.vy = (uy + ux * sway * 0.95) * spec.speed * speedScale;
        enemy.angle = Math.atan2(enemy.vy, enemy.vx);
      } else if (enemy.kind === 'dasher') {
        enemy.modeTimer -= dt;
        if (enemy.mode === 'stalk') {
          enemy.vx = ux * spec.speed * speedScale;
          enemy.vy = uy * spec.speed * speedScale;
          enemy.angle = Math.atan2(uy, ux);
          if (dist < 285 && player.alive) {
            enemy.mode = 'aim';
            enemy.modeTimer = 0.55;
          }
        } else if (enemy.mode === 'aim') {
          enemy.vx *= 0.86;
          enemy.vy *= 0.86;
          enemy.angle = Math.atan2(uy, ux);
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'dash';
            enemy.modeTimer = 0.36;
            enemy.dashX = ux;
            enemy.dashY = uy;
            events |= EV_DASH;
          }
        } else if (enemy.mode === 'dash') {
          enemy.vx = enemy.dashX * 640;
          enemy.vy = enemy.dashY * 640;
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'rest';
            enemy.modeTimer = 0.95;
          }
        } else {
          enemy.vx *= 0.9;
          enemy.vy *= 0.9;
          if (enemy.modeTimer <= 0) enemy.mode = 'stalk';
        }
      } else if (enemy.kind === 'bulwark') {
        enemy.vx = ux * spec.speed * speedScale;
        enemy.vy = uy * spec.speed * speedScale;
        enemy.angle += dt * 0.5;
      } else if (enemy.kind === 'orbiter') {
        // orbiter: a gun-skiff that holds orbit distance, strafes sideways
        // around the player (direction fixed by its seeded phase) and fires
        // a single aimed orb on a steady clock.
        const orbitDir = enemy.phase > Math.PI ? 1 : -1;
        const radialPush = clamp((dist - ORBITER.orbitDistance) / 120, -1, 1);
        enemy.vx = (-uy * orbitDir + ux * radialPush * 0.8) * spec.speed * speedScale;
        enemy.vy = (ux * orbitDir + uy * radialPush * 0.8) * spec.speed * speedScale;
        enemy.angle += dt * 2.4;
        if (player.alive) {
          enemy.shotTimer -= dt;
          if (enemy.shotTimer <= 0) {
            enemy.shotTimer = ORBITER.shootEvery;
            fireEnemyBullet(enemy.x, enemy.y, Math.atan2(dy, dx), ORBITER.bulletSpeed);
          }
        }
      } else {
        // dreadnought: it does not chase. It takes a slow orbit of the arena
        // centre, turns its guns on the player, and keeps the sky busy.
        const anchorX = FIELD.width / 2 + Math.cos(state.time * 0.11 + enemy.phase) * 300;
        const anchorY = FIELD.height / 2 + Math.sin(state.time * 0.083 + enemy.phase) * 165;
        const adx = anchorX - enemy.x;
        const ady = anchorY - enemy.y;
        const adist = Math.hypot(adx, ady) || 1;
        const thrust = Math.min(1, adist / 60);
        enemy.vx = (adx / adist) * spec.speed * thrust;
        enemy.vy = (ady / adist) * spec.speed * thrust;
        enemy.angle += dt * 0.35;
        if (player.alive) {
          enemy.radialTimer -= dt;
          if (enemy.radialTimer <= 0) {
            enemy.radialTimer = BOSS.radialEvery;
            const offset = enemy.age * 0.7;
            for (let i = 0; i < BOSS.radialCount; i += 1) {
              const a = offset + (i / BOSS.radialCount) * Math.PI * 2;
              fireEnemyBullet(enemy.x, enemy.y, a);
            }
          }
          enemy.aimedTimer -= dt;
          if (enemy.aimedTimer <= 0) {
            enemy.aimedTimer = BOSS.aimedEvery;
            const base = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            for (const spread of [-0.17, 0, 0.17]) fireEnemyBullet(enemy.x, enemy.y, base + spread);
          }
          enemy.escortTimer -= dt;
          if (enemy.escortTimer <= 0) {
            enemy.escortTimer = BOSS.spawnEvery;
            const escorts = state.enemies.filter((other) => other.kind !== 'dreadnought').length;
            if (escorts < BOSS.maxEscorts) {
              spawnEnemyNear(rng.chance(0.4) ? 'weaver' : 'chaser', enemy.x + rng.range(-70, 70), enemy.y + rng.range(-70, 70));
            }
          }
        }
      }
      enemy.x = clamp(enemy.x + enemy.vx * dt, enemy.radius, FIELD.width - enemy.radius);
      enemy.y = clamp(enemy.y + enemy.vy * dt, enemy.radius, FIELD.height - enemy.radius);
    }
    // A gentle separation so packs read as individuals, not one blob.
    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.radius + b.radius + 2;
        if (dist > 0.01 && dist < min) {
          const push = ((min - dist) / dist) * 0.5;
          // The dreadnought does not get shoved: all the give is the other's.
          if (a.kind !== 'dreadnought') {
            a.x -= dx * push * 0.5;
            a.y -= dy * push * 0.5;
          }
          if (b.kind !== 'dreadnought') {
            b.x += dx * push * 0.5;
            b.y += dy * push * 0.5;
          }
        }
      }
    }
    return events;
  }

  function stepCollisions() {
    let events = 0;
    const player = state.player;
    // Bullets against enemies.
    for (const bullet of state.bullets) {
      if (bullet.life <= 0) continue;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || enemy.warp > 0) continue;
        if (bullet.kind === 'laser' && bullet.hitIds.has(enemy.id)) continue;
        if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < enemy.radius + PLAYER.bulletRadius) {
          if (bullet.kind === 'laser') {
            bullet.hitIds.add(enemy.id);
            bullet.pierce -= 1;
            if (bullet.pierce < 0) bullet.life = 0;
          } else {
            bullet.life = 0;
          }
          enemy.hp -= 1;
          enemy.flash = 1;
          if (enemy.kind !== 'dreadnought') {
            enemy.x += bullet.vx * 0.006;
            enemy.y += bullet.vy * 0.006;
          }
          burst(bullet.x, bullet.y, COLORS.bullet, 3, 170, 2);
          break;
        }
      }
    }
    // Enemies against the player.
    if (player.alive) {
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || enemy.warp > 0) continue;
        if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + PLAYER.radius - 2) {
          // Everything that touches the hull dies on it — except the
          // dreadnought, which is far too much ship to die on a ship.
          if (enemy.kind !== 'dreadnought') enemy.hp = 0;
          if (state.demo || player.invulnTimer <= 0) {
            events |= hurtPlayer(enemy);
            if (!player.alive) break;
          } else {
            burst(enemy.x, enemy.y, COLORS[enemy.kind], 12, 260);
          }
        }
      }
    }
    // Hostile orbs against the player.
    if (player.alive) {
      for (const orb of state.enemyBullets) {
        if (orb.life <= 0) continue;
        if (Math.hypot(orb.x - player.x, orb.y - player.y) < BOSS.bulletRadius + PLAYER.radius - 2) {
          orb.life = 0;
          if (!state.demo && player.invulnTimer <= 0) {
            events |= damagePlayer(orb.x, orb.y, COLORS.enemyBullet);
            if (!player.alive) break;
          } else {
            burst(orb.x, orb.y, COLORS.enemyBullet, 8, 200, 2.5);
          }
        }
      }
    }
    // Pickups against the player: a magnet pull, then the catch.
    for (const pickup of state.pickups) {
      if (pickup.life <= 0 || !player.alive) continue;
      const d = distance(pickup, player);
      if (d < PICKUPS.magnetRadius) {
        pickup.vx += ((player.x - pickup.x) / (d || 1)) * PICKUPS.magnetSpeed * 4 * (1 / 60);
        pickup.vy += ((player.y - pickup.y) / (d || 1)) * PICKUPS.magnetSpeed * 4 * (1 / 60);
      }
      if (d < PLAYER.radius + 13) {
        pickup.life = 0;
        events |= EV_PICKUP;
        if (pickup.kind === 'repair') {
          if (state.hearts < PLAYER.hearts) {
            state.hearts += 1;
            floater(player.x, player.y - 26, '+1 HULL', COLORS.repair, 18);
          } else {
            state.score += 250;
            floater(player.x, player.y - 26, '+250', COLORS.repair, 18);
          }
        } else {
          player.overdriveTimer = PICKUPS.overdriveSeconds;
          floater(player.x, player.y - 26, 'OVERDRIVE', COLORS.overdrive, 18);
        }
        burst(pickup.x, pickup.y, COLORS[pickup.kind], 10, 200, 2.5);
      }
    }
    // Reap the dead.
    const dead = state.enemies.filter((enemy) => enemy.hp <= 0);
    for (const enemy of dead) events |= killEnemy(enemy, 0);
    state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
    return events;
  }

  function step(dt, control) {
    let events = 0;
    state.time += dt;
    state.shake *= Math.exp(-5.2 * dt);
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 1.7);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    for (const star of state.stars) {
      star.x -= star.z * 5 * dt;
      if (star.x < -2) star.x = FIELD.width + 2;
    }
    // The far parallax layer crawls; the dust motes drift on their own seeded
    // headings, so the sky has three depths moving at three speeds.
    for (const star of state.farStars) {
      star.x -= star.z * 5 * dt;
      if (star.x < -2) star.x = FIELD.width + 2;
    }
    for (const mote of state.dust) {
      mote.x -= mote.drift * dt;
      mote.y += Math.sin(state.time * 0.3 + mote.phase) * 2.2 * dt;
      if (mote.x < -2) mote.x = FIELD.width + 2;
    }
    if (!state.over) {
      // Wave flow: spawn from the queue, or breathe between waves.
      if (state.phase === 'combat') {
        if (state.spawnQueue.length > 0) {
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0 && state.enemies.length < MAX_ALIVE) {
            state.spawnTimer = SPAWN_INTERVAL;
            spawnEnemy(state.spawnQueue.shift());
          }
        } else if (state.enemies.length === 0 && state.player.alive) {
          const bonus = 100 * state.wave;
          if (!state.demo) {
            state.score += bonus;
            floater(FIELD.width / 2, FIELD.height / 2 - 60, `WAVE BONUS +${bonus}`, COLORS.text, 20);
          }
          state.banner = `WAVE ${state.wave} CLEAR`;
          state.bannerTimer = 1.7;
          state.phase = 'breather';
          state.breatherTimer = BREATHER_SECONDS;
          events |= EV_WAVE_CLEAR;
        }
      } else {
        state.breatherTimer -= dt;
        if (state.breatherTimer <= 0) {
          startWave(state.wave + 1);
          events |= EV_WAVE_START;
        }
      }
      events |= stepPlayer(dt, control);
      events |= stepEnemies(dt);
      events |= stepCollisions();
    }
    // Bullets, particles, floaters and pickups always settle, even after the
    // run ends, so the game-over backdrop comes to rest instead of freezing.
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) bullet.life = 0;
    }
    state.bullets = state.bullets.filter((bullet) => bullet.life > 0);
    for (const orb of state.enemyBullets) {
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      if (orb.x < -20 || orb.x > FIELD.width + 20 || orb.y < -20 || orb.y > FIELD.height + 20) orb.life = 0;
    }
    state.enemyBullets = state.enemyBullets.filter((orb) => orb.life > 0);
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.exp(-particle.drag * dt);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    for (const floater of state.floaters) {
      floater.y += floater.vy * dt;
      floater.life -= dt;
    }
    state.floaters = state.floaters.filter((floater) => floater.life > 0);
    for (const pickup of state.pickups) {
      pickup.age += dt;
      pickup.life -= dt;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      pickup.vx *= Math.exp(-2 * dt);
      pickup.vy *= Math.exp(-2 * dt);
    }
    state.pickups = state.pickups.filter((pickup) => pickup.life > 0);
    return events;
  }

  reset(false);
  return { state, reset, step };
}
