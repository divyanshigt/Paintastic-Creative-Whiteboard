'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const bg = $('#background');
const bgctx = bg.getContext('2d');
const viewport = $('#viewport');

let W = 1200;
let H = 800;

const KEY = 'paintastic.infinite.v1';
const MAX_HISTORY = 32;
const imageCache = new Map();

let camera = { x: 0, y: 0 };
let operations = [];
let pending = null;
let renderFrame = 0;

const stroke = document.createElement('canvas');
const sx = stroke.getContext('2d');

let tool = 'pen';
let color = '#6554c0';
let colorEnd = '#f39cc3';
let size = 6;
let opacity = 1;
let inkMode = 'solid';

let paper = '#ffffff';
let gridColor = '#d8d9e9';
let pattern = 'dots';
let spacing = 24;

let drawing = false;
let activeId = null;
let points = [];
let particles = [];
let history = [];
let index = -1;
let busy = false;
let zoom = 1;
let space = false;
let pan = null;
let raf = 0;
let saveTimer;
let toastTimer;
let textPoint = null;
let initialized = false;

const icons = {
  pen: 'M4 20l4-1L21 6l-5-5L3 14l-1 8 2-2M13 4l5 5M3 14l5 5',
  pencil: 'M4 20l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L4 16l-1 5 1-1M14 6l5 5',
  brush: 'M14 4l6-2-2 6-8 8-4-4 8-8M6 12c-6 1-1 6-5 9 7 1 10-3 8-7',
  highlighter: 'M9 3l10 10-6 6L3 9 9 3M5 11l-3 5 4 4 5-3M2 22h18',
  glitter: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2M20 2v4M18 4h4',
  eraser: 'M3 13l9-10a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-8 9H9l-6-5a2 2 0 0 1 0-3M7 9l10 9M13 21h9',
  text: 'M3 4h18M12 4v17M7 21h10M3 4v4M21 4v4',
  fill: 'M6 3l12 12-8 7L1 13 12 2M3 12h12M21 15c-5 5-3 8 0 8s5-3 0-8',
  picker: 'M14 3l7 7M11 6l7 7-9 9H3v-6L17 2a2 2 0 0 1 3 3L6 19',
  rectangle: 'M3 4h18v16H3V4',
  triangle: 'M12 3L22 21H2L12 3',
  circle: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  line: 'M3 21L21 3',
  hand: 'M6 12V7a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v6c0 5-3 8-8 8-3 0-5-2-7-4l-5-5c-2-2 1-4 3-2l3 3',
  undo: 'M9 4L3 10l6 6M3 10h11a7 7 0 0 1 0 14',
  redo: 'M15 4l6 6-6 6M21 10H10a7 7 0 0 0 0 14'
};

const labels = {
  pen: 'Pen',
  pencil: 'Pencil',
  brush: 'Brush',
  highlighter: 'Highlighter',
  glitter: 'Glitter pen',
  eraser: 'Eraser',
  text: 'Text',
  fill: 'Bucket fill',
  picker: 'Color picker',
  rectangle: 'Rectangle',
  circle: 'Ellipse',
  triangle: 'Triangle',
  line: 'Line',
  hand: 'Hand'
};

const keys = {
  p: 'pen',
  n: 'pencil',
  b: 'brush',
  h: 'highlighter',
  g: 'glitter',
  e: 'eraser',
  t: 'text',
  f: 'fill',
  i: 'picker'
};

const freehand = [
  'pen', 'pencil', 'brush', 'highlighter', 'glitter', 'eraser'
];

function svg(name) {
  return `<svg viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><path d="${icons[name]}"/></svg>`;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').classList.remove('visible');
  }, 2600);
}

function status(message) {
  $('#save-status').textContent = message;
}

Object.keys(labels).forEach(name => {
  const button = document.createElement('button');
  const key = Object.keys(keys).find(k => keys[k] === name);

  button.className = 'tool-button';
  button.dataset.tool = name;
  button.dataset.tip = labels[name] + (key ? ' · ' + key.toUpperCase() : '');
  button.setAttribute('aria-label', labels[name]);
  button.innerHTML = svg(name);
  button.onclick = () => selectTool(name);

  $('#tools').append(button);
});

$('#undo').innerHTML = svg('undo');
$('#redo').innerHTML = svg('redo');

function cursor() {
  let value = 'crosshair';

  if (tool === 'hand') {
    value = 'grab';
  } else if (tool === 'text') {
    value = 'text';
  } else if (tool === 'eraser') {
    value = 'none';
  } else {
    const glyph = svg(tool)
      .replace('currentColor', color)
      .replace(
        '<svg ',
        '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" '
      )
      .replace('stroke-width="1.6"', 'stroke-width="2"');

    value = `url("data:image/svg+xml,${encodeURIComponent(glyph)}") 3 24, crosshair`;
  }

  canvas.style.cursor = value;
}

