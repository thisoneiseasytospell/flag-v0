import { SIM, flagW, flagH, state } from './config.js';

let canvas = null;

export const cam = {
  tgtTheta: 0, tgtPhi: 0.06, tgtDist: 3.0,
  curTheta: 0, curPhi: 0.06, curDist: 3.0,
  target: [flagW * 0.5, 0, 0],
  tgtPan: [0, 0, 0],
};

let orbiting = false;
let panning = false;
let lastM = [0, 0];
let touchMode = 'none';
let touchCenter = [0, 0];
let touchDist = 0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function eyePos() {
  return [
    cam.target[0] + cam.curDist * Math.cos(cam.curPhi) * Math.sin(cam.curTheta),
    cam.target[1] + cam.curDist * Math.sin(cam.curPhi),
    cam.target[2] + cam.curDist * Math.cos(cam.curPhi) * Math.cos(cam.curTheta),
  ];
}

function clampPan() {
  if (state.viewMode === 'fullscreen') {
    cam.tgtPan[0] = clamp(cam.tgtPan[0], -flagW * 1.8, flagW * 1.8);
    cam.tgtPan[1] = clamp(cam.tgtPan[1], -flagH * 1.4, flagH * 1.4);
    cam.tgtPan[2] = clamp(cam.tgtPan[2], -flagW * 1.8, flagW * 1.8);
    return;
  }
  if (state.viewMode !== 'stadium') {
    cam.tgtPan[0] = 0;
    cam.tgtPan[1] = 0;
    cam.tgtPan[2] = 0;
    return;
  }
  cam.tgtPan[0] = clamp(cam.tgtPan[0], -flagW, flagW * 2.0);
  cam.tgtPan[1] = clamp(cam.tgtPan[1], -flagH * 1.4, flagH * 1.4);
  cam.tgtPan[2] = clamp(cam.tgtPan[2], -flagW * 1.6, flagW * 1.6);
}

function panBy(dx, dy, scale = 1.0) {
  if (state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') return;

  const e = eyePos();
  let fx = cam.target[0] - e[0];
  let fy = cam.target[1] - e[1];
  let fz = cam.target[2] - e[2];
  const fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-6) return;
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  // Right axis from world-up x forward. Falls back if camera looks straight up/down.
  let rx = fz;
  let ry = 0;
  let rz = -fx;
  let rLen = Math.hypot(rx, ry, rz);
  if (rLen < 1e-5) {
    rx = 1;
    ry = 0;
    rz = 0;
    rLen = 1;
  }
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  // Camera up axis.
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;

  const panScale = cam.tgtDist * 0.0017 * scale;
  cam.tgtPan[0] += (dx * rx - dy * ux) * panScale;
  cam.tgtPan[1] += (dx * ry - dy * uy) * panScale;
  cam.tgtPan[2] += (dx * rz - dy * uz) * panScale;
  clampPan();
}

function zoomBy(delta, speed = 0.0032) {
  if (state.viewMode === 'fullscreen') {
    SIM.zoom = clamp(SIM.zoom * Math.exp(delta * speed * 0.42), 55, 185);
    return;
  }
  cam.tgtDist = clamp(cam.tgtDist * Math.exp(delta * speed), 1.8, 18);
}

function touchInfo(t0, t1) {
  const cx = (t0.clientX + t1.clientX) * 0.5;
  const cy = (t0.clientY + t1.clientY) * 0.5;
  const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  return { cx, cy, dist };
}

