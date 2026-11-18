// Every sound is synthesised with WebAudio oscillators and noise — no files, no network. The
// context is created on the first gesture (resume), so a silent page never fights autoplay rules.
export function createAudio() {
  let context = null;
  let master = null;
  let engine = null;
  let engineGain = null;
  let siren = null;
  let sirenGain = null;
  let noiseBuffer = null;
  let musicClock = 0;
  let step = 0;
  let on = true;

  function ensure() {
    if (context) return true;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      context = new Audio();
      master = context.createGain();
      master.gain.value = on ? 0.55 : 0;
      master.connect(context.destination);

      const size = Math.floor(context.sampleRate * 0.6);
      noiseBuffer = context.createBuffer(1, size, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < size; i += 1) data[i] = Math.random() * 2 - 1;

      engine = context.createOscillator();
      engine.type = 'sawtooth';
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engine.start();

      siren = context.createOscillator();
      siren.type = 'square';
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      siren.connect(sirenGain);
      sirenGain.connect(master);
      siren.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function tone(freq, duration, type, volume, slide) {
    if (!context || !on) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noise(duration, volume, cutoff) {
    if (!context || !on || !noiseBuffer) return;
    const now = context.currentTime;
    const src = context.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 2400;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  function chord(notes, gap, type) {
    notes.forEach((freq, i) => {
      const now = context ? context.currentTime + i * gap : 0;
      if (!context || !on) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.34);
    });
  }

  function sfx(name) {
    if (!on || !ensure()) return;
    switch (name) {
      case 'shoot': tone(280, 0.11, 'square', 0.15, 90); noise(0.09, 0.18, 1800); break;
      case 'enemyShoot': tone(210, 0.09, 'square', 0.07, 80); break;
      case 'melee': tone(150, 0.12, 'triangle', 0.13, 70); noise(0.08, 0.1, 900); break;
      case 'hit': tone(420, 0.06, 'square', 0.08, 180); break;
      case 'hurt': tone(180, 0.25, 'sawtooth', 0.14, 70); break;
      case 'explosion': noise(0.65, 0.42, 700); tone(90, 0.55, 'sawtooth', 0.2, 35); break;
      case 'pickup': chord([660, 880, 1100], 0.06, 'sine'); break;
      case 'enter': tone(90, 0.35, 'sawtooth', 0.13, 240); break;
      case 'wanted': tone(740, 0.18, 'square', 0.1, 980); tone(980, 0.2, 'square', 0.09, 620); break;
      case 'mission': chord([440, 554, 659, 880], 0.1, 'triangle'); break;
      case 'win': chord([523, 659, 784, 1046, 1318], 0.14, 'triangle'); break;
      case 'click': tone(540, 0.05, 'sine', 0.08, 720); break;
      case 'load': chord([330, 440, 554], 0.08, 'sine'); break;
      default: break;
    }
  }

  function update(dt, info) {
    if (!context) return;
    const now = context.currentTime;
    engine.frequency.setTargetAtTime(55 + (info.speed || 0) * 0.55, now, 0.08);
    engineGain.gain.setTargetAtTime(info.driving ? 0.075 : 0, now, 0.12);
    siren.frequency.setValueAtTime(Math.floor(now * 2.6) % 2 === 0 ? 660 : 890, now);
    sirenGain.gain.setTargetAtTime(info.chase ? 0.045 : 0, now, 0.15);
    if (!on) return;
    musicClock -= dt;
    if (musicClock > 0) return;
    musicClock = 0.3;
    const bass = [110, 110, 130.8, 98, 110, 146.8, 130.8, 98];
    const lead = [440, 523.3, 659.3, 523.3, 392, 440, 587.3, 493.9];
    tone(bass[step % bass.length], 0.26, 'triangle', 0.055);
    if (step % 2 === 0) tone(lead[step % lead.length], 0.18, 'sine', 0.028);
    if (step % 4 === 0) noise(0.05, 0.035, 5200);
    step += 1;
  }

  function resume() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function setEnabled(value) {
    on = !!value;
    if (master && context) master.gain.setTargetAtTime(on ? 0.55 : 0, context.currentTime, 0.05);
  }

  return {
    resume,
    sfx,
    update,
    setEnabled,
    get enabled() { return on; },
  };
}
