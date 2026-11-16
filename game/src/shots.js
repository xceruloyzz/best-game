// The screenshot scenes behind ?shot=title|play|intense|over (with &seed=N),
// and the autopilot that flies them. Each scene resets the world and plays the
// real rules forward in fixed steps under a pilot, so the frame is what a
// short game really looks like and the same seed always stages the same
// frame. The strong pilot evades and leads its shots; the doomed pilot used
// for the game-over scene barely evades and is caught, as a hurried player is.
import { FIELD, PLAYER, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const STRONG_PILOT = { evadeRadius: 200, fireRange: 640, aimLead: 0.55, pickupGreed: 1 };
const DOOMED_PILOT = { evadeRadius: 55, fireRange: 380, aimLead: 0, pickupGreed: 0.2 };

/** The nearest live, fully warped-in enemy to a point, or null. */
function nearestEnemy(state, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.warp > 0) continue;
    const d = Math.hypot(enemy.x - x, enemy.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = enemy;
    }
  }
  return best;
}

/**
 * One step of pilot control for the world's player: flee anything close,
 * drift to a pickup when hurt or greedy, otherwise hold the middle ground;
 * aim at the nearest enemy with a lead on its velocity; fire in range.
 */
export function autopilotControl(state, pilot = STRONG_PILOT) {
  const player = state.player;
  if (!player.alive) return { x: 0, y: 0, aimX: player.x + 1, aimY: player.y, firing: false };
  let moveX = 0;
  let moveY = 0;
  for (const enemy of state.enemies) {
    if (enemy.warp > 0) continue;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = pilot.evadeRadius + enemy.radius;
    if (d < reach) {
      const weight = (1 - d / reach) * 2.4;
      moveX += (dx / d) * weight;
      moveY += (dy / d) * weight;
    }
  }
  // Hostile orbs are fast and small: sidestep anything on a near course.
  for (const orb of state.enemyBullets) {
    const dx = player.x - orb.x;
    const dy = player.y - orb.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 150) {
      const weight = (1 - d / 150) * 3.2;
      moveX += (dx / d) * weight;
      moveY += (dy / d) * weight;
    }
  }
  // Walls push back before they are reached.
  const margin = 90;
  if (player.x < margin) moveX += (1 - player.x / margin) * 1.6;
  if (player.x > FIELD.width - margin) moveX -= (1 - (FIELD.width - player.x) / margin) * 1.6;
  if (player.y < margin) moveY += (1 - player.y / margin) * 1.6;
  if (player.y > FIELD.height - margin) moveY -= (1 - (FIELD.height - player.y) / margin) * 1.6;
  // A pickup is worth a detour when the hull is hurt; the centre otherwise.
  let target = null;
  if (state.hearts < PLAYER.hearts || pilot.pickupGreed > 0.5) {
    for (const pickup of state.pickups) {
      if (pickup.kind === 'repair' || state.hearts >= PLAYER.hearts) target = pickup;
    }
  }
  if (target !== null && Math.hypot(moveX, moveY) < 0.7) {
    moveX += (target.x - player.x) / 300;
    moveY += (target.y - player.y) / 300;
  } else if (Math.hypot(moveX, moveY) < 0.25) {
    moveX += (FIELD.width / 2 - player.x) / 900;
    moveY += (FIELD.height / 2 - player.y) / 900;
  }
  const foe = nearestEnemy(state, player.x, player.y);
  let aimX = player.x + Math.cos(player.angle) * 120;
  let aimY = player.y + Math.sin(player.angle) * 120;
  let firing = false;
  if (foe !== null) {
    const dist = Math.hypot(foe.x - player.x, foe.y - player.y);
    const lead = (dist / 740) * pilot.aimLead;
    aimX = foe.x + foe.vx * lead;
    aimY = foe.y + foe.vy * lead;
    firing = dist < pilot.fireRange;
  }
  const length = Math.hypot(moveX, moveY);
  if (length > 1) {
    moveX /= length;
    moveY /= length;
  }
  return { x: moveX, y: moveY, aimX, aimY, firing };
}

/** Run a pilot forward until `done(state)` or the step budget runs out. */
function playUntil(world, pilot, done, maxSeconds) {
  const maxSteps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    if (done(world.state)) break;
    world.step(STEP, autopilotControl(world.state, pilot));
  }
}

/**
 * Set `world` to the named scene and say what to draw over it: the screen,
 * the best score to show, and whether that score is a new best. Any name but
 * play, intense or over stages the title.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    world.reset(false);
    // Scan the run for a frame in the thick of a fight: a full field and
    // shots in the air, the way the second wave actually feels.
    playUntil(
      world,
      STRONG_PILOT,
      (state) => (state.time > 14 && state.enemies.length >= 6 && state.bullets.length >= 3) || state.over,
      50,
    );
    return { screen: SCREEN_PLAY, best: 0, newBest: false };
  }
  if (name === 'intense') {
    world.reset(false);
    playUntil(
      world,
      STRONG_PILOT,
      (state) => (state.wave >= 4 && state.enemies.length >= 7) || state.over,
      95,
    );
    // A few more steps until the frame itself is busy: a kill mid-burst.
    playUntil(world, STRONG_PILOT, (state) => state.particles.length >= 14 || state.over, 3);
    return { screen: SCREEN_PLAY, best: 0, newBest: false };
  }
  if (name === 'over') {
    world.reset(false);
    playUntil(world, DOOMED_PILOT, (state) => state.over, 240);
    // A beat past the end: the death burst settles, the red flash fades, and
    // the score panel reads clean over the quiet field.
    playUntil(world, DOOMED_PILOT, () => false, 1.4);
    return { screen: SCREEN_OVER, best: world.state.score, newBest: world.state.score > 0 };
  }
  world.reset(true);
  playUntil(world, STRONG_PILOT, () => world.state.time >= 4.5, 12);
  return { screen: SCREEN_TITLE, best: 0, newBest: false };
}
