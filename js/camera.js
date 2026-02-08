import { flagW, flagH, state } from './config.js';

let canvas = null;

export const cam = {
  tgtTheta: 0, tgtPhi: 0.06, tgtDist: 3.0,
  curTheta: 0, curPhi: 0.06, curDist: 3.0,
  target: [flagW * 0.5, 0, 0],
};

let orbiting = false;
let lastM = [0, 0];

export function eyePos() {
  return [
    cam.target[0] + cam.curDist * Math.cos(cam.curPhi) * Math.sin(cam.curTheta),
    cam.target[1] + cam.curDist * Math.sin(cam.curPhi),
    cam.target[2] + cam.curDist * Math.cos(cam.curPhi) * Math.cos(cam.curTheta),
  ];
}

export function updateCamera(dt) {
  const cf = 1 - Math.pow(0.01, dt);

  if (state.viewMode === 'fullscreen') {
    const aspect = canvas.width / canvas.height;
    const fov = Math.PI / 4.5;
    const halfTan = Math.tan(fov / 2);
    const distH = (flagH / 2) / halfTan;
    const distW = (flagW / 2) / (halfTan * aspect);
    cam.tgtDist = Math.max(distH, distW) * 1.05;
    cam.tgtTheta = 0;
    cam.tgtPhi = 0.06;
    cam.target[0] += (flagW * 0.5 - cam.target[0]) * cf;
    cam.target[1] += (0 - cam.target[1]) * cf;
    cam.target[2] += (0 - cam.target[2]) * cf;
  } else {
    cam.target[0] += (0 - cam.target[0]) * cf;
    cam.target[1] += (0 - cam.target[1]) * cf;
    cam.target[2] += (0 - cam.target[2]) * cf;
  }

  const lf = 1 - Math.pow(0.0004, dt);
  cam.curTheta += (cam.tgtTheta - cam.curTheta) * lf;
  cam.curPhi += (cam.tgtPhi - cam.curPhi) * lf;
  cam.curDist += (cam.tgtDist - cam.curDist) * lf;
}

export function setupCameraControls(canvasEl) {
  canvas = canvasEl;

  canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && state.viewMode === 'stadium') {
      orbiting = true;
      lastM = [e.clientX, e.clientY];
      e.preventDefault();
    }
  });

  window.addEventListener('mouseup', () => orbiting = false);

  window.addEventListener('mousemove', e => {
    if (!orbiting || state.viewMode === 'fullscreen') return;
    const dx = e.clientX - lastM[0], dy = e.clientY - lastM[1];
    cam.tgtTheta -= dx * 0.004;
    cam.tgtPhi = Math.max(-1.2, Math.min(1.2, cam.tgtPhi + dy * 0.004));
    lastM = [e.clientX, e.clientY];
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.viewMode === 'stadium') {
      cam.tgtDist = Math.max(1.5, Math.min(10, cam.tgtDist * (1 + e.deltaY * 0.001)));
    }
  }, { passive: false });

  // Touch controls
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && state.viewMode === 'stadium') {
      orbiting = true;
      lastM = [e.touches[0].clientX, e.touches[0].clientY];
    }
  });

  canvas.addEventListener('touchmove', e => {
    if (orbiting && e.touches.length === 1 && state.viewMode === 'stadium') {
      e.preventDefault();
      const dx = e.touches[0].clientX - lastM[0], dy = e.touches[0].clientY - lastM[1];
      cam.tgtTheta -= dx * 0.004;
      cam.tgtPhi = Math.max(-1.2, Math.min(1.2, cam.tgtPhi + dy * 0.004));
      lastM = [e.touches[0].clientX, e.touches[0].clientY];
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => orbiting = false);
}
