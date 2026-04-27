const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(express.static(path.join(__dirname, 'public')));

// =====================================
// お題リスト
// =====================================
const wordLists = {
  'どうぶつ': ['ゾウ', 'ペンギン', 'クマ', 'キリン', 'ライオン', 'サル', 'うさぎ', 'カメ', 'タヌキ', 'キツネ', 'パンダ', 'トラ', 'ネコ', 'イヌ', 'ウマ', 'ヒツジ', 'ブタ', 'ニワトリ', 'コアラ', 'カンガルー'],
  'たべもの': ['ラーメン', 'ピザ', 'イチゴ', 'おにぎり', 'ケーキ', 'すし', 'カレー', 'たこやき', 'アイスクリーム', 'バナナ', 'リンゴ', 'ハンバーガー', 'チョコレート', 'ミカン', 'うどん', 'やきとり', 'プリン', 'ドーナツ', 'ポテト', 'ラムネ'],
  'のりもの': ['バス', 'ロケット', 'じてんしゃ', 'でんしゃ', 'ひこうき', 'せんすいかん', 'ヘリコプター', 'ボート', 'トラック', 'オートバイ', 'タクシー', 'しんかんせん', 'ヨット', 'きゅうきゅうしゃ', 'しょうぼうしゃ', 'くるま', 'ふね', 'じどうしゃ', 'スケートボード', 'UFO'],
  'スポーツ': ['サッカー', 'すいえい', 'すもう', 'テニス', 'やきゅう', 'スキー', 'ボクシング', 'ゴルフ', 'バレーボール', 'マラソン', 'じゅうどう', 'バスケットボール', 'たいそう', 'サーフィン', 'スケート', 'バドミントン', 'ピンポン', 'ラグビー', 'アーチェリー', 'ボウリング'],
  'たてもの': ['おしろ', 'がっこう', 'とうだい', 'マンション', 'じんじゃ', 'えき', 'びょういん', 'ピラミッド', 'タワー', 'きょうかい', 'ゆうえんち', 'としょかん', 'ホテル', 'トンネル', 'はし', 'えいがかん', 'スーパー', 'こうえん', 'どうぶつえん', 'おてら'],
  'しぜん': ['さくら', 'かみなり', 'かざん', 'にじ', 'つき', 'やま', 'うみ', 'たき', 'ゆき', 'たいふう', 'たいよう', 'ほし', 'かわ', 'もり', 'はな', 'きのこ', 'かいがら', 'こおり', 'なみ', 'きり'],
  'しごと': ['りょうりにん', 'うちゅうひこうし', 'にんじゃ', 'けいさつかん', 'しょうぼうし', 'いしゃ', 'のうか', 'きょうし', 'まほうつかい', 'かいぞく', 'かがくしゃ', 'けんちくか', 'ミュージシャン', 'かんごし', 'うんてんし', 'げいにん', 'まんがか', 'パティシエ', 'パイロット', 'まほうつかい'],
  'きもち': ['おこり', 'おどろき', 'はずかしい', 'かなしい', 'うれしい', 'こわい', 'ねむい', 'たのしい', 'さびしい', 'あせる', 'あきれる', 'わくわく', 'どきどき', 'ほっとする', 'なく', 'わらう', 'しんぱい', 'つかれる', 'はらがたつ', 'おどろく'],
  'エンタメ': ['ギター', 'えいが', 'おまつり', 'まんが', 'ゲーム', 'おんがく', 'ダンス', 'マジック', 'サーカス', 'えんげき', 'カメラ', 'テレビ', 'ピアノ', 'えほん', 'はなび', 'カラオケ', 'バンド', 'アニメ', 'アイドル', 'よさこい'],
  'なつかしい': ['ファミコン', 'くろでんわ', 'かみしばい', 'ちょうちん', 'こま', 'めんこ', 'そろばん', 'ゆかた', 'たけとんぼ', 'ふろしき', 'でんでんだいこ', 'おてだま', 'ガラスびん', 'せんたくいた', 'いろり', 'がまぐち', 'ふみきり', 'ちんどんや', 'あんどん', 'よーよー'],
  'うみのなかま': ['タコ', 'サメ', 'にんぎょ', 'クラゲ', 'イルカ', 'ウミガメ', 'カニ', 'エビ', 'フグ', 'ヒトデ', 'タツノオトシゴ', 'クジラ', 'マンタ', 'ラッコ', 'アザラシ', 'サンゴ', 'ウナギ', 'チンアナゴ', 'ナマコ', 'カキ'],
  'むずかしい概念': ['じゆう', 'じかん', 'ゆめ', 'あい', 'きおく', 'おと', 'かぜ', 'こどく', 'へいわ', 'きぼう', 'うんめい', 'しんじつ', 'いのち', 'えいえん', 'まほう', 'うそ', 'なつかしさ', 'みらい', 'かこ', 'うちゅう'],
};