function selectTool(name) {
  if (drawing || pan || busy) return;

  $('#cursor-preview').style.display = 'none';
  tool = name;

  update();
  preview();
  cursor();
}

function update() {
  const shape = ['rectangle', 'circle', 'triangle', 'line'].includes(tool);

  $$('[data-tool]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.tool === tool)
    );
  });

  $('#tool-name').textContent = labels[tool] + ' studio';
  $('#tool-symbol').innerHTML = svg(tool);

  $('#text-settings').hidden = tool !== 'text';
  $('#shape-settings').hidden = !shape;
  $('#size-value').value = size + ' px';
  $('#opacity-value').value = Math.round(opacity * 100) + '%';

  const hints = {
    text: 'click to type',
    hand: 'drag to explore',
    fill: 'tap a closed region',
    picker: 'tap to sample'
  };

  $('#tool-status').textContent =
    labels[tool] + ' · ' + (hints[tool] || 'make your mark');

  $$('[data-size]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(Number(button.dataset.size) === size)
    );
  });

  $('#undo').disabled = index <= 0 || busy || drawing;
  $('#redo').disabled = index >= history.length - 1 || busy || drawing;

  for (const id of ['#download', '#clear', '#clear-bottom', '#template']) {
    $(id).disabled = busy || drawing;
  }

  $('#gradient-row').hidden = inkMode !== 'gradient';
  $('#hex-label').textContent = color.toUpperCase();

  $('#ink-label').textContent =
    tool === 'glitter' ? 'A little sparkle makes everything better' :
    tool === 'highlighter' ? 'Soft, translucent ink for bright ideas' :
    tool === 'text' ? 'Click the board to put it into words' :
    'Your next great idea starts here';
}

function setColor(value) {
  color = value;
  $('#color').value = value;

  $$('[data-color]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.color === color)
    );
  });

  update();
  cursor();
  preview();
}

const colors = [
  '#6554c0', '#27283b', '#ffffff', '#e46e89',
  '#f1a24b', '#f0d66c', '#72b693', '#57a6ba',
  '#76a1e4', '#b18ae0', '#bc7a52', '#ed9ec7'
];

colors.forEach(c => {
  const button = document.createElement('button');
  button.dataset.color = c;
  button.style.background = c;
  button.setAttribute('aria-label', 'Ink color ' + c);
  button.onclick = () => setColor(c);
  $('#palette').append(button);
});

[
  '#ffffff', '#fbf5e8', '#fcecf0',
  '#ecf5ee', '#edf2fc', '#252b3a'
].forEach(c => {
  const button = document.createElement('button');
  button.dataset.paper = c;
  button.style.background = c;
  button.setAttribute('aria-label', 'Paper color ' + c);
  button.onclick = () => changeBackground({ paper: c });
  $('#paper-colors').append(button);
});

function backgroundState() {
  return { paper, gridColor, pattern, spacing };
}

function backgroundSync() {
  $('#paper-color').value = paper;
  $('#grid-color').value = gridColor;
  $('#grid-spacing').value = spacing;
  $('#grid-value').value = spacing + ' px';

  $$('[data-bg]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.bg === pattern)
    );
  });

  $$('[data-paper]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.paper === paper)
    );
  });
}

function drawBackground(c, width, height, cam, scale) {
  c.fillStyle = paper;
  c.fillRect(0, 0, width, height);
  c.strokeStyle = gridColor;
  c.fillStyle = gridColor;
  c.lineWidth = 1;

  const step = spacing * scale;

  // Hide an excessively dense grid when zoomed far out.
  if (pattern === 'plain' || step < 3) return;

  const ox = (((-cam.x * scale) % step) + step) % step;
  const oy = (((-cam.y * scale) % step) + step) % step;

  if (pattern === 'dots') {
    for (let y = oy; y < height; y += step) {
      for (let x = ox; x < width; x += step) {
        c.beginPath();
        c.arc(x, y, Math.max(.6, 1.15 * scale), 0, Math.PI * 2);
        c.fill();
      }
    }
  } else {
    c.beginPath();

    for (let y = oy; y < height; y += step) {
      c.moveTo(0, y);
      c.lineTo(width, y);
    }

    if (pattern === 'grid') {
      for (let x = ox; x < width; x += step) {
        c.moveTo(x, 0);
        c.lineTo(x, height);
      }
    }

    c.stroke();
  }
}

function paintBackground() {
  drawBackground(bgctx, W, H, camera, zoom);
  backgroundSync();
}

