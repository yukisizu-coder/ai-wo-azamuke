// =====================================
// AIをあざむけ！ クライアント
// =====================================

const socket = io();

// --- 状態管理 ---
let myName = '';
let myRoomCode = '';
let isHost = false;
let isDrawer = false;
let hasGuessed = false;

// --- キャンバス ---
let canvas, ctx;
let drawing = false;
let currentColor = '#1B2A4A';
let currentSize = 3;
let isEraser = false;
let lastX = 0, lastY = 0;

// --- UNDOヒストリー（最大3回分） ---
let undoHistory = [];
const MAX_UNDO = 3;

// --- タイマー ---
let drawTimer = null;
let drawTimeLeft = 0;
let currentDrawTime = 0;

// --- AIモノローグ ---
const aiMonologueWrong = [
  'ぬぬぬ…わからぬ！',
  'これは一体…なんじゃ！？',
  'むむむ！予測不能な絵じゃ…！',
  'そ、そんな絵は見たことがない！',
  'カイロス回路がショートしそう…！',
  'あ、あわわ…データが足りぬ！',
  '人間め…なかなかやるな！',
  'お、おのれ…次は負けんぞ！',
  'こ、これは…反則だー！！',
  'ぴぴぴ…エラー！エラー！！',
];

const aiMonologueCorrect = [
  'フハハ！お見通しじゃ！',
  'ふふふ…AIをなめるな！',
  '計算通り！完璧な分析！',
  'ピピッ！正解！人間に勝ったぞ！',
  'AIの目はごまかせないぞ！',
];

// =====================================
// 音響効果（Web Audio API）
// =====================================
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, dur, type = 'square', vol = 0.25, delay = 0) {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
  } catch(e) {}
}

// ボタンクリック音
function soundClick() {
  playTone(900, 0.04, 'square', 0.15);
}

// AI正解
function soundAIWin() {
  [262, 247, 233, 220].forEach((f, i) => playTone(f, 0.25, 'sawtooth', 0.25, i * 0.18));
  setTimeout(() => playTone(165, 0.6, 'sawtooth', 0.35), 800);
}

// AI不正解
function soundAILose() {
  [440, 392, 349, 330, 294].forEach((f, i) => playTone(f, 0.2, 'sine', 0.2, i * 0.13));
}

// 人間正解
function soundHumanWin() {
  [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.18, 'square', 0.2, i * 0.1));
  setTimeout(() => {
    [784, 1047].forEach((f, i) => playTone(f, 0.3, 'square', 0.25, i * 0.15));
  }, 500);
}

// 人間不正解
function soundHumanWrong() {
  playTone(180, 0.4, 'sawtooth', 0.25);
  playTone(160, 0.3, 'sawtooth', 0.2, 0.15);
}

// チャット受信音「ポン」← 追加
function soundChat() {
  playTone(880, 0.06, 'sine', 0.2);
  playTone(1100, 0.05, 'sine', 0.15, 0.06);
}

// =====================================
// 画面切り替え
// =====================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

// =====================================
// エラートースト
// =====================================
function showError(msg) {
  const toast = document.getElementById('error-toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// =====================================
// ホーム画面
// =====================================
document.getElementById('btn-goto-create').addEventListener('click', () => { soundClick(); showScreen('screen-create'); });
document.getElementById('btn-goto-join').addEventListener('click', () => { soundClick(); showScreen('screen-join'); });
document.getElementById('btn-back-from-create').addEventListener('click', () => { soundClick(); showScreen('screen-home'); });
document.getElementById('btn-back-from-join').addEventListener('click', () => { soundClick(); showScreen('screen-home'); });

// =====================================
// ルーム作成
// =====================================
document.getElementById('btn-create-room').addEventListener('click', () => {
  soundClick();
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showError('なまえを入力してね！'); return; }
  myName = name;
  socket.emit('create_room', { playerName: name });
});

// =====================================
// ルーム参加
// =====================================
document.getElementById('btn-join-room').addEventListener('click', () => {
  soundClick();
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { showError('なまえを入力してね！'); return; }
  if (code.length !== 4) { showError('4ケタのコードを入力してね！'); return; }
  myName = name;
  socket.emit('join_room', { playerName: name, roomCode: code });
});

// =====================================
// ロビー
// =====================================
function updatePlayerList(players) {
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.id === socket.id) li.textContent += '（あなた）';
    list.appendChild(li);
  });
}

