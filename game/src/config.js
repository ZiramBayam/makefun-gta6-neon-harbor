// Neon Harbor: every tuning number, colour and mission brief lives here. The renderer works in a
// fixed 1280x720 logical view; the simulation is a fixed 1/60 second step whatever the display does.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
/** One deterministic city for every visit; ?seed=N overrides it for experiments. */
export const DEFAULT_SEED = 0x4e484252; // "NHBR"

export const WORLD = {
  width: 5760,
  height: 4480,
  cell: 320, // a block plus one road, repeated across the map
  road: 88,
};

export const PLAYER = {
  radius: 13,
  walk: 215,
  sprint: 1.65,
  hp: 100,
  armor: 100,
  ammo: 36,
  fireDelay: 0.16,
  meleeDelay: 0.42,
  meleeRange: 54,
  respawnCost: 200,
};

export const CAR = {
  maxSpeed: 360,
  policeSpeed: 330,
  trafficSpeed: 150,
  vanSpeed: 300,
  accel: 280,
  brake: 440,
  friction: 140,
  turn: 2.9,
  radius: 23,
  health: 100,
};

export const WANTED = { max: 5, decay: 24 };

export const MISSIONS = [
  {
    title: 'Courier Run',
    speaker: 'Vera',
    brief: 'The package is at the Neon Row depot. Take it to Skyline Plaza, and keep off the main road.',
    reward: 250,
  },
  {
    title: 'Harbor Job',
    speaker: 'Vera',
    brief: 'A white van is waiting on Pier 7. Steal it and park it in the Old Town garage.',
    reward: 500,
  },
  {
    title: 'The Runner',
    speaker: 'Milo',
    brief: 'He is loose near Aurora Park. Find the runner and bring him down before he reaches the docks.',
    reward: 750,
  },
  {
    title: 'Plaza Standoff',
    speaker: 'Vera',
    brief: 'Four of them are holding Skyline Plaza. Clear them out, then meet me at the fountain.',
    reward: 1500,
  },
];

export const PALETTE = {
  backdrop: '#070912',
  asphalt: '#121725',
  road: '#1b2233',
  lane: '#3a4761',
  sidewalk: '#283148',
  water: '#0b2540',
  waterLine: '#155078',
  park: '#14342e',
  tree: '#2c7a5b',
  building: '#1d2440',
  buildingAlt: '#272246',
  neonPink: '#ff4fa3',
  neonCyan: '#48e6ff',
  neonGold: '#ffd45e',
  neonGreen: '#5dffb0',
  policeRed: '#ff4d5e',
  policeBlue: '#4c7cff',
  text: '#eaf3ff',
  muted: '#8494b0',
  panel: 'rgba(9, 14, 28, 0.86)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
/** The only key this game touches in browser storage. */
export const SAVE_KEY = 'neon-harbor.save.v1';
