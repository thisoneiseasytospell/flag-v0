import { SIM, cols, rows, flagW, flagH, state } from './config.js';
import { pos, prev, fixed, initCloth } from './cloth.js';
import { loadTexture, removeTexture } from './renderer.js';
import { cam } from './camera.js';

// ─── View modes ─────────────────────────────────────────────────
export function enterFullscreen() {
  state.viewMode = 'fullscreen';
  document.getElementById('viewFullscreen').classList.add('active');
  document.getElementById('viewStadium').classList.remove('active');

  // Pin only 4 corners
  fixed.fill(0);
  const tl = 0, tr = cols - 1;
  const bl = (rows - 1) * cols, br = bl + cols - 1;
  fixed[tl] = 1; fixed[tr] = 1; fixed[bl] = 1; fixed[br] = 1;

  // Snap corners to rest positions
  pos[tl * 3] = prev[tl * 3] = 0;
  pos[tl * 3 + 1] = prev[tl * 3 + 1] = flagH * 0.5;
  pos[tl * 3 + 2] = prev[tl * 3 + 2] = 0;

  pos[tr * 3] = prev[tr * 3] = flagW;
  pos[tr * 3 + 1] = prev[tr * 3 + 1] = flagH * 0.5;
  pos[tr * 3 + 2] = prev[tr * 3 + 2] = 0;

  pos[bl * 3] = prev[bl * 3] = 0;
  pos[bl * 3 + 1] = prev[bl * 3 + 1] = -flagH * 0.5;
  pos[bl * 3 + 2] = prev[bl * 3 + 2] = 0;

  pos[br * 3] = prev[br * 3] = flagW;
  pos[br * 3 + 1] = prev[br * 3 + 1] = -flagH * 0.5;
  pos[br * 3 + 2] = prev[br * 3 + 2] = 0;
}

export function enterStadium() {
  state.viewMode = 'stadium';
  document.getElementById('viewStadium').classList.add('active');
  document.getElementById('viewFullscreen').classList.remove('active');

  initCloth();
  fixed.fill(0);
  for (let j = 0; j < rows; j++) fixed[j * cols] = 1;

  cam.tgtTheta = 0.0;
  cam.tgtPhi = 0.15;
  cam.tgtDist = 9.0;
}

// ─── Wind direction helpers ─────────────────────────────────────
function dirLabel(d) {
  d = ((d % 360) + 360) % 360;
  const labels = ['Front', 'Front-Right', 'Side', 'Back-Right', 'Back', 'Back-Left', 'Side', 'Front-Left'];
  return labels[Math.round(d / 45) % 8];
}

