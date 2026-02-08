import { simulate } from './cloth.js';
import { render, resize, canvas } from './renderer.js';
import { setupCameraControls, updateCamera } from './camera.js';
import { setupUI } from './ui.js';

// Initialize
setupCameraControls(canvas);
setupUI();
window.addEventListener('resize', resize);
resize();

// Animation loop
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  updateCamera(dt);
  simulate(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