function changeBackground(values) {
  if (busy || drawing) return;

  ({ paper, gridColor, pattern, spacing } = {
    ...backgroundState(),
    ...values
  });

  paintBackground();
  commit();
}

function scheduleSave() {
  if (!initialized) return;

  clearTimeout(saveTimer);
  status('Saving your ideas…');

  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        operations,
        camera,
        zoom,
        title: $('#art-title').value,
        background: backgroundState()
      }));

      status('Saved on this browser');
    } catch {
      status('Storage full or unavailable · export to keep');
    }
  }, 600);
}

function commit() {
  history = history.slice(0, index + 1);

  history.push({
    operations: operations.slice(),
    background: backgroundState()
  });

  if (history.length > MAX_HISTORY) history.shift();

  index = history.length - 1;
  update();
  scheduleSave();
}

function undo(delta) {
  if (drawing || busy || pan) return;

  const next = index + delta;
  if (next < 0 || next >= history.length) return;

  index = next;
  operations = history[index].operations.slice();

  ({ paper, gridColor, pattern, spacing } = history[index].background);

  renderBoard();
  update();
  scheduleSave();
}

// Convert screen coordinates to unlimited world coordinates.
function xy(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: camera.x + (event.clientX - rect.left) / zoom,
    y: camera.y + (event.clientY - rect.top) / zoom,
    pressure: event.pointerType === 'pen'
      ? Math.max(.15, event.pressure || .5)
      : .5
  };
}

function operationInk(c, op, from, to) {
  if (op.inkMode === 'solid') return op.color;

  const gradient = c.createLinearGradient(
    from.x,
    from.y,
    to.x === from.x ? to.x + 1 : to.x,
    to.y
  );

  const stops = op.inkMode === 'gradient'
    ? [op.color, op.colorEnd]
    : ['#e2699b', '#f3ad4d', '#ded64a', '#62b88b', '#57a6db', '#a179dd'];

  stops.forEach((value, i) => {
    gradient.addColorStop(i / (stops.length - 1), value);
  });

  return gradient;
}

function ink(c, from, to) {
  return operationInk(c, { color, colorEnd, inkMode }, from, to);
}

function smoothingPath(c, list) {
  c.beginPath();
  c.moveTo(list[0].x, list[0].y);

  for (let i = 1; i < list.length - 1; i++) {
    c.quadraticCurveTo(
      list[i].x,
      list[i].y,
      (list[i].x + list[i + 1].x) / 2,
      (list[i].y + list[i + 1].y) / 2
    );
  }

  if (list.length > 1) {
    c.lineTo(list.at(-1).x, list.at(-1).y);
  }
}

function sparkle(c, x, y, r, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r * .25, y - r * .25);
  c.lineTo(x + r, y);
  c.lineTo(x + r * .25, y + r * .25);
  c.lineTo(x, y + r);
  c.lineTo(x - r * .25, y + r * .25);
  c.lineTo(x - r, y);
  c.lineTo(x - r * .25, y - r * .25);
  c.closePath();
  c.fill();
}

function currentOperation() {
  return {
    tool,
    color,
    colorEnd,
    inkMode,
    size,
    opacity,
    points: points.map(p => ({ ...p })),
    particles: particles.map(p => ({ ...p })),
    fill: $('#fill-shape').checked
  };
}

