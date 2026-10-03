'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

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

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris.records';
const BEST_COMBO_KEY = 'tetris.bestCombo';
const MAX_LINES_KEY = 'tetris.maxLines';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsBody = document.getElementById('start-records-body');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const playBtn = document.getElementById('play-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const gameoverRecords = document.getElementById('gameover-records');
const newRecordMsg = document.getElementById('new-record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const gameoverTableWrap = document.getElementById('gameover-table-wrap');
const gameoverRecordsBody = document.getElementById('gameover-records-body');
const gameoverBestCombo = document.getElementById('gameover-best-combo');
const gameoverMaxLines = document.getElementById('gameover-max-lines');
const gameoverMenuBtn = document.getElementById('gameover-menu-btn');

// combo = piezas consecutivas que limpian líneas; maxCombo = mejor combo de la partida
let combo, maxCombo, clearConfirmTimer;

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
  // combo: se suma si la pieza limpia líneas, se rompe si no
  if (cleared) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  if (gameOver) return; // evita guardar/mostrar los records dos veces
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  // máximos históricos: se actualizan aunque la partida no entre en el top
  const stats = loadStats();
  stats.bestCombo = Math.max(stats.bestCombo, maxCombo);
  stats.maxLines = Math.max(stats.maxLines, lines);
  saveStats(stats);
  renderStats(gameoverBestCombo, gameoverMaxLines);

  const qualifies = isTopScore(score);
  newRecordMsg.classList.toggle('hidden', !qualifies);
  nameForm.classList.toggle('hidden', !qualifies);
  gameoverTableWrap.classList.toggle('hidden', qualifies);
  if (!qualifies) renderRecords(gameoverRecordsBody, loadRecords(), -1);
  gameoverRecords.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (qualifies) {
    nameInput.value = '';
    nameInput.focus();
  }
}

// ---- Records: persistencia y render ----
function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(r => r && typeof r === 'object' && Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (err) {
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (err) {
    // sin persistencia: el juego sigue funcionando
  }
}

function loadStats() {
  const read = key => {
    try {
      const n = parseInt(localStorage.getItem(key), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (err) {
      return 0;
    }
  };
  return { bestCombo: read(BEST_COMBO_KEY), maxLines: read(MAX_LINES_KEY) };
}

function saveStats(stats) {
  try {
    localStorage.setItem(BEST_COMBO_KEY, String(stats.bestCombo));
    localStorage.setItem(MAX_LINES_KEY, String(stats.maxLines));
  } catch (err) {
    // sin persistencia
  }
}

function isTopScore(s) {
  if (s <= 0) return false;
  const records = loadRecords();
  return records.length < MAX_RECORDS || s > records[records.length - 1].score;
}

// Inserta la partida actual en el top y devuelve su posición (o -1)
function addRecord(name) {
  const entry = {
    name: name.trim().slice(0, NAME_MAX) || 'Anónimo',
    score,
    lines,
    maxCombo,
    date: new Date().toISOString(),
  };
  const records = loadRecords();
  // ante empate, la puntuación nueva queda por debajo de las anteriores
  let idx = records.findIndex(r => entry.score > r.score);
  if (idx === -1) idx = records.length;
  records.splice(idx, 0, entry);
  const top = records.slice(0, MAX_RECORDS);
  saveRecords(top);
  return { records: top, index: idx < MAX_RECORDS ? idx : -1 };
}

function renderRecords(tbody, records, highlightIndex) {
  tbody.replaceChildren();
  if (!records.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = 'Sin records todavía';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.className = 'highlight';
    const cells = [
      `${i + 1}`,
      String(r.name || 'Anónimo'),
      Number(r.score).toLocaleString(),
      String(Number(r.lines) || 0),
      String(Number(r.maxCombo) || 0),
    ];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text; // textContent: el nombre nunca se interpreta como HTML
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

function renderStats(comboEl, maxLinesEl) {
  const stats = loadStats();
  comboEl.textContent = stats.bestCombo;
  maxLinesEl.textContent = stats.maxLines;
}

function showStartScreen() {
  gameOver = true; // bloquea el loop y las teclas hasta pulsar Jugar
  cancelAnimationFrame(animId);
  overlay.classList.add('hidden');
  gameoverRecords.classList.add('hidden');
  resetClearConfirm();
  renderRecords(startRecordsBody, loadRecords(), -1);
  renderStats(startBestCombo, startMaxLines);
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

function resetClearConfirm() {
  clearTimeout(clearConfirmTimer);
  clearRecordsBtn.classList.remove('confirm');
  clearRecordsBtn.textContent = 'Borrar records';
}

// Borrado en dos pasos: el primer clic pide confirmación, el segundo borra
function onClearRecords() {
  if (!clearRecordsBtn.classList.contains('confirm')) {
    clearRecordsBtn.classList.add('confirm');
    clearRecordsBtn.textContent = '¿Seguro? Pulsa otra vez';
    clearConfirmTimer = setTimeout(resetClearConfirm, 5000);
    return;
  }
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(BEST_COMBO_KEY);
    localStorage.removeItem(MAX_LINES_KEY);
  } catch (err) {
    // sin persistencia
  }
  resetClearConfirm();
  renderRecords(startRecordsBody, [], -1);
  renderStats(startBestCombo, startMaxLines);
}

function onSaveName(e) {
  e.preventDefault();
  const { records, index } = addRecord(nameInput.value);
  nameInput.blur();
  nameForm.classList.add('hidden');
  renderRecords(gameoverRecordsBody, records, index);
  gameoverTableWrap.classList.remove('hidden');
  restartBtn.focus();
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
  if (gameOver) return; // la partida terminó en este frame: no reprogramar el loop
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
  combo = 0;
  maxCombo = 0;
  startScreen.classList.add('hidden');
  gameoverRecords.classList.add('hidden');
  // quita el foco de los botones para que Espacio/Enter no los vuelva a pulsar
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; // escribiendo el nombre
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
playBtn.addEventListener('click', init);
gameoverMenuBtn.addEventListener('click', showStartScreen);
clearRecordsBtn.addEventListener('click', onClearRecords);
nameForm.addEventListener('submit', onSaveName);
// los Espacios del hard drop que siguen llegando tras el game over no deben rellenar el nombre
nameInput.addEventListener('input', () => {
  const trimmed = nameInput.value.replace(/^\s+/, '');
  if (trimmed !== nameInput.value) nameInput.value = trimmed;
});

// la partida ya no arranca sola: primero la pantalla de inicio
showStartScreen();
