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

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) res.set('Content-Type', 'text/css');
    else if (filePath.endsWith('.js')) res.set('Content-Type', 'application/javascript');
    else if (filePath.endsWith('.html')) res.set('Content-Type', 'text/html');
  }
}));

app.get('/style.css', (req, res) => {
  res.type('text/css');
  res.sendFile(path.join(__dirname, 'public', 'style.css'));
});
app.get('/game.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'game.js'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// =====================================
// 単語エイリアス（漢字・表記ゆれ対応）
// =====================================
const wordAliases = {
  'ゾウ':['ぞう','象'],'クマ':['くま','熊'],'キリン':['きりん','麒麟'],
  'ライオン':['らいおん'],'サル':['さる','猿'],'うさぎ':['ウサギ','兎','兔'],
  'カメ':['かめ','亀'],'タヌキ':['たぬき','狸'],'キツネ':['きつね','狐'],
  'パンダ':['ぱんだ'],'トラ':['とら','虎'],'ネコ':['ねこ','猫'],
  'イヌ':['いぬ','犬'],'ウマ':['うま','馬'],'ヒツジ':['ひつじ','羊'],
  'ブタ':['ぶた','豚'],'ニワトリ':['にわとり','鶏','鳥'],'コアラ':['こあら'],
  'カンガルー':['かんがるー'],
  'ラーメン':['らーめん','拉麺'],'ピザ':['ぴざ'],'イチゴ':['いちご','苺'],
  'おにぎり':['おにぎり','御握り','握り飯'],'ケーキ':['けーき'],
  'すし':['スシ','寿司','鮨','鮓'],'カレー':['かれー','カレーライス'],
  'たこやき':['タコヤキ','蛸焼き','たこ焼き','タコ焼き'],
  'アイスクリーム':['あいすくりーむ','アイス','あいす'],
  'バナナ':['ばなな'],'リンゴ':['りんご','林檎'],
  'ハンバーガー':['はんばーがー'],'チョコレート':['ちょこれーと','チョコ','ちょこ'],
  'ミカン':['みかん','蜜柑','オレンジ'],'うどん':['ウドン','饂飩'],
  'やきとり':['ヤキトリ','焼き鳥','焼鳥'],'プリン':['ぷりん'],
  'ドーナツ':['どーなつ'],'ポテト':['ぽてと','じゃがいも','ジャガイモ','芋'],
  'ラムネ':['らむね'],
  'バス':['ばす'],'ロケット':['ろけっと'],'じてんしゃ':['ジテンシャ','自転車'],
  'でんしゃ':['デンシャ','電車'],'ひこうき':['ヒコウキ','飛行機'],
  'せんすいかん':['センスイカン','潜水艦'],'ヘリコプター':['へりこぷたー'],
  'ボート':['ぼーと'],'トラック':['とらっく'],
  'オートバイ':['おーとばい','バイク','ばいく'],'タクシー':['たくしー'],
  'しんかんせん':['シンカンセン','新幹線'],'ヨット':['よっと'],
  'きゅうきゅうしゃ':['キュウキュウシャ','救急車'],
  'しょうぼうしゃ':['ショウボウシャ','消防車'],'くるま':['クルマ','車'],
  'ふね':['フネ','船'],'じどうしゃ':['ジドウシャ','自動車','車'],
  'スケートボード':['すけーとぼーど'],'UFO':['ゆーふぉー','ユーフォー'],
  'サッカー':['さっかー'],'すいえい':['スイエイ','水泳'],
  'すもう':['スモウ','相撲'],'テニス':['てにす'],'やきゅう':['ヤキュウ','野球'],
  'スキー':['すきー'],'ボクシング':['ぼくしんぐ'],'ゴルフ':['ごるふ'],
  'バレーボール':['ばれーぼーる','バレー'],'マラソン':['まらそん'],
  'じゅうどう':['ジュウドウ','柔道'],
  'バスケットボール':['ばすけっとぼーる','バスケ','ばすけ'],
  'たいそう':['タイソウ','体操'],'サーフィン':['さーふぃん'],
  'スケート':['すけーと'],'バドミントン':['ばどみんとん'],
  'ピンポン':['ぴんぽん','卓球','たっきゅう'],'ラグビー':['らぐびー'],
  'アーチェリー':['あーちぇりー'],'ボウリング':['ぼうりんぐ'],
  'おしろ':['オシロ','城','しろ','お城'],'がっこう':['ガッコウ','学校'],
  'とうだい':['トウダイ','灯台'],'マンション':['まんしょん'],
  'じんじゃ':['ジンジャ','神社'],'えき':['エキ','駅'],
  'びょういん':['ビョウイン','病院'],'ピラミッド':['ぴらみっど'],
  'タワー':['たわー','塔','とう'],'きょうかい':['キョウカイ','教会'],
  'ゆうえんち':['ユウエンチ','遊園地'],'としょかん':['トショカン','図書館'],
  'ホテル':['ほてる'],'トンネル':['とんねる'],'はし':['ハシ','橋'],
  'えいがかん':['エイガカン','映画館'],'スーパー':['すーぱー'],
  'こうえん':['コウエン','公園'],'どうぶつえん':['ドウブツエン','動物園'],
  'おてら':['オテラ','てら','寺','お寺'],
  'さくら':['サクラ','桜'],'かみなり':['カミナリ','雷'],
  'かざん':['カザン','火山'],'にじ':['ニジ','虹'],'つき':['ツキ','月'],
  'やま':['ヤマ','山'],'うみ':['ウミ','海'],'たき':['タキ','滝'],
  'ゆき':['ユキ','雪'],'たいふう':['タイフウ','台風'],
  'たいよう':['タイヨウ','太陽','日','お日様'],'ほし':['ホシ','星'],
  'かわ':['カワ','川','河'],'もり':['モリ','森'],'はな':['ハナ','花'],
  'きのこ':['キノコ','茸'],'かいがら':['カイガラ','貝殻','貝'],
  'こおり':['コオリ','氷'],'なみ':['ナミ','波'],'きり':['キリ','霧'],
  'りょうりにん':['リョウリニン','料理人','コック','シェフ'],
  'うちゅうひこうし':['ウチュウヒコウシ','宇宙飛行士'],
  'にんじゃ':['ニンジャ','忍者'],
  'けいさつかん':['ケイサツカン','警察官','けいさつ','警察','お巡りさん'],
  'しょうぼうし':['ショウボウシ','消防士'],'いしゃ':['イシャ','医者','医師','ドクター'],
  'のうか':['ノウカ','農家'],'きょうし':['キョウシ','教師','先生','せんせい'],
  'まほうつかい':['マホウツカイ','魔法使い','魔法使'],
  'かいぞく':['カイゾク','海賊'],'かがくしゃ':['カガクシャ','科学者'],
  'けんちくか':['ケンチクカ','建築家'],'ミュージシャン':['みゅーじしゃん','音楽家'],
  'かんごし':['カンゴシ','看護師','看護婦'],
  'うんてんし':['ウンテンシ','運転士','運転手'],'げいにん':['ゲイニン','芸人'],
  'まんがか':['マンガカ','漫画家'],'パティシエ':['ぱてぃしえ','お菓子職人'],
  'パイロット':['ぱいろっと'],
  'おこり':['オコリ','怒り','いかり','イカリ','怒る'],
  'おどろき':['オドロキ','驚き','びっくり'],
  'はずかしい':['ハズカシイ','恥ずかしい','恥'],
  'かなしい':['カナシイ','悲しい','悲しみ'],
  'うれしい':['ウレシイ','嬉しい'],'こわい':['コワイ','怖い','恐い'],
  'ねむい':['ネムイ','眠い'],'たのしい':['タノシイ','楽しい'],
  'さびしい':['サビシイ','寂しい','淋しい'],'あせる':['アセル','焦る'],
  'あきれる':['アキレル','呆れる'],'わくわく':['ワクワク'],
  'どきどき':['ドキドキ'],'ほっとする':['ホットスル','ほっと'],
  'なく':['ナク','泣く','泣き'],'わらう':['ワラウ','笑う','笑い'],
  'しんぱい':['シンパイ','心配'],'つかれる':['ツカレル','疲れる'],
  'はらがたつ':['ハラガタツ','腹が立つ','怒り'],'おどろく':['オドロク','驚く'],
  'ギター':['ぎたー'],'えいが':['エイガ','映画'],
  'おまつり':['オマツリ','祭り','まつり','祭'],
  'まんが':['マンガ','漫画'],'ゲーム':['げーむ'],'おんがく':['オンガク','音楽'],
  'ダンス':['だんす'],'マジック':['まじっく'],'サーカス':['さーかす'],
  'えんげき':['エンゲキ','演劇','劇'],'カメラ':['かめら'],
  'テレビ':['てれび'],'ピアノ':['ぴあの'],'えほん':['エホン','絵本'],
  'はなび':['ハナビ','花火'],'カラオケ':['からおけ'],
  'バンド':['ばんど'],'アニメ':['あにめ'],'アイドル':['あいどる'],
  'よさこい':['ヨサコイ'],
  'ファミコン':['ふぁみこん','ゲーム機','テレビゲーム'],
  'くろでんわ':['クロデンワ','黒電話','電話','でんわ'],
  'かみしばい':['カミシバイ','紙芝居'],'ちょうちん':['チョウチン','提灯'],
  'こま':['コマ','独楽'],'めんこ':['メンコ'],'そろばん':['ソロバン','算盤'],
  'ゆかた':['ユカタ','浴衣'],'たけとんぼ':['タケトンボ','竹蜻蛉'],
  'ふろしき':['フロシキ','風呂敷'],'でんでんだいこ':['デンデンダイコ','でんでん太鼓'],
  'おてだま':['オテダマ','お手玉'],'ガラスびん':['がらすびん','ガラス瓶','瓶'],
  'せんたくいた':['センタクイタ','洗濯板'],'いろり':['イロリ','囲炉裏'],
  'がまぐち':['ガマグチ','財布'],'ふみきり':['フミキリ','踏切'],
  'ちんどんや':['チンドンヤ'],'あんどん':['アンドン','行灯'],
  'よーよー':['ヨーヨー','ヨヨ'],
  'タコ':['たこ','蛸','章魚'],'サメ':['さめ','鮫'],
  'にんぎょ':['ニンギョ','人魚'],'クラゲ':['くらげ','水母','海月'],
  'イルカ':['いるか','海豚'],'ウミガメ':['うみがめ','海亀','海ガメ'],
  'カニ':['かに','蟹'],'エビ':['えび','海老','蝦'],
  'フグ':['ふぐ','河豚'],'ヒトデ':['ひとで','海星'],
  'タツノオトシゴ':['たつのおとしご','竜の落とし子','海馬'],
  'クジラ':['くじら','鯨'],'マンタ':['まんた'],'ラッコ':['らっこ'],
  'アザラシ':['あざらし'],'サンゴ':['さんご','珊瑚'],
  'ウナギ':['うなぎ','鰻'],'チンアナゴ':['ちんあなご'],
  'ナマコ':['なまこ','海鼠'],'カキ':['かき','牡蠣'],
  'じゆう':['ジユウ','自由'],'じかん':['ジカン','時間'],
  'ゆめ':['ユメ','夢'],'あい':['アイ','愛'],'きおく':['キオク','記憶'],
  'おと':['オト','音'],'かぜ':['カゼ','風'],'こどく':['コドク','孤独'],
  'へいわ':['ヘイワ','平和'],'きぼう':['キボウ','希望'],
  'うんめい':['ウンメイ','運命'],'しんじつ':['シンジツ','真実'],
  'いのち':['イノチ','命'],'えいえん':['エイエン','永遠'],
  'まほう':['マホウ','魔法'],'うそ':['ウソ','嘘'],
  'なつかしさ':['ナツカシサ','懐かしさ','懐かし'],
  'みらい':['ミライ','未来'],'かこ':['カコ','過去'],
  'うちゅう':['ウチュウ','宇宙'],
};

function checkAnswer(guess, correct) {
  const normalize = (s) => toKatakana(s.trim().toLowerCase()).replace(/\s/g, '');
  const g = normalize(guess);
  const c = normalize(correct);
  if (g === c || g.includes(c) || c.includes(g)) return true;
  const aliases = wordAliases[correct] || [];
  for (const alias of aliases) {
    const a = normalize(alias);
    if (g === a || g.includes(a) || a.includes(g)) return true;
  }
  return false;
}

// =====================================
// Claude AI 判定
// =====================================
const difficultyPrompts = {
  easy: {
    system: 'あなたは絵を見て何が描かれているかを答えるAIです。しかしあなたは絵の読み取りがとても苦手で、よく間違えます。自信がなければ全然違う答えを言っても構いません。答えは必ず日本語で単語一つだけ答えてください。説明は不要です。',
  },
  normal: {
    system: 'あなたは絵を見て何が描かれているかを答えるAIです。描かれた絵を見て、何を表しているか日本語で単語一つだけ答えてください。説明は不要です。',
  },
  hard: {
    system: 'あなたは高精度な画像認識AIです。描かれた絵を細部まで徹底的に分析し、何を表しているか正確に判断してください。どんな抽象的な絵でも必ず答えを出してください。答えは日本語で単語一つだけ答えてください。説明は不要です。',
  }
};

async function askClaudeAI(imageBase64, difficulty) {
  const { system } = difficultyPrompts[difficulty] || difficultyPrompts.normal;
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 50,
    system,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: base64Data },
        },
        { type: 'text', text: 'この絵に何が描かれていますか？日本語で単語一つだけ答えてください。' },
      ],
    }],
  });
  return response.content[0].text.trim();
}