function paintOperation(c, op) {
  if (op.tool === 'image' || op.tool === 'patch') {
    const image = imageCache.get(op.src);

    if (image) {
      if (op.tool === 'patch') {
        c.clearRect(op.x, op.y, op.w, op.h);
      }

      c.drawImage(image, op.x, op.y, op.w, op.h);
    }

    return;
  }

  const {
    tool: type,
    size: width,
    opacity: alpha,
    points: list,
    particles: glitter
  } = op;

  c.globalAlpha = alpha * (
    type === 'highlighter' ? .28 :
    type === 'pencil' ? .75 : 1
  );

  c.globalCompositeOperation =
    type === 'eraser' ? 'destination-out' : 'source-over';

  if (type === 'eraser') c.globalAlpha = 1;

  if (type === 'text') {
    c.font = op.font;
    c.textBaseline = 'top';

    c.fillStyle = operationInk(
      c, op,
      { x: op.x, y: op.y },
      { x: op.x + op.w, y: op.y }
    );

    op.lines.forEach((line, i) => {
      c.fillText(line, op.x, op.y + i * op.lineHeight);
    });

    return;
  }

  const first = list[0];
  const end = list.at(-1);
  const paint = operationInk(c, op, first, end);

  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = paint;
  c.fillStyle = paint;

  c.lineWidth =
    type === 'pencil' ? Math.max(1, width * .45) :
    type === 'highlighter' ? width * 2.5 :
    width;

  if (freehand.includes(type)) {
    if (type === 'glitter') {
      for (const p of glitter) {
        c.globalAlpha = p.alpha * alpha;

        if (p.star) {
          sparkle(c, p.x, p.y, p.r, p.white ? '#ffffff' : paint);
        } else {
          c.fillStyle = p.white ? '#fff4bd' : paint;
          c.beginPath();
          c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else if (list.length === 1) {
      c.beginPath();
      c.arc(first.x, first.y, c.lineWidth / 2, 0, Math.PI * 2);
      c.fill();
    } else if (
      type === 'brush' &&
      list.some(p => p.pressure !== .5)
    ) {
      for (let i = 1; i < list.length; i++) {
        c.lineWidth = width * (.35 + list[i].pressure * 1.3);
        c.beginPath();
        c.moveTo(list[i - 1].x, list[i - 1].y);
        c.lineTo(list[i].x, list[i].y);
        c.stroke();
      }
    } else {
      smoothingPath(c, list);
      c.stroke();
    }

    return;
  }

  c.beginPath();

  if (type === 'rectangle') {
    c.rect(
      first.x,
      first.y,
      end.x - first.x,
      end.y - first.y
    );
  } else if (type === 'circle') {
    c.ellipse(
      (first.x + end.x) / 2,
      (first.y + end.y) / 2,
      Math.abs(end.x - first.x) / 2,
      Math.abs(end.y - first.y) / 2,
      0, 0, Math.PI * 2
    );
  } else if (type === 'triangle') {
    c.moveTo((first.x + end.x) / 2, first.y);
    c.lineTo(end.x, end.y);
    c.lineTo(first.x, end.y);
    c.closePath();
  } else {
    c.moveTo(first.x, first.y);
    c.lineTo(end.x, end.y);
  }

  if (op.fill && type !== 'line') c.fill();
  else c.stroke();
}

function drawWorldOperation(c, op, cam, scale) {
  c.save();
  c.setTransform(
    scale, 0, 0, scale,
    -cam.x * scale,
    -cam.y * scale
  );
  paintOperation(c, op);
  c.restore();
}

function renderBoard() {
  paintBackground();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  for (const op of operations) {
    drawWorldOperation(ctx, op, camera, zoom);
  }

  if (pending) {
    drawWorldOperation(ctx, pending, camera, zoom);
  }
}

function queueBoard() {
  if (renderFrame) return;

  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    renderBoard();
  });
}

function renderStroke() {
  raf = 0;
  if (!drawing || pan) return;

  pending = currentOperation();

  // Reuse the artwork snapshot during a stroke.
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(stroke, 0, 0);
  drawWorldOperation(ctx, pending, camera, zoom);
}

function addSparkles(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);

  const steps = Math.min(
    2048,
    Math.max(1, Math.ceil(distance / Math.max(1, size * .12)))
  );

  for (let i = 1; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps;
    const y = a.y + (b.y - a.y) * i / steps;

    for (let j = 0; j < 4; j++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * Math.max(5, size * .8);

      particles.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        r: .45 + Math.random() * Math.max(1, size * .12),
        white: Math.random() < .23,
        star: Math.random() < .16,
        alpha: .5 + Math.random() * .5
      });
    }
  }
}

function queueStroke() {
  if (!raf) raf = requestAnimationFrame(renderStroke);
}

function flood(worldPoint) {
  const p = {
    x: (worldPoint.x - camera.x) * zoom,
    y: (worldPoint.y - camera.y) * zoom
  };

  if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return false;

  const image = ctx.getImageData(0, 0, W, H);
  const data = image.data;
  const seed = Math.floor(p.y) * W + Math.floor(p.x);
  const offset = seed * 4;
  const target = Array.from(data.slice(offset, offset + 4));
  const rgb = color.slice(1).match(/../g).map(v => parseInt(v, 16));
  const alpha = Math.round(opacity * 255);

  if (rgb.every((v, i) => v === target[i]) && alpha === target[3]) {
    return false;
  }

  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);

  let head = 0;
  let tail = 0;

  queue[tail++] = seed;
  seen[seed] = 1;

  while (head < tail) {
    const n = queue[head++];
    const i = n * 4;

    const matches = target[3] === 0
      ? data[i + 3] === 0
      : Math.max(
          ...target.map((v, j) => Math.abs(data[i + j] - v))
        ) <= 32;

    if (!matches) continue;

    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = alpha;

    const x = n % W;

    const add = k => {
      if (!seen[k]) {
        seen[k] = 1;
        queue[tail++] = k;
      }
    };

    if (x > 0) add(n - 1);
    if (x < W - 1) add(n + 1);
    if (n >= W) add(n - W);
    if (n < W * (H - 1)) add(n + W);
  }

  ctx.putImageData(image, 0, 0);

  const src = canvas.toDataURL();
  const copy = document.createElement('canvas');
  copy.width = W;
  copy.height = H;
  copy.getContext('2d').putImageData(image, 0, 0);

  imageCache.set(src, copy);

  operations.push({
    tool: 'patch',
    src,
    x: camera.x,
    y: camera.y,
    w: W / zoom,
    h: H / zoom
  });

  toast('Fill applies to this visible area.');
  return true;
}