// ─── Setup all UI bindings ──────────────────────────────────────
export function setupUI() {
  // Panel toggle
  const panel = document.getElementById('panel');
  document.getElementById('panelClose').addEventListener('click', () => panel.classList.add('collapsed'));
  document.getElementById('panelToggle').addEventListener('click', () => panel.classList.remove('collapsed'));

  // Sliders
  function slider(id, valId, fn) {
    const el = document.getElementById(id), v = document.getElementById(valId);
    el.addEventListener('input', () => { v.textContent = fn(el.value); });
  }
  slider('windStrength', 'windVal', v => { SIM.windStrength = +v; return v; });
  slider('turbulence', 'turbVal', v => { SIM.turbulence = +v; return v; });
  slider('stiffness', 'stiffVal', v => { SIM.stiffness = +v; return v; });
  slider('damping', 'dampVal', v => { SIM.damping = +v; return v; });
  slider('opacity', 'opacityVal', v => { SIM.opacity = v / 100; return v + '%'; });
  slider('stretch', 'stretchVal', v => { SIM.stretch = +v; return v; });

  // Wind dial
  const windDial = document.getElementById('windDial');
  const windArrow = document.getElementById('windArrow');
  const windDegEl = document.getElementById('windDeg');
  const windDirLbl = document.getElementById('windDirLabel');
  let dialDrag = false;

  function updateDial() {
    windArrow.style.transform = `translateX(-50%) translateY(-100%) rotate(${SIM.windAngle}deg)`;
    windDegEl.textContent = Math.round(SIM.windAngle) + '\u00B0';
    windDirLbl.textContent = dirLabel(SIM.windAngle);
  }

  function dialFromEvent(e) {
    const r = windDial.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = -(e.clientY - r.top - r.height / 2);
    SIM.windAngle = ((Math.atan2(cx, cy) * 180 / Math.PI) + 360) % 360;
    updateDial();
  }

  windDial.addEventListener('mousedown', e => { dialDrag = true; dialFromEvent(e); });
  window.addEventListener('mousemove', e => { if (dialDrag) dialFromEvent(e); });
  window.addEventListener('mouseup', () => dialDrag = false);
  windDial.addEventListener('touchstart', e => { e.preventDefault(); dialDrag = true; dialFromEvent(e.touches[0]); });
  window.addEventListener('touchmove', e => { if (dialDrag) { e.preventDefault(); dialFromEvent(e.touches[0]); } }, { passive: false });
  window.addEventListener('touchend', () => dialDrag = false);
  updateDial();

  // Color picker
  const colorIn = document.getElementById('flagColor');
  colorIn.addEventListener('input', () => {
    const h = colorIn.value;
    SIM.flagColor = [
      parseInt(h.substr(1, 2), 16) / 255,
      parseInt(h.substr(3, 2), 16) / 255,
      parseInt(h.substr(5, 2), 16) / 255,
    ];
  });

  // File upload
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const texPrev = document.getElementById('texturePreview');
  const prevImg = document.getElementById('previewImg');
  const globalDrop = document.getElementById('globalDrop');

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        loadTexture(img);
        prevImg.src = e.target.result;
        texPrev.style.display = 'block';
        dropzone.style.display = 'none';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });

  document.getElementById('removeTexture').addEventListener('click', () => {
    removeTexture();
    texPrev.style.display = 'none';
    dropzone.style.display = 'block';
    fileInput.value = '';
  });

  // Global drop overlay
  let gdc = 0;
  document.addEventListener('dragenter', e => {
    e.preventDefault(); gdc++;
    if (e.dataTransfer.types.includes('Files')) globalDrop.classList.add('active');
  });
  document.addEventListener('dragleave', e => {
    e.preventDefault(); gdc--;
    if (gdc <= 0) { gdc = 0; globalDrop.classList.remove('active'); }
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); gdc = 0; globalDrop.classList.remove('active');
    if (e.dataTransfer.files[0]?.type.startsWith('image/')) handleFile(e.dataTransfer.files[0]);
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('windStrength').value = 50;
    document.getElementById('turbulence').value = 35;
    document.getElementById('stiffness').value = 55;
    document.getElementById('damping').value = 94;
    document.getElementById('opacity').value = 100;
    document.getElementById('stretch').value = 50;

    SIM.windStrength = 50; SIM.turbulence = 35; SIM.stiffness = 55;
    SIM.damping = 94; SIM.opacity = 1.0; SIM.windAngle = 0; SIM.stretch = 50;
    SIM.flagColor = [0.91, 0.90, 0.89];
    colorIn.value = '#e8e6e3';

    document.getElementById('windVal').textContent = '50';
    document.getElementById('turbVal').textContent = '35';
    document.getElementById('stiffVal').textContent = '55';
    document.getElementById('dampVal').textContent = '94';
    document.getElementById('opacityVal').textContent = '100%';
    document.getElementById('stretchVal').textContent = '50';
    updateDial();

    removeTexture();
    texPrev.style.display = 'none';
    dropzone.style.display = 'block';
    fileInput.value = '';

    initCloth();
    if (state.viewMode === 'fullscreen') enterFullscreen();
    else enterStadium();
  });

  // View mode toggle
  document.getElementById('viewFullscreen').addEventListener('click', enterFullscreen);
  document.getElementById('viewStadium').addEventListener('click', enterStadium);

  // Theme toggle
  document.getElementById('themeDark').addEventListener('click', () => {
    state.theme = 'dark';
    document.documentElement.classList.remove('light-mode');
    document.getElementById('themeDark').classList.add('active');
    document.getElementById('themeLight').classList.remove('active');
  });
  document.getElementById('themeLight').addEventListener('click', () => {
    state.theme = 'light';
    document.documentElement.classList.add('light-mode');
    document.getElementById('themeLight').classList.add('active');
    document.getElementById('themeDark').classList.remove('active');
  });

  // Initialize default mode
  enterFullscreen();
}
