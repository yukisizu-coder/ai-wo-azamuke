// =====================================
// AIをあざむけ！ クライアント
// =====================================
const socket = io();

let myName = '', myRoomCode = '', isHost = false, isDrawer = false, hasGuessed = false;
let canvas, ctx, drawing = false, currentColor = '#1B2A4A', currentSize = 3, isEraser = false, lastX = 0, lastY = 0;
let undoHistory = [], drawTimer = null, drawTimeLeft = 0;

// =====================================
// 音響効果
// =====================================
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, dur, type = 'square', vol = 0.2, delay = 0) {
  try {
    const ac = getAudio(); const osc = ac.createOscillator(); const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = ac.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
  } catch(e) {}
}
function soundClick()     { playTone(900, 0.04, 'square', 0.12); }
function soundAIWin()     { [262,247,233,220].forEach((f,i)=>playTone(f,0.25,'sawtooth',0.25,i*0.18)); setTimeout(()=>playTone(165,0.6,'sawtooth',0.3),800); }
function soundAILose()    { [440,392,349,330,294].forEach((f,i)=>playTone(f,0.18,'sine',0.18,i*0.12)); }
function soundHumanWin()  { [523,659,784,1047].forEach((f,i)=>playTone(f,0.18,'square',0.2,i*0.1)); setTimeout(()=>{ [784,1047].forEach((f,i)=>playTone(f,0.3,'square',0.22,i*0.15)); },500); }
function soundHumanWrong(){ playTone(180,0.4,'sawtooth',0.22); playTone(160,0.3,'sawtooth',0.18,0.15); }
function soundChat()      { playTone(880,0.06,'sine',0.18); playTone(1100,0.05,'sine',0.13,0.07); }

// =====================================
// BGM ③
// =====================================
let bgmEnabled = false, bgmSchedulerInterval = null, bgmNoteIndex = 0, bgmNextTime = 0;

// レトロポップなメロディ（Cメジャーペンタトニック）
const BGM_NOTES = [
  [523,0.15],[659,0.15],[784,0.15],[880,0.25],[784,0.15],[659,0.15],[523,0.3],[0,0.15],
  [880,0.15],[784,0.15],[659,0.15],[523,0.25],[659,0.15],[523,0.15],[440,0.3],[0,0.15],
  [523,0.15],[587,0.15],[659,0.15],[698,0.15],[784,0.25],[659,0.15],[523,0.15],[440,0.3],[0,0.15],
  [523,0.25],[659,0.15],[784,0.15],[659,0.15],[523,0.4],[0,0.4],
];

function scheduleBGMNote(freq, dur, startTime) {
  if (freq === 0) return;
  try {
    const ac = getAudio(); const osc = ac.createOscillator(); const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = 'square'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.04, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur * 0.85);
    osc.start(startTime); osc.stop(startTime + dur);
  } catch(e) {}
}

function bgmScheduler() {
  if (!bgmEnabled) return;
  const ac = getAudio();
  while (bgmNextTime < ac.currentTime + 0.15) {
    const [freq, dur] = BGM_NOTES[bgmNoteIndex];
    scheduleBGMNote(freq, dur, bgmNextTime);
    bgmNextTime += dur;
    bgmNoteIndex = (bgmNoteIndex + 1) % BGM_NOTES.length;
  }
}

function startBGM() {
  if (bgmSchedulerInterval) return;
  bgmEnabled = true;
  bgmNoteIndex = 0;
  bgmNextTime = getAudio().currentTime + 0.05;
  bgmSchedulerInterval = setInterval(bgmScheduler, 50);
}

function stopBGM() {
  bgmEnabled = false;
  clearInterval(bgmSchedulerInterval);
  bgmSchedulerInterval = null;
}

document.getElementById('btn-bgm').addEventListener('click', () => {
  if (bgmEnabled) { stopBGM(); document.getElementById('btn-bgm').textContent = '🔇'; }
  else { startBGM(); document.getElementById('btn-bgm').textContent = '🎵'; }
});

