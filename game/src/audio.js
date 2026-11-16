// Synthesised sound effects: every blip is an oscillator shaped in code, so
// the game ships no audio files and stays silent until the player first
// interacts (a browser rule). One small engine: tone sweeps and a noise
// burst for explosions, a master gain, a mute the M key toggles.

/** How often the shot blip may sound, seconds: the gun fires faster than ears want. */
const SHOT_THROTTLE = 0.05;

/**
 * The sound engine. unlock() starts the context from a user gesture;
 * play(name) sounds one effect; toggleMute() flips and reports the mute.
 * With no WebAudio (an old browser) every call is a quiet no-op.
 */
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let lastShot = 0;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor === undefined) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.22;
    master.connect(context.destination);
  }

  /** One shaped tone: type, from -> to Hz over dur, at gain, starting when seconds from now. */
  function tone(type, from, to, dur, gain, when = 0) {
    if (context === null || master === null || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + dur);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** A short filtered noise burst: the body of an explosion. */
  function noise(dur, gain, when = 0) {
    if (context === null || master === null || muted) return;
    const start = context.currentTime + when;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, start);
    filter.frequency.exponentialRampToValueAtTime(120, start + dur);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
  }

  function play(name) {
    if (context === null || muted) return;
    switch (name) {
      case 'shoot': {
        const now = context.currentTime;
        if (now - lastShot < SHOT_THROTTLE) return;
        lastShot = now;
        tone('square', 920, 480, 0.07, 0.05);
        break;
      }
      case 'kill':
        tone('sawtooth', 340, 55, 0.2, 0.16);
        noise(0.16, 0.12);
        break;
      case 'split':
        tone('sawtooth', 220, 40, 0.3, 0.2);
        noise(0.28, 0.18);
        break;
      case 'hurt':
        tone('square', 170, 65, 0.28, 0.22);
        noise(0.2, 0.14);
        break;
      case 'dash':
        tone('sawtooth', 1250, 280, 0.14, 0.05);
        break;
      case 'pickup':
        tone('sine', 660, 660, 0.09, 0.14);
        tone('sine', 990, 990, 0.14, 0.14, 0.08);
        break;
      case 'wave':
        tone('triangle', 440, 440, 0.1, 0.14);
        tone('triangle', 554, 554, 0.1, 0.14, 0.09);
        tone('triangle', 659, 659, 0.16, 0.14, 0.18);
        break;
      case 'clear':
        tone('triangle', 523, 523, 0.1, 0.13);
        tone('triangle', 784, 784, 0.18, 0.13, 0.09);
        break;
      case 'over':
        tone('sawtooth', 392, 392, 0.22, 0.16);
        tone('sawtooth', 311, 311, 0.22, 0.16, 0.2);
        tone('sawtooth', 233, 180, 0.5, 0.16, 0.4);
        break;
      default:
        break;
    }
  }

  return {
    unlock,
    play,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