function sample(worldPoint) {
  const x = Math.floor((worldPoint.x - camera.x) * zoom);
  const y = Math.floor((worldPoint.y - camera.y) * zoom);

  const temp = document.createElement('canvas');
  temp.width = 1;
  temp.height = 1;

  const c = temp.getContext('2d');
  c.drawImage(bg, x, y, 1, 1, 0, 0, 1, 1);
  c.drawImage(canvas, x, y, 1, 1, 0, 0, 1, 1);

  const data = c.getImageData(0, 0, 1, 1).data;

  setColor('#' + Array.from(data).slice(0, 3)
    .map(v => v.toString(16).padStart(2, '0'))
    .join(''));

  toast('Color picked: ' + color.toUpperCase());
}

function pointerDown(event) {
  if (busy || drawing || pan || event.button > 1) return;

  event.preventDefault();

  if (tool === 'hand' || space || event.button === 1) {
    pan = {
      x: event.clientX,
      y: event.clientY,
      left: camera.x,
      top: camera.y
    };

    activeId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    viewport.classList.add('panning');
    return;
  }

  if (event.button !== 0) return;

  const p = xy(event);

  if (tool === 'text') {
    textPoint = p;
    $('#text-input').value = '';
    $('#text-dialog').showModal();
    $('#text-input').focus();
    return;
  }

  if (tool === 'picker') {
    sample(p);
    return;
  }

  if (tool === 'fill') {
    if (flood(p)) commit();
    return;
  }

  drawing = true;
  activeId = event.pointerId;
  points = [p];
  particles = [];

  stroke.width = W;
  stroke.height = H;
  sx.clearRect(0, 0, W, H);
  sx.drawImage(canvas, 0, 0);

  if (tool === 'glitter') addSparkles(p, p);

  canvas.setPointerCapture(event.pointerId);
  update();
  renderStroke();
}

function previewCursor(event) {
  const ring = $('#cursor-preview');

  if (event.pointerType === 'touch' || tool !== 'eraser') {
    ring.style.display = 'none';
    return;
  }

  const rect = canvas.getBoundingClientRect();

  ring.style.display = 'block';
  ring.style.left = event.clientX - rect.left + 'px';
  ring.style.top = event.clientY - rect.top + 'px';
  ring.style.width = size * zoom + 'px';
  ring.style.height = size * zoom + 'px';
  ring.style.borderRadius = '50%';
}

function pointerMove(event) {
  previewCursor(event);

  if (event.pointerId !== activeId) return;

  if (pan) {
    camera.x = pan.left - (event.clientX - pan.x) / zoom;
    camera.y = pan.top - (event.clientY - pan.y) / zoom;
    queueBoard();
    return;
  }

  if (!drawing) return;

  const events = typeof event.getCoalescedEvents === 'function'
    ? event.getCoalescedEvents()
    : [];

  for (const item of events.length ? events : [event]) {
    const p = xy(item);
    const previous = points.at(-1);

    if (Math.hypot(p.x - previous.x, p.y - previous.y) < .4) {
      continue;
    }

    if (tool === 'glitter') addSparkles(previous, p);
    points.push(p);
  }

  queueStroke();
}

function finish(event) {
  if (event.pointerId !== activeId) return;

  if (pan) {
    pan = null;
    viewport.classList.remove('panning');
    scheduleSave();
  } else if (drawing) {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    if (event.type === 'pointerup') {
      pointerMove(event);

      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }

      operations.push(currentOperation());
    }

    drawing = false;
    pending = null;
    renderBoard();

    if (event.type === 'pointerup') commit();

    points = [];
    particles = [];
  }

  const id = activeId;
  activeId = null;

  if (canvas.hasPointerCapture(id)) {
    canvas.releasePointerCapture(id);
  }

  update();
}

canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('pointerup', finish);
canvas.addEventListener('pointercancel', finish);
canvas.addEventListener('lostpointercapture', finish);

canvas.addEventListener('pointerleave', () => {
  $('#cursor-preview').style.display = 'none';
});

function zoomLabel() {
  return (
    zoom < .01
      ? (zoom * 100).toPrecision(2)
      : Math.round(zoom * 100)
  ) + '%';
}

