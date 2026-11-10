const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const COLORS = [null, '#34d7ff', '#6277ff', '#ff9f43', '#ffe44d', '#55ef8b', '#b66dff', '#ff5777'];
const SHAPES = [
  [[1, 1, 1, 1]],
  [[2, 0, 0], [2, 2, 2]],
  [[0, 0, 3], [3, 3, 3]],
  [[4, 4], [4, 4]],
  [[0, 5, 5], [5, 5, 0]],
  [[0, 6, 0], [6, 6, 6]],
  [[7, 7, 0], [0, 7, 7]]
];

const boardCanvas = document.querySelector('#board');
const ctx = boardCanvas.getContext('2d');
const nextCanvas = document.querySelector('#next');
const nextCtx = nextCanvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#startButton');
const pauseButton = document.querySelector('#pauseButton');
const scoreEl = document.querySelector('#score');
const levelEl = document.querySelector('#level');
const linesEl = document.querySelector('#lines');

let arena;
let player;
let nextPiece;
let score = 0;
let lines = 0;
let level = 1;
let dropCounter = 0;
let lastTime = 0;
let running = false;
let paused = false;
let animationId;

function emptyArena() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return shape.map(row => [...row]);
}

function drawCell(context, x, y, value, size = BLOCK) {
  if (!value) return;
  const pad = 2;
  context.fillStyle = COLORS[value];
  context.shadowColor = COLORS[value];
  context.shadowBlur = 8;
  context.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,.25)';
  context.fillRect(x * size + 5, y * size + 5, size - 10, 3);
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,.035)';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * BLOCK, 0); ctx.lineTo(x * BLOCK, ROWS * BLOCK); ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * BLOCK); ctx.lineTo(COLS * BLOCK, y * BLOCK); ctx.stroke();
  }
}

function drawMatrix(matrix, offset, context = ctx, size = BLOCK) {
  matrix.forEach((row, y) => row.forEach((value, x) => drawCell(context, x + offset.x, y + offset.y, value, size)));
}

function draw() {
  ctx.fillStyle = '#090b1c';
  ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  drawGrid();
  drawMatrix(arena, { x: 0, y: 0 });
  drawMatrix(player.matrix, player.pos);
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const size = 24;
  const width = nextPiece[0].length * size;
  const height = nextPiece.length * size;
  drawMatrix(nextPiece, { x: (nextCanvas.width - width) / size / 2, y: (nextCanvas.height - height) / size / 2 }, nextCtx, size);
}

function collide() {
  const { matrix, pos } = player;
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x] && (arena[y + pos.y] && arena[y + pos.y][x + pos.x]) !== 0) return true;
    }
  }
  return false;
}

function merge() {
  player.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) arena[y + player.pos.y][x + player.pos.x] = value;
  }));
}

function sweep() {
  let cleared = 0;
  outer: for (let y = arena.length - 1; y >= 0; y--) {
    for (let x = 0; x < arena[y].length; x++) if (arena[y][x] === 0) continue outer;
    arena.splice(y, 1);
    arena.unshift(Array(COLS).fill(0));
    y++;
    cleared++;
  }
  if (cleared) {
    score += [0, 100, 300, 500, 800][cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    updateStats();
  }
}

function resetPlayer() {
  player.matrix = nextPiece;
  nextPiece = randomPiece();
  player.pos.y = 0;
  player.pos.x = Math.floor((COLS - player.matrix[0].length) / 2);
  drawNext();
  if (collide()) gameOver();
}

function drop() {
  player.pos.y++;
  if (collide()) {
    player.pos.y--;
    merge();
    sweep();
    resetPlayer();
  }
  dropCounter = 0;
}

function hardDrop() {
  let distance = 0;
  while (!collide()) { player.pos.y++; distance++; }
  player.pos.y--;
  score += Math.max(0, distance - 1) * 2;
  updateStats();
  merge();
  sweep();
  resetPlayer();
  dropCounter = 0;
}

function move(direction) {
  player.pos.x += direction;
  if (collide()) player.pos.x -= direction;
}

function rotate() {
  const originalX = player.pos.x;
  player.matrix = player.matrix[0].map((_, i) => player.matrix.map(row => row[i]).reverse());
  let offset = 1;
  while (collide()) {
    player.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (Math.abs(offset) > player.matrix[0].length) {
      player.matrix = player.matrix[0].map((_, i) => player.matrix.map(row => row[row.length - 1 - i]));
      player.pos.x = originalX;
      return;
    }
  }
}

function updateStats() {
  scoreEl.textContent = score.toLocaleString('ko-KR');
  levelEl.textContent = level;
  linesEl.textContent = lines;
}

function update(time = 0) {
  if (!running) return;
  const delta = time - lastTime;
  lastTime = time;
  if (!paused) {
    dropCounter += delta;
    if (dropCounter > Math.max(90, 800 - (level - 1) * 65)) drop();
    draw();
  }
  animationId = requestAnimationFrame(update);
}

function startGame() {
  cancelAnimationFrame(animationId);
  arena = emptyArena();
  player = { pos: { x: 0, y: 0 }, matrix: randomPiece() };
  nextPiece = randomPiece();
  score = 0; lines = 0; level = 1; dropCounter = 0; lastTime = 0;
  running = true; paused = false;
  pauseButton.textContent = '일시정지';
  overlay.classList.add('hidden');
  updateStats();
  resetPlayer();
  update();
}

function gameOver() {
  running = false;
  cancelAnimationFrame(animationId);
  overlay.querySelector('h1').textContent = 'GAME OVER';
  overlay.querySelector('p').textContent = `최종 점수 ${score.toLocaleString('ko-KR')}점`;
  startButton.textContent = '다시 시작';
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  pauseButton.textContent = paused ? '계속하기' : '일시정지';
}

document.addEventListener('keydown', event => {
  if (!running) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) event.preventDefault();
  if (event.key.toLowerCase() === 'p') return togglePause();
  if (paused) return;
  if (event.key === 'ArrowLeft') move(-1);
  if (event.key === 'ArrowRight') move(1);
  if (event.key === 'ArrowDown') { drop(); score++; updateStats(); }
  if (event.key === 'ArrowUp') rotate();
  if (event.key === ' ') hardDrop();
  draw();
});

startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', togglePause);

arena = emptyArena();
player = { pos: { x: 3, y: 0 }, matrix: randomPiece() };
nextPiece = randomPiece();
draw();
drawNext();
