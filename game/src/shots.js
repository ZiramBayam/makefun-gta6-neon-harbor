// Stage helpers for the recorded screenshots. F3 jumps the player close to the current job but
// always stays outside its gold marker's radius, so the objective stays visible in the frame.
import { WORLD } from './config.js';

const TAU = Math.PI * 2;

function free(city, x, y) {
  return x > 30 && y > 30 && x < WORLD.width - 30 && y < WORLD.height - 30 && !city.isSolid(x, y) && !city.isWater(x, y);
}

export function nearObjective(goal, city, player) {
  if (!goal) return null;
  const facing = Math.atan2(player.y - goal.y, player.x - goal.x);
  for (const extra of [190, 290, 410]) {
    const radius = goal.radius + extra;
    for (let k = 0; k < 16; k += 1) {
      const angle = facing + (k * TAU) / 16;
      const x = goal.x + Math.cos(angle) * radius;
      const y = goal.y + Math.sin(angle) * radius;
      if (free(city, x, y)) return { x, y, angle: angle + Math.PI };
    }
  }
  return { x: goal.x + goal.radius + 200, y: goal.y, angle: Math.PI };
}

export function sceneName(screen) {
  return screen === 'title' ? 'start' : screen === 'paused' ? 'pause' : screen === 'win' ? 'win' : 'play';
}