export function updateCamera(dt) {
  const cf = 1 - Math.pow(0.01, dt);

  let baseX = 0;
  let baseY = 0;
  let baseZ = 0;

  if (state.viewMode === 'fullscreen') {
    const aspect = canvas.width / canvas.height;
    const fov = Math.PI / 4.5;
    const halfTan = Math.tan(fov / 2);
    const distH = (flagH / 2) / halfTan;
    const distW = (flagW / 2) / (halfTan * aspect);
    const zoomFactor = Math.max(0.55, Math.min(2.4, SIM.zoom / 100));
    cam.tgtDist = Math.max(distH, distW) * 0.95 * zoomFactor;
    baseX = flagW * 0.5;
  }

  clampPan();
  const tgtX = baseX + cam.tgtPan[0];
  const tgtY = baseY + cam.tgtPan[1];
  const tgtZ = baseZ + cam.tgtPan[2];
  cam.target[0] += (tgtX - cam.target[0]) * cf;
  cam.target[1] += (tgtY - cam.target[1]) * cf;
  cam.target[2] += (tgtZ - cam.target[2]) * cf;
  cam.tgtPhi = clamp(cam.tgtPhi, -1.45, 1.45);

  const lf = 1 - Math.pow(0.0004, dt);
  cam.curTheta += (cam.tgtTheta - cam.curTheta) * lf;
  cam.curPhi += (cam.tgtPhi - cam.curPhi) * lf;
  cam.curDist += (cam.tgtDist - cam.curDist) * lf;
}

export function setupCameraControls(canvasEl) {
  canvas = canvasEl;
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    if (state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') return;

    if (e.button === 0 && !(e.altKey || e.shiftKey)) {
      orbiting = true;
      lastM = [e.clientX, e.clientY];
    } else if (e.button === 1 || e.button === 2 || (e.button === 0 && (e.altKey || e.shiftKey))) {
      panning = true;
      lastM = [e.clientX, e.clientY];
    } else {
      return;
    }
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    orbiting = false;
    panning = false;
  });

  window.addEventListener('mousemove', e => {
    const dx = e.clientX - lastM[0], dy = e.clientY - lastM[1];
    if ((state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') || (!orbiting && !panning)) return;

    if (orbiting) {
      cam.tgtTheta -= dx * 0.0062;
      cam.tgtPhi = clamp(cam.tgtPhi + dy * 0.0052, -1.45, 1.45);
    } else if (panning) {
      panBy(dx, dy, 1.35);
    }

    lastM = [e.clientX, e.clientY];
  });

  canvas.addEventListener('wheel', e => {
    if (state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') return;
    e.preventDefault();
    const speed = (e.ctrlKey || e.altKey || e.metaKey) ? 0.0032 : 0.0017;
    zoomBy(e.deltaY, speed);
  }, { passive: false });

  // Touch controls
  canvas.addEventListener('touchstart', e => {
    if (state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') return;

    if (e.touches.length === 1) {
      touchMode = 'orbit';
      lastM = [e.touches[0].clientX, e.touches[0].clientY];
    } else if (e.touches.length >= 2) {
      touchMode = 'panzoom';
      const info = touchInfo(e.touches[0], e.touches[1]);
      touchCenter = [info.cx, info.cy];
      touchDist = info.dist;
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') return;
    if (touchMode === 'orbit' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastM[0];
      const dy = e.touches[0].clientY - lastM[1];
      cam.tgtTheta -= dx * 0.006;
      cam.tgtPhi = clamp(cam.tgtPhi + dy * 0.005, -1.45, 1.45);
      lastM = [e.touches[0].clientX, e.touches[0].clientY];
      e.preventDefault();
      return;
    }

    if (touchMode === 'panzoom' && e.touches.length >= 2) {
      const info = touchInfo(e.touches[0], e.touches[1]);
      panBy(info.cx - touchCenter[0], info.cy - touchCenter[1], 1.35);
      zoomBy(touchDist - info.dist, 0.0048);
      touchCenter = [info.cx, info.cy];
      touchDist = info.dist;
      e.preventDefault();
    }
  });

  canvas.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
      touchMode = 'none';
    } else if (e.touches.length === 1) {
      touchMode = 'orbit';
      lastM = [e.touches[0].clientX, e.touches[0].clientY];
    }
  });

  canvas.addEventListener('dblclick', () => {
    if (state.viewMode !== 'stadium' && state.viewMode !== 'fullscreen') return;
    if (state.viewMode === 'fullscreen') {
      cam.tgtTheta = 0.0;
      cam.tgtPhi = 0.06;
      SIM.zoom = 100;
    } else {
      cam.tgtTheta = 0.0;
      cam.tgtPhi = 0.15;
      cam.tgtDist = 9.0;
    }
    cam.tgtPan[0] = 0;
    cam.tgtPan[1] = 0;
    cam.tgtPan[2] = 0;
  });
}
