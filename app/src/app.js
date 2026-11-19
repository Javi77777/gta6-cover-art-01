// Neon Palms Cover Studio — a multi-panel sunset poster maker that runs fully
// offline. Photos are read on the user's own machine (FileReader or the
// bundled sample scenes) and never uploaded. The cover is drawn on a 2D
// canvas and exported as a PNG in the common post sizes. All lettering is
// drawn with system fonts and all art is drawn in code: no Rockstar Games
// logo, artwork or font anywhere in the app.

const EXPORT_SIZES = {
  square: { width: 1080, height: 1080, label: '1080 × 1080' },
  portrait: { width: 1080, height: 1350, label: '1080 × 1350' },
  wide: { width: 1920, height: 1080, label: '1920 × 1080' },
};

const SAMPLE_SCENES = [
  { file: 'boulevard.jpg', name: 'Boulevard' },
  { file: 'neon.jpg', name: 'Neon street' },
  { file: 'pier.jpg', name: 'Pier' },
];

const GRADE_FILTERS = {
  sunset: 'saturate(1.35) contrast(1.08) sepia(0.18)',
  neon: 'saturate(1.55) contrast(1.15) hue-rotate(-12deg)',
  teal: 'saturate(1.08) contrast(1.06)',
  noir: 'grayscale(1) contrast(1.28) brightness(1.06)',
};

const state = {
  size: 'square',
  layout: 'quad',
  grade: 'sunset',
  title: 'NEON SHORE',
  subtitle: 'PALM TREES & MIDNIGHT LIGHTS',
  titleStyle: 'white',
  grain: true,
  palms: true,
  selectedPanel: 0,
  selectedPhoto: 0,
  photos: [], // { name, image }
  panels: [
    { photo: 0, zoom: 1, x: 0, y: 0 },
    { photo: 1, zoom: 1, x: 0, y: 0 },
    { photo: 2, zoom: 1, x: 0, y: 0 },
    { photo: 0, zoom: 1, x: 0, y: 0 },
  ],
};

const canvas = document.getElementById('coverCanvas');
const ctx = canvas.getContext('2d');
let grainTile = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not load ' + src));
    image.src = src;
  });
}

function makeGrainTile() {
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const tctx = tile.getContext('2d');
  const data = tctx.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 28;
  }
  tctx.putImageData(data, 0, 0);
  return tile;
}

// ---- layout geometry -------------------------------------------------------

function titleBandHeight(height) {
  return Math.round(height * 0.2);
}

function layoutPanels(layout, width, height) {
  const band = layout === 'solo' ? 0 : titleBandHeight(height);
  const photoH = height - band;
  const g = Math.max(6, Math.round(width * 0.009)); // gutter
  if (layout === 'hero') {
    const heroW = Math.round(width * 0.62);
    const sideW = width - heroW - g;
    const sideH = Math.round((photoH - g * 2) / 3);
    return [
      { x: 0, y: 0, w: heroW, h: photoH },
      { x: heroW + g, y: 0, w: sideW, h: sideH },
      { x: heroW + g, y: sideH + g, w: sideW, h: sideH },
      { x: heroW + g, y: (sideH + g) * 2, w: sideW, h: sideH },
    ];
  }
  if (layout === 'trio') {
    const w = Math.round((width - g * 2) / 3);
    return [
      { x: 0, y: 0, w, h: photoH },
      { x: w + g, y: 0, w, h: photoH },
      { x: (w + g) * 2, y: 0, w, h: photoH },
    ];
  }
  if (layout === 'solo') {
    return [{ x: 0, y: 0, w: width, h: height }];
  }
  // quad: 2 x 2
  const w = Math.round((width - g) / 2);
  const h = Math.round((photoH - g) / 2);
  return [
    { x: 0, y: 0, w, h },
    { x: w + g, y: 0, w, h },
    { x: 0, y: h + g, w, h },
    { x: w + g, y: h + g, w, h },
  ];
}

function panelCount(layout) {
  return layout === 'trio' ? 3 : layout === 'solo' ? 1 : 4;
}

// ---- drawing ---------------------------------------------------------------

