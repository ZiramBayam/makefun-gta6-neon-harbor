// The simulation: the player's body and car, traffic, pedestrians, bullets, damage, police, four
// linked missions and a save snapshot. There is no drawing and no browser in this module; every
// notable moment is pushed into state.events for the loop to turn into sound and announcements.
import { CAR, MISSIONS, PLAYER, WANTED, WORLD } from './config.js';
import { chance, pick, range } from './random.js';

const TAU = Math.PI * 2;
const CAR_COLORS = ['#e94f8a', '#4fd6e9', '#f2c94c', '#7ed957', '#f07f4b', '#e7ecf5', '#9b7bff'];
const PED_COLORS = ['#ff7fb0', '#6fe3ff', '#ffd166', '#8affc1', '#c7a6ff', '#ff9f68'];
const PICKUPS = ['health', 'armor', 'ammo', 'money'];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleDelta(a, b) {
  let d = (a - b + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

export function createWorld(city, random) {
  let nextId = 1;
  const state = {
    time: 0,
    money: 300,
    wanted: 0,
    wantedTimer: 0,
    panic: 0,
    player: {
      x: 0, y: 0, angle: 0, aim: 0, speed: 0,
      hp: PLAYER.hp, armor: 0, ammo: PLAYER.ammo,
      onFoot: true, car: null, invuln: 0, fireCd: 0, meleeCd: 0, headlights: true,
    },
    cars: [], peds: [], bullets: [], pickups: [], fx: [], booms: [],
    missionIndex: -1, stage: '', missionDelay: 0, hasPackage: false, won: false,
    dialogue: null, toast: null, hint: '', job: 'Free roam',
    rain: false, events: [],
    stats: { shots: 0, kills: 0, cars: 0, missions: 0, distance: 0 },
  };

  function event(type, extra) {
    state.events.push(extra ? { type, ...extra } : { type });
  }

  function fx(x, y, kind, color, count = 1, speed = 90) {
    for (let k = 0; k < count; k += 1) {
      if (state.fx.length > 320) break;
      const a = random() * TAU;
      const s = speed * (0.3 + random());
      const life = kind === 'smoke' ? 0.9 + random() : 0.25 + random() * 0.45;
      state.fx.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life, kind, color,
        size: kind === 'smoke' ? 6 + random() * 8 : 2 + random() * 3,
      });
    }
  }

  function say(who, text, seconds = 7) {
    state.dialogue = { who, text, t: seconds, max: seconds };
  }

  function toast(text, seconds = 4) {
    state.toast = { text, t: seconds, max: seconds };
  }

  function freeSpot(x, y) {
    if (!city.isSolid(x, y) && !city.isWater(x, y)) return { x, y };
    for (let r = 24; r <= 360; r += 24) {
      for (let a = 0; a < 12; a += 1) {
        const nx = x + Math.cos((a * TAU) / 12) * r;
        const ny = y + Math.sin((a * TAU) / 12) * r;
        if (!city.isSolid(nx, ny) && !city.isWater(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x: 200, y: 200 };
  }

  function makeCar(kind, x, y, extras = {}) {
    const car = {
      id: nextId++, x, y, angle: 0, speed: 0, kind, mode: kind === 'traffic' ? 'lane' : 'free',
      color: kind === 'police' ? '#dfe6f2' : pick(random, CAR_COLORS),
      health: CAR.health, dead: false, deadT: 0, controlled: false,
      missionVan: false, shotCd: range(random, 0.6, 1.8), flash: random() * TAU,
      axis: 'h', dir: 1, siren: false, ...extras,
    };
    state.cars.push(car);
    return car;
  }

  function findCar(id) {
    for (let k = 0; k < state.cars.length; k += 1) if (state.cars[k].id === id) return state.cars[k];
    return null;
  }

  function spawnTraffic(count) {
    for (let k = 0; k < count; k += 1) {
      const p = city.roadPoint(random);
      makeCar('traffic', p.x, p.y, {
        angle: p.angle, axis: p.axis, dir: p.dir,
        speed: CAR.trafficSpeed * range(random, 0.7, 1.25),
      });
    }
  }

  function spawnPeds(count) {
    for (let k = 0; k < count; k += 1) {
      const p = city.openPoint(random);
      state.peds.push({
        id: nextId++, x: p.x, y: p.y, angle: random() * TAU,
        baseSpeed: range(random, 34, 66), speed: 50, color: pick(random, PED_COLORS),
        kind: 'civilian', hostile: false, hp: 40, down: false, downT: 0,
        wander: range(random, 0.5, 3), flee: 0, shotCd: range(random, 0.5, 2),
      });
    }
  }

  function spawnPickups(count) {
    for (let k = 0; k < count; k += 1) {
      const p = city.openPoint(random);
      const kind = pick(random, PICKUPS);
      state.pickups.push({
        x: p.x, y: p.y, kind, active: true, timer: 0,
        amount: kind === 'money' ? 120 : kind === 'ammo' ? 18 : 40,
      });
    }
  }

  function spawnPolice(count) {
    for (let k = 0; k < count; k += 1) {
      const a = random() * TAU;
      const d = range(random, 420, 820);
      const p = freeSpot(state.player.x + Math.cos(a) * d, state.player.y + Math.sin(a) * d);
      const car = makeCar('police', p.x, p.y, { angle: a + Math.PI, speed: 90 });
      car.siren = true;
      event('police', { x: p.x, y: p.y });
    }
  }

  function ensurePolice() {
    const current = state.cars.filter((c) => c.kind === 'police' && !c.dead).length;
    const wanted = state.wanted > 0 ? Math.min(6, state.wanted + 1) : 0;
    if (current < wanted) spawnPolice(wanted - current);
    if (state.wanted === 0 && current > 0) {
      for (const car of state.cars) if (car.kind === 'police' && !car.dead) car.dead = true;
    }
  }

  function addWanted(n, reason) {
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.wantedTimer = WANTED.decay + state.wanted * 14;
    ensurePolice();
    toast(`${'★'.repeat(state.wanted)} WANTED — ${reason}`, 5);
    event('wanted', { n });
  }

  function setupMission(index, narrate = true) {
    if (index < 0 || index >= MISSIONS.length) return;
    state.missionIndex = index;
    state.missionDelay = 0;
    state.hasPackage = false;
    const def = MISSIONS[index];
    if (index === 0) {
      state.stage = 'pickup';
    } else if (index === 1) {
      state.stage = 'steal';
      const p = freeSpot(city.landmark('pier').x, city.landmark('pier').y);
      makeCar('van', p.x, p.y, { color: '#e8eef7', missionVan: true, angle: 0 });
    } else if (index === 2) {
      state.stage = 'find';
      const park = city.landmark('park');
      const p = freeSpot(park.x + 150, park.y - 100);
      state.peds.push({
        id: nextId++, x: p.x, y: p.y, angle: 1.2, baseSpeed: 90, speed: 90,
        color: '#ffd45e', kind: 'runner', hostile: false, hp: 80, down: false, downT: 0,
        wander: 1, flee: 0, shotCd: 99,
      });
    } else if (index === 3) {
      state.stage = 'fight';
      const plaza = city.landmark('plaza');
      const spots = [[-110, -90], [110, -90], [-110, 105], [110, 105]];
      for (const [dx, dy] of spots) {
        const p = freeSpot(plaza.x + dx, plaza.y + dy);
        state.peds.push({
          id: nextId++, x: p.x, y: p.y, angle: random() * TAU, baseSpeed: 70, speed: 0,
          color: '#ff4d5e', kind: 'gangster', hostile: true, hp: 60, down: false, downT: 0,
          wander: 1, flee: 0, shotCd: range(random, 0.8, 2),
        });
      }
    }
    if (narrate) {
      say(def.speaker, def.brief, 10);
      toast(`NEW JOB ${index + 1}/4 · ${def.title}`, 5);
      event('mission', { index });
    }
  }

  function startNextMission() {
    const next = state.missionIndex + 1;
    if (next < MISSIONS.length) setupMission(next, true);
    else if (!state.won) {
      state.won = true;
      event('win');
    }
  }

  function completeMission() {
    if (state.missionDelay > 0 || state.won) return;
    const def = MISSIONS[state.missionIndex];
    if (!def) return;
    state.money += def.reward;
    state.stats.missions += 1;
    state.missionDelay = 2.4;
    toast(`JOB COMPLETE  +$${def.reward}`, 6);
    if (state.missionIndex === MISSIONS.length - 1) {
      say('Vera', 'The harbor is ours. Get out of town before the sirens catch up.', 10);
      state.won = true;
      event('win');
    } else {
      say('Vera', 'Clean work. I have another job lined up — follow the gold.', 7);
      event('missionComplete');
    }
  }

  function objective() {
    if (state.missionIndex < 0 || state.won || state.missionDelay > 0) return null;
    if (state.missionIndex === 0) {
      const m = city.landmark(state.stage === 'pickup' ? 'depot' : 'plaza');
      return {
        x: m.x, y: m.y, radius: 78,
        label: state.stage === 'pickup' ? 'PICK UP THE PACKAGE' : 'DELIVER TO SKYLINE PLAZA',
        kind: 'walk',
      };
    }
    if (state.missionIndex === 1) {
      if (state.stage === 'steal') {
        for (const car of state.cars) {
          if (car.missionVan && !car.dead) {
            return { x: car.x, y: car.y, radius: 84, label: 'STEAL THE HARBOR VAN', kind: 'car' };
          }
        }
      }
      const g = city.landmark('garage');
      return { x: g.x, y: g.y, radius: 86, label: 'PARK THE VAN IN THE GARAGE', kind: 'car' };
    }
    if (state.missionIndex === 2) {
      for (const ped of state.peds) {
        if (ped.kind === 'runner' && !ped.down) {
          return {
            x: ped.x, y: ped.y, radius: state.stage === 'find' ? 175 : 80,
            label: state.stage === 'find' ? 'FIND THE RUNNER' : 'TAKE DOWN THE RUNNER',
            kind: 'runner',
          };
        }
      }
      return null;
    }
    if (state.missionIndex === 3) {
      const m = city.landmark('plaza');
      return {
        x: m.x, y: m.y, radius: state.stage === 'fight' ? 130 : 72,
        label: state.stage === 'fight' ? 'CLEAR SKYLINE PLAZA' : 'MEET VERA AT THE FOUNTAIN',
        kind: 'fight',
      };
    }
    return null;
  }

  function hurtPlayer(amount) {
    const p = state.player;
    if (p.invuln > 0) return;
    p.invuln = 0.75;
    let left = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, left);
      p.armor -= absorbed;
      left -= absorbed;
    }
    p.hp -= left;
    fx(p.x, p.y, 'spark', '#ff4d5e', 8);
    event('hurt', { x: p.x, y: p.y });
    if (p.hp <= 0) {
      const payer = Math.min(state.money, PLAYER.respawnCost);
      state.money -= payer;
      state.wanted = 0;
      ensurePolice();
      p.hp = PLAYER.hp;
      p.armor = 0;
      p.ammo = Math.max(18, p.ammo);
      p.onFoot = true;
      p.car = null;
      const spot = freeSpot(city.landmark('office').x, city.landmark('office').y);
      p.x = spot.x;
      p.y = spot.y;
      say('Paramedic', 'Easy. The hospital took two hundred dollars and your gun smoke is gone.', 7);
      toast(`HOSPITAL  -$${payer}`, 5);
      event('hurt');
    }
  }

  function damagePed(ped, amount) {
    if (ped.down) return;
    ped.hp -= amount;
    ped.flee = 5;
    fx(ped.x, ped.y, 'spark', '#ffd45e', 5);
    event('hit', { x: ped.x, y: ped.y });
    if (ped.hp > 0) return;
    ped.down = true;
    ped.downT = 0;
    state.stats.kills += 1;
    event('pedDown', { x: ped.x, y: ped.y });
    if (ped.kind === 'runner' && state.missionIndex === 2 && state.stage !== 'done') {
      state.stage = 'done';
      completeMission();
    }
    if (ped.kind === 'gangster' && state.missionIndex === 3 && state.stage === 'fight') {
      let left = 0;
      for (const other of state.peds) if (other.kind === 'gangster' && !other.down) left += 1;
      if (left === 0) {
        state.stage = 'finish';
        say('Vera', 'They are down! Get to the fountain — quick!', 7);
        toast('PLAZA CLEAR — REACH THE FOUNTAIN', 5);
        event('missionStep');
      }
    }
  }

  function explodeCar(car) {
    if (car.dead) return;
    car.dead = true;
    car.deadT = 0;
    car.speed = 0;
    state.booms.push({ x: car.x, y: car.y, t: 0, max: 0.9, r: 140 });
    fx(car.x, car.y, 'fire', '#ffb347', 26, 180);
    fx(car.x, car.y, 'smoke', '#576173', 18, 110);
    event('explosion', { x: car.x, y: car.y });
    for (const ped of state.peds) {
      if (!ped.down && distance(ped.x, ped.y, car.x, car.y) < 120) damagePed(ped, 55);
    }
    for (const other of state.cars) {
      if (other !== car && !other.dead && distance(other.x, other.y, car.x, car.y) < 145) {
        other.health -= 45;
        if (other.health <= 0) explodeCar(other);
      }
    }
    if (distance(state.player.x, state.player.y, car.x, car.y) < 120) hurtPlayer(24);
    if (state.player.car === car.id) {
      state.player.car = null;
      state.player.onFoot = true;
      const spot = freeSpot(car.x + 60, car.y + 60);
      state.player.x = spot.x;
      state.player.y = spot.y;
    }
  }

  function damageCar(car, amount) {
    if (car.dead) return;
    car.health -= amount;
    fx(car.x, car.y, 'spark', '#9fe8ff', 3, 70);
    if (car.health <= 0) {
      state.stats.cars += 1;
      explodeCar(car);
      if (state.wanted === 0) addWanted(1, 'witnessed a crash');
    }
  }

  function fire(x, y) {
    const p = state.player;
    if (p.fireCd > 0) return;
    if (p.ammo <= 0) {
      toast('OUT OF AMMO — LOOK FOR AN AMMO PICKUP', 2.5);
      p.fireCd = 0.4;
      return;
    }
    p.fireCd = PLAYER.fireDelay;
    p.ammo -= 1;
    state.stats.shots += 1;
    state.panic = 3;
    const car = p.onFoot ? null : findCar(p.car);
    const ox = car ? car.x : p.x;
    const oy = car ? car.y : p.y;
    let angle = Math.atan2(y - oy, x - ox);
    if (car) angle += range(random, -0.07, 0.07);
    p.aim = angle;
    const sx = ox + Math.cos(angle) * 20;
    const sy = oy + Math.sin(angle) * 20;
    state.bullets.push({
      x: sx, y: sy, vx: Math.cos(angle) * 980, vy: Math.sin(angle) * 980,
      life: 1.05, from: 'player', damage: 27,
    });
    fx(sx, sy, 'flash', '#ffd45e', 3, 80);
    event('shoot', { x: sx, y: sy });
    if (state.wanted === 0 && chance(random, 0.16)) addWanted(1, 'shot fired');
    for (const ped of state.peds) {
      if (!ped.down && distance(ped.x, ped.y, p.x, p.y) < 300) ped.flee = 5;
    }
  }

  function melee() {
    const p = state.player;
    if (p.meleeCd > 0 || !p.onFoot) return;
    p.meleeCd = PLAYER.meleeDelay;
    let landed = false;
    for (const ped of state.peds) {
      if (ped.down) continue;
      const d = distance(ped.x, ped.y, p.x, p.y);
      if (d > PLAYER.meleeRange) continue;
      const a = Math.atan2(ped.y - p.y, ped.x - p.x);
      if (Math.abs(angleDelta(a, p.aim)) > 1.2) continue;
      damagePed(ped, ped.kind === 'runner' ? 55 : 45);
      landed = true;
    }
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = distance(car.x, car.y, p.x, p.y);
      if (d < CAR.radius + PLAYER.meleeRange * 0.6 && Math.abs(angleDelta(Math.atan2(car.y - p.y, car.x - p.x), p.aim)) < 1) {
        damageCar(car, 12);
        landed = true;
      }
    }
    fx(p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30, 'spark', landed ? '#ffd45e' : '#8fa2c0', landed ? 8 : 3, 110);
    event('melee', { x: p.x, y: p.y });
  }

  function exitSpot(car) {
    for (const side of [-1, 1]) {
      const x = car.x + Math.cos(car.angle + side * Math.PI / 2) * 46;
      const y = car.y + Math.sin(car.angle + side * Math.PI / 2) * 46;
      if (!city.isSolid(x, y)) return { x, y };
    }
    return freeSpot(car.x + 50, car.y);
  }

  function tryEnter() {
    const p = state.player;
    if (!p.onFoot && p.car) {
      const car = findCar(p.car);
      if (!car) {
        p.onFoot = true;
        p.car = null;
        return;
      }
      const spot = exitSpot(car);
      p.x = spot.x;
      p.y = spot.y;
      p.onFoot = true;
      p.car = null;
      p.angle = car.angle;
      car.speed = 0;
      car.controlled = false;
      event('exit', { x: p.x, y: p.y });
      return;
    }
    let best = null;
    let bestD = 82;
    for (const car of state.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = distance(p.x, p.y, car.x, car.y);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (!best) {
      toast('NO VEHICLE IN REACH', 2);
      return;
    }
    p.onFoot = false;
    p.car = best.id;
    p.angle = best.angle;
    best.controlled = true;
    best.speed = 0;
    best.health = Math.max(best.health, 40);
    event('enter', { x: best.x, y: best.y });
    if (best.missionVan && state.missionIndex === 1 && state.stage === 'steal') {
      state.stage = 'deliver';
      say('Vera', 'Van is yours. Take it to the Old Town garage and leave the keys in the ignition.', 8);
      toast('VAN SECURED — DRIVE TO THE GARAGE', 5);
      event('missionStep');
    } else {
      toast('CARJACKED — W A S D TO DRIVE', 3);
    }
  }

  function updatePlayerCar(car, input, dt) {
    const p = state.player;
    const throttle = -input.y;
    if (throttle > 0) car.speed += CAR.accel * dt * throttle;
    else if (throttle < 0) car.speed -= CAR.brake * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.friction * dt);
    const top = car.missionVan ? CAR.vanSpeed : CAR.maxSpeed;
    car.speed = clamp(car.speed, -120, top);
    const grip = Math.min(1, Math.abs(car.speed) / 100);
    const steer = input.handbrake ? 1.45 : 1;
    car.angle += input.x * CAR.turn * dt * grip * steer * (car.speed < -1 ? -1 : 1);
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    if (city.isSolid(car.x + dx, car.y)) {
      const impact = Math.abs(car.speed);
      car.speed *= -0.22;
      if (impact > 130) damageCar(car, impact * 0.09);
      fx(car.x, car.y, 'spark', '#ffd45e', 5);
    } else car.x += dx;
    if (city.isSolid(car.x, car.y + dy)) {
      const impact = Math.abs(car.speed);
      car.speed *= -0.22;
      if (impact > 130) damageCar(car, impact * 0.09);
      fx(car.x, car.y, 'spark', '#ffd45e', 5);
    } else car.y += dy;
    car.x = clamp(car.x, 20, WORLD.width - 20);
    car.y = clamp(car.y, 20, WORLD.height - 20);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = Math.abs(car.speed);
    state.stats.distance += Math.abs(car.speed) * dt;
    if (Math.abs(car.speed) > 150 && chance(random, 0.09)) {
      fx(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 'smoke', '#5c6478', 1, 25);
    }
  }

  function updatePolice(car, dt) {
    const p = state.player;
    const desired = Math.atan2(p.y - car.y, p.x - car.x);
    const turn = clamp(angleDelta(desired, car.angle), -CAR.turn * dt, CAR.turn * dt);
    car.angle += turn;
    car.flash += dt * 9;
    car.speed = Math.min(CAR.policeSpeed, car.speed + 200 * dt);
    const dx = Math.cos(car.angle) * car.speed * dt;
    const dy = Math.sin(car.angle) * car.speed * dt;
    if (!city.isSolid(car.x + dx, car.y)) car.x += dx;
    else {
      car.angle += 0.7;
      car.speed *= 0.55;
    }
    if (!city.isSolid(car.x, car.y + dy)) car.y += dy;
    else {
      car.angle += 0.7;
      car.speed *= 0.55;
    }
    const d = distance(car.x, car.y, p.x, p.y);
    car.shotCd -= dt;
    if (state.wanted >= 3 && d < 360 && d > 55 && car.shotCd <= 0) {
      car.shotCd = range(random, 0.9, 1.9);
      const a = Math.atan2(p.y - car.y, p.x - car.x) + range(random, -0.12, 0.12);
      state.bullets.push({
        x: car.x + Math.cos(a) * 24, y: car.y + Math.sin(a) * 24,
        vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, life: 0.8, from: 'enemy', damage: 9,
      });
      event('shoot', { x: car.x, y: car.y });
    }
    if (d < 36 && p.invuln <= 0) hurtPlayer(11);
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) {
        ped.downT += dt;
        continue;
      }
      ped.wander -= dt;
      if (ped.wander <= 0) {
        ped.wander = range(random, 1.2, 4);
        ped.angle += range(random, -1.3, 1.3);
      }
      const d = distance(ped.x, ped.y, p.x, p.y);
      ped.flee = Math.max(0, ped.flee - dt);
      if (ped.kind === 'runner') {
        if (d < 320) {
          ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
          ped.speed = d < 90 ? 145 : 118;
        } else ped.speed = ped.baseSpeed;
      } else if (ped.hostile) {
        ped.shotCd -= dt;
        if (d < 430) {
          ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
          ped.speed = d < 180 ? 40 : 68;
          if (d < 340 && ped.shotCd <= 0) {
            ped.shotCd = range(random, 0.9, 1.8);
            const a = Math.atan2(p.y - ped.y, p.x - ped.x) + range(random, -0.1, 0.1);
            state.bullets.push({
              x: ped.x + Math.cos(a) * 14, y: ped.y + Math.sin(a) * 14,
              vx: Math.cos(a) * 690, vy: Math.sin(a) * 690, life: 0.8, from: 'enemy', damage: 8,
            });
            event('shoot', { x: ped.x, y: ped.y });
            state.panic = 2;
          }
        } else ped.speed = ped.baseSpeed;
      } else if (state.panic > 0 && d < 290) {
        ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
        ped.speed = 108;
      } else {
        ped.speed = ped.baseSpeed;
      }
      const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      if (city.isSolid(nx, ped.y)) ped.angle += 1.9;
      else ped.x = nx;
      if (city.isSolid(ped.x, ny)) ped.angle += 1.9;
      else ped.y = ny;
      if (d < 30 && ped.kind === 'civilian' && state.wanted > 2 && p.invuln <= 0) hurtPlayer(3);
    }
  }

  function updateBullets(dt) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let spent = b.life <= 0;
      if (!spent && city.isSolid(b.x, b.y)) {
        fx(b.x, b.y, 'spark', '#ffd45e', 3, 60);
        spent = true;
      }
      if (!spent && b.from === 'player') {
        for (const ped of state.peds) {
          if (!ped.down && distance(ped.x, ped.y, b.x, b.y) < 13) {
            damagePed(ped, b.damage);
            spent = true;
            break;
          }
        }
        if (!spent) {
          for (const car of state.cars) {
            if (!car.dead && distance(car.x, car.y, b.x, b.y) < CAR.radius) {
              damageCar(car, b.damage);
              spent = true;
              break;
            }
          }
        }
      } else if (!spent && distance(p.x, p.y, b.x, b.y) < (p.onFoot ? 16 : 25)) {
        hurtPlayer(b.damage);
        spent = true;
      }
      if (spent) state.bullets.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = state.player;
    for (const pk of state.pickups) {
      if (!pk.active) {
        pk.timer -= dt;
        if (pk.timer <= 0) pk.active = true;
        continue;
      }
      if (distance(p.x, p.y, pk.x, pk.y) > 30) continue;
      pk.active = false;
      pk.timer = range(random, 18, 32);
      if (pk.kind === 'health') {
        p.hp = Math.min(PLAYER.hp, p.hp + pk.amount);
        toast(`+${pk.amount} HEALTH`, 2);
      } else if (pk.kind === 'armor') {
        p.armor = Math.min(PLAYER.armor, p.armor + pk.amount);
        toast(`+${pk.amount} ARMOR`, 2);
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        toast(`+${pk.amount} AMMO`, 2);
      } else {
        state.money += pk.amount;
        toast(`+$${pk.amount}`, 2);
      }
      event('pickup', { x: pk.x, y: pk.y });
    }
  }

  function checkMission() {
    if (state.missionDelay > 0 || state.won || state.missionIndex < 0) return;
    const goal = objective();
    if (!goal) return;
    const p = state.player;
    const d = distance(p.x, p.y, goal.x, goal.y);
    if (state.missionIndex === 0 && d < goal.radius) {
      if (state.stage === 'pickup') {
        state.stage = 'deliver';
        state.hasPackage = true;
        say('Vera', 'Package in hand. Skyline Plaza — and try not to attract the patrols.', 7);
        toast('PACKAGE SECURED — DELIVER IT TO SKYLINE PLAZA', 5);
        event('missionStep');
      } else if (state.stage === 'deliver') completeMission();
    } else if (state.missionIndex === 1 && state.stage === 'deliver' && d < goal.radius && !p.onFoot && p.car) {
      const car = findCar(p.car);
      if (car && car.missionVan) completeMission();
    } else if (state.missionIndex === 2 && state.stage === 'find' && d < goal.radius) {
      state.stage = 'catch';
      say('Milo', 'That is him! Do not let him reach the docks — take him down!', 7);
      toast('TAKE DOWN THE RUNNER', 5);
      event('missionStep');
    } else if (state.missionIndex === 3 && state.stage === 'finish' && d < goal.radius) {
      completeMission();
    }
  }

  function updateHint() {
    const p = state.player;
    const goal = objective();
    let hint = 'WASD move · Shift sprint · E carjack · click fire · J melee · F handbrake';
    if (goal) {
      const d = distance(p.x, p.y, goal.x, goal.y);
      hint = d < goal.radius + 130 ? goal.label.toLowerCase() : `Follow the gold marker · ${goal.label.toLowerCase()}`;
      if (state.missionIndex === 1 && state.stage === 'steal' && d < 130) hint = 'Press E to steal the harbor van';
      if (state.missionIndex === 2 && state.stage === 'catch' && d < 150) hint = 'Click to shoot or press J to melee';
      if (state.missionIndex === 3 && state.stage === 'fight') hint = 'Clear the plaza · click to shoot, J to melee';
    }
    if (p.onFoot && hint.indexOf('press E') < 0) {
      for (const car of state.cars) {
        if (car.dead || car.kind === 'police') continue;
        if (distance(p.x, p.y, car.x, car.y) < 78) {
          hint = 'Press E to steal this car';
          break;
        }
      }
    }
    state.hint = hint;
  }

  function step(dt, input) {
    const p = state.player;
    state.time += dt;
    state.panic = Math.max(0, state.panic - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.meleeCd = Math.max(0, p.meleeCd - dt);
    if (state.dialogue) {
      state.dialogue.t -= dt;
      if (state.dialogue.t <= 0) state.dialogue = null;
    }
    if (state.toast) {
      state.toast.t -= dt;
      if (state.toast.t <= 0) state.toast = null;
    }
    if (state.missionDelay > 0) {
      state.missionDelay -= dt;
      if (state.missionDelay <= 0) startNextMission();
    }
    if (state.wantedTimer > 0) {
      state.wantedTimer -= dt;
      if (state.wantedTimer <= 0 && state.wanted > 0) {
        state.wanted -= 1;
        state.wantedTimer = 16;
        event('wantedDown');
      }
    }
    ensurePolice();

    const mx = input.x || 0;
    const my = input.y || 0;
    const len = Math.hypot(mx, my);
    if (p.onFoot) {
      const speed = PLAYER.walk * (input.sprint ? PLAYER.sprint : 1);
      const ux = len > 1 ? mx / len : mx;
      const uy = len > 1 ? my / len : my;
      if (!city.isSolid(p.x + ux * speed * dt, p.y)) p.x += ux * speed * dt;
      if (!city.isSolid(p.x, p.y + uy * speed * dt)) p.y += uy * speed * dt;
      if (len > 0.05) p.angle = Math.atan2(uy, ux);
      p.speed = len > 0 ? speed : 0;
      state.stats.distance += p.speed * dt;
    } else {
      const car = findCar(p.car);
      if (car) updatePlayerCar(car, { x: mx, y: my, handbrake: input.handbrake }, dt);
      else {
        p.onFoot = true;
        p.car = null;
      }
    }

    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.dead) {
        car.deadT += dt;
        if (car.deadT > 7) state.cars.splice(i, 1);
        continue;
      }
      if (car.controlled) continue;
      if (car.mode === 'lane') {
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        if (car.x < -60 || car.x > WORLD.width + 60 || car.y < -60 || car.y > WORLD.height + 60) {
          const p2 = city.roadPoint(random, car.axis);
          car.x = p2.x;
          car.y = p2.y;
          car.angle = p2.angle;
          car.dir = p2.dir;
        }
      } else if (car.kind === 'police') updatePolice(car, dt);
      else car.speed *= 1 - Math.min(1, dt * 2);
    }

    updatePeds(dt);
    updateBullets(dt);
    updatePickups(dt);
    checkMission();

    for (let i = state.fx.length - 1; i >= 0; i -= 1) {
      const f = state.fx[i];
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 1 - dt * 2;
      f.vy *= 1 - dt * 2;
      f.life -= dt;
      if (f.life <= 0) state.fx.splice(i, 1);
    }
    for (let i = state.booms.length - 1; i >= 0; i -= 1) {
      state.booms[i].t += dt;
      if (state.booms[i].t >= state.booms[i].max) state.booms.splice(i, 1);
    }

    const goal = objective();
    let job = 'Free roam';
    if (goal && state.missionIndex >= 0) {
      job = `${state.missionIndex + 1}/4 ${MISSIONS[state.missionIndex].title} · ${goal.label}`;
    } else if (state.missionDelay > 0) job = 'Job complete · get ready';
    if (job !== state.job) state.job = job;
    updateHint();
  }

  function snapshot() {
    const p = state.player;
    const car = p.car ? findCar(p.car) : null;
    return {
      v: 1,
      x: p.x, y: p.y, angle: p.angle, aim: p.aim, hp: p.hp, armor: p.armor, ammo: p.ammo,
      onFoot: p.onFoot, money: state.money, wanted: state.wanted, time: state.time, rain: state.rain,
      missionIndex: state.missionIndex, stage: state.stage,
      car: car ? { x: car.x, y: car.y, angle: car.angle, missionVan: car.missionVan } : null,
      runner: (() => {
        for (const ped of state.peds) if (ped.kind === 'runner') return { x: ped.x, y: ped.y, down: ped.down };
        return null;
      })(),
      gangsters: state.peds.filter((ped) => ped.kind === 'gangster').map((ped) => ({ x: ped.x, y: ped.y, down: ped.down })),
      stats: { ...state.stats },
    };
  }

  function restore(data) {
    if (!data || data.v !== 1) return false;
    reset();
    const p = state.player;
    p.x = Number(data.x) || p.x;
    p.y = Number(data.y) || p.y;
    p.angle = Number(data.angle) || 0;
    p.aim = Number(data.aim) || 0;
    p.hp = clamp(Number(data.hp) || PLAYER.hp, 1, PLAYER.hp);
    p.armor = clamp(Number(data.armor) || 0, 0, PLAYER.armor);
    p.ammo = Number(data.ammo) || PLAYER.ammo;
    p.onFoot = data.onFoot !== false;
    state.money = Number(data.money) || 0;
    state.wanted = clamp(Number(data.wanted) || 0, 0, WANTED.max);
    state.wantedTimer = state.wanted > 0 ? 40 : 0;
    state.time = Number(data.time) || 0;
    state.rain = !!data.rain;
    state.stats = { ...state.stats, ...(data.stats || {}) };

    if (Number.isInteger(data.missionIndex) && data.missionIndex >= 0 && data.missionIndex < MISSIONS.length) {
      setupMission(data.missionIndex, false);
      state.stage = data.stage || state.stage;
      if (data.missionIndex === 1) {
        const vans = state.cars.filter((car) => car.missionVan);
        if (data.car && data.car.missionVan) {
          const v = vans[0];
          if (v) {
            v.x = data.car.x;
            v.y = data.car.y;
            v.angle = data.car.angle || 0;
          }
        } else {
          for (const v of vans) v.dead = true;
        }
      }
      if (data.runner) {
        for (const ped of state.peds) {
          if (ped.kind === 'runner') {
            ped.x = data.runner.x;
            ped.y = data.runner.y;
            ped.down = !!data.runner.down;
          }
        }
      }
      if (Array.isArray(data.gangsters)) {
        const gang = state.peds.filter((ped) => ped.kind === 'gangster');
        data.gangsters.forEach((g, i) => {
          if (gang[i]) {
            gang[i].x = g.x;
            gang[i].y = g.y;
            gang[i].down = !!g.down;
          }
        });
      }
      if (state.stage === 'done') completeMission();
    }
    if (data.car && !p.onFoot) {
      const car = makeCar(data.car.missionVan ? 'van' : 'traffic', data.car.x, data.car.y, {
        angle: data.car.angle || 0, missionVan: !!data.car.missionVan, controlled: true,
        color: data.car.missionVan ? '#e8eef7' : pick(random, CAR_COLORS),
      });
      p.car = car.id;
      p.x = car.x;
      p.y = car.y;
    } else {
      p.onFoot = true;
      p.car = null;
    }
    ensurePolice();
    say('Vera', 'Welcome back. The gold marker still knows where to go.', 6);
    toast('SAVE LOADED', 4);
    event('load');
    return true;
  }

  function reset() {
    state.time = 0;
    state.money = 300;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.panic = 0;
    state.won = false;
    state.missionIndex = -1;
    state.stage = '';
    state.missionDelay = 0;
    state.hasPackage = false;
    state.dialogue = null;
    state.toast = null;
    state.hint = '';
    state.job = 'Free roam';
    state.events.length = 0;
    state.cars.length = 0;
    state.peds.length = 0;
    state.bullets.length = 0;
    state.pickups.length = 0;
    state.fx.length = 0;
    state.booms.length = 0;
    state.stats = { shots: 0, kills: 0, cars: 0, missions: 0, distance: 0 };
    nextId = 1;
    const p = state.player;
    const depot = city.landmark('depot');
    const start = freeSpot(depot.x + 160, depot.y + 120);
    p.x = start.x;
    p.y = start.y;
    p.angle = 0;
    p.aim = 0;
    p.speed = 0;
    p.hp = PLAYER.hp;
    p.armor = 0;
    p.ammo = PLAYER.ammo;
    p.onFoot = true;
    p.car = null;
    p.invuln = 0;
    p.fireCd = 0;
    p.meleeCd = 0;
    p.headlights = true;
    spawnTraffic(28);
    spawnPeds(72);
    spawnPickups(28);
  }

  reset();
  return {
    state, reset, step, fire, melee, tryEnter, objective, startNextMission,
    addWanted, snapshot, restore,
  };
}