// =====================================
// 音声チャット（WebRTC + Simple-peer）
// =====================================
let localStream = null;
let peers = {};        // { peerId: SimplePeer }
let voiceActive = false;

function getVoiceBtn() { return document.getElementById('btn-voice'); }

async function startVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    voiceActive = true;
    const btn = getVoiceBtn();
    btn.textContent = '🎙️';
    btn.classList.add('on');
    socket.emit('voice_join');
  } catch (err) {
    showError('マイクの許可が必要です！ブラウザの設定を確認してね🎤');
    console.error('getUserMedia error:', err);
  }
}

function stopVoice() {
  // 全ピア接続を切断
  Object.keys(peers).forEach(peerId => removePeer(peerId));
  // マイクを停止
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  voiceActive = false;
  const btn = getVoiceBtn();
  btn.textContent = '🔕';
  btn.classList.remove('on');
  socket.emit('voice_leave');
}

function createPeer(peerId, initiator) {
  if (peers[peerId]) return; // 既に存在
  const peer = new SimplePeer({
    initiator,
    stream: localStream,
    trickle: true,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
  });
  peer.on('signal', signal => {
    socket.emit('voice_signal', { targetId: peerId, signal });
  });
  peer.on('stream', remoteStream => {
    // <audio>要素を作って音を流す
    let audio = document.getElementById('voice-audio-' + peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'voice-audio-' + peerId;
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    audio.srcObject = remoteStream;
    audio.play().catch(e => console.log('audio play error:', e));
  });
  peer.on('close', () => removePeer(peerId));
  peer.on('error', err => { console.log('peer error:', err); removePeer(peerId); });
  peers[peerId] = peer;
}

function removePeer(peerId) {
  if (peers[peerId]) { try { peers[peerId].destroy(); } catch(e) {} delete peers[peerId]; }
  const audio = document.getElementById('voice-audio-' + peerId);
  if (audio) audio.remove();
}

document.getElementById('btn-voice').addEventListener('click', () => {
  soundClick();
  if (voiceActive) stopVoice();
  else startVoice();
});

// WebRTCシグナリング Socketイベント
socket.on('voice_existing_peers', ({ peerIds }) => {
  if (!voiceActive || !localStream) return;
  peerIds.forEach(peerId => createPeer(peerId, true));
});
socket.on('voice_peer_joined', ({ peerId }) => {
  if (!voiceActive || !localStream) return;
  createPeer(peerId, false);
});
socket.on('voice_signal', ({ fromId, signal }) => {
  if (!voiceActive || !localStream) return;
  if (!peers[fromId]) createPeer(fromId, false);
  if (peers[fromId]) { try { peers[fromId].signal(signal); } catch(e) { console.log('signal error:', e); } }
});
socket.on('voice_peer_left', ({ peerId }) => {
  removePeer(peerId);
});

// =====================================
// 画面切り替え
// =====================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
function showError(msg) {
  const t = document.getElementById('error-toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// =====================================
// ナビ
// =====================================
document.getElementById('btn-goto-create').addEventListener('click',  () => { soundClick(); showScreen('screen-create'); });
document.getElementById('btn-goto-join').addEventListener('click',    () => { soundClick(); showScreen('screen-join'); });
document.getElementById('btn-back-from-create').addEventListener('click', () => { soundClick(); showScreen('screen-home'); });
document.getElementById('btn-back-from-join').addEventListener('click',   () => { soundClick(); showScreen('screen-home'); });

document.getElementById('btn-create-room').addEventListener('click', () => {
  soundClick();
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showError('なまえを入力してね！'); return; }
  myName = name; socket.emit('create_room', { playerName: name });
});
document.getElementById('btn-join-room').addEventListener('click', () => {
  soundClick();
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { showError('なまえを入力してね！'); return; }
  if (code.length !== 4) { showError('4ケタのコードを入力してね！'); return; }
  myName = name; socket.emit('join_room', { playerName: name, roomCode: code });
});

// =====================================
// ロビー
// =====================================
function updatePlayerList(players) {
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.id === socket.id ? '（あなた）' : '');
    list.appendChild(li);
  });
}
document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    const b = document.getElementById('btn-copy-code');
    b.textContent = 'コピー済！'; setTimeout(() => b.textContent = 'コピー', 2000);
  });
});
document.getElementById('btn-start-game').addEventListener('click', () => {
  soundClick();
  socket.emit('start_game', {
    difficulty: document.getElementById('setting-difficulty').value,
    totalRounds: parseInt(document.getElementById('setting-rounds').value),
    drawTime: parseInt(document.getElementById('setting-drawtime').value),
  });
});