document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    document.getElementById('btn-copy-code').textContent = 'コピー済！';
    setTimeout(() => { document.getElementById('btn-copy-code').textContent = 'コピー'; }, 2000);
  });
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  soundClick();
  const difficulty = document.getElementById('setting-difficulty').value;
  const totalRounds = parseInt(document.getElementById('setting-rounds').value);
  const drawTime = parseInt(document.getElementById('setting-drawtime').value); // ← 追加
  socket.emit('start_game', { difficulty, totalRounds, drawTime });
});

// =====================================
// タイマー ← 追加
// =====================================
function startDrawTimer(seconds) {
  stopDrawTimer();
  if (!seconds || seconds <= 0) return;
  drawTimeLeft = seconds;
  const el = document.getElementById('timer-display');
  el.textContent = `⏱️ ${drawTimeLeft}`;
  el.className = '';

  drawTimer = setInterval(() => {
    drawTimeLeft--;
    if (drawTimeLeft <= 0) {
      stopDrawTimer();
      el.textContent = '⏱️ 0';
      // 描き手なら自動でOK送信
      if (isDrawer) {
        const okBtn = document.getElementById('btn-ok');
        if (okBtn && !okBtn.disabled) {
          okBtn.click();
        }
      }
    } else {
      el.textContent = `⏱️ ${drawTimeLeft}`;
      el.className = drawTimeLeft <= 10 ? 'timer-urgent' : '';
    }
  }, 1000);
}

function stopDrawTimer() {
  clearInterval(drawTimer);
  drawTimer = null;
  const el = document.getElementById('timer-display');
  if (el) { el.textContent = ''; el.className = ''; }
}

// =====================================
// チャット ← 追加
// =====================================
function showChat(visible) {
  const area = document.getElementById('chat-area');
  if (visible) {
    area.classList.remove('hidden');
  } else {
    area.classList.add('hidden');
  }
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat_message', { text });
  input.value = '';
}