function setZoom(value, anchor) {
  if (drawing || pan) return;

  const rect = canvas.getBoundingClientRect();

  const a = anchor || {
    x: rect.left + W / 2,
    y: rect.top + H / 2
  };

  const p = xy({
    clientX: a.x,
    clientY: a.y
  });

  zoom = Math.max(.000001, Math.min(4, value));

  camera.x = p.x - (a.x - rect.left) / zoom;
  camera.y = p.y - (a.y - rect.top) / zoom;

  $('#zoom-reset').textContent = zoomLabel();
  $('#zoom-out').disabled = zoom <= .000001;
  $('#zoom-in').disabled = zoom >= 4;

  renderBoard();
  scheduleSave();
}

function bounds() {
  let box = null;

  for (const op of operations) {
    if (op.tool === 'eraser') continue;

    let b;

    if (op.points) {
      const pad = op.size * 2 + 3;
      b = { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity };

      for (const p of op.points) {
        b.x = Math.min(b.x, p.x - pad);
        b.y = Math.min(b.y, p.y - pad);
        b.r = Math.max(b.r, p.x + pad);
        b.b = Math.max(b.b, p.y + pad);
      }
    } else {
      b = {
        x: op.x,
        y: op.y,
        r: op.x + op.w,
        b: op.y + op.h
      };
    }

    if (!box) {
      box = b;
    } else {
      box = {
        x: Math.min(box.x, b.x),
        y: Math.min(box.y, b.y),
        r: Math.max(box.r, b.r),
        b: Math.max(box.b, b.b)
      };
    }
  }

  return box;
}

function fit() {
  if (drawing || pan) return;

  const b = bounds();

  if (!b) {
    camera = { x: 0, y: 0 };
    setZoom(1);
    camera = { x: 0, y: 0 };
    renderBoard();
    scheduleSave();
    return;
  }

  setZoom(Math.min(
    Math.max(50, W - 160) / Math.max(1, b.r - b.x),
    Math.max(50, H - 180) / Math.max(1, b.b - b.y),
    1
  ));

  camera = {
    x: (b.x + b.r) / 2 - W / (2 * zoom),
    y: (b.y + b.b) / 2 - H / (2 * zoom)
  };

  renderBoard();
  scheduleSave();
}

$('#zoom-in').onclick = () => setZoom(zoom * 1.2);
$('#zoom-out').onclick = () => setZoom(zoom / 1.2);
$('#zoom-reset').onclick = () => setZoom(1);
$('#fit').onclick = fit;

viewport.addEventListener('wheel', event => {
  event.preventDefault();

  if (drawing || pan || busy) return;

  if (event.ctrlKey || event.metaKey) {
    setZoom(zoom * Math.exp(-event.deltaY * .002), {
      x: event.clientX,
      y: event.clientY
    });
  } else {
    const unit =
      event.deltaMode === 1 ? 16 :
      event.deltaMode === 2 ? H : 1;

    camera.x += (
      event.shiftKey ? event.deltaY : event.deltaX
    ) * unit / zoom;

    camera.y += (
      event.shiftKey ? 0 : event.deltaY
    ) * unit / zoom;

    queueBoard();
    scheduleSave();
  }
}, { passive: false });

function resizeBoard() {
  const width = Math.max(1, Math.floor(viewport.clientWidth));
  const height = Math.max(1, Math.floor(viewport.clientHeight));

  if (width === W && height === H) return;

  if (drawing || pan) {
    finish({ pointerId: activeId, type: 'pointercancel' });
  }

  W = width;
  H = height;

  canvas.width = bg.width = W;
  canvas.height = bg.height = H;

  renderBoard();
}

new ResizeObserver(resizeBoard).observe(viewport);

function hslHex(h) {
  const saturation = .65;
  const lightness = .58;
  const a = saturation * Math.min(lightness, 1 - lightness);

  const f = n => {
    const k = (n + h / 30) % 12;

    return Math.round(
      255 * (
        lightness -
        a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      )
    ).toString(16).padStart(2, '0');
  };

  return '#' + f(0) + f(8) + f(4);
}