// =====================================
// タイマー
// =====================================
function startDrawTimer(seconds) {
  stopDrawTimer();
  if (!seconds || seconds <= 0) return;
  drawTimeLeft = seconds;
  const el = document.getElementById('timer-display');
  el.textContent = `⏱️ ${drawTimeLeft}`; el.className = '';
  drawTimer = setInterval(() => {
    drawTimeLeft--;
    if (drawTimeLeft <= 0) {
      stopDrawTimer();
      if (isDrawer) { const ok = document.getElementById('btn-ok'); if (ok && !ok.disabled) ok.click(); }
    } else {
      el.textContent = `⏱️ ${drawTimeLeft}`;
      el.className = drawTimeLeft <= 10 ? 'timer-urgent' : '';
    }
  }, 1000);
}
function stopDrawTimer() {
  clearInterval(drawTimer); drawTimer = null;
  const el = document.getElementById('timer-display');
  if (el) { el.textContent = ''; el.className = ''; }
}

// =====================================
// チャット
// =====================================
function showChat(visible) {
  document.getElementById('chat-area').classList.toggle('hidden', !visible);
}
function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim(); if (!text) return;
  socket.emit('chat_message', { text }); input.value = '';
}
function addChatBubble(playerId, playerName, text) {
  const isMe = playerId === socket.id;
  const msgs = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isMe ? 'mine' : 'others'}`;
  const nameEl = document.createElement('span'); nameEl.className = 'chat-name'; nameEl.textContent = isMe ? '' : playerName;
  const textEl = document.createElement('span'); textEl.className = 'chat-text'; textEl.textContent = text;
  bubble.appendChild(nameEl); bubble.appendChild(textEl);
  msgs.appendChild(bubble); msgs.scrollTop = msgs.scrollHeight;
  if (!isMe) soundChat();
}
document.getElementById('btn-chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

// =====================================
// キャンバス
// =====================================
function initCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  const maxW = Math.min(window.innerWidth - 20, 700);
  canvas.width = maxW; canvas.height = Math.round(maxW * 0.6);
  canvas.style.width = maxW + 'px'; canvas.style.height = Math.round(maxW * 0.6) + 'px';
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); draw(e.touches[0]); },      { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); endDraw(); },                { passive: false });
}
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
}
function startDraw(e) {
  if (!isDrawer) return; drawing = true;
  const pos = getPos(e); lastX = pos.x; lastY = pos.y;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, (isEraser ? currentSize * 3 : currentSize) / 2, 0, Math.PI * 2);
  ctx.fillStyle = isEraser ? 'white' : currentColor; ctx.fill();
  socket.emit('draw_event', { type:'dot', x:pos.x, y:pos.y, color:isEraser?'white':currentColor, size:isEraser?currentSize*3:currentSize, cw:canvas.width, ch:canvas.height });
}
function draw(e) {
  if (!drawing || !isDrawer) return;
  const pos = getPos(e);
  ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y);
  ctx.strokeStyle = isEraser ? 'white' : currentColor;
  ctx.lineWidth = isEraser ? currentSize * 3 : currentSize;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  socket.emit('draw_event', { type:'line', x0:lastX, y0:lastY, x1:pos.x, y1:pos.y, color:isEraser?'white':currentColor, size:isEraser?currentSize*3:currentSize, cw:canvas.width, ch:canvas.height });
  lastX = pos.x; lastY = pos.y;
}
function endDraw() { if (drawing && isDrawer) saveUndoState(); drawing = false; }
function saveUndoState() { if (!canvas) return; undoHistory.push(canvas.toDataURL()); if (undoHistory.length > 4) undoHistory.shift(); updateUndoButton(); }
function updateUndoButton() {
  const btn = document.getElementById('btn-undo'); if (!btn) return;
  const can = undoHistory.length > 1; btn.disabled = !can; btn.style.opacity = can ? '1' : '0.4';
  btn.textContent = `↩ 戻す(${Math.max(0, undoHistory.length - 1)})`;
}
function drawRemote(data) {
  if (!ctx) return;
  const sx = canvas.width / data.cw, sy = canvas.height / data.ch;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (data.type === 'dot') { ctx.beginPath(); ctx.arc(data.x*sx, data.y*sy, data.size/2, 0, Math.PI*2); ctx.fillStyle = data.color; ctx.fill(); }
  else if (data.type === 'line') { ctx.beginPath(); ctx.moveTo(data.x0*sx, data.y0*sy); ctx.lineTo(data.x1*sx, data.y1*sy); ctx.strokeStyle = data.color; ctx.lineWidth = data.size; ctx.stroke(); }
  else if (data.type === 'clear') { ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  else if (data.type === 'image') { const img=new Image(); img.onload=()=>{ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height); }; img.src=data.data; }
}

// ツール
document.querySelectorAll('.color-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); currentColor = btn.dataset.color; isEraser = false;
  document.getElementById('btn-eraser').style.background = '#2D6E6E';
}));
document.querySelectorAll('.size-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); currentSize = parseInt(btn.dataset.size);
}));
document.getElementById('btn-eraser').addEventListener('click', () => {
  isEraser = !isEraser; document.getElementById('btn-eraser').style.background = isEraser ? '#C9960C' : '#2D6E6E';
});
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!isDrawer) return; saveUndoState(); ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); saveUndoState();
  socket.emit('draw_event', { type:'clear', cw:canvas.width, ch:canvas.height });
});
document.getElementById('btn-undo').addEventListener('click', () => {
  if (!isDrawer || undoHistory.length <= 1) return;
  undoHistory.pop(); const prev = undoHistory[undoHistory.length-1];
  const img = new Image(); img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height); socket.emit('draw_event',{type:'image',data:prev,cw:canvas.width,ch:canvas.height}); }; img.src = prev;
  updateUndoButton();
});
document.getElementById('btn-ok').addEventListener('click', () => {
  if (!isDrawer) return; stopDrawTimer();
  socket.emit('submit_drawing', { imageData: canvas.toDataURL('image/png') });
  document.getElementById('btn-ok').disabled = true; document.getElementById('btn-ok').textContent = '送信中...';
  document.getElementById('draw-tools').classList.add('hidden'); showChat(false);
});

// 人間の回答
document.getElementById('btn-submit-guess').addEventListener('click', submitGuess);
document.getElementById('guess-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });
function submitGuess() {
  const input = document.getElementById('guess-input'); const guess = input.value.trim();
  if (!guess || hasGuessed) return; hasGuessed = true;
  socket.emit('human_guess', { guess }); input.value = ''; input.disabled = true; document.getElementById('btn-submit-guess').disabled = true;
}

document.getElementById('btn-next-round').addEventListener('click', () => socket.emit('next_round'));
document.getElementById('btn-to-gameover').addEventListener('click', () => socket.emit('next_round'));
document.getElementById('btn-play-again').addEventListener('click', () => {
  showScreen('screen-lobby');
  if (isHost) { document.getElementById('host-settings').classList.remove('hidden'); document.getElementById('guest-waiting').classList.add('hidden'); }
});

// =====================================
// フェーズ管理
// =====================================
function hideAllPhases() {
  document.querySelectorAll('.phase-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('canvas-area').classList.add('hidden');
  document.getElementById('current-word-display').classList.add('hidden');
  document.getElementById('phase-watching').classList.add('hidden');
}
function buildCategoryGrid(categories) {
  const grid = document.getElementById('category-grid'); grid.innerHTML = '';
  const icons = { 'どうぶつ':'🐘','たべもの':'🍜','のりもの':'🚗','スポーツ':'⚽','たてもの':'🏠','しぜん':'🌸','しごと':'💼','きもち':'😂','エンタメ':'🎮','なつかしい':'📺','うみのなかま':'🐙','キャラクター':'🌟' };
  categories.forEach(cat => {
    const btn = document.createElement('button'); btn.className = 'category-btn';
    btn.textContent = (icons[cat]||'') + '\n' + cat;
    btn.addEventListener('click', () => {
      soundClick();
      socket.emit('select_category', { category: cat });
      // ④ カテゴリ選択後はサーバーからstart_drawingが来るまで待つ
      document.getElementById('watching-message').textContent = 'お題を準備中...🎲';
      hideAllPhases();
      document.getElementById('phase-watching').classList.remove('hidden');
    });
    grid.appendChild(btn);
  });
}

// =====================================
// ギャラリー表示
// =====================================
function showGallery(galleryData) {
  const el = document.getElementById('round-gallery');
  if (!galleryData || galleryData.length === 0) { el.classList.add('hidden'); return; }
  el.innerHTML = ''; el.classList.remove('hidden');
  const title = document.createElement('p'); title.className = 'round-gallery-title'; title.textContent = '✏️ みんなの絵コレクション'; el.appendChild(title);
  galleryData.forEach(item => {
    const card = document.createElement('div'); card.className = 'gallery-card';
    const round = document.createElement('p'); round.className = 'gallery-round'; round.textContent = `R${item.round}`;
    const img = document.createElement('img'); img.className = 'gallery-img'; img.src = item.imageData; img.alt = item.drawerName;
    const author = document.createElement('p'); author.className = 'gallery-author'; author.textContent = `✏️ ${item.drawerName}`;
    card.appendChild(round); card.appendChild(img); card.appendChild(author); el.appendChild(card);
  });
}

// =====================================
// Socket イベント
// =====================================
socket.on('error', ({ message }) => showError(message));

socket.on('room_created', ({ roomCode, players, isHost: host }) => {
  myRoomCode = roomCode; isHost = host;
  document.getElementById('lobby-room-code').textContent = roomCode; updatePlayerList(players);
  document.getElementById('host-settings').classList.remove('hidden'); document.getElementById('guest-waiting').classList.add('hidden');
  showScreen('screen-lobby');
});
socket.on('room_joined', ({ roomCode, players, isHost: host }) => {
  myRoomCode = roomCode; isHost = host;
  document.getElementById('lobby-room-code').textContent = roomCode; updatePlayerList(players);
  document.getElementById('host-settings').classList.add('hidden'); document.getElementById('guest-waiting').classList.remove('hidden');
  showScreen('screen-lobby');
});
socket.on('player_updated', ({ players }) => updatePlayerList(players));

socket.on('game_started', ({ difficulty, totalRounds, drawTime, players }) => {
  initCanvas(); showScreen('screen-game'); hideAllPhases(); showChat(false);
  document.getElementById('phase-info').textContent = 'まもなく開始';
});

socket.on('round_started', ({ round, totalRounds, drawerName, drawerId, categories }) => {
  isDrawer = (drawerId === socket.id); hasGuessed = false;
  stopDrawTimer(); showChat(false);
  document.getElementById('round-info').textContent = `ラウンド ${round}/${totalRounds}`;
  document.getElementById('phase-info').textContent = isDrawer ? 'あなたが描き手！' : `${drawerName} が描いています`;
  if (ctx) { ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  undoHistory = []; if (canvas) undoHistory.push(canvas.toDataURL()); updateUndoButton();
  document.getElementById('chat-messages').innerHTML = '';

  if (isDrawer) {
    buildCategoryGrid(categories);
    hideAllPhases(); document.getElementById('phase-category').classList.remove('hidden');
    document.getElementById('phase-info').textContent = 'カテゴリを選ぼう！';
  } else {
    document.getElementById('watching-message').textContent = `${drawerName} がカテゴリを選んでいます...`;
    hideAllPhases(); document.getElementById('phase-watching').classList.remove('hidden');
  }
});

// ④ start_drawing：サーバーからお題が1つ届く
socket.on('start_drawing', ({ word, category, drawTime }) => {
  document.getElementById('current-word-text').textContent = word;
  document.getElementById('current-word-display').classList.remove('hidden');
  document.getElementById('btn-ok').disabled = false; document.getElementById('btn-ok').textContent = 'OK！描けた！';
  document.getElementById('draw-tools').classList.remove('hidden');
  hideAllPhases();
  document.getElementById('canvas-area').classList.remove('hidden');
  document.getElementById('current-word-display').classList.remove('hidden');
  document.getElementById('phase-info').textContent = '描いてね！';
  showChat(true);
  if (drawTime && drawTime > 0) startDrawTimer(drawTime);
});

socket.on('drawing_phase', ({ drawerName, category, drawTime }) => {
  document.getElementById('watching-message').textContent = `${drawerName} が「${category}」から描いています...`;
  hideAllPhases();
  document.getElementById('canvas-area').classList.remove('hidden');
  document.getElementById('phase-watching').classList.remove('hidden');
  document.getElementById('draw-tools').classList.add('hidden');
  document.getElementById('phase-info').textContent = 'みんなで見よう！';
  showChat(true);
  if (drawTime && drawTime > 0) startDrawTimer(drawTime);
});

socket.on('draw_event', (data) => { if (!isDrawer) drawRemote(data); });
socket.on('chat_message', ({ playerId, playerName, text }) => addChatBubble(playerId, playerName, text));

socket.on('ai_guessing', ({ difficulty }) => {
  stopDrawTimer(); showChat(false);
  const labels = { easy:'ゆるいAI', normal:'ふつうAI', hard:'きびしいAI' };
  document.getElementById('ai-thinking-text').textContent = `${labels[difficulty]||'AI'} が絵を分析中...`;
  hideAllPhases(); document.getElementById('phase-ai').classList.remove('hidden');
  document.getElementById('phase-info').textContent = 'AIが判定中...';
});

socket.on('ai_result', ({ guess, correct }) => {
  document.getElementById('ai-answer-text').textContent = `「${guess}」`;
  const verdict = document.getElementById('ai-verdict');
  const eyeL = document.getElementById('result-eye-left');
  const eyeR = document.getElementById('result-eye-right');
  const mouth = document.getElementById('result-mouth');
  const monologue = document.getElementById('ai-monologue');

  const wrongPhrases = ['ぬぬぬ…わからぬ！','これは一体…なんじゃ！？','むむむ！予測不能な絵じゃ…！','カイロス回路がショートしそう…！','人間め…なかなかやるな！','お、おのれ…次は負けんぞ！','ぴぴぴ…エラー！エラー！！'];
  const rightPhrases = ['フハハ！お見通しじゃ！','ふふふ…AIをなめるな！','計算通り！完璧な分析！','ピピッ！正解！人間に勝ったぞ！'];

  if (correct) {
    verdict.textContent = '😈 正解！AIの勝ち！'; verdict.className = 'ai-verdict correct';
    if (eyeL) { eyeL.className = 'ai-eye left happy'; eyeR.className = 'ai-eye right happy'; }
    if (mouth) mouth.className = 'ai-mouth happy';
    if (monologue) { monologue.textContent = rightPhrases[Math.floor(Math.random()*rightPhrases.length)]; monologue.classList.remove('hidden'); }
    soundAIWin();
  } else {
    verdict.textContent = '🎉 不正解！人間の番だ！'; verdict.className = 'ai-verdict wrong';
    // ① 悔しい顔
    if (eyeL) { eyeL.className = 'ai-eye left frustrated'; eyeR.className = 'ai-eye right frustrated'; }
    if (mouth) mouth.className = 'ai-mouth frustrated';
    if (monologue) { monologue.textContent = wrongPhrases[Math.floor(Math.random()*wrongPhrases.length)]; monologue.classList.remove('hidden'); }
    soundAILose();
  }
  hideAllPhases(); document.getElementById('phase-ai-result').classList.remove('hidden');
  document.getElementById('phase-info').textContent = correct ? 'AIの勝ち！' : 'AIは外した！';
});

socket.on('human_guessing_phase', ({ drawerName, category }) => {
  const label = document.getElementById('human-guess-label');
  const inputArea = document.getElementById('guess-input-area');
  if (isDrawer) { label.textContent = `みんなが「${category}」の答えを考えています...`; inputArea.classList.add('hidden'); }
  else { label.textContent = `「${category}」カテゴリ！何が描いてある？`; inputArea.classList.remove('hidden'); document.getElementById('guess-input').disabled = false; document.getElementById('btn-submit-guess').disabled = false; }
  document.getElementById('guess-log').innerHTML = '';
  hideAllPhases();
  document.getElementById('phase-human').classList.remove('hidden');
  document.getElementById('canvas-area').classList.remove('hidden');
  document.getElementById('phase-info').textContent = '人間が回答中...';
  showChat(true);
});

socket.on('guess_submitted', ({ playerName, guess, correct }) => {
  const log = document.getElementById('guess-log');
  const item = document.createElement('div'); item.className = `guess-item ${correct?'correct':'wrong'}`;
  item.textContent = `${playerName}：「${guess}」 ${correct?'✓ 正解！':'✗ 不正解'}`;
  log.appendChild(item); if (correct) soundHumanWin(); else soundHumanWrong(); log.scrollTop = log.scrollHeight;
});

socket.on('round_over', ({ winner, correctWord, scores, round, totalRounds, isLastRound, gallery }) => {
  showChat(false);
  const winnerEl = document.getElementById('result-winner-text');
  if (winner==='human') { winnerEl.textContent='🎉 人間チームの勝ち！'; winnerEl.className='result-winner human-win'; }
  else if (winner==='ai') { winnerEl.textContent='🤖 AIの勝ち！'; winnerEl.className='result-winner ai-win'; }
  else { winnerEl.textContent='🤝 引き分け！'; winnerEl.className='result-winner draw'; }
  document.getElementById('result-word').textContent = correctWord;
  const scoreList = document.getElementById('round-score-list'); scoreList.innerHTML = '';
  scores.forEach(s => { const i=document.createElement('div'); i.className='score-item'; i.innerHTML=`<span>${s.name}</span><span>${s.score}pt</span>`; scoreList.appendChild(i); });
  showGallery(gallery);
  const btnNext = document.getElementById('btn-next-round'); const btnGO = document.getElementById('btn-to-gameover');
  if (isHost) { if (isLastRound) { btnNext.style.display='none'; btnGO.style.display='inline-block'; } else { btnNext.style.display='inline-block'; btnGO.style.display='none'; } }
  else { btnNext.style.display='none'; btnGO.style.display='none'; }
  hideAllPhases(); document.getElementById('phase-round-result').classList.remove('hidden');
  document.getElementById('phase-info').textContent = 'ラウンド終了';
});

socket.on('game_over', ({ scores, winner }) => {
  const list = document.getElementById('final-score-list'); list.innerHTML = '';
  scores.forEach((s,i) => { const item=document.createElement('div'); item.className='final-score-item'; const medals=['🥇','🥈','🥉']; item.innerHTML=`<span>${medals[i]||`${i+1}位`} ${s.name}</span><span>${s.score}pt</span>`; list.appendChild(item); });
  showScreen('screen-gameover');
});