// =====================================
// ルーム管理
// =====================================
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRandomWords(category, count = 3) {
  const words = [...wordLists[category]];
  const selected = [];
  for (let i = 0; i < count && words.length > 0; i++) {
    const idx = Math.floor(Math.random() * words.length);
    selected.push(words.splice(idx, 1)[0]);
  }
  return selected;
}

// ひらがな↔カタカナ正規化
function toKatakana(str) {
  return str.replace(/[ぁ-ゖ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

function checkAnswer(guess, correct) {
  const normalize = (s) => toKatakana(s.trim().toLowerCase()).replace(/\s/g, '');
  const g = normalize(guess);
  const c = normalize(correct);
  return g.includes(c) || c.includes(g);
}

// =====================================
// Claude AI 判定
// =====================================
const difficultyPrompts = {
  easy: {
    system: 'あなたは絵を見て何が描かれているかを答えるAIです。しかしあなたは絵の読み取りがとても苦手で、よく間違えます。自信がなければ全然違う答えを言っても構いません。答えは必ず日本語で単語一つだけ答えてください。説明は不要です。',
    hint: '（ゆるいモード：よく間違えてください）'
  },
  normal: {
    system: 'あなたは絵を見て何が描かれているかを答えるAIです。描かれた絵を見て、何を表しているか日本語で単語一つだけ答えてください。説明は不要です。',
    hint: ''
  },
  hard: {
    system: 'あなたは高精度な画像認識AIです。描かれた絵を細部まで徹底的に分析し、何を表しているか正確に判断してください。どんな抽象的な絵でも必ず答えを出してください。答えは日本語で単語一つだけ答えてください。説明は不要です。',
    hint: '（きびしいモード：できる限り正解を目指してください）'
  }
};

async function askClaudeAI(imageBase64, difficulty) {
  const { system } = difficultyPrompts[difficulty] || difficultyPrompts.normal;

  // base64のヘッダーを取り除く
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 50,
    system,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: 'この絵に何が描かれていますか？日本語で単語一つだけ答えてください。',
          },
        ],
      },
    ],
  });

  return response.content[0].text.trim();
}

// =====================================
// ゲームロジック
// =====================================
function createRoom(hostId, hostName) {
  let code;
  do {
    code = generateRoomCode();
  } while (rooms[code]);

  rooms[code] = {
    code,
    hostId,
    players: [{ id: hostId, name: hostName, score: 0 }],
    gameStarted: false,
    difficulty: 'normal',
    totalRounds: 5,
    currentRound: 0,
    currentDrawerIndex: 0,
    currentWord: null,
    currentCategory: null,
    phase: 'lobby', // lobby | word_select | drawing | ai_guessing | human_guessing | round_result | game_over
    canvasData: null,
    aiGuess: null,
    aiCorrect: false,
    humanGuesses: [],
    roundWinner: null, // 'ai' | 'human' | 'draw'
  };
  return rooms[code];
}

function getRoom(code) {
  return rooms[code.toUpperCase()] || null;
}

function removePlayer(roomCode, playerId) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players = room.players.filter(p => p.id !== playerId);
  if (room.players.length === 0) {
    delete rooms[roomCode];
    return null;
  }
  if (room.hostId === playerId && room.players.length > 0) {
    room.hostId = room.players[0].id;
  }
  return room;
}

