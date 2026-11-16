// Keyboard and mouse, read as game controls: a held-keys set for movement, the
// mouse in arena coordinates for aim, and one-shot action bits for the keys a
// screen reacts to once (start, pause, mute). The world never sees the DOM:
// main turns this into the plain control object the world steps on.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const MOVE_KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * Input on a canvas. toLogical(clientX, clientY) maps a mouse event to arena
 * coordinates (the renderer's transform). Exposes axes() (a unit-ish move
 * vector), aim ({x, y} in arena pixels), firing (mouse held or Space held),
 * and takeActions() (the one-shot bits pressed since the last call).
 */
export function createInput(canvas, toLogical) {
  const held = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const point = toLogical(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.seen = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      actions |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The move vector from the held keys: each axis -1, 0 or 1. */
    axes() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const dir = MOVE_KEYS[code];
        if (dir === 'left') x -= 1;
        else if (dir === 'right') x += 1;
        else if (dir === 'up') y -= 1;
        else if (dir === 'down') y += 1;
      }
      return { x, y };
    },
    /** Where the player aims: the mouse, in arena coordinates. */
    aim() {
      return { x: mouse.x, y: mouse.y, seen: mouse.seen };
    },
    /** Whether the gun should fire: left mouse held, or Space held. */
    firing() {
      return mouse.down || held.has('Space');
    },
    /** The one-shot actions since the last call; clears them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