// =====================================
// ゲームロジック
// =====================================
function createRoom(hostId, hostName) {
  let code;
  do { code = generateRoomCode(); } while (rooms[code]);

  rooms[code] = {
    code,
    hostId,
    players: [{ id: hostId, name: hostName, score: 0 }],
    gameStarted: false,
    difficulty: 'normal',
    totalRounds: 5,
    drawTime: 0,          // ← 追加：0=無制限, 20/40/60秒
    currentRound: 0,
    currentDrawerIndex: 0,
    currentWord: null,
    currentCategory: null,
    phase: 'lobby',
    canvasData: null,
    aiGuess: null,
    aiCorrect: false,
    humanGuesses: [],
    roundWinner: null,
    allDrawings: [],      // ← 追加：全ラウンドのギャラリー
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
  if (room.players.length === 0) { delete rooms[roomCode]; return null; }
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
    socket.emit('room_created', { roomCode: room.code, players: room.players, isHost: true });
    console.log(`ルーム作成: ${room.code} by ${name}`);
  });

  // ルーム参加
  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const name = (playerName || '名無し').slice(0, 12);
    const room = getRoom(code);
    if (!room) { socket.emit('error', { message: 'ルームが見つかりません。コードを確認してね！' }); return; }
    if (room.gameStarted) { socket.emit('error', { message: 'このゲームはすでに開始しています。' }); return; }
    if (room.players.length >= 6) { socket.emit('error', { message: 'このルームは満員です（最大6人）。' }); return; }
    room.players.push({ id: socket.id, name, score: 0 });
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_joined', { roomCode: code, players: room.players, isHost: false });
    socket.to(code).emit('player_updated', { players: room.players });
    console.log(`${name} がルーム ${code} に参加`);
  });

  // ゲーム開始
  socket.on('start_game', ({ difficulty, totalRounds, drawTime }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error', { message: '2人以上必要です！' }); return; }

    room.gameStarted = true;
    room.difficulty = difficulty || 'normal';
    room.totalRounds = parseInt(totalRounds) || 5;
    room.drawTime = parseInt(drawTime) || 0;   // ← 追加
    room.currentRound = 0;
    room.currentDrawerIndex = 0;
    room.allDrawings = [];                      // ← 追加：ゲーム開始時リセット
    room.players.forEach(p => p.score = 0);

    io.to(room.code).emit('game_started', {
      difficulty: room.difficulty,
      totalRounds: room.totalRounds,
      drawTime: room.drawTime,                  // ← 追加
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
    if (!wordLists[category]) { socket.emit('error', { message: '無効なカテゴリです。' }); return; }

    room.currentCategory = category;
    const words = getRandomWords(category, 3);
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

    // 観戦者へ（カテゴリだけ・drawTime付き）
    socket.to(room.code).emit('drawing_phase', {
      drawerName: drawer.name,
      category: room.currentCategory,
      round: room.currentRound,
      totalRounds: room.totalRounds,
      drawTime: room.drawTime,                  // ← 追加
    });

    // 描き手へ（drawTime付き）
    socket.emit('start_drawing', {
      word,
      category: room.currentCategory,
      round: room.currentRound,
      totalRounds: room.totalRounds,
      drawTime: room.drawTime,                  // ← 追加
    });
  });

  // 描画データ同期（ライブ描画）
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

    // ギャラリーに保存 ← 追加
    room.allDrawings.push({
      round: room.currentRound,
      drawerName: drawer.name,
      imageData,
    });

    io.to(room.code).emit('ai_guessing', { difficulty: room.difficulty });

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
        setTimeout(() => endRound(room, 'ai'), 3000);
      } else {
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
      io.to(room.code).emit('ai_result', { guess: 'エラーが発生しました', correct: false, correctWord: null });
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
    if (drawer && drawer.id === socket.id) return;
    if (room.humanGuesses.find(g => g.playerId === socket.id)) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const correct = checkAnswer(guess, room.currentWord);
    room.humanGuesses.push({ playerId: socket.id, name: player.name, guess, correct });
    io.to(room.code).emit('guess_submitted', { playerName: player.name, guess, correct });
    if (correct) { setTimeout(() => endRound(room, 'human', socket.id), 2000); return; }
    const nonDrawers = room.players.filter(p => p.id !== drawer?.id);
    if (room.humanGuesses.length >= nonDrawers.length) {
      setTimeout(() => endRound(room, 'draw'), 2000);
    }
  });

  // =====================================
  // チャット ← 追加
  // =====================================
  socket.on('chat_message', ({ text }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const msg = (text || '').trim().slice(0, 30);
    if (!msg) return;
    io.to(room.code).emit('chat_message', {
      playerId: socket.id,
      playerName: player.name,
      text: msg,
    });
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
    if (room) { io.to(code).emit('player_updated', { players: room.players }); }
    console.log('切断:', socket.id);
  });
});

// =====================================
// ラウンド管理
// =====================================
function startNextRound(room) {
  room.currentRound++;
  if (room.currentRound > room.totalRounds) { endGame(room); return; }

  room.currentDrawerIndex = (room.currentRound - 1) % room.players.length;
  room.phase = 'word_select';
  room.currentWord = null;
  room.currentCategory = null;
  room.aiGuess = null;
  room.aiCorrect = false;
  room.humanGuesses = [];
  room.roundWinner = null;

  const drawer = room.players[room.currentDrawerIndex];
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

  if (winner === 'human' && winnerId) {
    const winPlayer = room.players.find(p => p.id === winnerId);
    if (winPlayer) winPlayer.score += 2;
    if (drawer) drawer.score += 1;
  }

  io.to(room.code).emit('round_over', {
    winner,
    correctWord: room.currentWord,
    aiGuess: room.aiGuess,
    scores: room.players.map(p => ({ name: p.name, score: p.score })),
    round: room.currentRound,
    totalRounds: room.totalRounds,
    isLastRound: room.currentRound >= room.totalRounds,
    gallery: room.allDrawings,                  // ← 追加：全ラウンドのギャラリー
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