// =====================================
// Socket.io
// =====================================
io.on('connection', (socket) => {
  console.log('接続:', socket.id);

  // ルーム作成
  socket.on('create_room', ({ playerName }) => {
    const name = (playerName || '名無し').slice(0, 12);
    const room = createRoom(socket.id, name);
    socket.join(room.code);
    socket.roomCode = room.code;
    socket.emit('room_created', {
      roomCode: room.code,
      players: room.players,
      isHost: true,
    });
    console.log(`ルーム作成: ${room.code} by ${name}`);
  });

  // ルーム参加
  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const name = (playerName || '名無し').slice(0, 12);
    const room = getRoom(code);

    if (!room) {
      socket.emit('error', { message: 'ルームが見つかりません。コードを確認してね！' });
      return;
    }
    if (room.gameStarted) {
      socket.emit('error', { message: 'このゲームはすでに開始しています。' });
      return;
    }
    if (room.players.length >= 6) {
      socket.emit('error', { message: 'このルームは満員です（最大6人）。' });
      return;
    }

    room.players.push({ id: socket.id, name, score: 0 });
    socket.join(code);
    socket.roomCode = code;

    socket.emit('room_joined', {
      roomCode: code,
      players: room.players,
      isHost: false,
    });
    socket.to(code).emit('player_updated', { players: room.players });
    console.log(`${name} がルーム ${code} に参加`);
  });

  // ゲーム開始
  socket.on('start_game', ({ difficulty, totalRounds }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) {
      socket.emit('error', { message: '2人以上必要です！' });
      return;
    }

    room.gameStarted = true;
    room.difficulty = difficulty || 'normal';
    room.totalRounds = parseInt(totalRounds) || 5;
    room.currentRound = 0;
    room.currentDrawerIndex = 0;
    room.players.forEach(p => p.score = 0);

    io.to(room.code).emit('game_started', {
      difficulty: room.difficulty,
      totalRounds: room.totalRounds,
      players: room.players,
    });

    startNextRound(room);
  });

  // カテゴリ選択
  socket.on('select_category', ({ category }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.id !== socket.id) return;
    if (room.phase !== 'word_select') return;

    if (!wordLists[category]) {
      socket.emit('error', { message: '無効なカテゴリです。' });
      return;
    }

    room.currentCategory = category;
    const words = getRandomWords(category, 3);

    // お題候補は描き手だけに送る
    socket.emit('word_choices', { words, category });
  });

  // お題確定
  socket.on('select_word', ({ word }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.id !== socket.id) return;
    if (room.phase !== 'word_select') return;

    room.currentWord = word;
    room.phase = 'drawing';
    room.canvasData = null;

    // 描き手以外にはカテゴリだけ伝える
    socket.to(room.code).emit('drawing_phase', {
      drawerName: drawer.name,
      category: room.currentCategory,
      round: room.currentRound,
      totalRounds: room.totalRounds,
    });

    // 描き手には描画開始を伝える
    socket.emit('start_drawing', {
      word,
      category: room.currentCategory,
      round: room.currentRound,
      totalRounds: room.totalRounds,
    });
  });

  // 描画データ同期
  socket.on('draw_event', (data) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'drawing') return;
    socket.to(room.code).emit('draw_event', data);
  });

  // 描画完了（OKボタン）
  socket.on('submit_drawing', async ({ imageData }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.id !== socket.id) return;
    if (room.phase !== 'drawing') return;

    room.phase = 'ai_guessing';
    room.canvasData = imageData;
    room.humanGuesses = [];

    io.to(room.code).emit('ai_guessing', {
      difficulty: room.difficulty,
    });

    try {
      const aiGuess = await askClaudeAI(imageData, room.difficulty);
      room.aiGuess = aiGuess;
      room.aiCorrect = checkAnswer(aiGuess, room.currentWord);

      io.to(room.code).emit('ai_result', {
        guess: aiGuess,
        correct: room.aiCorrect,
        correctWord: room.aiCorrect ? room.currentWord : null,
      });

      if (room.aiCorrect) {
        // AIの勝ち
        setTimeout(() => endRound(room, 'ai'), 3000);
      } else {
        // 人間の予想フェーズへ
        room.phase = 'human_guessing';
        const nonDrawers = room.players.filter(p => p.id !== drawer.id);

        io.to(room.code).emit('human_guessing_phase', {
          drawerName: drawer.name,
          category: room.currentCategory,
          players: nonDrawers.map(p => ({ id: p.id, name: p.name, guessed: false })),
        });
      }
    } catch (err) {
      console.error('Claude API エラー:', err);
      io.to(room.code).emit('ai_result', {
        guess: 'エラーが発生しました',
        correct: false,
        correctWord: null,
      });
      room.phase = 'human_guessing';
      const nonDrawers = room.players.filter(p => p.id !== drawer.id);
      io.to(room.code).emit('human_guessing_phase', {
        drawerName: drawer.name,
        category: room.currentCategory,
        players: nonDrawers.map(p => ({ id: p.id, name: p.name, guessed: false })),
      });
    }
  });

  // 人間の回答
  socket.on('human_guess', ({ guess }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'human_guessing') return;
    const drawer = room.players[room.currentDrawerIndex];
    if (drawer && drawer.id === socket.id) return; // 描き手は回答不可

    // すでに回答済みかチェック
    if (room.humanGuesses.find(g => g.playerId === socket.id)) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const correct = checkAnswer(guess, room.currentWord);
    room.humanGuesses.push({ playerId: socket.id, name: player.name, guess, correct });

    io.to(room.code).emit('guess_submitted', {
      playerName: player.name,
      guess,
      correct,
    });

    if (correct) {
      // 人間の勝ち
      setTimeout(() => endRound(room, 'human', socket.id), 2000);
      return;
    }

    // 全員回答したか確認
    const nonDrawers = room.players.filter(p => p.id !== drawer?.id);
    if (room.humanGuesses.length >= nonDrawers.length) {
      setTimeout(() => endRound(room, 'draw'), 2000);
    }
  });

  // 次のラウンドへ（ホストが押す）
  socket.on('next_round', () => {
    const room = getRoom(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'round_result') return;
    startNextRound(room);
  });

  // 切断
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = removePlayer(code, socket.id);
    if (room) {
      io.to(code).emit('player_updated', { players: room.players });
    }
    console.log('切断:', socket.id);
  });
});

