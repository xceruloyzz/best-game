// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), the
// renderer paints what is there, and world events become sound. The game
// moves between four screens — title (with its attract-mode demo), play,
// paused and game over — and the title is where every run starts and ends.
//
// ?seed=N fixes the spawn pattern. ?shot=title|play|intense|over (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EV_BOSS_DOWN,
  EV_DASH,
  EV_HURT,
  EV_KILL,
  EV_OVER,
  EV_PICKUP,
  EV_SHOT,
  EV_SPLIT,
  EV_WAVE_CLEAR,
  EV_WAVE_START,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { autopilotControl, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
const IDLE = { x: 0, y: 0, aimX: 0, aimY: 0, firing: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { newBest: scene.newBest });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toLogical);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let newBest = false;
  let accumulator = 0;
  let last = performance.now();

  world.reset(true);

  // Screen readers (and anyone watching the page's text) hear the big beats.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset(false);
    newBest = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.play('wave');
    announce('Playing. Three hull hearts. Survive the waves.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      newBest = true;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EV_SHOT) audio.play('shoot');
    if (events & EV_KILL) audio.play('kill');
    if (events & EV_SPLIT) audio.play('split');
    if (events & EV_BOSS_DOWN) {
      audio.play('bossdown');
      announce('Dreadnought destroyed.');
    }
    if (events & EV_DASH) audio.play('dash');
    if (events & EV_PICKUP) audio.play('pickup');
    if (events & EV_WAVE_START) audio.play('wave');
    if (events & EV_WAVE_CLEAR) audio.play('clear');
    if (events & EV_HURT) {
      audio.play('hurt');
      if (world.state.hearts > 0) announce(world.state.hearts === 1 ? 'Hit. One heart left.' : `Hit. ${world.state.hearts} hearts left.`);
    }
    if (events & EV_OVER) {
      audio.play('over');
      endGame();
    }
  }

  function control() {
    const axes = input.axes();
    const aim = input.aim();
    const player = world.state.player;
    const aimX = aim.seen ? aim.x : player.x + Math.cos(player.angle) * 140;
    const aimY = aim.seen ? aim.y : player.y + Math.sin(player.angle) * 140;
    return { x: axes.x, y: axes.y, aimX, aimY, firing: input.firing() };
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, autopilotControl(world.state));
      return;
    }
    if (screen === SCREEN_OVER) {
      world.step(STEP, IDLE);
      return;
    }
    const events = world.step(STEP, control());
    playEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen !== SCREEN_PAUSED) {
      while (accumulator >= STEP && screen !== SCREEN_PAUSED) {
        step();
        accumulator -= STEP;
        if (screen === SCREEN_OVER && accumulator > STEP * 4) accumulator = STEP * 4;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, { newBest });
  }

  // Leaving the tab pauses a running game rather than letting it die unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Void. Click or press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
