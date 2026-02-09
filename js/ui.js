import { SIM, cols, rows, flagW, flagH, state } from './config.js';
import { pos, prev, fixed, initCloth } from './cloth.js';
import { loadTexture, removeTexture } from './renderer.js';
import { cam } from './camera.js';

// ─── View modes ─────────────────────────────────────────────────
export function enterFullscreen() {
  state.viewMode = 'fullscreen';
  document.getElementById('viewFullscreen').classList.add('active');
  document.getElementById('viewStadium').classList.remove('active');
  cam.tgtTheta = 0.0;
  cam.tgtPhi = 0.06;
  cam.tgtPan[0] = 0;
  cam.tgtPan[1] = 0;
  cam.tgtPan[2] = 0;
}

export function enterStadium() {
  state.viewMode = 'stadium';
  document.getElementById('viewStadium').classList.add('active');
  document.getElementById('viewFullscreen').classList.remove('active');

  initCloth();

  cam.tgtTheta = 0.0;
  cam.tgtPhi = 0.15;
  cam.tgtDist = 9.0;
  cam.tgtPan[0] = 0;
  cam.tgtPan[1] = 0;
  cam.tgtPan[2] = 0;
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
  slider('windDrift', 'driftVal', v => { SIM.windDrift = +v; return v + '\u00B0'; });
  slider('stiffness', 'stiffVal', v => { SIM.stiffness = +v; return v; });
  slider('damping', 'dampVal', v => { SIM.damping = +v; return v; });
  slider('opacity', 'opacityVal', v => { SIM.opacity = v / 100; return v + '%'; });
  slider('stretch', 'stretchVal', v => { SIM.stretch = +v; return v; });

  // Pin controls
  const pinCornersBtn = document.getElementById('pinCorners');
  const pinPoleDenseBtn = document.getElementById('pinPoleDense');
  const pinCustomBtn = document.getElementById('pinCustom');
  const pinMap = document.getElementById('pinMap');
  const pinClearBtn = document.getElementById('pinClearBtn');
  const customPins = [];
  let draggingPin = -1;
  let touchDraggingPin = -1;
  const PIN_HIT_PX = 11;
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function snapPinnedAtRest(idx) {
    const u = (idx % cols) / (cols - 1);
    const v = ((idx / cols) | 0) / (rows - 1);
    const i3 = idx * 3;
    const rx = u * flagW;
    const ry = -v * flagH + flagH * 0.5;
    pos[i3] = prev[i3] = rx;
    pos[i3 + 1] = prev[i3 + 1] = ry;
    pos[i3 + 2] = prev[i3 + 2] = 0;
  }

  function uvFromClient(clientX, clientY) {
    const r = pinMap.getBoundingClientRect();
    return {
      u: clamp01((clientX - r.left) / Math.max(r.width, 1)),
      v: clamp01((clientY - r.top) / Math.max(r.height, 1)),
    };
  }

  function closestPinIndex(clientX, clientY) {
    const r = pinMap.getBoundingClientRect();
    const lx = clientX - r.left;
    const ly = clientY - r.top;
    let best = -1;
    let bestD2 = PIN_HIT_PX * PIN_HIT_PX;
    for (let i = 0; i < customPins.length; i++) {
      const dx = lx - customPins[i].u * r.width;
      const dy = ly - customPins[i].v * r.height;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        best = i;
        bestD2 = d2;
      }
    }
    return best;
  }

  function renderPinMap() {
    pinMap.querySelectorAll('.pin-map-dot').forEach(el => el.remove());
    for (const p of customPins) {
      const dot = document.createElement('div');
      dot.className = 'pin-map-dot';
      dot.style.left = `${(p.u * 100).toFixed(3)}%`;
      dot.style.top = `${(p.v * 100).toFixed(3)}%`;
      pinMap.appendChild(dot);
    }
  }

  function applyPins() {
    fixed.fill(0);

    if (state.pinMode === 'custom') {
      const used = new Set();
      for (const p of customPins) {
        const i = Math.round(clamp01(p.u) * (cols - 1));
        const j = Math.round(clamp01(p.v) * (rows - 1));
        const idx = j * cols + i;
        if (used.has(idx)) continue;
        used.add(idx);
        fixed[idx] = 1;
        snapPinnedAtRest(idx);
      }
      return;
    }

    if (state.pinMode === 'corners') {
      const tl = 0;
      const tr = cols - 1;
      const bl = (rows - 1) * cols;
      const br = bl + cols - 1;
      fixed[tl] = 1; fixed[tr] = 1; fixed[bl] = 1; fixed[br] = 1;
      snapPinnedAtRest(tl);
      snapPinnedAtRest(tr);
      snapPinnedAtRest(bl);
      snapPinnedAtRest(br);
      return;
    }

    if (state.pinMode === 'poleDense') {
      for (let j = 0; j < rows; j++) {
        const idx = j * cols;
        fixed[idx] = 1;
        snapPinnedAtRest(idx);
      }
      return;
    }

    for (let j = 0; j < rows; j++) {
      const idx = j * cols;
      fixed[idx] = 1;
      snapPinnedAtRest(idx);
    }
  }

  function syncPinUI() {
    pinCornersBtn.classList.toggle('active', state.pinMode === 'corners');
    pinPoleDenseBtn.classList.toggle('active', state.pinMode === 'poleDense');
    pinCustomBtn.classList.toggle('active', state.pinMode === 'custom');
    pinMap.style.opacity = state.pinMode === 'custom' ? '1' : '0.72';
  }

  function setPinMode(mode) {
    state.pinMode = mode;
    syncPinUI();
    applyPins();
  }

  function applyTallPolePreset() {
    document.getElementById('windStrength').value = 36;
    document.getElementById('turbulence').value = 30;
    document.getElementById('windDrift').value = 24;
    document.getElementById('stiffness').value = 40;
    document.getElementById('damping').value = 92;
    document.getElementById('opacity').value = 100;
    document.getElementById('stretch').value = 10;

    SIM.windStrength = 36;
    SIM.turbulence = 30;
    SIM.windDrift = 24;
    SIM.windAngle = 90;
    SIM.zoom = 100;
    SIM.stiffness = 40;
    SIM.damping = 92;
    SIM.opacity = 1.0;
    SIM.stretch = 10;
    state.pinMode = 'poleDense';
    syncPinUI();

    document.getElementById('windVal').textContent = '36';
    document.getElementById('turbVal').textContent = '30';
    document.getElementById('driftVal').textContent = '24°';
    document.getElementById('stiffVal').textContent = '40';
    document.getElementById('dampVal').textContent = '92';
    document.getElementById('opacityVal').textContent = '100%';
    document.getElementById('stretchVal').textContent = '10';

    updateDial();
    applyPins();
  }

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

  pinMap.addEventListener('contextmenu', e => e.preventDefault());
  pinMap.addEventListener('mousedown', e => {
    const hit = closestPinIndex(e.clientX, e.clientY);

    if (e.button === 2) {
      e.preventDefault();
      if (hit >= 0) {
        customPins.splice(hit, 1);
        state.pinMode = 'custom';
        syncPinUI();
        applyPins();
        renderPinMap();
      }
      return;
    }
    if (e.button !== 0) return;

    e.preventDefault();
    state.pinMode = 'custom';
    syncPinUI();

    if (hit >= 0) {
      draggingPin = hit;
      renderPinMap();
      applyPins();
    } else {
      const uvp = uvFromClient(e.clientX, e.clientY);
      customPins.push(uvp);
      draggingPin = customPins.length - 1;
      renderPinMap();
      applyPins();
    }
  });

  window.addEventListener('mousemove', e => {
    if (draggingPin < 0 || draggingPin >= customPins.length) return;
    customPins[draggingPin] = uvFromClient(e.clientX, e.clientY);
    renderPinMap();
    applyPins();
  });

  window.addEventListener('mouseup', () => { draggingPin = -1; });

  pinMap.addEventListener('touchstart', e => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    const hit = closestPinIndex(t.clientX, t.clientY);
    state.pinMode = 'custom';
    syncPinUI();
    if (hit >= 0) {
      touchDraggingPin = hit;
      renderPinMap();
      applyPins();
    } else {
      customPins.push(uvFromClient(t.clientX, t.clientY));
      touchDraggingPin = customPins.length - 1;
      renderPinMap();
      applyPins();
    }
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (touchDraggingPin < 0 || !e.touches.length || touchDraggingPin >= customPins.length) return;
    const t = e.touches[0];
    customPins[touchDraggingPin] = uvFromClient(t.clientX, t.clientY);
    renderPinMap();
    applyPins();
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', () => { touchDraggingPin = -1; });
  pinClearBtn.addEventListener('click', () => {
    customPins.length = 0;
    state.pinMode = 'custom';
    syncPinUI();
    renderPinMap();
    applyPins();
  });

  pinCornersBtn.addEventListener('click', () => setPinMode('corners'));
  pinPoleDenseBtn.addEventListener('click', () => setPinMode('poleDense'));
  pinCustomBtn.addEventListener('click', () => setPinMode('custom'));
  renderPinMap();
  syncPinUI();

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
  const prevVideo = document.getElementById('previewVideo');
  const globalDrop = document.getElementById('globalDrop');
  let activeObjectUrl = null;
  let activeVideo = null;

  function resetPreview() {
    prevImg.style.display = 'none';
    prevVideo.style.display = 'none';
    prevImg.removeAttribute('src');
    prevVideo.pause();
    prevVideo.removeAttribute('src');
    prevVideo.load();
  }

  function clearMediaResources() {
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute('src');
      activeVideo.load();
      activeVideo = null;
    }
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  }

  function isSupportedFile(file) {
    return !!file && (
      file.type.startsWith('image/')
      || file.type.startsWith('video/')
    );
  }

  function setPreviewVisible() {
    texPrev.style.display = 'block';
    dropzone.style.display = 'none';
  }

  function handleImage(file) {
    const url = URL.createObjectURL(file);
    clearMediaResources();
    resetPreview();
    activeObjectUrl = url;

    const img = new Image();
    img.onload = () => {
      loadTexture(img, { isVideo: false });
      prevImg.src = url;
      prevImg.style.display = 'block';
      prevVideo.style.display = 'none';
      setPreviewVisible();
    };
    img.onerror = () => {
      clearMediaResources();
      resetPreview();
    };
    img.src = url;
  }

  function handleVideo(file) {
    const url = URL.createObjectURL(file);
    clearMediaResources();
    resetPreview();
    activeObjectUrl = url;

    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';

    video.addEventListener('loadeddata', () => {
      activeVideo = video;
      loadTexture(video, { isVideo: true });
      video.play().catch(() => {});

      prevVideo.src = url;
      prevVideo.muted = true;
      prevVideo.loop = true;
      prevVideo.playsInline = true;
      prevVideo.style.display = 'block';
      prevImg.style.display = 'none';
      prevVideo.play().catch(() => {});

      setPreviewVisible();
    }, { once: true });

    video.addEventListener('error', () => {
      clearMediaResources();
      resetPreview();
    }, { once: true });

    video.src = url;
    video.load();
  }

  function handleFile(file) {
    if (!isSupportedFile(file)) return;
    if (file.type.startsWith('image/')) {
      handleImage(file);
      return;
    }
    handleVideo(file);
  }

  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });

  document.getElementById('removeTexture').addEventListener('click', () => {
    removeTexture();
    clearMediaResources();
    resetPreview();
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
    if (isSupportedFile(e.dataTransfer.files[0])) handleFile(e.dataTransfer.files[0]);
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', () => {
    applyTallPolePreset();
    SIM.flagColor = [0.91, 0.90, 0.89];
    colorIn.value = '#e8e6e3';
    customPins.length = 0;
    renderPinMap();

    removeTexture();
    clearMediaResources();
    resetPreview();
    texPrev.style.display = 'none';
    dropzone.style.display = 'block';
    fileInput.value = '';

    initCloth();
    if (state.viewMode === 'fullscreen') enterFullscreen();
    else enterStadium();
    applyPins();
  });
  document.getElementById('presetTallPoleBtn').addEventListener('click', () => {
    applyTallPolePreset();
    if (state.viewMode === 'fullscreen') enterFullscreen();
    else enterStadium();
    applyPins();
  });

  // View mode toggle
  document.getElementById('viewFullscreen').addEventListener('click', () => {
    enterFullscreen();
    applyPins();
  });
  document.getElementById('viewStadium').addEventListener('click', () => {
    enterStadium();
    applyPins();
  });

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
  applyPins();
}