// =====================================
// ラウンド管理
// =====================================
function startNextRound(room) {
  room.currentRound++;

  if (room.currentRound > room.totalRounds) {
    endGame(room);
    return;
  }

  // 描き手をローテーション
  room.currentDrawerIndex = (room.currentRound - 1) % room.players.length;
  room.phase = 'word_select';
  room.currentWord = null;
  room.currentCategory = null;
  room.aiGuess = null;
  room.aiCorrect = false;
  room.humanGuesses = [];
  room.roundWinner = null;

  const drawer = room.players[room.currentDrawerIndex];

  // 全員にラウンド開始を通知
  io.to(room.code).emit('round_started', {
    round: room.currentRound,
    totalRounds: room.totalRounds,
    drawerName: drawer.name,
    drawerId: drawer.id,
    categories: Object.keys(wordLists),
  });
}

function endRound(room, winner, winnerId = null) {
  room.phase = 'round_result';
  room.roundWinner = winner;

  const drawer = room.players[room.currentDrawerIndex];

  // スコア計算
  if (winner === 'human' && winnerId) {
    const winPlayer = room.players.find(p => p.id === winnerId);
    if (winPlayer) winPlayer.score += 2;
    if (drawer) drawer.score += 1;
  }
  // AIが勝った場合・引き分けはスコアなし

  io.to(room.code).emit('round_over', {
    winner,
    correctWord: room.currentWord,
    aiGuess: room.aiGuess,
    scores: room.players.map(p => ({ name: p.name, score: p.score })),
    round: room.currentRound,
    totalRounds: room.totalRounds,
    isLastRound: room.currentRound >= room.totalRounds,
  });
}

function endGame(room) {
  room.phase = 'game_over';
  room.gameStarted = false;

  const sorted = [...room.players].sort((a, b) => b.score - a.score);

  io.to(room.code).emit('game_over', {
    scores: sorted.map(p => ({ name: p.name, score: p.score })),
    winner: sorted[0]?.name,
  });
}

// =====================================
// サーバー起動
// =====================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 AIをあざむけ！サーバー起動中 http://localhost:${PORT}`);
});
