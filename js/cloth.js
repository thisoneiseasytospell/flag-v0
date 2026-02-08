import {
  SIM, cols, rows, totalPts,
  flagW, flagH, restDx, restDy, restDiag, state,
} from './config.js';

// ─── Particle arrays ────────────────────────────────────────────
export const pos = new Float32Array(totalPts * 3);
export const prev = new Float32Array(totalPts * 3);
export const nrm = new Float32Array(totalPts * 3);
export const uv = new Float32Array(totalPts * 2);
export const fixed = new Uint8Array(totalPts);

for (let i = 0; i < totalPts; i++) {
  fixed[i] = (i % cols === 0) ? 1 : 0;
}

export function initCloth() {
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const i3 = idx * 3;
      const x = (i / (cols - 1)) * flagW;
      const y = -(j / (rows - 1)) * flagH + flagH * 0.5;
      pos[i3] = prev[i3] = x;
      pos[i3 + 1] = prev[i3 + 1] = y;
      pos[i3 + 2] = prev[i3 + 2] = 0;
      uv[idx * 2] = i / (cols - 1);
      uv[idx * 2 + 1] = j / (rows - 1);
    }
  }
}
initCloth();

// ─── Triangle indices ───────────────────────────────────────────
const triIdx = [];
for (let j = 0; j < rows - 1; j++) {
  for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i;
    triIdx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
  }
}
export const indexData = new Uint32Array(triIdx);

// ─── Constraints (struct-of-arrays for performance) ─────────────
const cA = [], cB = [], cR = [];
function addC(a, b, r) { cA.push(a); cB.push(b); cR.push(r); }

for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    const idx = j * cols + i;
    if (i < cols - 1) addC(idx, idx + 1, restDx);
    if (j < rows - 1) addC(idx, idx + cols, restDy);
    if (i < cols - 1 && j < rows - 1) {
      addC(idx, idx + cols + 1, restDiag);
      addC(idx + 1, idx + cols, restDiag);
    }
    if (i < cols - 2) addC(idx, idx + 2, restDx * 2);
    if (j < rows - 2) addC(idx, idx + cols * 2, restDy * 2);
  }
}

const numC = cA.length;
const conA = new Uint32Array(cA);
const conB = new Uint32Array(cB);
const conR = new Float32Array(cR);

// ─── Wind gust system ───────────────────────────────────────────
// Moving blobs of wind that drift across the flag surface.
// Each gust has a position in UV space, velocity, radius, and force.
// This creates organic, non-periodic large-scale turbulence.
const NUM_GUSTS = 10;
const gusts = [];

function initGusts() {
  gusts.length = 0;
  for (let i = 0; i < NUM_GUSTS; i++) {
    gusts.push({
      x: Math.random() * 1.4 - 0.2,
      y: Math.random() * 1.4 - 0.2,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.12,
      r: 0.15 + Math.random() * 0.35,
      sx: (Math.random() - 0.5) * 2.0,
      sz: (Math.random() - 0.5) * 2.0,
    });
  }
}
initGusts();

function updateGusts(dt) {
  for (const g of gusts) {
    // Drift position
    g.x += g.vx * dt;
    g.y += g.vy * dt;

    // Wrap around with margin so gusts re-enter smoothly
    if (g.x < -0.5) g.x += 2.0;
    if (g.x > 1.5) g.x -= 2.0;
    if (g.y < -0.5) g.y += 2.0;
    if (g.y > 1.5) g.y -= 2.0;

    // Random walk on velocity (smooth acceleration changes)
    g.vx += (Math.random() - 0.5) * dt * 0.6;
    g.vy += (Math.random() - 0.5) * dt * 0.4;
    g.vx *= 0.995;
    g.vy *= 0.995;

    // Random walk on strength (slow evolving push direction)
    g.sx += (Math.random() - 0.5) * dt * 3.0;
    g.sz += (Math.random() - 0.5) * dt * 3.0;
    g.sx *= 0.99;
    g.sz *= 0.99;
  }
}

