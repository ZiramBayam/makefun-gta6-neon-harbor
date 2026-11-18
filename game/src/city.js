// The hand-built map: an eight-district street grid of neon blocks, parks and a plaza, with a
// harbor of water and piers in the south-east. Everything is generated from the seeded stream at
// boot; collision asks the grid about a point, so the rest of the game never needs the raw data.
import { PALETTE, WORLD } from './config.js';
import { chance, pick, range } from './random.js';

const FACADE = ['#202a4a', '#2a2246', '#1c3247', '#322341', '#193a3c', '#2b2f52'];
const SIGNS = ['CLUB NOVA', 'RAMEN 24', 'VOLT', 'ARCADE', 'HOTEL', 'NEON', 'SUSHI', 'DATA'];
const SIGN_COLORS = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonGold, PALETTE.neonGreen];

export function createCity(random) {
  const { cell, road, width, height } = WORLD;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const shoreX = width * 0.6;
  const shoreY = height * 0.55;

  const cells = [];
  const buildings = [];
  const trees = [];
  const piers = [
    { x: shoreX - 70, y: shoreY + 90, w: 700, h: 94, name: 'PIER 7' },
    { x: shoreX - 70, y: shoreY + 400, w: 820, h: 94, name: 'PIER 9' },
    { x: shoreX - 70, y: shoreY + 710, w: 600, h: 94, name: 'PIER 12' },
  ];
  const landmarks = [];
  const districts = [];

  function index(i, j) {
    return j * cols + i;
  }

  function centre(i, j) {
    return { x: (i + 0.5) * cell, y: (j + 0.5) * cell };
  }

  function onPier(x, y) {
    for (let k = 0; k < piers.length; k += 1) {
      const p = piers[k];
      if (x >= p.x && x <= p.x + p.w && y >= p.y - 4 && y <= p.y + p.h + 4) return true;
    }
    return false;
  }

  function inWater(x, y) {
    return x > shoreX && y > shoreY && !onPier(x, y);
  }

  function isWater(x, y) {
    return inWater(x, y);
  }

  function isRoad(x, y) {
    const cx = ((x % cell) + cell) % cell;
    const cy = ((y % cell) + cell) % cell;
    return cx < road || cy < road;
  }

  function isSolid(x, y) {
    if (x < 10 || y < 10 || x > width - 10 || y > height - 10) return true;
    if (onPier(x, y)) return false;
    if (inWater(x, y)) return true;
    const i = Math.floor(x / cell);
    const j = Math.floor(y / cell);
    if (i < 0 || j < 0 || i >= cols || j >= rows) return true;
    const c = cells[index(i, j)];
    if (!c) return true;
    for (let k = 0; k < c.buildings.length; k += 1) {
      const b = c.buildings[k];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  // Mission-critical cells are fixed so a save always points at the same streets.
  const special = new Map([
    ['3,2', 'depot'],
    ['12,4', 'plaza'],
    ['6,8', 'park'],
    ['4,11', 'garage'],
    ['10,8', 'office'],
  ]);

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const c = { i, j, type: 'normal', buildings: [], props: [] };
      const p = centre(i, j);
      const tag = special.get(`${i},${j}`);
      if (inWater(p.x, p.y) && !tag) c.type = 'water';
      else if (tag === 'plaza') c.type = 'plaza';
      else if (tag === 'park') c.type = 'park';
      else if (chance(random, 0.045) && !tag) c.type = 'park';
      cells.push(c);

      const lotX = i * cell + road;
      const lotY = j * cell + road;
      const lotW = cell - road;
      const lotH = cell - road;
      if (c.type === 'normal') {
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            if (chance(random, 0.13)) continue;
            const w = lotW / 2 - 15;
            const h = lotH / 2 - 15;
            const b = {
              x: lotX + sx * (lotW / 2) + 9,
              y: lotY + sy * (lotH / 2) + 9,
              w,
              h,
              color: pick(random, FACADE),
              seed: Math.floor(random() * 4096),
              tall: chance(random, 0.3),
              sign: chance(random, 0.3) ? pick(random, SIGNS) : null,
              signColor: pick(random, SIGN_COLORS),
            };
            buildings.push(b);
            c.buildings.push(b);
          }
        }
      } else if (c.type === 'park') {
        for (let t = 0; t < 7; t += 1) {
          const tree = {
            x: lotX + range(random, 16, lotW - 16),
            y: lotY + range(random, 16, lotH - 16),
            r: range(random, 9, 17),
            seed: Math.floor(random() * 1000),
          };
          trees.push(tree);
          c.props.push(tree);
        }
      }
    }
  }

  function addLandmark(key, label, x, y, color, kind) {
    const mark = { key, label, x, y, color, kind };
    landmarks.push(mark);
    return mark;
  }

  const depot = centre(3, 2);
  const plaza = centre(12, 4);
  const park = centre(6, 8);
  const garage = centre(4, 11);
  const office = centre(10, 8);
  addLandmark('depot', 'COURIER DEPOT', depot.x, depot.y, PALETTE.neonPink, 'depot');
  addLandmark('plaza', 'SKYLINE PLAZA', plaza.x, plaza.y, PALETTE.neonGold, 'plaza');
  addLandmark('park', 'AURORA PARK', park.x, park.y, PALETTE.neonGreen, 'park');
  addLandmark('garage', 'OLD TOWN GARAGE', garage.x, garage.y, PALETTE.neonCyan, 'garage');
  addLandmark('office', 'HARBOR OFFICE', office.x, office.y, PALETTE.neonCyan, 'office');
  addLandmark('pier', 'PIER 7', piers[0].x + piers[0].w * 0.6, piers[0].y + piers[0].h / 2, PALETTE.neonGold, 'pier');

  const districtDefs = [
    ['NEON ROW', 0, 0, 6, 5, '#ff4fa3'],
    ['VAPOR QUARTER', 6, 0, 12, 5, '#48e6ff'],
    ['SKYLINE', 12, 0, 18, 5, '#ffd45e'],
    ['OLD TOWN', 0, 5, 6, 10, '#5dffb0'],
    ['AURORA PARK', 6, 5, 12, 10, '#78ff9e'],
    ['IRONWORKS', 12, 5, 18, 10, '#ff8a5c'],
    ['COBALT DOCKS', 0, 10, 9, 14, '#4c7cff'],
    ['HARBOR POINT', 9, 10, 18, 14, '#ff4fa3'],
  ];
  for (const [name, i0, j0, i1, j1, color] of districtDefs) {
    const a = centre(i0, j0);
    const b = centre(i1 - 1, j1 - 1);
    districts.push({ name, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, color, i0, j0, i1, j1 });
  }

  /** A point on a traffic lane. Lanes stay clear of the water so traffic never drives into it. */
  function roadPoint(rng, axis) {
    const a = axis ?? (chance(rng, 0.5) ? 'h' : 'v');
    const dir = chance(rng, 0.5) ? 1 : -1;
    if (a === 'h') {
      const j = Math.floor(range(rng, 0, 7.6));
      return {
        x: dir > 0 ? 30 : width - 30,
        y: j * cell + (dir > 0 ? road * 0.3 : road * 0.7),
        angle: dir > 0 ? 0 : Math.PI,
        axis: 'h',
        dir,
      };
    }
    const i = Math.floor(range(rng, 0, 10.5));
    return {
      x: i * cell + (dir > 0 ? road * 0.3 : road * 0.7),
      y: dir > 0 ? 30 : height - 30,
      angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      axis: 'v',
      dir,
    };
  }

  /** A walkable spot on a sidewalk or a pier, for pedestrians and pickups. */
  function openPoint(rng) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const x = range(rng, 50, width - 50);
      const y = range(rng, 50, height - 50);
      if (!isSolid(x, y) && !isRoad(x, y) && !inWater(x, y)) return { x, y };
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const p = piers[Math.floor(rng() * piers.length)];
      const x = range(rng, p.x + 10, p.x + p.w - 10);
      const y = range(rng, p.y + 12, p.y + p.h - 12);
      if (!isSolid(x, y)) return { x, y };
    }
    return { x: 200, y: 200 };
  }

  function landmark(key) {
    for (let k = 0; k < landmarks.length; k += 1) if (landmarks[k].key === key) return landmarks[k];
    return landmarks[0];
  }

  return {
    width,
    height,
    cell,
    road,
    cols,
    rows,
    shoreX,
    shoreY,
    cells,
    buildings,
    trees,
    piers,
    landmarks,
    districts,
    isSolid,
    isWater,
    isRoad,
    isPier: onPier,
    roadPoint,
    openPoint,
    landmark,
  };
}