function addChatBubble(playerId, playerName, text) {
  const isMe = playerId === socket.id;
  const messages = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isMe ? 'mine' : 'others'}`;

  const nameEl = document.createElement('span');
  nameEl.className = 'chat-name';
  nameEl.textContent = isMe ? '' : playerName;

  const textEl = document.createElement('span');
  textEl.className = 'chat-text';
  textEl.textContent = text;

  bubble.appendChild(nameEl);
  bubble.appendChild(textEl);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;

  if (!isMe) soundChat();
}

document.getElementById('btn-chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});

// =====================================
// ゲーム画面の初期化
// =====================================
function initCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  function resizeCanvas() {
    const maxW = Math.min(window.innerWidth - 20, 700);
    const w = maxW;
    const h = Math.round(w * 0.6);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);
  }
  resizeCanvas();

  // マウスイベント
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);

  // タッチイベント
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); draw(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchend', e => { e.preventDefault(); endDraw(); }, { passive: false });
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function startDraw(e) {
  if (!isDrawer) return;
  drawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, (isEraser ? currentSize * 3 : currentSize) / 2, 0, Math.PI * 2);
  ctx.fillStyle = isEraser ? 'white' : currentColor;
  ctx.fill();

  socket.emit('draw_event', {
    type: 'dot',
    x: pos.x, y: pos.y,
    color: isEraser ? 'white' : currentColor,
    size: isEraser ? currentSize * 3 : currentSize,
    cw: canvas.width, ch: canvas.height,
  });
}

function draw(e) {
  if (!drawing || !isDrawer) return;
  const pos = getPos(e);

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.strokeStyle = isEraser ? 'white' : currentColor;
  ctx.lineWidth = isEraser ? currentSize * 3 : currentSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  socket.emit('draw_event', {
    type: 'line',
    x0: lastX, y0: lastY,
    x1: pos.x, y1: pos.y,
    color: isEraser ? 'white' : currentColor,
    size: isEraser ? currentSize * 3 : currentSize,
    cw: canvas.width, ch: canvas.height,
  });

  lastX = pos.x;
  lastY = pos.y;
}

function endDraw() {
  if (drawing && isDrawer) saveUndoState();
  drawing = false;
}

function saveUndoState() {
  if (!canvas) return;
  undoHistory.push(canvas.toDataURL());
  if (undoHistory.length > MAX_UNDO + 1) undoHistory.shift();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  if (!btn) return;
  const canUndo = undoHistory.length > 1;
  btn.disabled = !canUndo;
  btn.style.opacity = canUndo ? '1' : '0.4';
  const remaining = Math.max(0, undoHistory.length - 1);
  btn.textContent = `↩ 戻す(${remaining})`;
}

function drawRemote(data) {
  if (!ctx) return;
  const sx = canvas.width / data.cw;
  const sy = canvas.height / data.ch;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (data.type === 'dot') {
    ctx.beginPath();
    ctx.arc(data.x * sx, data.y * sy, data.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = data.color;
    ctx.fill();
  } else if (data.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(data.x0 * sx, data.y0 * sy);
    ctx.lineTo(data.x1 * sx, data.y1 * sy);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.stroke();
  } else if (data.type === 'clear') {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (data.type === 'image') {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = data.data;
  }
}

// 描画ツール
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
    isEraser = false;
    document.getElementById('btn-eraser').style.background = '#2D6E6E';
  });
});

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSize = parseInt(btn.dataset.size);
  });
});

document.getElementById('btn-eraser').addEventListener('click', () => {
  isEraser = !isEraser;
  document.getElementById('btn-eraser').style.background = isEraser ? '#C9960C' : '#2D6E6E';
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!isDrawer) return;
  saveUndoState();
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveUndoState();
  socket.emit('draw_event', { type: 'clear', cw: canvas.width, ch: canvas.height });
});

document.getElementById('btn-undo').addEventListener('click', () => {
  if (!isDrawer) return;
  if (undoHistory.length <= 1) return;
  undoHistory.pop();
  const prevState = undoHistory[undoHistory.length - 1];
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    socket.emit('draw_event', { type: 'image', data: prevState, cw: canvas.width, ch: canvas.height });
  };
  img.src = prevState;
  updateUndoButton();
});

// =====================================
// OKボタン（描画完了）
// =====================================
document.getElementById('btn-ok').addEventListener('click', () => {
  if (!isDrawer) return;
  stopDrawTimer(); // ← タイマー停止
  const imageData = canvas.toDataURL('image/png');
  socket.emit('submit_drawing', { imageData });
  document.getElementById('btn-ok').disabled = true;
  document.getElementById('btn-ok').textContent = '送信中...';
  document.getElementById('draw-tools').classList.add('hidden');
  showChat(false); // ← 描画完了時チャット非表示
});

// =====================================
// 人間の回答
// =====================================
document.getElementById('btn-submit-guess').addEventListener('click', submitGuess);
document.getElementById('guess-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitGuess();
});

function submitGuess() {
  const input = document.getElementById('guess-input');
  const guess = input.value.trim();
  if (!guess) return;
  if (hasGuessed) return;
  hasGuessed = true;
  socket.emit('human_guess', { guess });
  input.value = '';
  input.disabled = true;
  document.getElementById('btn-submit-guess').disabled = true;
}

// =====================================
// 次のラウンド / ゲームオーバーへ
// =====================================
document.getElementById('btn-next-round').addEventListener('click', () => {
  socket.emit('next_round');
});

document.getElementById('btn-to-gameover').addEventListener('click', () => {
  socket.emit('next_round');
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  showScreen('screen-lobby');
  if (isHost) {
    document.getElementById('host-settings').classList.remove('hidden');
    document.getElementById('guest-waiting').classList.add('hidden');
  }
});

// =====================================
// ゲーム画面のフェーズ切り替え
// =====================================
function hideAllPhases() {
  document.querySelectorAll('.phase-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('canvas-area').classList.add('hidden');
  document.getElementById('current-word-display').classList.add('hidden');
  document.getElementById('phase-watching').classList.add('hidden');
}

function showPhase(id) {
  hideAllPhases();
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

// カテゴリグリッドを生成
function buildCategoryGrid(categories) {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = '';
  const icons = {
    'どうぶつ': '🐘', 'たべもの': '🍜', 'のりもの': '🚗',
    'スポーツ': '⚽', 'たてもの': '🏠', 'しぜん': '🌸',
    'しごと': '💼', 'きもち': '😂', 'エンタメ': '🎮',
    'なつかしい': '📺', 'うみのなかま': '🐙', 'むずかしい概念': '🤔',
  };
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = (icons[cat] || '') + '\n' + cat;
    btn.addEventListener('click', () => {
      socket.emit('select_category', { category: cat });
      showPhase('phase-word-select');
    });
    grid.appendChild(btn);
  });
}

// =====================================
// ギャラリー表示 ← 追加
// =====================================
function showGallery(galleryData) {
  const galleryEl = document.getElementById('round-gallery');
  if (!galleryData || galleryData.length === 0) {
    galleryEl.classList.add('hidden');
    return;
  }
  galleryEl.innerHTML = '';
  galleryEl.classList.remove('hidden');

  // タイトル
  const title = document.createElement('p');
  title.className = 'round-gallery-title';
  title.textContent = '✏️ みんなの絵コレクション';
  galleryEl.appendChild(title);

  galleryData.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const roundLabel = document.createElement('p');
    roundLabel.className = 'gallery-round';
    roundLabel.textContent = `R${item.round}`;

    const img = document.createElement('img');
    img.className = 'gallery-img';
    img.src = item.imageData;
    img.alt = `${item.drawerName}の絵`;

    const author = document.createElement('p');
    author.className = 'gallery-author';
    author.textContent = `✏️ ${item.drawerName}`;

    card.appendChild(roundLabel);
    card.appendChild(img);
    card.appendChild(author);
    galleryEl.appendChild(card);
  });
}

// =====================================
// Socket イベントハンドラ
// =====================================

// エラー
socket.on('error', ({ message }) => showError(message));

// ルーム作成成功
socket.on('room_created', ({ roomCode, players, isHost: host }) => {
  myRoomCode = roomCode;
  isHost = host;
  document.getElementById('lobby-room-code').textContent = roomCode;
  updatePlayerList(players);
  document.getElementById('host-settings').classList.remove('hidden');
  document.getElementById('guest-waiting').classList.add('hidden');
  showScreen('screen-lobby');
});

// ルーム参加成功
socket.on('room_joined', ({ roomCode, players, isHost: host }) => {
  myRoomCode = roomCode;
  isHost = host;
  document.getElementById('lobby-room-code').textContent = roomCode;
  updatePlayerList(players);
  document.getElementById('host-settings').classList.add('hidden');
  document.getElementById('guest-waiting').classList.remove('hidden');
  showScreen('screen-lobby');
});

// プレイヤー更新
socket.on('player_updated', ({ players }) => {
  updatePlayerList(players);
});

// ゲーム開始
socket.on('game_started', ({ difficulty, totalRounds, drawTime, players }) => {
  currentDrawTime = drawTime || 0;
  initCanvas();
  showScreen('screen-game');
  hideAllPhases();
  showChat(false);
  document.getElementById('phase-info').textContent = 'まもなく開始';
});

// ラウンド開始
socket.on('round_started', ({ round, totalRounds, drawerName, drawerId, categories }) => {
  isDrawer = (drawerId === socket.id);
  hasGuessed = false;
  stopDrawTimer();
  showChat(false);

  document.getElementById('round-info').textContent = `ラウンド ${round}/${totalRounds}`;
  document.getElementById('phase-info').textContent = isDrawer ? 'あなたが描き手！' : `${drawerName} が描いています`;

  // キャンバスクリア＆UNDOリセット
  if (ctx) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  undoHistory = [];
  if (canvas) undoHistory.push(canvas.toDataURL());
  updateUndoButton();

  // チャットをクリア
  document.getElementById('chat-messages').innerHTML = '';

  if (isDrawer) {
    buildCategoryGrid(categories);
    showPhase('phase-category');
    document.getElementById('phase-info').textContent = 'カテゴリを選ぼう！';
  } else {
    document.getElementById('watching-message').textContent = `${drawerName} がカテゴリを選んでいます...`;
    showPhase('phase-watching');
  }
});

// お題の選択肢（描き手のみ）
socket.on('word_choices', ({ words, category }) => {
  const area = document.getElementById('word-choices');
  area.innerHTML = '';
  words.forEach(word => {
    const btn = document.createElement('button');
    btn.className = 'word-btn';
    btn.textContent = word;
    btn.addEventListener('click', () => {
      socket.emit('select_word', { word });
    });
    area.appendChild(btn);
  });
  showPhase('phase-word-select');
});

// 描画フェーズ開始（描き手）← drawTime追加
socket.on('start_drawing', ({ word, category, round, totalRounds, drawTime }) => {
  document.getElementById('current-word-text').textContent = word;
  document.getElementById('current-word-display').classList.remove('hidden');
  document.getElementById('btn-ok').disabled = false;
  document.getElementById('btn-ok').textContent = 'OK！描けた！';
  document.getElementById('draw-tools').classList.remove('hidden');

  hideAllPhases();
  document.getElementById('canvas-area').classList.remove('hidden');
  document.getElementById('current-word-display').classList.remove('hidden');
  document.getElementById('phase-info').textContent = '描いてね！';

  showChat(true); // ← チャット表示

  // タイマー開始 ← 追加
  if (drawTime && drawTime > 0) {
    startDrawTimer(drawTime);
  }
});

// 描画フェーズ開始（観戦者）← drawTime追加
socket.on('drawing_phase', ({ drawerName, category, round, totalRounds, drawTime }) => {
  document.getElementById('watching-message').textContent = `${drawerName} が「${category}」から描いています...`;
  hideAllPhases();
  document.getElementById('canvas-area').classList.remove('hidden');
  document.getElementById('phase-watching').classList.remove('hidden');
  document.getElementById('draw-tools').classList.add('hidden');
  document.getElementById('phase-info').textContent = 'みんなで見よう！';

  showChat(true); // ← チャット表示

  // タイマー表示（観戦者は見るだけ）← 追加
  if (drawTime && drawTime > 0) {
    startDrawTimer(drawTime);
  }
});

// リモート描画
socket.on('draw_event', (data) => {
  if (!isDrawer) drawRemote(data);
});

// チャット受信 ← 追加
socket.on('chat_message', ({ playerId, playerName, text }) => {
  addChatBubble(playerId, playerName, text);
});

// AI判定中
socket.on('ai_guessing', ({ difficulty }) => {
  stopDrawTimer(); // ← タイマー停止
  showChat(false); // ← チャット非表示
  const labels = { easy: 'ゆるいAI', normal: 'ふつうAI', hard: 'きびしいAI' };
  document.getElementById('ai-thinking-text').textContent = `${labels[difficulty] || 'AI'} が絵を分析中...`;
  hideAllPhases();
  document.getElementById('phase-ai').classList.remove('hidden');
  document.getElementById('phase-info').textContent = 'AIが判定中...';
});

// AI結果
socket.on('ai_result', ({ guess, correct, correctWord }) => {
  document.getElementById('ai-answer-text').textContent = `「${guess}」`;
  const verdict = document.getElementById('ai-verdict');
  const eyeL = document.getElementById('result-eye-left');
  const eyeR = document.getElementById('result-eye-right');
  const mouth = document.getElementById('result-mouth');
  const monologue = document.getElementById('ai-monologue');

  if (correct) {
    verdict.textContent = '😈 正解！AIの勝ち！';
    verdict.className = 'ai-verdict correct';
    if (eyeL) { eyeL.className = 'ai-eye left happy'; eyeR.className = 'ai-eye right happy'; }
    if (mouth) mouth.className = 'ai-mouth happy';
    if (monologue) {
      const msg = aiMonologueCorrect[Math.floor(Math.random() * aiMonologueCorrect.length)];
      monologue.textContent = msg;
      monologue.classList.remove('hidden');
    }
    soundAIWin();
  } else {
    verdict.textContent = '🎉 不正解！人間の番だ！';
    verdict.className = 'ai-verdict wrong';
    if (eyeL) { eyeL.className = 'ai-eye left sad'; eyeR.className = 'ai-eye right sad'; }
    if (mouth) mouth.className = 'ai-mouth sad';
    if (monologue) {
      const msg = aiMonologueWrong[Math.floor(Math.random() * aiMonologueWrong.length)];
      monologue.textContent = msg;
      monologue.classList.remove('hidden');
    }
    soundAILose();
  }

  hideAllPhases();
  document.getElementById('phase-ai-result').classList.remove('hidden');
  document.getElementById('phase-info').textContent = correct ? 'AIの勝ち！' : 'AIは外した！';
});

// 人間の回答フェーズ
socket.on('human_guessing_phase', ({ drawerName, category, players }) => {
  const label = document.getElementById('human-guess-label');
  const inputArea = document.getElementById('guess-input-area');

  if (isDrawer) {
    label.textContent = `みんなが「${category}」の答えを考えています...`;
    inputArea.classList.add('hidden');
  } else {
    label.textContent = `「${category}」のカテゴリから何が描かれてる？`;
    inputArea.classList.remove('hidden');
    document.getElementById('guess-input').disabled = false;
    document.getElementById('btn-submit-guess').disabled = false;
  }

  document.getElementById('guess-log').innerHTML = '';
  hideAllPhases();
  document.getElementById('phase-human').classList.remove('hidden');
  document.getElementById('canvas-area').classList.remove('hidden');
  document.getElementById('phase-info').textContent = '人間が回答中...';

  showChat(true); // ← 回答フェーズもチャット表示
});

// 誰かが回答した
socket.on('guess_submitted', ({ playerName, guess, correct }) => {
  const log = document.getElementById('guess-log');
  const item = document.createElement('div');
  item.className = `guess-item ${correct ? 'correct' : 'wrong'}`;
  item.textContent = `${playerName}：「${guess}」 ${correct ? '✓ 正解！' : '✗ 不正解'}`;
  log.appendChild(item);
  if (correct) soundHumanWin();
  else soundHumanWrong();
  log.scrollTop = log.scrollHeight;
});

// ラウンド終了 ← gallery追加
socket.on('round_over', ({ winner, correctWord, aiGuess, scores, round, totalRounds, isLastRound, gallery }) => {
  showChat(false);

  const winnerEl = document.getElementById('result-winner-text');
  if (winner === 'human') {
    winnerEl.textContent = '🎉 人間チームの勝ち！';
    winnerEl.className = 'result-winner human-win';
  } else if (winner === 'ai') {
    winnerEl.textContent = '🤖 AIの勝ち！';
    winnerEl.className = 'result-winner ai-win';
  } else {
    winnerEl.textContent = '🤝 引き分け！';
    winnerEl.className = 'result-winner draw';
  }

  document.getElementById('result-word').textContent = correctWord;

  // スコア
  const scoreList = document.getElementById('round-score-list');
  scoreList.innerHTML = '';
  scores.forEach(s => {
    const item = document.createElement('div');
    item.className = 'score-item';
    item.innerHTML = `<span>${s.name}</span><span>${s.score}pt</span>`;
    scoreList.appendChild(item);
  });

  // ギャラリー ← 追加
  showGallery(gallery);

  // ボタン制御
  const btnNext = document.getElementById('btn-next-round');
  const btnGameOver = document.getElementById('btn-to-gameover');

  if (isHost) {
    if (isLastRound) {
      btnNext.style.display = 'none';
      btnGameOver.style.display = 'inline-block';
    } else {
      btnNext.style.display = 'inline-block';
      btnGameOver.style.display = 'none';
    }
  } else {
    btnNext.style.display = 'none';
    btnGameOver.style.display = 'none';
  }

  hideAllPhases();
  document.getElementById('phase-round-result').classList.remove('hidden');
  document.getElementById('phase-info').textContent = 'ラウンド終了';
});

// ゲーム終了
socket.on('game_over', ({ scores, winner }) => {
  const list = document.getElementById('final-score-list');
  list.innerHTML = '';
  scores.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'final-score-item';
    const medals = ['🥇', '🥈', '🥉'];
    item.innerHTML = `<span>${medals[i] || `${i+1}位`} ${s.name}</span><span>${s.score}pt</span>`;
    list.appendChild(item);
  });
  showScreen('screen-gameover');
});
