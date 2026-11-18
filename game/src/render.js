// Drawing only: state + screen in, pixels out. The 1280x720 logical view is scaled to the window
// and centred. The camera follows the player over the hand-built city; the same routine paints the
// title, controls, play, pause and win screens. Every clickable button is re-listed each frame.
import { FONT, PALETTE, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_CONTROLS = 'controls';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  const cam = { x: VIEW.width / 2, y: VIEW.height / 2, ready: false };
  const api = { buttons: [], camera: cam };
  const fonts = new Map();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * dpr);
    const height = Math.round(window.innerHeight * dpr);
    canvas.width = width;
    canvas.height = height;
    view.dpr = dpr;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function screenToLogical(clientX, clientY) {
    return {
      x: (clientX * view.dpr - view.x) / view.scale,
      y: (clientY * view.dpr - view.y) / view.scale,
    };
  }

  function worldToScreen(x, y, camera = cam) {
    return { x: x - camera.x + VIEW.width / 2, y: y - camera.y + VIEW.height / 2 };
  }

  function font(size, weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`.trim());
    context.font = fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    font(size, weight);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function panel(x, y, w, h, accent = PALETTE.neonCyan) {
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, w, h);
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, w - 2, h - 2);
    context.fillStyle = accent;
    context.fillRect(x + 1, y + 1, 58, 3);
  }

  function button(id, label, x, y, w, h, extras, accent = PALETTE.neonCyan) {
    api.buttons.push({ id, x, y, w, h });
    const mouse = extras && extras.mouse ? extras.mouse : { x: -1, y: -1 };
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    context.fillStyle = hover ? 'rgba(72,230,255,0.22)' : 'rgba(12,20,38,0.86)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = hover ? '#ffffff' : accent;
    context.lineWidth = hover ? 2.5 : 1.5;
    context.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    text(label, x + w / 2, y + h / 2 + 7, 19, hover ? '#ffffff' : PALETTE.text, 'center', '600');
  }

  function wrap(value, maxWidth, size) {
    font(size);
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      if (context.measureText(attempt).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = attempt;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawGround(city, state, bounds) {
    const ctx = context;
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

    const cell = city.cell;
    const road = city.road;
    const i0 = clamp(Math.floor(bounds.left / cell), 0, city.cols - 1);
    const i1 = clamp(Math.ceil(bounds.right / cell), 0, city.cols - 1);
    const j0 = clamp(Math.floor(bounds.top / cell), 0, city.rows - 1);
    const j1 = clamp(Math.ceil(bounds.bottom / cell), 0, city.rows - 1);
    ctx.fillStyle = PALETTE.road;
    for (let i = i0; i <= i1; i += 1) ctx.fillRect(i * cell, bounds.top, road, bounds.bottom - bounds.top);
    for (let j = j0; j <= j1; j += 1) ctx.fillRect(bounds.left, j * cell, bounds.right - bounds.left, road);
    ctx.fillStyle = PALETTE.lane;
    for (let j = j0; j <= j1; j += 1) {
      const y = j * cell + road / 2;
      if (y < city.shoreY) {
        for (let x = Math.max(bounds.left, 0); x < bounds.right; x += 58) ctx.fillRect(x, y, 26, 2);
      }
    }
    for (let i = i0; i <= i1; i += 1) {
      const x = i * cell + road / 2;
      if (x < city.shoreX) {
        for (let y = Math.max(bounds.top, 0); y < bounds.bottom; y += 58) ctx.fillRect(x, y, 2, 26);
      }
    }

    const wx = Math.max(bounds.left, city.shoreX);
    const wy = Math.max(bounds.top, city.shoreY);
    if (wx < bounds.right && wy < bounds.bottom) {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(wx, wy, bounds.right - wx, bounds.bottom - wy);
      ctx.strokeStyle = PALETTE.waterLine;
      ctx.lineWidth = 2;
      for (let y = Math.ceil(wy / 46) * 46; y < bounds.bottom; y += 46) {
        ctx.beginPath();
        for (let x = wx; x < bounds.right; x += 40) {
          const yy = y + Math.sin(x * 0.012 + state.time * 1.4 + y) * 4;
          if (x === wx) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }

    for (const pier of city.piers) {
      if (pier.x > bounds.right || pier.x + pier.w < bounds.left || pier.y > bounds.bottom || pier.y + pier.h < bounds.top) continue;
      ctx.fillStyle = '#3a2f3a';
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = '#544153';
      for (let x = pier.x; x < pier.x + pier.w; x += 22) ctx.fillRect(x, pier.y + 4, 2, pier.h - 8);
      ctx.fillStyle = PALETTE.neonGold;
      ctx.fillRect(pier.x, pier.y - 3, pier.w, 3);
      ctx.fillRect(pier.x, pier.y + pier.h, pier.w, 3);
    }

    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const c = city.cells[j * city.cols + i];
        if (!c || c.type === 'water') continue;
        const x = i * cell + road;
        const y = j * cell + road;
        const size = cell - road;
        if (c.type === 'park') {
          ctx.fillStyle = PALETTE.park;
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = '#2a6b55';
          ctx.strokeRect(x + 4, y + 4, size - 8, size - 8);
          for (const tree of c.props) {
            ctx.fillStyle = '#0d241f';
            ctx.beginPath();
            ctx.arc(tree.x + 3, tree.y + 4, tree.r, 0, TAU);
            ctx.fill();
            ctx.fillStyle = PALETTE.tree;
            ctx.beginPath();
            ctx.arc(tree.x, tree.y, tree.r, 0, TAU);
            ctx.fill();
          }
        } else if (c.type === 'plaza') {
          ctx.fillStyle = '#28334a';
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = 'rgba(255,212,94,0.28)';
          for (let k = 0; k < size; k += 22) {
            ctx.beginPath();
            ctx.moveTo(x + k, y);
            ctx.lineTo(x + k, y + size);
            ctx.moveTo(x, y + k);
            ctx.lineTo(x + size, y + k);
            ctx.stroke();
          }
          ctx.fillStyle = '#1a3350';
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, 34, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = PALETTE.neonGold;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, 30 + Math.sin(state.time * 2) * 2, 0, TAU);
          ctx.stroke();
          ctx.lineWidth = 1;
        } else {
          ctx.fillStyle = PALETTE.sidewalk;
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = 'rgba(72,230,255,0.10)';
          ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        }
      }
    }

    for (const b of city.buildings) {
      if (b.x > bounds.right || b.x + b.w < bounds.left || b.y > bounds.bottom || b.y + b.h < bounds.top) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(b.x + 6, b.y + 7, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, 4);
      ctx.fillStyle = b.tall ? 'rgba(72,230,255,0.13)' : 'rgba(255,79,163,0.10)';
      ctx.fillRect(b.x + 3, b.y + 9, b.w - 6, b.h - 12);
      const cols = Math.max(2, Math.floor((b.w - 10) / 17));
      const rows = Math.max(2, Math.floor((b.h - 12) / 18));
      for (let r = 0; r < rows; r += 1) {
        for (let col = 0; col < cols; col += 1) {
          if ((r * 7 + col * 13 + b.seed) % 5 > 1) continue;
          ctx.fillStyle = b.seed % 3 === 0 ? 'rgba(255,212,94,0.55)' : 'rgba(120,225,255,0.42)';
          ctx.fillRect(b.x + 7 + col * 17, b.y + 10 + r * 18, 7, 8);
        }
      }
      if (b.sign) {
        ctx.fillStyle = b.signColor;
        ctx.globalAlpha = 0.82;
        ctx.fillRect(b.x + 6, b.y + b.h - 14, Math.min(b.w - 12, b.sign.length * 7 + 8), 11);
        ctx.globalAlpha = 1;
        text(b.sign, b.x + 10, b.y + b.h - 5, 9, '#08101e', 'left', '700');
      }
    }

    for (const mark of city.landmarks) {
      if (mark.x < bounds.left || mark.x > bounds.right || mark.y < bounds.top || mark.y > bounds.bottom) continue;
      ctx.fillStyle = 'rgba(6,10,20,0.7)';
      ctx.fillRect(mark.x - 70, mark.y + 30, 140, 17);
      text(mark.label, mark.x, mark.y + 43, 10, mark.color, 'center', '700');
    }
  }

  function drawCar(car, state, bounds) {
    if (car.x < bounds.left - 60 || car.x > bounds.right + 60 || car.y < bounds.top - 60 || car.y > bounds.bottom + 60) return;
    const ctx = context;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const long = car.kind === 'van' ? 30 : 23;
    const wide = car.kind === 'van' ? 14 : 12;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-long + 4, -wide + 5, long * 2, wide * 2);
    ctx.fillStyle = car.dead ? '#4b3a35' : car.color;
    ctx.fillRect(-long, -wide, long * 2, wide * 2);
    ctx.fillStyle = car.kind === 'police' ? '#101b30' : 'rgba(10,18,34,0.85)';
    ctx.fillRect(-long + 8, -wide + 3, long - 10, wide * 2 - 6);
    ctx.fillRect(5, -wide + 3, long - 12, wide * 2 - 6);
    ctx.fillStyle = state.player.headlights ? '#fff3b0' : '#6e7c96';
    ctx.fillRect(long - 3, -wide + 2, 4, 6);
    ctx.fillRect(long - 3, wide - 8, 4, 6);
    ctx.fillStyle = '#ff4d5e';
    ctx.fillRect(-long, -wide + 2, 3, 6);
    ctx.fillRect(-long, wide - 8, 3, 6);
    if (car.kind === 'police') {
      const flash = Math.floor(state.time * 7) % 2 === 0;
      ctx.fillStyle = flash ? PALETTE.policeRed : '#3a1522';
      ctx.fillRect(-5, -9, 10, 6);
      ctx.fillStyle = flash ? '#15203a' : PALETTE.policeBlue;
      ctx.fillRect(-5, 3, 10, 6);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = flash ? PALETTE.policeRed : PALETTE.policeBlue;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (car.missionVan) {
      ctx.strokeStyle = PALETTE.neonGold;
      ctx.lineWidth = 2;
      ctx.strokeRect(-long - 3, -wide - 3, long * 2 + 6, wide * 2 + 6);
    }
    ctx.restore();
  }

  function drawWorld(city, state, bounds) {
    drawGround(city, state, bounds);
    for (const pk of state.pickups) {
      if (!pk.active || pk.x < bounds.left || pk.x > bounds.right || pk.y < bounds.top || pk.y > bounds.bottom) continue;
      const color = pk.kind === 'health' ? PALETTE.neonGreen : pk.kind === 'armor' ? PALETTE.neonCyan : pk.kind === 'ammo' ? PALETTE.neonGold : '#b9a3ff';
      const pulse = 6 + Math.sin(state.time * 4 + pk.x) * 1.5;
      context.fillStyle = color;
      context.globalAlpha = 0.25;
      context.beginPath();
      context.arc(pk.x, pk.y, pulse + 6, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
      context.fillRect(pk.x - 5, pk.y - 5, 10, 10);
      text(pk.kind === 'money' ? '$' : pk.kind[0].toUpperCase(), pk.x, pk.y + 3, 9, '#08101e', 'center', '700');
    }
    for (const ped of state.peds) {
      if (ped.x < bounds.left || ped.x > bounds.right || ped.y < bounds.top || ped.y > bounds.bottom) continue;
      if (ped.down) {
        context.strokeStyle = '#7a3a4e';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(ped.x - 6, ped.y);
        context.lineTo(ped.x + 6, ped.y + 2);
        context.stroke();
        continue;
      }
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.beginPath();
      context.ellipse(ped.x + 2, ped.y + 4, 7, 4, 0, 0, TAU);
      context.fill();
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(ped.x, ped.y, 5.5, 0, TAU);
      context.fill();
      context.fillStyle = '#ffe0c0';
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 3, 0, TAU);
      context.fill();
      if (ped.kind === 'runner' || ped.kind === 'gangster') {
        context.strokeStyle = ped.kind === 'runner' ? PALETTE.neonGold : PALETTE.policeRed;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(ped.x, ped.y, 10, 0, TAU);
        context.stroke();
      }
    }
    for (const car of state.cars) drawCar(car, state, bounds);

    const player = state.player;
    if (player.onFoot && (player.invuln === 0 || Math.floor(player.invuln * 12) % 2 === 0)) {
      context.save();
      context.translate(player.x, player.y);
      context.rotate(player.aim);
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.beginPath();
      context.ellipse(2, 4, 13, 7, 0, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.neonCyan;
      context.beginPath();
      context.arc(0, 0, 11, 0, TAU);
      context.fill();
      context.fillStyle = '#0b1224';
      context.fillRect(-2, 3, 20, 4);
      context.fillStyle = '#ffe0c0';
      context.beginPath();
      context.arc(4, 0, 5, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.neonGold;
      context.beginPath();
      context.arc(0, 0, 15, -0.45, 0.45);
      context.stroke();
      context.restore();
    }

    for (const b of state.bullets) {
      context.strokeStyle = b.from === 'player' ? '#fff2a8' : '#ff7a8a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x, b.y);
      context.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      context.stroke();
    }
    for (const f of state.fx) {
      const alpha = clamp(f.life / f.max, 0, 1);
      context.globalAlpha = alpha;
      context.fillStyle = f.color;
      if (f.kind === 'smoke') {
        context.beginPath();
        context.arc(f.x, f.y, f.size * (1.6 - alpha), 0, TAU);
        context.fill();
      } else {
        context.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
      }
      context.globalAlpha = 1;
    }
    for (const boom of state.booms) {
      const t = boom.t / boom.max;
      context.globalAlpha = 1 - t;
      context.strokeStyle = t < 0.5 ? '#ffd45e' : '#ff7043';
      context.lineWidth = 8 * (1 - t) + 1;
      context.beginPath();
      context.arc(boom.x, boom.y, boom.r * t, 0, TAU);
      context.stroke();
      context.fillStyle = 'rgba(255,140,60,0.35)';
      context.beginPath();
      context.arc(boom.x, boom.y, boom.r * t * 0.6, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
    }

    if (state.rain) {
      context.strokeStyle = 'rgba(150,205,255,0.35)';
      context.lineWidth = 1;
      for (let k = 0; k < 130; k += 1) {
        const x = ((k * 173 + state.time * 420) % (VIEW.width + 240)) - 120;
        const y = ((k * 311 + state.time * 760) % (VIEW.height + 160)) - 80;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 7, y + 18);
        context.stroke();
      }
    }
  }

  function drawObjective(goal, state) {
    if (!goal) return;
    const ctx = context;
    const s = worldToScreen(goal.x, goal.y);
    const pulse = Math.sin(state.time * 4) * 3;
    if (s.x < -40 || s.x > VIEW.width + 40 || s.y < -40 || s.y > VIEW.height + 40) {
      const cx = clamp(s.x, 60, VIEW.width - 60);
      const cy = clamp(s.y, 90, VIEW.height - 90);
      const a = Math.atan2(s.y - cy, s.x - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = PALETTE.neonGold;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.strokeStyle = PALETTE.neonGold;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, goal.radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const glow = ctx.createLinearGradient(0, -150, 0, 0);
    glow.addColorStop(0, 'rgba(255,212,94,0)');
    glow.addColorStop(1, 'rgba(255,212,94,0.4)');
    ctx.fillStyle = glow;
    ctx.fillRect(-5, -150, 10, 150);
    ctx.fillStyle = PALETTE.neonGold;
    ctx.beginPath();
    ctx.moveTo(0, -14 - pulse);
    ctx.lineTo(13 + pulse, 0);
    ctx.lineTo(0, 14 + pulse);
    ctx.lineTo(-13 - pulse, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#12182a';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.font = '700 14px ' + FONT;
    const width = ctx.measureText(goal.label).width + 22;
    const labelY = s.y - 178 < 64 ? s.y + 48 : s.y - 178;
    ctx.fillStyle = 'rgba(6,10,20,0.86)';
    ctx.fillRect(s.x - width / 2, labelY, width, 24);
    text(goal.label, s.x, labelY + 17, 14, PALETTE.neonGold, 'center', '700');
  }

  function bar(x, y, w, h, value, max, color) {
    context.fillStyle = 'rgba(6,10,22,0.9)';
    context.fillRect(x, y, w, h);
    context.fillStyle = color;
    context.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(value / max, 0, 1)), h - 4);
    context.strokeStyle = 'rgba(255,255,255,0.16)';
    context.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawMinimap(city, state, goal, x, y, w, h) {
    const ctx = context;
    ctx.fillStyle = 'rgba(5,9,20,0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.neonCyan;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const sx = w / city.width;
    const sy = h / city.height;
    ctx.fillStyle = 'rgba(21,80,120,0.55)';
    ctx.fillRect(x + city.shoreX * sx, y + city.shoreY * sy, (city.width - city.shoreX) * sx, (city.height - city.shoreY) * sy);
    ctx.strokeStyle = 'rgba(120,160,220,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= city.cols; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * city.cell * sx, y);
      ctx.lineTo(x + i * city.cell * sx, y + h);
      ctx.stroke();
    }
    for (let j = 0; j <= city.rows; j += 1) {
      ctx.beginPath();
      ctx.moveTo(x, y + j * city.cell * sy);
      ctx.lineTo(x + w, y + j * city.cell * sy);
      ctx.stroke();
    }
    for (const mark of city.landmarks) {
      ctx.fillStyle = mark.color;
      ctx.fillRect(x + mark.x * sx - 2, y + mark.y * sy - 2, 4, 4);
    }
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      ctx.fillStyle = PALETTE.policeRed;
      ctx.fillRect(x + car.x * sx - 1.5, y + car.y * sy - 1.5, 3, 3);
    }
    if (goal) {
      ctx.fillStyle = PALETTE.neonGold;
      ctx.beginPath();
      ctx.arc(x + goal.x * sx, y + goal.y * sy, 4, 0, TAU);
      ctx.fill();
    }
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + p.x * sx, y + p.y * sy, 3.5, 0, TAU);
    ctx.fill();
    text('MAP', x + 8, y + 14, 10, PALETTE.muted, 'left', '700');
  }

  function drawHud(city, state, goal) {
    const ctx = context;
    const p = state.player;
    panel(18, 16, 262, 94);
    text(`$${state.money}`, 32, 47, 28, PALETTE.neonGreen, 'left', '700');
    text('HP', 32, 70, 12, PALETTE.muted, 'left', '700');
    bar(56, 60, 204, 12, p.hp, 100, PALETTE.neonGreen);
    text('AR', 32, 91, 12, PALETTE.muted, 'left', '700');
    bar(56, 81, 204, 12, p.armor, 100, PALETTE.neonCyan);
    text(`AMMO ${p.ammo}`, 32, 108, 13, PALETTE.neonGold, 'left', '700');

    ctx.textBaseline = 'alphabetic';
    const jobWidth = Math.min(720, ctx.measureText(state.job).width + 260);
    font(15);
    panel(VIEW.width / 2 - jobWidth / 2, 16, jobWidth, 36, PALETTE.neonGold);
    text(state.job, VIEW.width / 2, 39, 15, PALETTE.text, 'center', '600');

    panel(VIEW.width - 238, 16, 220, 60, state.wanted ? PALETTE.policeRed : PALETTE.neonCyan);
    text('WANTED', VIEW.width - 226, 38, 12, PALETTE.muted, 'left', '700');
    for (let star = 0; star < 5; star += 1) {
      text('★', VIEW.width - 218 + star * 40, 63, 27,
        star < state.wanted ? PALETTE.neonGold : 'rgba(150,165,190,0.28)', 'center');
    }
    drawMinimap(city, state, goal, VIEW.width - 238, 84, 220, 168);

    if (!p.onFoot) {
      const speed = Math.round(Math.abs(p.speed) * 0.42);
      panel(18, VIEW.height - 116, 174, 64, PALETTE.neonGold);
      text(String(speed), 32, VIEW.height - 63, 38, PALETTE.neonGold, 'left', '700');
      text('KM/H', 112, VIEW.height - 66, 14, PALETTE.muted, 'left', '700');
      text(p.headlights ? 'LIGHTS ON' : 'LIGHTS OFF', 32, VIEW.height - 77, 10, PALETTE.muted, 'left');
    }

    panel(18, VIEW.height - 44, Math.min(860, 30 + ctx.measureText(state.hint).width), 30);
    font(13);
    text(state.hint, 32, VIEW.height - 24, 13, PALETTE.muted, 'left');

    if (state.toast) {
      ctx.globalAlpha = clamp(state.toast.t / 0.5, 0, 1);
      panel(VIEW.width / 2 - 260, 266, 520, 42, PALETTE.neonGold);
      text(state.toast.text, VIEW.width / 2, 293, 19, PALETTE.neonGold, 'center', '700');
      ctx.globalAlpha = 1;
    }
    if (state.dialogue) {
      const lines = wrap(state.dialogue.text, 860, 17);
      const top = VIEW.height - 118 - lines.length * 23;
      panel(200, top, 880, 42 + lines.length * 23, PALETTE.neonPink);
      text(state.dialogue.who.toUpperCase(), 222, top + 27, 14, PALETTE.neonPink, 'left', '700');
      lines.forEach((line, i) => text(line, 222, top + 52 + i * 23, 17, PALETTE.text, 'left'));
    }
  }

  function dim(alpha) {
    context.fillStyle = `rgba(4,7,16,${alpha})`;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function titleScreen(extras) {
    const ctx = context;
    dim(0.54);
    ctx.shadowColor = PALETTE.neonPink;
    ctx.shadowBlur = 26;
    text('NEON HARBOR', VIEW.width / 2, 206, 76, PALETTE.text, 'center', '800');
    ctx.shadowBlur = 0;
    text('AN OFFLINE OPEN-WORLD CRIME STORY', VIEW.width / 2, 244, 18, PALETTE.neonCyan, 'center', '700');
    text('Four jobs. Eight districts. Five stars. One city that never sleeps.', VIEW.width / 2, 292, 16, PALETTE.muted, 'center');
    button('play', 'PLAY', 540, 342, 200, 52, extras, PALETTE.neonPink);
    if (extras.saveExists) button('continue', 'CONTINUE', 540, 406, 200, 52, extras, PALETTE.neonGreen);
    button('controls', 'CONTROLS', 540, 470, 200, 52, extras);
    if (extras.saveExists) text('A saved run is ready on this device.', VIEW.width / 2, 546, 13, PALETTE.neonGreen, 'center');
    text('No network · no downloads · seeded world', VIEW.width / 2, 676, 13, PALETTE.muted, 'center');
  }

  function controlsScreen(extras) {
    dim(0.8);
    panel(240, 76, 800, 572, PALETTE.neonCyan);
    text('CONTROLS', VIEW.width / 2, 132, 42, PALETTE.text, 'center', '800');
    const rows = [
      ['WASD / Arrows', 'Walk · steer and accelerate when driving'],
      ['Shift', 'Sprint on foot'],
      ['E', 'Enter or steal a car · exit when driving'],
      ['Mouse click', 'Fire the pistol toward the pointer'],
      ['J / Space', 'Melee attack'],
      ['F', 'Handbrake while driving'],
      ['H', 'Toggle headlights'],
      ['P / Escape', 'Pause and open the save menu'],
      ['M / R', 'Mute audio · toggle rain'],
      ['F2 / F3', 'Raise 3 wanted stars · jump near the gold marker'],
    ];
    rows.forEach(([key, value], i) => {
      const y = 186 + i * 38;
      text(key, 288, y, 16, PALETTE.neonGold, 'left', '700');
      text(value, 486, y, 16, PALETTE.text, 'left');
    });
    button('back', 'BACK', 540, 596, 200, 44, extras);
  }

  function pausedScreen(state, extras) {
    dim(0.7);
    panel(440, 196, 400, 400, PALETTE.neonPink);
    text('PAUSED', VIEW.width / 2, 258, 42, PALETTE.text, 'center', '800');
    text(`Job ${state.job}`, VIEW.width / 2, 290, 14, PALETTE.muted, 'center');
    button('resume', 'RESUME', 540, 320, 200, 46, extras);
    button('save', 'SAVE GAME', 540, 376, 200, 46, extras, PALETTE.neonGreen);
    button('mute', extras.muted ? 'SOUND: OFF' : 'SOUND: ON', 540, 432, 200, 46, extras);
    button('restart', 'RESTART', 540, 488, 200, 46, extras, PALETTE.policeRed);
    text('P or Escape to resume', VIEW.width / 2, 568, 12, PALETTE.muted, 'center');
  }

  function winScreen(state, extras) {
    const ctx = context;
    dim(0.72);
    panel(380, 120, 520, 486, PALETTE.neonGold);
    ctx.shadowColor = PALETTE.neonGold;
    ctx.shadowBlur = 20;
    text('HARBOR TAKEN', VIEW.width / 2, 192, 44, PALETTE.neonGold, 'center', '800');
    ctx.shadowBlur = 0;
    text('All four jobs are done. Neon Harbor belongs to you.', VIEW.width / 2, 226, 15, PALETTE.text, 'center');
    const stats = [
      ['CASH', `$${state.money}`],
      ['JOBS', `${state.stats.missions} / 4`],
      ['BODIES', String(state.stats.kills)],
      ['CARS LOST', String(state.stats.cars)],
      ['TIME', `${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s`],
    ];
    stats.forEach(([label, value], i) => {
      const y = 288 + i * 42;
      text(label, 458, y, 16, PALETTE.muted, 'left', '700');
      text(value, 822, y, 19, PALETTE.text, 'right', '700');
    });
    button('restart', 'PLAY AGAIN', 540, 510, 200, 52, extras, PALETTE.neonGold);
  }

  function draw(state, screen, extras) {
    api.buttons.length = 0;
    const city = extras.city;
    const p = state.player;
    const targetX = clamp(p.x, VIEW.width / 2, city.width - VIEW.width / 2);
    const targetY = clamp(p.y, VIEW.height / 2, city.height - VIEW.height / 2);
    if (!cam.ready) {
      cam.x = targetX;
      cam.y = targetY;
      cam.ready = true;
    } else {
      cam.x += (targetX - cam.x) * 0.12;
      cam.y += (targetY - cam.y) * 0.12;
    }
    const bounds = {
      left: cam.x - VIEW.width / 2 - 120,
      right: cam.x + VIEW.width / 2 + 120,
      top: cam.y - VIEW.height / 2 - 120,
      bottom: cam.y + VIEW.height / 2 + 120,
    };

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';
    context.save();
    context.translate(VIEW.width / 2 - cam.x, VIEW.height / 2 - cam.y);
    drawWorld(city, state, bounds);
    context.restore();

    const goal = (typeof window !== 'undefined' && window.__nhObjective) || null;
    if (screen === SCREEN_TITLE || screen === SCREEN_CONTROLS) {
      drawObjective(goal, state);
      if (screen === SCREEN_TITLE) titleScreen(extras);
      else controlsScreen(extras);
      return;
    }

    drawObjective(goal, state);
    drawHud(city, state, goal);
    if (screen === SCREEN_PAUSED) pausedScreen(state, extras);
    else if (screen === SCREEN_WIN) winScreen(state, extras);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, screenToLogical, api, worldToScreen };
}