function preview() {
  const c = $('#stroke-preview').getContext('2d');

  c.clearRect(0, 0, 440, 100);
  c.lineWidth = Math.min(
    32,
    tool === 'highlighter' ? size * 2 :
    tool === 'pencil' ? size * .45 : size
  );

  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = ink(c, { x: 25, y: 50 }, { x: 415, y: 50 });
  c.fillStyle = c.strokeStyle;
  c.globalAlpha = opacity * (tool === 'highlighter' ? .28 : 1);

  if (tool === 'text') {
    c.font = '32px ' + $('#font-family').value;
    c.fillText('Hello, imagination.', 25, 65);
  } else if (tool === 'glitter') {
    for (let i = 0; i < 100; i++) {
      const x = 25 + i * 3.9;
      const y = 50 + Math.sin(i / 12) * 17;

      sparkle(
        c, x, y + (i % 5 - 2) * 5,
        1 + (i % 4),
        i % 5 === 0 ? '#e7c56d' : c.strokeStyle
      );
    }
  } else {
    c.beginPath();
    c.moveTo(25, 60);
    c.bezierCurveTo(100, -5, 125, 100, 215, 50);
    c.bezierCurveTo(290, 0, 300, 95, 415, 40);
    c.stroke();
  }

  c.globalAlpha = 1;
}

$('#color').oninput = e => setColor(e.target.value);

$('#color-end').oninput = e => {
  colorEnd = e.target.value;
  preview();
};

$('#hue').oninput = e => setColor(hslHex(Number(e.target.value)));

$('#size').oninput = e => {
  size = Number(e.target.value);
  update();
  preview();
};

$$('[data-size]').forEach(button => {
  button.onclick = () => {
    size = Number(button.dataset.size);
    $('#size').value = size;
    update();
    preview();
  };
});

$('#opacity').oninput = e => {
  opacity = Number(e.target.value) / 100;
  update();
  preview();
};

$('#ink-mode').onchange = e => {
  inkMode = e.target.value;
  update();
  preview();
};

$('#font-family').onchange = preview;

$$('[data-bg]').forEach(button => {
  button.onclick = () => changeBackground({
    pattern: button.dataset.bg
  });
});

$('#paper-color').onchange = e => changeBackground({
  paper: e.target.value
});

$('#grid-color').onchange = e => changeBackground({
  gridColor: e.target.value
});

$('#grid-spacing').oninput = e => {
  $('#grid-value').value = e.target.value + ' px';
};

$('#grid-spacing').onchange = e => changeBackground({
  spacing: Number(e.target.value)
});

$('#undo').onclick = () => undo(-1);
$('#redo').onclick = () => undo(1);
$('#art-title').oninput = scheduleSave;
$('#text-cancel').onclick = () => $('#text-dialog').close();

$('#text-form').onsubmit = event => {
  event.preventDefault();

  const value = $('#text-input').value;
  if (!value.trim() || !textPoint) return;

  const fontSize = Number($('#font-size').value);
  const lineHeight = fontSize * 1.3;
  const font = (
    $('#bold').checked ? '700 ' : '400 '
  ) + fontSize + 'px ' + $('#font-family').value;

  ctx.font = font;

  const lines = value.split('\n');
  const width = Math.max(
    1,
    ...lines.map(line => ctx.measureText(line).width)
  );

  operations.push({
    tool: 'text',
    x: textPoint.x,
    y: textPoint.y,
    w: width,
    h: lines.length * lineHeight,
    font,
    lineHeight,
    lines,
    color,
    colorEnd,
    inkMode,
    opacity
  });

  renderBoard();
  commit();
  $('#text-dialog').close();
};

function confirmReplace(message) {
  if (busy || drawing || pan) return Promise.resolve(false);

  $('#confirm-text').textContent = message;

  const dialog = $('#confirm-dialog');
  dialog.returnValue = '';
  dialog.showModal();

  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
    }, { once: true });
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function useTemplate(name, ask = true) {
  if (busy || drawing || pan) return;

  if (
    ask &&
    !await confirmReplace('Replace all artwork? You can undo this.')
  ) return;

  busy = true;
  update();

  try {
    if (name === 'blank') {
      operations = [];
    } else {
      const image = await loadImage('art/' + name + '.svg');
      const temp = document.createElement('canvas');

      temp.width = 1200;
      temp.height = 800;

      const c = temp.getContext('2d');
      c.drawImage(image, 0, 0, 1200, 800);

      const imageData = c.getImageData(0, 0, 1200, 800);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i] > 245 &&
          data[i + 1] > 245 &&
          data[i + 2] > 245
        ) {
          data[i + 3] = 0;
        }
      }

      c.putImageData(imageData, 0, 0);

      const src = temp.toDataURL();
      imageCache.set(src, temp);

      operations = [{
        tool: 'image',
        src,
        x: 0,
        y: 0,
        w: 1200,
        h: 800
      }];

      tool = 'fill';
      cursor();
      preview();
    }

    renderBoard();
    commit();
    fit();
  } catch {
    toast('Page could not load. Your artwork is safe.');
  } finally {
    busy = false;
    $('#template').value = '';
    update();
  }
}

$('#template').onchange = e => {
  if (e.target.value) useTemplate(e.target.value);
};

