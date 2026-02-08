// Simulation parameters
export const SIM = {
  windStrength: 50,
  turbulence: 35,
  windAngle: 0,
  stiffness: 55,
  damping: 94,
  opacity: 1.0,
  flagColor: [0.91, 0.90, 0.89],
  gravity: -3.5,
  stretch: 50,
};

// Cloth grid dimensions
export const cols = 120;
export const rows = 69;
export const totalPts = cols * rows;
export const flagW = 3.0;
export const flagH = flagW / 1.75;
export const restDx = flagW / (cols - 1);
export const restDy = flagH / (rows - 1);
export const restDiag = Math.sqrt(restDx * restDx + restDy * restDy);

// Shared mutable state
export const state = {
  viewMode: 'fullscreen',
  theme: 'dark',
};