// ─── Physics simulation ─────────────────────────────────────────
let time = 0;
const SUBSTEPS = 3;

export function simulate(frameDt) {
  const dt = Math.min(Math.max(frameDt, 0.006), 0.02);

  // Update gust blobs once per frame (not per substep)
  updateGusts(dt);

  const subDt = dt / SUBSTEPS;

  for (let s = 0; s < SUBSTEPS; s++) {
    const dt2 = subDt * subDt;
    const damp = Math.pow(SIM.damping / 100, subDt * 60);
    const windNorm = SIM.windStrength / 100;
    const windBase = windNorm * windNorm * 30.0;
    const turbAmt = SIM.turbulence / 100;
    const aRad = SIM.windAngle * Math.PI / 180;
    const wdx = Math.sin(aRad), wdz = Math.cos(aRad);
    // Softer constraints = more wrinkles (silk-like drape)
    const iterations = Math.floor(SIM.stiffness / 100 * 3) + 3;

    time += subDt;

    // Stadium: figure-8 pinned column sweep
    if (state.viewMode === 'stadium') {
      for (let j = 0; j < rows; j++) {
        const p = j * cols;
        const i3 = p * 3;
        const restY = -(j / (rows - 1)) * flagH + flagH * 0.5;
        const vn = j / (rows - 1);
        const phase = time * 1.4 + vn * 0.35;
        const nx = 2.8 * Math.sin(phase);
        const ny = restY + 0.25 * Math.sin(2 * phase);
        const nz = 1.4 * Math.cos(phase);
        pos[i3] = nx; pos[i3 + 1] = ny; pos[i3 + 2] = nz;
        prev[i3] = nx; prev[i3 + 1] = ny; prev[i3 + 2] = nz;
      }
    }

    // Verlet integration with forces
    for (let p = 0; p < totalPts; p++) {
      if (fixed[p]) continue;
      const i3 = p * 3;
      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];

      const vx = (px - prev[i3]) * damp;
      const vy = (py - prev[i3 + 1]) * damp;
      const vz = (pz - prev[i3 + 2]) * damp;

      prev[i3] = px; prev[i3 + 1] = py; prev[i3 + 2] = pz;

      const col = p % cols;
      const row = (p / cols) | 0;
      const u = col / (cols - 1);
      const v = row / (rows - 1);

      // ── Gust blob turbulence (organic, non-periodic) ──
      let gustX = 0, gustZ = 0;
      for (let g = 0; g < NUM_GUSTS; g++) {
        const gust = gusts[g];
        const gdx = u - gust.x;
        const gdy = v - gust.y;
        const d2 = gdx * gdx + gdy * gdy;
        const r2 = gust.r * gust.r;
        if (d2 < r2) {
          // Smooth quadratic falloff
          const w = 1.0 - d2 / r2;
          const w2 = w * w;
          gustX += gust.sx * w2;
          gustZ += gust.sz * w2;
        }
      }

      // ── Fine wrinkle detail (high-freq sine, too small to cause global oscillation) ──
      const f1 = Math.sin(u * 22.0 + time * 1.3) * Math.cos(v * 16.0 + time * 1.1) * 0.3;
      const f2 = Math.sin(v * 20.0 + time * 1.5) * Math.cos(u * 18.0 + time * 0.9) * 0.3;
      const f3 = Math.cos(v * 25.0 + time * 1.2 + u * 20.0) * 0.2;
      const uf1 = Math.sin(u * 35.0 + time * 1.8) * Math.cos(v * 30.0 + time * 1.4) * 0.15;
      const uf2 = Math.cos(u * 40.0 + time * 2.1) * Math.sin(v * 38.0 + time * 1.7) * 0.1;

      const fineX = (f1 + uf1 + uf2) * turbAmt * 3.5;
      const fineY = f2 * turbAmt * 0.8;
      const fineZ = (f3 + uf1 * 0.5) * turbAmt * 4.0;

      // ── Compose forces ──
      const wm = 0.3 + u * 0.7;
      const gustScale = turbAmt * (windBase * 0.25 + 0.5);

      let fx = wdx * windBase * wm
        + gustX * gustScale
        + fineX * (windBase * 0.15 + 0.2);
      let fy = SIM.gravity * (1.0 + v * 0.3)
        + fineY * (windBase * 0.06 + 0.1);
      let fz = wdz * windBase * wm
        + gustZ * gustScale
        + fineZ * (windBase * 0.15 + 0.2);

      // Tiny random jitter — invisible, but breaks resonance/equilibrium
      fx += (Math.random() - 0.5) * 0.015;
      fz += (Math.random() - 0.5) * 0.015;

      // Fullscreen: edge springs pull toward rest position
      if (state.viewMode === 'fullscreen') {
        const stretch = SIM.stretch / 100;
        const restX = u * flagW;
        const restY = -(v) * flagH + flagH * 0.5;
        const edgeDist = Math.min(u, 1 - u, v, 1 - v);
        const springK = stretch * 200.0 * Math.max(0, 1.0 - edgeDist * 4.0);
        if (springK > 0.01) {
          fx += (restX - px) * springK;
          fy += (restY - py) * springK;
          fz += (0 - pz) * springK * 0.3;
        }
      }

      pos[i3] = px + vx + fx * dt2;
      pos[i3 + 1] = py + vy + fy * dt2;
      pos[i3 + 2] = pz + vz + fz * dt2;
    }

    // Constraint solving
    for (let iter = 0; iter < iterations; iter++) {
      for (let c = 0; c < numC; c++) {
        const a = conA[c], b = conB[c];
        const a3 = a * 3, b3 = b * 3;
        const dx = pos[b3] - pos[a3], dy = pos[b3 + 1] - pos[a3 + 1], dz = pos[b3 + 2] - pos[a3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-7) continue;
        const diff = (dist - conR[c]) / dist * 0.5;
        const cx = dx * diff, cy = dy * diff, cz = dz * diff;
        const af = fixed[a], bf = fixed[b];
        if (!af && !bf) {
          pos[a3] += cx; pos[a3 + 1] += cy; pos[a3 + 2] += cz;
          pos[b3] -= cx; pos[b3 + 1] -= cy; pos[b3 + 2] -= cz;
        } else if (!af) {
          pos[a3] += cx * 2; pos[a3 + 1] += cy * 2; pos[a3 + 2] += cz * 2;
        } else if (!bf) {
          pos[b3] -= cx * 2; pos[b3 + 1] -= cy * 2; pos[b3 + 2] -= cz * 2;
        }
      }
    }
  }

  // Compute normals
  nrm.fill(0);
  for (let t = 0; t < triIdx.length; t += 3) {
    const a = triIdx[t], b = triIdx[t + 1], c = triIdx[t + 2];
    const a3 = a * 3, b3 = b * 3, c3 = c * 3;
    const abx = pos[b3] - pos[a3], aby = pos[b3 + 1] - pos[a3 + 1], abz = pos[b3 + 2] - pos[a3 + 2];
    const acx = pos[c3] - pos[a3], acy = pos[c3 + 1] - pos[a3 + 1], acz = pos[c3 + 2] - pos[a3 + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    nrm[a3] += nx; nrm[a3 + 1] += ny; nrm[a3 + 2] += nz;
    nrm[b3] += nx; nrm[b3 + 1] += ny; nrm[b3 + 2] += nz;
    nrm[c3] += nx; nrm[c3 + 1] += ny; nrm[c3 + 2] += nz;
  }
  for (let i = 0; i < totalPts; i++) {
    const i3 = i * 3;
    const len = Math.sqrt(nrm[i3] ** 2 + nrm[i3 + 1] ** 2 + nrm[i3 + 2] ** 2);
    if (len > 0) { nrm[i3] /= len; nrm[i3 + 1] /= len; nrm[i3 + 2] /= len; }
  }
}