$('#clear').onclick = () => useTemplate('blank');
$('#clear-bottom').onclick = () => useTemplate('blank');

$('#download').onclick = () => {
  const b = bounds() || {
    x: camera.x,
    y: camera.y,
    r: camera.x + W / zoom,
    b: camera.y + H / zoom
  };

  const width = b.r - b.x + 40;
  const height = b.b - b.y + 40;

  // Keep a very large drawing within practical PNG memory limits.
  const scale = Math.min(
    1,
    8192 / width,
    8192 / height,
    Math.sqrt(16000000 / (width * height))
  );

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.ceil(width * scale));
  out.height = Math.max(1, Math.ceil(height * scale));

  const c = out.getContext('2d');
  const exportCamera = { x: b.x - 20, y: b.y - 20 };

  drawBackground(c, out.width, out.height, exportCamera, scale);

  // A separate artwork layer keeps erasers from erasing the paper.
  const art = document.createElement('canvas');
  art.width = out.width;
  art.height = out.height;

  const artContext = art.getContext('2d');

  for (const op of operations) {
    drawWorldOperation(artContext, op, exportCamera, scale);
  }

  c.drawImage(art, 0, 0);

  out.toBlob(blob => {
    if (!blob) {
      toast('Export failed. Please try again.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = (
      $('#art-title').value.trim()
        .replace(/[^a-z0-9 _-]/gi, '')
        .slice(0, 60) || 'paintastic-whiteboard'
    ) + '.png';

    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

    toast(
      scale < 1
        ? 'Whole drawing exported, scaled to fit PNG limits.'
        : 'Whole drawing exported.'
    );
  }, 'image/png');
};

$('#settings-toggle').onclick = () => {
  const closed = document.body.classList.toggle('settings-closed');

  $('#settings-toggle').setAttribute(
    'aria-expanded',
    String(!closed)
  );

  $('#inspector').inert = closed;
};

$('#help').onclick = () => $('#help-dialog').showModal();

document.addEventListener('keydown', event => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
    $$('dialog').some(dialog => dialog.open)
  ) return;

  const key = event.key.toLowerCase();

  if (event.code === 'Space') {
    event.preventDefault();
    space = true;
    canvas.style.cursor = 'grab';
    return;
  }

  if (drawing || pan) return;

  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    undo(event.shiftKey ? 1 : -1);
  } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault();
    undo(1);
  } else if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    keys[key]
  ) {
    event.preventDefault();
    selectTool(keys[key]);
  }
});

document.addEventListener('keyup', event => {
  if (event.code === 'Space') {
    space = false;
    cursor();
  }
});

window.addEventListener('blur', () => {
  space = false;
  cursor();
});

async function init() {
  busy = true;

  resizeBoard();
  setColor(color);

  if (window.innerWidth <= 700) {
    document.body.classList.add('settings-closed');
    $('#settings-toggle').setAttribute('aria-expanded', 'false');
    $('#inspector').inert = true;
  }

  let restored = false;

  try {
    const saved = JSON.parse(
      localStorage.getItem(KEY) ||
      localStorage.getItem('paintastic.whiteboard.v2') ||
      'null'
    );

    if (saved) {
      if (Array.isArray(saved.operations)) {
        for (const op of saved.operations) {
          if (op.src) {
            imageCache.set(op.src, await loadImage(op.src));
          }
        }

        operations = saved.operations;
        camera = saved.camera || { x: 0, y: 0 };
        zoom = Math.max(.000001, Math.min(4, saved.zoom || 1));
      } else if (saved.image) {
        imageCache.set(saved.image, await loadImage(saved.image));

        operations = [{
          tool: 'image',
          src: saved.image,
          x: 0,
          y: 0,
          w: 1200,
          h: 800
        }];
      }

      $('#art-title').value = String(
        saved.title || 'My happy space'
      ).slice(0, 60);

      const b = saved.background;

      if (
        b &&
        /^#[0-9a-f]{6}$/i.test(b.paper) &&
        /^#[0-9a-f]{6}$/i.test(b.gridColor) &&
        ['plain', 'dots', 'grid', 'ruled'].includes(b.pattern) &&
        Number.isFinite(b.spacing) &&
        b.spacing >= 12 &&
        b.spacing <= 64
      ) {
        ({ paper, gridColor, pattern, spacing } = b);
      }

      restored = true;
    }
  } catch {
    status('Could not restore board · previous save has not been changed');
  }

  busy = false;
  renderBoard();
  commit();
  initialized = true;

  $('#zoom-reset').textContent = zoomLabel();

  const requested = new URLSearchParams(location.search).get('template');

  if (['garden', 'landscape', 'mandala'].includes(requested)) {
    await useTemplate(requested, restored);
  }
}

init();