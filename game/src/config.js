// NEON VOID's tuning: the arena, the palette and every number the rest of the
// game is built from, in one place so the feel can be adjusted in one pass.

/** The arena in logical pixels; the renderer scales it to the window. */
export const FIELD = { width: 1280, height: 800 };

/** The fixed step the world advances in, seconds: 60 steps a second. */
export const STEP = 1 / 60;

/** localStorage key for the best score. */
export const BEST_KEY = 'neon-void-best';

/** The palette: one neon family on deep space, a colour per thing that moves. */
export const COLORS = {
  space: '#05060f',
  grid: 'rgba(64, 120, 180, 0.13)',
  gridGlow: 'rgba(64, 160, 255, 0.05)',
  player: '#4df3ff',
  playerCore: '#e8fdff',
  bullet: '#aef7ff',
  chaser: '#ff4d6d',
  weaver: '#b26bff',
  dasher: '#ffd24d',
  bulwark: '#ff8a3d',
  repair: '#ff5d8f',
  overdrive: '#ffe74d',
  text: '#d9f6ff',
  dim: '#7fa8c9',
  danger: '#ff3355',
};

/** The player ship: size, handling and guns. */
export const PLAYER = {
  radius: 13,
  accel: 2400,
  maxSpeed: 345,
  hearts: 3,
  fireInterval: 0.145,
  overdriveInterval: 0.062,
  bulletSpeed: 740,
  bulletLife: 0.95,
  bulletRadius: 3.5,
  invulnerableSeconds: 2,
};

/** Enemy kinds: radius, hull, speed, score and the wave points they cost. */
export const ENEMIES = {
  chaser: { radius: 14, hp: 2, speed: 108, score: 100, cost: 1 },
  weaver: { radius: 12, hp: 2, speed: 132, score: 150, cost: 2 },
  dasher: { radius: 13, hp: 3, speed: 92, score: 200, cost: 3 },
  bulwark: { radius: 27, hp: 11, speed: 44, score: 400, cost: 6 },
};

/** Combo: a kill feeds the chain, the chain feeds the multiplier. */
export const COMBO = {
  windowSeconds: 2.5,
  killsPerStep: 8,
  maxMultiplier: 8,
};

/** Pickups: how often a kill drops one, and how the overdrive cell behaves. */
export const PICKUPS = {
  dropChance: 0.1,
  magnetRadius: 96,
  magnetSpeed: 320,
  lifeSeconds: 9,
  overdriveSeconds: 6,
};

/**
 * The letterbox transform between the window and the arena: the scale that
 * fits the field inside a cssW by cssH window, and the offsets that centre
 * it. The renderer draws through it and the input maps the mouse back.
 */
export function computeView(cssWidth, cssHeight) {
  const scale = Math.min(cssWidth / FIELD.width, cssHeight / FIELD.height);
  return {
    scale,
    ox: (cssWidth - FIELD.width * scale) / 2,
    oy: (cssHeight - FIELD.height * scale) / 2,
  };
}
