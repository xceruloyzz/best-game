# best-game

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/xceruloyzz/best-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/xceruloyzz/best-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**NEON VOID** — an original neon twin-stick arena survival shooter that plays
entirely offline in a desktop browser. Pilot a lone starfighter in a glowing
void arena: move with WASD or the arrow keys, aim with the mouse, and hold the
mouse button (or Space) to fire. Survive escalating waves of five enemy kinds —
chasers that hunt you, weavers that snake in, dashers that telegraph and lunge,
armoured bulwarks that split when they break, and every fifth wave the
DREADNOUGHT, a capital ship that orbits the arena answering with radial bullet
rings, aimed spreads and fresh escorts — chain kills to raise your
combo multiplier up to ×8, grab repair hearts and overdrive cells, and chase
the high score across three hull hearts. Canvas rendering over a seeded
nebula sky, with glow, shockwaves, spark bursts and screen shake, synthesised
WebAudio sound effects, and a full loop: title
screen, waves, pause, game over and restart. No build step, no network, no
external assets: plain ES modules under `game/`, handed in by `main.ts`
(Node 22) which copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a desktop browser
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ztsmgxnm&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
