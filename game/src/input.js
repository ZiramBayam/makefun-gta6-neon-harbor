// Keyboard and pointer input. Held keys give a movement axis; one-shot presses and clicks are
// queued and taken once by the loop, so a press between two frames is never lost or counted twice.
// Pointer positions are converted through the renderer into the fixed 1280x720 logical view.

const HELD = new Set([
  'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'KeyF',
]);
const PRESSED = new Set([
  'Enter', 'Space', 'KeyP', 'Escape', 'KeyM', 'KeyR', 'KeyH', 'KeyE', 'KeyJ',
  'F2', 'F3',
]);

export function createInput(renderer) {
  const held = new Set();
  const presses = [];
  const clicks = [];
  const mouse = { x: 0, y: 0, down: false };

  function move(event) {
    const point = renderer.screenToLogical(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
  }

  window.addEventListener('keydown', (event) => {
    if (HELD.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (PRESSED.has(event.code)) {
      if (!event.repeat) presses.push(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    presses.length = 0;
    clicks.length = 0;
    mouse.down = false;
  });
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerdown', (event) => {
    move(event);
    if (event.button === 0) {
      mouse.down = true;
      clicks.push({ x: mouse.x, y: mouse.y });
    }
    event.preventDefault();
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    axis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
        - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0)
        - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return {
        x,
        y,
        sprint: held.has('ShiftLeft') || held.has('ShiftRight'),
        handbrake: held.has('KeyF'),
      };
    },
    takePresses() {
      const taken = presses.slice();
      presses.length = 0;
      return taken;
    },
    takeClicks() {
      const taken = clicks.slice();
      clicks.length = 0;
      return taken;
    },
    clear() {
      held.clear();
      presses.length = 0;
      clicks.length = 0;
      mouse.down = false;
    },
  };
}
