// Boot and the single loop. Input is read once per frame, the world advances in fixed 1/60 s
// steps (several after a slow frame, none after a fast one), and the renderer paints the result.
// Screens: title -> controls or play; play <-> paused; play -> win when the fourth job is done.
// ?seed=N pins the deterministic city. The whole game is local: no requests leave this page.
import { DEFAULT_SEED, SAVE_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import {
  createRenderer, SCREEN_CONTROLS, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { createAudio } from './audio.js';
import { nearObjective } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);
const world = createWorld(city, random);
const renderer = createRenderer(canvas);
const input = createInput(renderer);
const audio = createAudio();
const state = world.state;

let screen = SCREEN_TITLE;
let accumulator = 0;
let last = performance.now();
let saveExists = readSave() !== null;

function announce(message) {
  status.textContent = message;
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.snapshot()));
    saveExists = true;
    announce('Game saved to this browser.');
    return true;
  } catch {
    announce('Saving is unavailable in this browser.');
    return false;
  }
}

function startNew() {
  world.reset();
  world.startNextMission();
  accumulator = 0;
  screen = SCREEN_PLAY;
  input.clear();
  audio.resume();
  audio.sfx('mission');
  announce('Playing. Follow the gold marker to start the first job.');
}

function continueGame() {
  const data = readSave();
  if (!data) {
    announce('No saved game was found.');
    return;
  }
  if (world.restore(data)) {
    accumulator = 0;
    screen = SCREEN_PLAY;
    input.clear();
    audio.resume();
    announce('Save loaded. Welcome back to Neon Harbor.');
  }
}

function pause() {
  screen = SCREEN_PAUSED;
  input.clear();
  announce('Paused. You can save from the menu.');
}

function resume() {
  screen = SCREEN_PLAY;
  input.clear();
  accumulator = 0;
  announce('Playing.');
}

function handleButton(id) {
  audio.resume();
  audio.sfx('click');
  switch (id) {
    case 'play': startNew(); break;
    case 'continue': continueGame(); break;
    case 'controls': screen = SCREEN_CONTROLS; input.clear(); announce('Controls.'); break;
    case 'back': screen = SCREEN_TITLE; input.clear(); announce('Back at the title.'); break;
    case 'resume': resume(); break;
    case 'save': writeSave(); break;
    case 'mute':
      audio.setEnabled(!audio.enabled);
      announce(audio.enabled ? 'Sound on.' : 'Sound off.');
      break;
    case 'restart': startNew(); break;
    default: break;
  }
}

function teleportNearGoal() {
  const goal = world.objective();
  const spot = nearObjective(goal, city, state.player);
  if (!spot) {
    announce('No active objective to jump to.');
    return;
  }
  if (state.player.onFoot) {
    state.player.x = spot.x;
    state.player.y = spot.y;
    state.player.aim = spot.angle;
  } else {
    const car = state.cars.find((c) => c.id === state.player.car);
    if (car) {
      car.x = spot.x;
      car.y = spot.y;
      car.angle = spot.angle;
      car.speed = 0;
    }
  }
  announce(`Jumped near the objective: ${goal.label}.`);
}

function handlePresses() {
  const presses = input.takePresses();
  if (presses.length) audio.resume();
  for (const code of presses) {
    if (code === 'KeyM') {
      audio.setEnabled(!audio.enabled);
      announce(audio.enabled ? 'Sound on.' : 'Sound off.');
      continue;
    }
    if (screen === SCREEN_PLAY && code === 'KeyR') {
      state.rain = !state.rain;
      announce(state.rain ? 'Rain on.' : 'Rain off.');
      continue;
    }
    if (screen === SCREEN_PLAY && code === 'KeyH') {
      state.player.headlights = !state.player.headlights;
      announce(state.player.headlights ? 'Headlights on.' : 'Headlights off.');
      continue;
    }
    if (screen === SCREEN_PLAY && code === 'F2') {
      world.addWanted(3, 'photo');
      announce('Wanted level 3. Police are on the way.');
      continue;
    }
    if (screen === SCREEN_PLAY && code === 'F3') {
      teleportNearGoal();
      continue;
    }
    if (screen === SCREEN_TITLE) {
      if (code === 'Enter' || code === 'Space') startNew();
      continue;
    }
    if (screen === SCREEN_CONTROLS) {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') {
        screen = SCREEN_TITLE;
        input.clear();
      }
      continue;
    }
    if (screen === SCREEN_PLAY) {
      if (code === 'KeyP' || code === 'Escape') pause();
      else if (code === 'KeyE') world.tryEnter();
      else if (code === 'KeyJ' || code === 'Space') world.melee();
      continue;
    }
    if (screen === SCREEN_PAUSED) {
      if (code === 'KeyP' || code === 'Escape') resume();
      continue;
    }
    if (screen === SCREEN_WIN && (code === 'Enter' || code === 'Space')) startNew();
  }
}

function handleClicks() {
  const clicks = input.takeClicks();
  if (clicks.length) audio.resume();
  for (const click of clicks) {
    let used = false;
    for (const b of renderer.api.buttons) {
      if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
        handleButton(b.id);
        used = true;
        break;
      }
    }
    if (!used && screen === SCREEN_PLAY) {
      const cam = renderer.api.camera;
      world.fire(click.x - cam.x + VIEW.width / 2, click.y - cam.y + VIEW.height / 2);
    }
  }
}

function drainEvents() {
  const events = state.events.splice(0);
  for (const e of events) {
    switch (e.type) {
      case 'shoot': audio.sfx('shoot'); break;
      case 'melee': audio.sfx('melee'); break;
      case 'hit': audio.sfx('hit'); break;
      case 'hurt': audio.sfx('hurt'); announce('You took damage.'); break;
      case 'explosion': audio.sfx('explosion'); break;
      case 'pickup': audio.sfx('pickup'); break;
      case 'enter': audio.sfx('enter'); break;
      case 'wanted': audio.sfx('wanted'); break;
      case 'mission': case 'missionComplete': case 'missionStep': audio.sfx('mission'); break;
      case 'load': audio.sfx('load'); break;
      case 'win': audio.sfx('win'); break;
      default: break;
    }
    if (e.type === 'missionStep' || e.type === 'missionComplete' || e.type === 'wanted') {
      if (state.toast) announce(state.toast.text);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;
  accumulator += Math.min(elapsed, MAX_FRAME);
  last = now;

  handlePresses();
  handleClicks();
  if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
    const axis = screen === SCREEN_PLAY
      ? input.axis()
      : { x: 0, y: 0, sprint: false, handbrake: false };
    while (accumulator >= STEP) {
      world.step(STEP, axis);
      accumulator -= STEP;
      if (screen === SCREEN_PLAY && state.won) {
        screen = SCREEN_WIN;
        input.clear();
        announce('All four jobs complete. Neon Harbor is yours.');
        break;
      }
    }
  } else {
    accumulator = 0;
  }
  drainEvents();

  window.__nhObjective = state.missionIndex >= 0 ? world.objective() : null;
  renderer.draw(state, screen, {
    city,
    saveExists,
    muted: !audio.enabled,
    mouse: input.mouse,
    objective: window.__nhObjective,
  });
  audio.update(STEP, {
    driving: !state.player.onFoot,
    speed: state.player.speed,
    chase: state.wanted > 0,
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) pause();
});

window.NH = {
  world,
  city,
  state,
  renderer,
  input,
  get screen() { return screen; },
};

announce('Neon Harbor. Press Enter to start, choose Continue for a saved run, or click Controls.');
requestAnimationFrame(frame);
