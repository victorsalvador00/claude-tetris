'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins visuales ----
// Cada skin define su paleta (1-indexada, null en 0: tipo de pieza = índice de color = valor de celda),
// el fondo y la cuadrícula del canvas, y su propia función para dibujar un bloque.

// Aclara (pct > 0) u oscurece (pct < 0) un color '#rrggbb'.
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const mix = v => Math.round(pct >= 0 ? v + (255 - v) * pct : v * (1 + pct));
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

// Traza un rectángulo con esquinas redondeadas (arcTo funciona en todos los navegadores).
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Patrón fijo 5×5 para la skin pixel art: 1 = píxel claro, -1 = píxel oscuro, 0 = color base.
const PIXEL_PATTERN = [
  [ 1, 1, 1, 1, 0],
  [ 1, 0, 0, 1,-1],
  [ 1, 0, 1, 0,-1],
  [ 1,-1, 0, 0,-1],
  [ 0,-1,-1,-1,-1],
];

const SKINS = {
  retro: {
    name: 'Retro',
    colors: [
      null,
      '#4dd0e1', // I - cian
      '#ffd54f', // O - amarillo
      '#ba68c8', // T - morado
      '#81c784', // S - verde
      '#e57373', // Z - rojo
      '#7986cb', // J - índigo
      '#ffb74d', // L - naranja
    ],
    bg: '#1a1a25',
    grid: '#22222e',
    drawBlock(context, x, y, color, size) {
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // brillo superior
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
  },
  neon: {
    name: 'Neón',
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2f6bff', '#ff8c00'],
    bg: '#000000',
    grid: '#0c0c16',
    drawBlock(context, x, y, color, size) {
      const px = x * size, py = y * size;
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      // sin sombra para el interior: efecto de tubo de neón
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(0,0,0,0.45)';
      context.fillRect(px + 7, py + 7, size - 14, size - 14);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px + 3, py + 3, size - 6, 2);
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a8e6e8', '#fff1a8', '#d9b8f0', '#b8e6b8', '#f7b5b5', '#b5c4f7', '#ffd3a8'],
    bg: '#fbf6ef',
    grid: '#efe7dc',
    ghostAlpha: 0.45, // sobre fondo claro, 0.2 deja la pieza fantasma casi invisible
    drawBlock(context, x, y, color, size) {
      const px = x * size, py = y * size, r = size * 0.25;
      roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = shade(color, -0.18);
      context.stroke();
      // brillo suave arriba a la izquierda
      roundRectPath(context, px + 6, py + 5, size * 0.4, size * 0.18, size * 0.09);
      context.fillStyle = 'rgba(255,255,255,0.55)';
      context.fill();
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8b800', '#9878f8', '#58d854', '#e40058', '#0058f8', '#f87858'],
    bg: '#14141c',
    grid: '#1e1e2a',
    drawBlock(context, x, y, color, size) {
      const px = x * size, py = y * size;
      const n = PIXEL_PATTERN.length;
      const p = size / n;
      const light = shade(color, 0.4), dark = shade(color, -0.35);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = PIXEL_PATTERN[r][c];
          context.fillStyle = v > 0 ? light : v < 0 ? dark : color;
          context.fillRect(Math.floor(px + c * p), Math.floor(py + r * p), Math.ceil(p), Math.ceil(p));
        }
      }
      // contorno oscuro de 1px para separar bloques
      context.strokeStyle = 'rgba(0,0,0,0.6)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    },
  },
};

const SKIN_STORAGE_KEY = 'tetris.skin';
let skin = SKINS.retro;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // delega en la skin activa; save/restore evita que shadowBlur, alpha, etc. contaminen otros dibujos
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x, y, skin.colors[colorIndex], size);
  context.restore();
}

function drawGrid() {
  ctx.fillStyle = skin.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = skin.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  drawGrid(); // también pinta el fondo de la skin

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, skin.ghostAlpha ?? 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.fillStyle = skin.bg;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Selector de skin ----
const skinSelect = document.getElementById('skin-select');

function setSkin(id) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, id)) id = 'retro';
  skin = SKINS[id];
  skinSelect.value = id;
  document.body.dataset.skin = id;
  // redibujo inmediato (también en pausa o game over, cuando el loop está detenido)
  if (board && current) draw();
  if (next) drawNext();
  return id;
}

for (const [id, s] of Object.entries(SKINS)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = s.name;
  skinSelect.appendChild(opt);
}

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_STORAGE_KEY); } catch (e) { /* almacenamiento no disponible */ }
setSkin(savedSkin);

skinSelect.addEventListener('change', () => {
  const id = setSkin(skinSelect.value);
  try { localStorage.setItem(SKIN_STORAGE_KEY, id); } catch (e) { /* almacenamiento no disponible */ }
  // quita el foco para que las flechas y Space vuelvan a controlar el juego
  skinSelect.blur();
});

// Si el select conserva el foco (se abrió y cerró sin cambiar), las teclas del juego no deben
// cambiar la skin: se anula la acción del select y se suelta el foco; el evento sigue
// propagándose hasta el manejador de teclado del documento.
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyP'];
skinSelect.addEventListener('keydown', e => {
  if (!GAME_KEYS.includes(e.code)) return;
  e.preventDefault();
  skinSelect.blur();
});

init();