function drawPhotoCover(target, image, rect, zoom, offsetX, offsetY) {
  const base = Math.max(rect.w / image.naturalWidth, rect.h / image.naturalHeight);
  const scale = base * zoom;
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (offsetX / 100) * rect.w * 0.5;
  const dy = rect.y + (rect.h - dh) / 2 + (offsetY / 100) * rect.h * 0.5;
  target.save();
  target.beginPath();
  target.rect(rect.x, rect.y, rect.w, rect.h);
  target.clip();
  target.drawImage(image, dx, dy, dw, dh);
  target.restore();
}

function drawEmptyPanel(target, rect, index) {
  const grad = target.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  grad.addColorStop(0, '#3a1445');
  grad.addColorStop(1, '#160a20');
  target.fillStyle = grad;
  target.fillRect(rect.x, rect.y, rect.w, rect.h);
  target.fillStyle = 'rgba(246,239,230,0.75)';
  target.font = `700 ${Math.max(14, rect.w * 0.045)}px sans-serif`;
  target.textAlign = 'center';
  target.textBaseline = 'middle';
  target.fillText(`Panel ${index + 1}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function gradeOverlay(target, width, height, grade) {
  target.save();
  if (grade === 'sunset') {
    const g = target.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(255,122,61,0.20)');
    g.addColorStop(0.55, 'rgba(255,46,136,0.12)');
    g.addColorStop(1, 'rgba(90,10,90,0.28)');
    target.globalCompositeOperation = 'soft-light';
    target.fillStyle = g;
    target.fillRect(0, 0, width, height);
  } else if (grade === 'neon') {
    const g = target.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, 'rgba(255,46,136,0.30)');
    g.addColorStop(1, 'rgba(46,230,214,0.30)');
    target.globalCompositeOperation = 'overlay';
    target.fillStyle = g;
    target.fillRect(0, 0, width, height);
  } else if (grade === 'teal') {
    target.globalCompositeOperation = 'soft-light';
    target.fillStyle = 'rgba(46,180,200,0.35)';
    target.fillRect(0, 0, width, height);
  } else {
    target.globalCompositeOperation = 'soft-light';
    target.fillStyle = 'rgba(255,255,255,0.14)';
    target.fillRect(0, 0, width, height);
  }
  target.restore();
}

function drawSunDisc(target, rects, grade) {
  if (grade !== 'sunset' && grade !== 'neon') return;
  // Keep the disc inside the first (largest) panel so it never blobs over a
  // neighbouring panel.
  const panel = rects[0];
  const cx = panel.x + panel.w * 0.68;
  const cy = panel.y + panel.h * 0.3;
  const r = Math.min(panel.w, panel.h) * 0.24;
  target.save();
  target.beginPath();
  target.rect(panel.x, panel.y, panel.w, panel.h);
  target.clip();
  const glow = target.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.1);
  glow.addColorStop(0, grade === 'neon' ? 'rgba(255,46,136,0.5)' : 'rgba(255,170,60,0.5)');
  glow.addColorStop(1, 'rgba(255,170,60,0)');
  target.globalCompositeOperation = 'screen';
  target.fillStyle = glow;
  target.fillRect(cx - r * 2.1, cy - r * 2.1, r * 4.2, r * 4.2);
  const disc = target.createLinearGradient(cx, cy - r, cx, cy + r);
  disc.addColorStop(0, '#ffe08a');
  disc.addColorStop(0.6, '#ff7a3d');
  disc.addColorStop(1, '#ff2e88');
  target.fillStyle = disc;
  target.beginPath();
  target.arc(cx, cy, r, 0, Math.PI * 2);
  target.fill();
  target.restore();
}

function drawPalmSilhouette(target, x, y, s, color) {
  target.save();
  target.strokeStyle = color;
  target.fillStyle = color;
  target.lineWidth = Math.max(2, s * 0.045);
  target.lineCap = 'round';
  // Trunk, leaning slightly.
  target.beginPath();
  target.moveTo(x, y);
  target.quadraticCurveTo(x + s * 0.08, y - s * 0.5, x + s * 0.22, y - s * 0.92);
  target.stroke();
  const topX = x + s * 0.22;
  const topY = y - s * 0.92;
  // Fronds: seven arcs fanning out from the crown.
  for (let i = 0; i < 7; i++) {
    const a = (-Math.PI * 0.92) + (i * Math.PI * 0.27);
    const ex = topX + Math.cos(a) * s * 0.52;
    const ey = topY + Math.sin(a) * s * 0.34 + s * 0.1;
    const mx = topX + Math.cos(a) * s * 0.3;
    const my = topY + Math.sin(a) * s * 0.12 - s * 0.12;
    target.beginPath();
    target.moveTo(topX, topY);
    target.quadraticCurveTo(mx, my, ex, ey);
    target.stroke();
  }
  // Coconuts.
  target.beginPath();
  target.arc(topX - s * 0.02, topY + s * 0.05, s * 0.035, 0, Math.PI * 2);
  target.arc(topX + s * 0.05, topY + s * 0.06, s * 0.03, 0, Math.PI * 2);
  target.fill();
  target.restore();
}

function fitTitleFont(target, text, maxWidth, startSize) {
  let size = startSize;
  target.font = `900 ${size}px "Arial Black", "Liberation Sans", "DejaVu Sans", sans-serif`;
  while (size > 24 && target.measureText(text).width > maxWidth) {
    size = Math.floor(size * 0.92);
    target.font = `900 ${size}px "Arial Black", "Liberation Sans", "DejaVu Sans", sans-serif`;
  }
  return size;
}

function drawTitleBlock(target, width, height, bandTop) {
  const bandH = height - bandTop;
  // Deep dusk band with a neon top rule.
  const bg = target.createLinearGradient(0, bandTop, 0, height);
  bg.addColorStop(0, '#1c0b28');
  bg.addColorStop(1, '#0d0613');
  target.fillStyle = bg;
  target.fillRect(0, bandTop, width, bandH);
  const rule = target.createLinearGradient(0, 0, width, 0);
  rule.addColorStop(0, '#ff7a3d');
  rule.addColorStop(0.5, '#ff2e88');
  rule.addColorStop(1, '#2ee6d6');
  target.fillStyle = rule;
  target.fillRect(0, bandTop, width, Math.max(3, width * 0.004));

  const pad = width * 0.05;
  const title = (state.title || 'NEON SHORE').toUpperCase();
  const titleSize = fitTitleFont(target, title, width - pad * 2, Math.round(bandH * 0.52));
  const titleY = bandTop + bandH * 0.52;
  target.textAlign = 'left';
  target.textBaseline = 'middle';
  target.lineJoin = 'round';
  target.lineWidth = Math.max(3, titleSize * 0.14);
  target.strokeStyle = 'rgba(10,4,16,0.9)';
  if (state.titleStyle === 'sunset') {
    const fill = target.createLinearGradient(0, titleY - titleSize * 0.5, 0, titleY + titleSize * 0.5);
    fill.addColorStop(0, '#ffe08a');
    fill.addColorStop(0.55, '#ff7a3d');
    fill.addColorStop(1, '#ff2e88');
    target.fillStyle = fill;
  } else if (state.titleStyle === 'neon') {
    target.shadowColor = '#ff2e88';
    target.shadowBlur = titleSize * 0.35;
    target.fillStyle = '#ffd7ec';
  } else {
    target.fillStyle = '#ffffff';
  }
  target.strokeText(title, pad, titleY);
  target.fillText(title, pad, titleY);
  target.shadowBlur = 0;

  // Subtitle, letterspaced caps.
  const sub = (state.subtitle || '').toUpperCase();
  if (sub) {
    const subSize = Math.max(13, Math.round(bandH * 0.13));
    target.font = `700 ${subSize}px "Segoe UI", Arial, sans-serif`;
    try { target.letterSpacing = `${Math.round(subSize * 0.28)}px`; } catch { /* older canvas */ }
    target.fillStyle = '#2ee6d6';
    target.fillText(sub, pad, bandTop + bandH * 0.86);
    try { target.letterSpacing = '0px'; } catch { /* older canvas */ }
  }

  // Palm silhouettes framing the band.
  if (state.palms) {
    const palmColor = 'rgba(6,2,10,0.85)';
    drawPalmSilhouette(target, width * 0.94, bandTop + bandH * 0.98, bandH * 1.15, palmColor);
  }
}

function drawSoloTitle(target, width, height) {
  // Scrim + title over the bottom of the single photo.
  const scrimH = Math.round(height * 0.3);
  const scrim = target.createLinearGradient(0, height - scrimH, 0, height);
  scrim.addColorStop(0, 'rgba(10,4,16,0)');
  scrim.addColorStop(1, 'rgba(10,4,16,0.88)');
  target.fillStyle = scrim;
  target.fillRect(0, height - scrimH, width, scrimH);
  const pad = width * 0.05;
  const title = (state.title || 'NEON SHORE').toUpperCase();
  const titleSize = fitTitleFont(target, title, width - pad * 2, Math.round(height * 0.085));
  const titleY = height - Math.round(height * 0.09);
  target.textAlign = 'left';
  target.textBaseline = 'middle';
  target.lineJoin = 'round';
  target.lineWidth = Math.max(3, titleSize * 0.14);
  target.strokeStyle = 'rgba(10,4,16,0.9)';
  target.fillStyle = state.titleStyle === 'sunset' ? '#ffcf6e' : '#ffffff';
  if (state.titleStyle === 'neon') {
    target.shadowColor = '#ff2e88';
    target.shadowBlur = titleSize * 0.3;
    target.fillStyle = '#ffd7ec';
  }
  target.strokeText(title, pad, titleY);
  target.fillText(title, pad, titleY);
  target.shadowBlur = 0;
  const sub = (state.subtitle || '').toUpperCase();
  if (sub) {
    target.font = `700 ${Math.max(13, Math.round(height * 0.02))}px "Segoe UI", Arial, sans-serif`;
    try { target.letterSpacing = '5px'; } catch { /* older canvas */ }
    target.fillStyle = '#2ee6d6';
    target.fillText(sub, pad, height - Math.round(height * 0.035));
    try { target.letterSpacing = '0px'; } catch { /* older canvas */ }
  }
}

function drawVignetteAndGrain(target, width, height) {
  const vg = target.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.42,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  vg.addColorStop(0, 'rgba(10,4,18,0)');
  vg.addColorStop(1, 'rgba(10,4,18,0.42)');
  target.fillStyle = vg;
  target.fillRect(0, 0, width, height);
  if (state.grain) {
    if (!grainTile) grainTile = makeGrainTile();
    target.save();
    target.globalAlpha = 0.5;
    target.fillStyle = target.createPattern(grainTile, 'repeat');
    target.fillRect(0, 0, width, height);
    target.restore();
  }
  // Thin poster frame.
  target.strokeStyle = 'rgba(246,239,230,0.9)';
  target.lineWidth = Math.max(2, width * 0.003);
  target.strokeRect(target.lineWidth / 2, target.lineWidth / 2, width - target.lineWidth, height - target.lineWidth);
}

// ---- main render -----------------------------------------------------------

function renderCover(target, width, height) {
  const t = target.getContext('2d');
  t.clearRect(0, 0, width, height);
  t.fillStyle = '#160a20';
  t.fillRect(0, 0, width, height);
  const rects = layoutPanels(state.layout, width, height);
  const count = panelCount(state.layout);
  const filter = GRADE_FILTERS[state.grade] || GRADE_FILTERS.sunset;
  for (let i = 0; i < count; i++) {
    const panel = state.panels[i] || { photo: 0, zoom: 1, x: 0, y: 0 };
    const photo = state.photos[panel.photo];
    if (photo && photo.image) {
      t.save();
      t.filter = filter;
      drawPhotoCover(t, photo.image, rects[i], panel.zoom, panel.x, panel.y);
      t.restore();
    } else {
      drawEmptyPanel(t, rects[i], i);
    }
  }
  const photoH = state.layout === 'solo' ? height : height - titleBandHeight(height);
  gradeOverlay(t, width, photoH, state.grade);
  // No extra sun on a full-bleed photo: the scene already carries its own.
  if (state.layout !== 'solo') drawSunDisc(t, rects, state.grade);
  if (state.layout === 'solo') {
    drawSoloTitle(t, width, height);
  } else {
    drawTitleBlock(t, width, height, photoH);
  }
  drawVignetteAndGrain(t, width, height);
  t.filter = 'none';
}

function renderPreview() {
  const size = EXPORT_SIZES[state.size];
  canvas.width = size.width;
  canvas.height = size.height;
  renderCover(canvas, size.width, size.height);
}

// ---- export ----------------------------------------------------------------

function exportPNG() {
  const size = EXPORT_SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = size.width;
  off.height = size.height;
  renderCover(off, size.width, size.height);
  const status = document.getElementById('status');
  off.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed in this browser — try again.';
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neon-palms-cover-${state.size}-${size.width}x${size.height}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    status.textContent = `Exported ${size.label} PNG — check your downloads.`;
  }, 'image/png');
}

// ---- UI --------------------------------------------------------------------

function refreshPhotoTray() {
  const tray = document.getElementById('photoTray');
  tray.innerHTML = '';
  state.photos.forEach((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-thumb' + (index === state.selectedPhoto ? ' is-active' : '');
    const img = document.createElement('img');
    img.src = photo.image.src;
    img.alt = photo.name;
    const label = document.createElement('span');
    label.textContent = photo.name;
    button.append(img, label);
    button.addEventListener('click', () => {
      state.selectedPhoto = index;
      const panel = state.panels[state.selectedPanel];
      if (panel) panel.photo = index;
      refreshPhotoTray();
      refreshPanelControls();
      renderPreview();
    });
    tray.appendChild(button);
  });
  refreshPanelPhotoSelect();
}

function refreshPanelPhotoSelect() {
  const select = document.getElementById('panelPhoto');
  select.innerHTML = '';
  state.photos.forEach((photo, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = photo.name;
    select.appendChild(option);
  });
  const panel = state.panels[state.selectedPanel];
  if (panel) select.value = String(panel.photo);
}

function refreshPanelControls() {
  const count = panelCount(state.layout);
  const label = document.getElementById('panelLabel');
  label.textContent = `Panel ${state.selectedPanel + 1} of ${count} — pick a photo for it below, then crop.`;
  const panel = state.panels[state.selectedPanel] || { photo: 0, zoom: 1, x: 0, y: 0 };
  document.getElementById('panelPhoto').value = String(panel.photo);
  document.getElementById('zoomSlider').value = String(Math.round(panel.zoom * 100));
  document.getElementById('zoomVal').textContent = `${Math.round(panel.zoom * 100)}%`;
  document.getElementById('panXSlider').value = String(panel.x);
  document.getElementById('panYSlider').value = String(panel.y);
}

function bindChoiceRow(rowId, onPick) {
  const row = document.getElementById(rowId);
  row.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      row.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      onPick(button);
      renderPreview();
    });
  });
}

function bindControls() {
  document.querySelectorAll('.size-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      state.size = button.dataset.size;
      renderPreview();
    });
  });
  bindChoiceRow('layoutRow', (button) => {
    state.layout = button.dataset.layout;
    state.selectedPanel = 0;
    refreshPanelControls();
  });
  bindChoiceRow('gradeRow', (button) => { state.grade = button.dataset.grade; });
  bindChoiceRow('titleStyleRow', (button) => { state.titleStyle = button.dataset.titleStyle; });

  document.getElementById('titleInput').addEventListener('input', (e) => {
    state.title = e.target.value;
    renderPreview();
  });
  document.getElementById('subtitleInput').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    renderPreview();
  });
  document.getElementById('panelPhoto').addEventListener('change', (e) => {
    const panel = state.panels[state.selectedPanel];
    if (panel) panel.photo = Number(e.target.value);
    renderPreview();
  });
  document.getElementById('zoomSlider').addEventListener('input', (e) => {
    const panel = state.panels[state.selectedPanel];
    if (panel) panel.zoom = Number(e.target.value) / 100;
    document.getElementById('zoomVal').textContent = `${e.target.value}%`;
    renderPreview();
  });
  document.getElementById('panXSlider').addEventListener('input', (e) => {
    const panel = state.panels[state.selectedPanel];
    if (panel) panel.x = Number(e.target.value);
    renderPreview();
  });
  document.getElementById('panYSlider').addEventListener('input', (e) => {
    const panel = state.panels[state.selectedPanel];
    if (panel) panel.y = Number(e.target.value);
    renderPreview();
  });
  document.getElementById('grainToggle').addEventListener('change', (e) => {
    state.grain = e.target.checked;
    renderPreview();
  });
  document.getElementById('palmsToggle').addEventListener('change', (e) => {
    state.palms = e.target.checked;
    renderPreview();
  });
  document.getElementById('fillAllBtn').addEventListener('click', () => {
    state.panels.forEach((panel) => { panel.photo = state.selectedPhoto; });
    refreshPanelControls();
    renderPreview();
    document.getElementById('status').textContent = 'Every panel now uses the selected photo.';
  });
  document.getElementById('photoFiles').addEventListener('change', (e) => {
    addUploadedPhotos(e.target.files);
    e.target.value = '';
  });
  document.getElementById('exportBtn').addEventListener('click', exportPNG);

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const rects = layoutPanels(state.layout, canvas.width, canvas.height);
    const hit = rects.findIndex((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    if (hit >= 0) {
      state.selectedPanel = hit;
      const panel = state.panels[hit];
      if (panel) state.selectedPhoto = panel.photo;
      refreshPhotoTray();
      refreshPanelControls();
      renderPreview();
    }
  });
}

function addUploadedPhotos(fileList) {
  const status = document.getElementById('status');
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
  if (!files.length) {
    status.textContent = 'Choose an image file to add it as a photo.';
    return;
  }
  let pending = files.length;
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      loadImage(reader.result).then((image) => {
        state.photos.push({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Photo', image });
        pending -= 1;
        if (pending === 0) {
          state.selectedPhoto = state.photos.length - 1;
          refreshPhotoTray();
          refreshPanelControls();
          renderPreview();
          status.textContent = `${files.length} photo${files.length > 1 ? 's' : ''} added — click a panel, then pick a photo for it.`;
        }
      });
    };
    reader.readAsDataURL(file);
  });
}

async function loadSamplePhotos() {
  const status = document.getElementById('status');
  for (const scene of SAMPLE_SCENES) {
    try {
      const image = await loadImage(`samples/${scene.file}`);
      state.photos.push({ name: scene.name, image });
      refreshPhotoTray();
      renderPreview();
    } catch {
      status.textContent = `Sample scene ${scene.file} did not load — add your own photo.`;
    }
  }
  if (state.photos.length) {
    status.textContent = 'Ready — tweak the caption, pick a layout and export your PNG.';
  }
}

// ---- fixed screenshot scenes (?shot=cover / ?shot=editor) -------------------

async function runShotScene(query) {
  const shot = query.get('shot');
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const size = query.get('size');
  if (size && EXPORT_SIZES[size]) {
    state.size = size;
    document.querySelectorAll('.size-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.size === size);
    });
  }
  const layout = query.get('layout');
  if (layout && ['quad', 'hero', 'trio', 'solo'].includes(layout)) state.layout = layout;
  const grade = query.get('grade');
  if (grade && GRADE_FILTERS[grade]) state.grade = grade;
  const photo = query.get('photo');
  if (photo !== null && !Number.isNaN(Number(photo))) {
    state.panels[0].photo = Number(photo);
    state.selectedPhoto = Number(photo);
  }
  const caption = query.get('caption');
  if (caption) {
    state.title = caption;
    document.getElementById('titleInput').value = caption;
  }
  const subtitle = query.get('subtitle');
  if (subtitle) {
    state.subtitle = subtitle;
    document.getElementById('subtitleInput').value = subtitle;
  }
  await loadSamplePhotos();
  renderPreview();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}

// ---- boot ------------------------------------------------------------------

bindControls();
refreshPanelControls();
renderPreview();
const query = new URLSearchParams(window.location.search);
if (query.get('shot')) {
  runShotScene(query);
} else {
  loadSamplePhotos();
}
