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
const NUM_GUSTS = 9;
const GUST_SPEED_LIMIT = 0.55;
const GUST_FORCE_LIMIT = 3.4;
const GUST_PHASE_SPEED_LIMIT = 5.2;
const gusts = [];
const gustPulse = new Float32Array(NUM_GUSTS);
const gustSwirl = new Float32Array(NUM_GUSTS);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function initGusts() {
  gusts.length = 0;
  for (let i = 0; i < NUM_GUSTS; i++) {
    gusts.push({
      x: Math.random() * 1.4 - 0.2,
      y: Math.random() * 1.4 - 0.2,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.20,
      r: 0.10 + Math.random() * 0.26,
      sx: (Math.random() - 0.5) * 2.8,
      sz: (Math.random() - 0.5) * 2.8,
      phase: Math.random() * Math.PI * 2.0,
      phaseVel: 1.2 + Math.random() * 2.6,
      pulse: 0.35 + Math.random() * 1.45,
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.4),
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
    g.vx += (Math.random() - 0.5) * dt * 0.9;
    g.vy += (Math.random() - 0.5) * dt * 0.7;
    g.vx *= 0.993;
    g.vy *= 0.993;
    g.vx = clamp(g.vx, -GUST_SPEED_LIMIT, GUST_SPEED_LIMIT);
    g.vy = clamp(g.vy, -GUST_SPEED_LIMIT, GUST_SPEED_LIMIT);

    // Random walk on strength (slow evolving push direction)
    g.sx += (Math.random() - 0.5) * dt * 4.0;
    g.sz += (Math.random() - 0.5) * dt * 4.0;
    g.sx *= 0.987;
    g.sz *= 0.987;
    g.sx = clamp(g.sx, -GUST_FORCE_LIMIT, GUST_FORCE_LIMIT);
    g.sz = clamp(g.sz, -GUST_FORCE_LIMIT, GUST_FORCE_LIMIT);

    // Evolving gust "state" drives non-periodic flutter without global sine waves
    g.phase += g.phaseVel * dt;
    if (g.phase > Math.PI * 2.0) g.phase -= Math.PI * 2.0;
    g.phaseVel += (Math.random() - 0.5) * dt * 1.5;
    g.phaseVel = clamp(g.phaseVel, 0.7, GUST_PHASE_SPEED_LIMIT);
    g.pulse += (Math.random() - 0.5) * dt * 1.8;
    g.pulse = clamp(g.pulse, 0.15, 1.8);
  }
}

// ─── Physics simulation ─────────────────────────────────────────
const SUBSTEPS = 2;
let windAngleDrift = 0;
let windAngleVel = 0;
let windStrengthDrift = 0;
let time = 0;

function updateAmbientWind(dt) {
  const driftMax = SIM.windDrift;
  if (driftMax <= 0.01) {
    windAngleDrift *= Math.exp(-dt * 6.0);
    windAngleVel *= Math.exp(-dt * 7.5);
  } else {
    windAngleVel += (Math.random() - 0.5) * dt * (26.0 + driftMax * 1.15);
    windAngleVel += (-windAngleDrift * (1.15 + driftMax * 0.03)) * dt;
    windAngleVel *= Math.exp(-dt * 1.9);
    windAngleDrift += windAngleVel * dt;
    windAngleDrift = clamp(windAngleDrift, -driftMax, driftMax);
  }

  windStrengthDrift += (Math.random() - 0.5) * dt * (1.1 + SIM.turbulence / 90);
  windStrengthDrift *= Math.exp(-dt * 1.6);
  windStrengthDrift = clamp(windStrengthDrift, -0.36, 0.36);
}

function applyStadiumPoleMotion() {
  if (state.viewMode !== 'stadium') return;
  // Original Stadium motion: horizontal figure-8 sweep on the pole edge.
  for (let j = 0; j < rows; j++) {
    const p = j * cols;
    const i3 = p * 3;
    const restY = -(j / (rows - 1)) * flagH + flagH * 0.5;
    const vn = j / (rows - 1);
    const phase = time * 1.4 + vn * 0.35;
    const nx = 2.8 * Math.sin(phase);
    const ny = restY + 0.25 * Math.sin(2 * phase);
    const nz = 1.4 * Math.cos(phase);
    pos[i3] = prev[i3] = nx;
    pos[i3 + 1] = prev[i3 + 1] = ny;
    pos[i3 + 2] = prev[i3 + 2] = nz;
  }
}

export function simulate(frameDt) {
  const dt = Math.min(Math.max(frameDt, 0.004), 0.016);

  // Update gust blobs once per frame (not per substep)
  updateGusts(dt);
  updateAmbientWind(dt);

  const subDt = dt / SUBSTEPS;

  for (let s = 0; s < SUBSTEPS; s++) {
    const dt2 = subDt * subDt;
    time += subDt;
    const damp = Math.pow(SIM.damping / 100, subDt * 85);
    const windNorm = clamp((SIM.windStrength / 100) * (1.0 + windStrengthDrift), 0, 1.6);
    const windBase = windNorm * windNorm * 24.0 + windNorm * 2.5;
    const turbAmt = SIM.turbulence / 100;
    const aRad = (SIM.windAngle + windAngleDrift) * Math.PI / 180;
    const wdx = Math.sin(aRad), wdz = Math.cos(aRad);
    const iterations = Math.floor(SIM.stiffness / 100 * 2) + 2;
    const solveStrength = 0.5 + (SIM.stiffness / 100) * 0.3;
    const dragK = 0.012 + (1.0 - SIM.damping / 100) * 0.62 + windNorm * 0.01;
    const maxStep = Math.max(restDx, restDy) * (1.3 + windNorm * 0.9);

    applyStadiumPoleMotion();

    // Evaluate per-gust phase once per substep (faster than per-particle trig).
    for (let g = 0; g < NUM_GUSTS; g++) {
      const gust = gusts[g];
      gustPulse[g] = (0.72 + Math.sin(gust.phase) * 0.28) * (0.42 + gust.pulse * 0.58);
      gustSwirl[g] = gust.spin * (0.22 + 0.34 * Math.cos(gust.phase * 0.75));
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

      const uv2 = p * 2;
      const u = uv[uv2];
      const v = uv[uv2 + 1];

      // ── Gust blob turbulence (organic, non-periodic) ──
      let gustX = 0, gustZ = 0, gustLift = 0;
      for (let g = 0; g < NUM_GUSTS; g++) {
        const gust = gusts[g];
        const gdx = u - gust.x;
        const gdy = v - gust.y;
        const d2 = gdx * gdx + gdy * gdy;
        const r2 = gust.r * gust.r;
        if (d2 < r2) {
          // Pressure + swirl from localized evolving gusts
          const w = 1.0 - d2 / r2;
          const w2 = w * w;
          const w3 = w2 * w;
          const pulse = w2 * gustPulse[g];
          const swirl = w3 * gustSwirl[g];
          gustX += gust.sx * pulse - gdy * swirl;
          gustZ += gust.sz * pulse + gdx * swirl;
          // Keep vertical turbulence zero-mean so corners don't accumulate upward drift.
          gustLift += swirl * 0.30 + (pulse - 0.50) * 0.10;
        }
      }

      // ── Compose forces ──
      const wm = 0.3 + u * 0.7;
      const gustScale = turbAmt * (windBase * 0.34 + 0.85);

      let fx = wdx * windBase * wm
        + gustX * gustScale;
      let fy = SIM.gravity * (1.0 + v * 0.62 + u * u * 0.22)
        + gustLift * gustScale * 0.045;
      let fz = wdz * windBase * wm
        + gustZ * gustScale;

      // Normal-aligned aerodynamic pressure makes folds self-excite dynamically.
      const npx = nrm[i3];
      const npy = nrm[i3 + 1];
      const npz = nrm[i3 + 2];
      const nLen2 = npx * npx + npy * npy + npz * npz;
      if (nLen2 > 1e-4) {
        const ndw = npx * wdx + npz * wdz + npy * 0.05;
        const aero = ndw * Math.abs(ndw) * (windBase * (0.75 + turbAmt * 0.55)) * (0.2 + u * 0.8);
        fx += npx * aero;
        fy += npy * aero * 0.24;
        fz += npz * aero;
      }

      // Relative airflow drag removes runaway oscillation over long runs.
      const velX = vx / subDt;
      const velY = vy / subDt;
      const velZ = vz / subDt;
      const flowX = wdx * windBase * (0.35 + u * 0.65);
      const flowZ = wdz * windBase * (0.35 + u * 0.65);
      const relX = velX - flowX;
      const relY = velY;
      const relZ = velZ - flowZ;
      if (u > 0.35 && velY > 0.0) {
        fy -= velY * (0.016 + u * 0.028);
      }
      const drag = dragK * (0.25 + u * 0.75);
      fx -= relX * drag;
      fy -= relY * drag * 0.8;
      fz -= relZ * drag;

      // Fullscreen: edge springs pull toward rest position
      if (state.viewMode === 'fullscreen') {
        const stretchN = clamp(SIM.stretch / 140, 0, 1);
        const stretchTaut = Math.pow(stretchN, 1.35);
        const restX = u * flagW;
        const restY = -(v) * flagH + flagH * 0.5;
        const sag = flagH * (0.015 + 0.105 * u * u * (0.45 + 0.55 * (1.0 - v)));
        const targetY = restY - sag;
        // Base hold keeps framing stable; stretch adds controllable tautness.
        const holdY = (2.4 + u * 1.6) + stretchTaut * (6.8 + u * 5.6);
        const holdXZ = (0.62 + u * 0.35) + stretchTaut * (2.6 + u * 2.2);
        fx += (restX - px) * holdXZ;
        fy += (targetY - py) * holdY;
        fz += (0 - pz) * holdXZ * 0.22;

        // Trailing edge anti-float: when a point rises above its rest height, push it back down.
        const above = py - targetY;
        if (above > 0.0) {
          const sink = (1.8 + u * 5.4) * (1.0 + above * 0.95);
          fy -= above * sink;
          if (velY > 0.0) fy -= velY * (0.030 + u * 0.070);
        }

        const edgeDist = Math.min(u, 1 - u, v, 1 - v);
        const springK = stretchTaut * 210.0 * Math.max(0, 1.0 - edgeDist * 4.0);
        if (springK > 0.01) {
          fx += (restX - px) * springK;
          fy += (targetY - py) * springK;
          fz += (0 - pz) * springK * 0.16;
        }
      }

      let nx = px + vx + fx * dt2;
      let ny = py + vy + fy * dt2;
      let nz = pz + vz + fz * dt2;

      const sx = nx - px, sy = ny - py, sz = nz - pz;
      const stepLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (stepLen > maxStep) {
        const sInv = maxStep / stepLen;
        nx = px + sx * sInv;
        ny = py + sy * sInv;
        nz = pz + sz * sInv;
      }

      pos[i3] = nx;
      pos[i3 + 1] = ny;
      pos[i3 + 2] = nz;
    }

    // Constraint solving
    for (let iter = 0; iter < iterations; iter++) {
      for (let c = 0; c < numC; c++) {
        const a = conA[c], b = conB[c];
        const a3 = a * 3, b3 = b * 3;
        const dx = pos[b3] - pos[a3], dy = pos[b3 + 1] - pos[a3 + 1], dz = pos[b3 + 2] - pos[a3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-7) continue;
        const diff = (dist - conR[c]) / dist * 0.5 * solveStrength;
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
