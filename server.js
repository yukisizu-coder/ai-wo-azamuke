const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) res.set('Content-Type', 'text/css');
    else if (filePath.endsWith('.js')) res.set('Content-Type', 'application/javascript');
    else if (filePath.endsWith('.html')) res.set('Content-Type', 'text/html');
  }
}));
app.get('/style.css', (req, res) => { res.type('text/css'); res.sendFile(path.join(__dirname, 'public', 'style.css')); });
app.get('/game.js', (req, res) => { res.type('application/javascript'); res.sendFile(path.join(__dirname, 'public', 'game.js')); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// =====================================
// 組み合わせお題（くみあわせカテゴリ用）
// keywords: 各グループ内はOR、グループ間はAND
//   例: [['確定申告','かくていしんこく'], ['カバ','かば']]
//   → 「確定申告 or かくていしんこく」AND「カバ or かば」が両方含まれれば正解
// =====================================
const comboWords = [
  // ── 普通っぽい（3割） ──
  { phrase: '笹を食べるパンダ',             keywords: [['笹','ささ'],['パンダ','ぱんだ']] },
  { phrase: '傘をさすカエル',               keywords: [['傘','かさ'],['カエル','かえる']] },
  { phrase: '本を読むウサギ',               keywords: [['本','ほん'],['ウサギ','うさぎ']] },
  { phrase: 'ピアノを弾くゴリラ',           keywords: [['ピアノ','ぴあの'],['ゴリラ','ごりら']] },
  { phrase: 'ラーメンを食べるクマ',         keywords: [['ラーメン','らーめん'],['クマ','くま']] },
  { phrase: '宇宙服を着たサル',             keywords: [['宇宙','うちゅう'],['サル','さる']] },
  { phrase: 'プールで泳ぐキリン',           keywords: [['プール','ぷーる'],['キリン','きりん']] },
  { phrase: 'スノーボードするカニ',         keywords: [['スノーボード','スノボ','すのーぼーど'],['カニ','かに']] },
  { phrase: 'バレエを踊るブタ',             keywords: [['バレエ','ばれえ'],['ブタ','ぶた']] },
  { phrase: '花火を見るクジラ',             keywords: [['花火','はなび'],['クジラ','くじら']] },
  { phrase: '将棋をさすペンギン',           keywords: [['将棋','しょうぎ'],['ペンギン','ぺんぎん']] },
  { phrase: '縄跳びするフラミンゴ',         keywords: [['縄跳び','なわとび'],['フラミンゴ','ふらみんご']] },
  // ── 奇抜（7割）！「どうやって描くんだ！」系 ──
  { phrase: 'サバゲーをするちいかわ',       keywords: [['サバゲー','さばげー','サバゲ'],['ちいかわ']] },
  { phrase: '飛行機に乗る恐竜',             keywords: [['飛行機','ひこうき'],['恐竜','きょうりゅう']] },
  { phrase: '歯医者に行くワニ',             keywords: [['歯医者','はいしゃ','歯科'],['ワニ','わに']] },
  { phrase: '確定申告するカバ',             keywords: [['確定申告','しんこく','かくていしんこく'],['カバ','かば']] },
  { phrase: '美容院に来たライオン',         keywords: [['美容院','びよういん','美容室','美容'],['ライオン','らいおん']] },
  { phrase: '電話中のゾウ',                 keywords: [['電話','でんわ'],['ゾウ','ぞう']] },
  { phrase: '水中でラーメンを食べるシャチ', keywords: [['ラーメン','らーめん'],['シャチ','しゃち']] },
  { phrase: 'カラオケで熱唱するサメ',       keywords: [['カラオケ','からおけ'],['サメ','さめ']] },
  { phrase: '面接を受けるシマウマ',         keywords: [['面接','めんせつ'],['シマウマ','しまうま']] },
  { phrase: '居酒屋で飲むオオカミ',         keywords: [['居酒屋','いざかや'],['オオカミ','おおかみ']] },
  { phrase: '深夜コンビニにいるチーター',   keywords: [['コンビニ','こんびに'],['チーター','ちーたー']] },
  { phrase: '国会で演説するコアラ',         keywords: [['演説','えんぜつ','国会','こっかい'],['コアラ','こあら']] },
  { phrase: '宝くじを当てたカメ',           keywords: [['宝くじ','たからくじ','宝'],['カメ','かめ']] },
  { phrase: 'ヨガをするラクダ',             keywords: [['ヨガ','よが'],['ラクダ','らくだ']] },
  { phrase: 'テレビショッピングするトラ',   keywords: [['テレビショッピング','テレビ','通販','つうはん'],['トラ','とら']] },
  { phrase: '給食を配るフクロウ',           keywords: [['給食','きゅうしょく'],['フクロウ','ふくろう']] },
  { phrase: 'ディスコで踊るウミガメ',       keywords: [['ディスコ','でぃすこ'],['ウミガメ','うみがめ']] },
  { phrase: '自撮りするクジャク',           keywords: [['自撮り','じどり','セルフィー'],['クジャク','くじゃく']] },
  { phrase: '引越し中のハムスター',         keywords: [['引越し','ひっこし'],['ハムスター','はむすたー']] },
  { phrase: 'スマホを使うイルカ',           keywords: [['スマホ','スマートフォン'],['イルカ','いるか']] },
  { phrase: '縁日でゲームするキツネ',       keywords: [['縁日','えんにち','お祭り','まつり'],['キツネ','きつね']] },
  { phrase: '雪山で遭難するトカゲ',         keywords: [['雪山','ゆきやま','遭難','そうなん'],['トカゲ','とかげ']] },
  { phrase: 'キャンプするタコ',             keywords: [['キャンプ','きゃんぷ','テント'],['タコ','たこ']] },
  { phrase: '徹夜で論文を書くリス',         keywords: [['論文','ろんぶん','徹夜','てつや'],['リス','りす']] },
  { phrase: 'タクシーを呼ぶヒツジ',         keywords: [['タクシー','たくしー'],['ヒツジ','ひつじ']] },
  { phrase: '合コンに来たサイ',             keywords: [['合コン','ごうこん'],['サイ','さい']] },
  { phrase: '新幹線で寝るヤギ',             keywords: [['新幹線','しんかんせん'],['ヤギ','やぎ']] },
  { phrase: '折り紙を折るコウモリ',         keywords: [['折り紙','おりがみ'],['コウモリ','こうもり']] },
];

// =====================================
// お題リスト
// =====================================
const wordLists = {
  // どうぶつ＋うみのなかまを統合（C案）
  'どうぶつ': ['ゾウ','ペンギン','クマ','キリン','ライオン','サル','うさぎ','カメ','タヌキ','キツネ','パンダ','トラ','ネコ','イヌ','ウマ','ヒツジ','ブタ','ニワトリ','コアラ','カンガルー','ゴリラ','シマウマ','チーター','オオカミ','ハムスター','カバ','サイ','ワニ','フラミンゴ','フクロウ','コウモリ','カワウソ','リス','ハリネズミ','トカゲ','カエル','ヘビ','クジャク','ラクダ','ヤギ','タコ','サメ','にんぎょ','クラゲ','イルカ','ウミガメ','カニ','エビ','フグ','ヒトデ','タツノオトシゴ','クジラ','マンタ','ラッコ','アザラシ','サンゴ','ウナギ','チンアナゴ','ナマコ','カキ','タイ','マグロ','ヒラメ','イカ','ウニ','ホタテ','アワビ','ヤドカリ','アンコウ','セイウチ','ジュゴン','シーラカンス','ハンマーヘッド','サバ','カレイ','シャチ','ウミヘビ','アシカ','カツオ','イワシ'],
  'たべもの': ['ラーメン','ピザ','イチゴ','おにぎり','ケーキ','すし','カレー','たこやき','アイスクリーム','バナナ','リンゴ','ハンバーガー','チョコレート','ミカン','うどん','やきとり','プリン','ドーナツ','ポテト','ラムネ','たいやき','やきそば','チャーハン','パスタ','エビフライ','からあげ','メロン','スイカ','クレープ','まんじゅう','だんご','わたがし','おでん','みそしる','コロッケ','かき氷','ホットケーキ','ステーキ','サンドイッチ','グミ'],
  'のりもの': ['バス','ロケット','じてんしゃ','でんしゃ','ひこうき','せんすいかん','ヘリコプター','ボート','トラック','オートバイ','タクシー','しんかんせん','ヨット','きゅうきゅうしゃ','しょうぼうしゃ','くるま','ふね','スケートボード','UFO','リムジン','トラクター','パトカー','スクーター','モノレール','ケーブルカー','カヌー','ジェットスキー','ききゅう','グライダー','ドローン','じんりきしゃ','ゴンドラ','ダンプカー','ロードバイク','キックボード','フェリー','リニアモーターカー','ちかてつ','ばしゃ','そり'],
  'スポーツ': ['サッカー','すいえい','すもう','テニス','やきゅう','スキー','ボクシング','ゴルフ','バレーボール','マラソン','じゅうどう','バスケットボール','たいそう','サーフィン','スケート','バドミントン','ピンポン','ラグビー','アーチェリー','ボウリング','なわとび','ドッジボール','フットサル','フィギュアスケート','スノーボード','クライミング','フェンシング','レスリング','ハンドボール','ホッケー','カーリング','ダーツ','ビリヤード','けんどう','きゅうどう','からて','チアリーディング','ローラースケート','パルクール','スケートボード'],
  'たてもの': ['おしろ','がっこう','とうだい','マンション','じんじゃ','えき','びょういん','ピラミッド','タワー','きょうかい','ゆうえんち','としょかん','ホテル','トンネル','はし','えいがかん','スーパー','こうえん','どうぶつえん','おてら','びじゅつかん','こうじょう','プール','スタジアム','コンビニ','デパート','ゆうびんきょく','ぎんこう','しょうぼうしょ','ようちえん','ダム','すいぞくかん','プラネタリウム','ロッジ','おんせん','みなと','くうこう','ビル','まちや','けいさつしょ'],
  'しぜん': ['さくら','かみなり','かざん','にじ','つき','やま','うみ','たき','ゆき','たいふう','たいよう','ほし','かわ','もり','はな','きのこ','かいがら','こおり','なみ','きり','きのみ','いわ','どうくつ','おか','みずうみ','さばく','いんせき','なだれ','オーロラ','たんぽぽ','ちょうちょ','あめ','かぜ','くも','よる','あさひ','にじいろ','はるかぜ','こもれび','しもばしら'],
  'しごと': ['りょうりにん','うちゅうひこうし','にんじゃ','けいさつかん','しょうぼうし','いしゃ','のうか','きょうし','まほうつかい','かいぞく','かがくしゃ','けんちくか','ミュージシャン','かんごし','うんてんし','げいにん','まんがか','パティシエ','パイロット','はいゆう','ダンサー','りょうし','てじなし','かんとく','すもうとり','さむらい','まいこ','きしゃ','けんきゅうしゃ','だいく','ウェイター','カメラマン','ゆうびんや','どうぶつつかい','まじょ','ゾンビ','スーパーヒーロー','がいこくじんのくに','ハッカー','ロボット'],
  'エンタメ': ['ギター','えいが','おまつり','まんが','ゲーム','おんがく','ダンス','マジック','サーカス','えんげき','カメラ','テレビ','ピアノ','えほん','はなび','カラオケ','バンド','アニメ','アイドル','よさこい','ドラム','バイオリン','コンサート','トランプ','ジェンガ','ボードゲーム','コスプレ','ハロウィン','クリスマス','しゃしん','ラジオ','YouTuber','なぞなぞ','かるた','すごろく','オーケストラ','バレエ','ミュージカル','ゲームはいしん','フラダンス'],
  'なつかしい': ['ファミコン','くろでんわ','かみしばい','ちょうちん','こま','めんこ','そろばん','ゆかた','たけとんぼ','ふろしき','でんでんだいこ','おてだま','ガラスびん','せんたくいた','いろり','がまぐち','ふみきり','ちんどんや','あんどん','よーよー','けんだま','べいごま','おはじき','しょうぎ','たこ','ふうりん','きんぎょすくい','ぼんおどり','みこし','やぐら','ひなにんぎょう','こいのぼり','せんとう','はっぴ','すだれ','たらい','でんしゃのつり革','ランドセル','ちゃぶだい','がっこうのきゅうしょく'],
  'くみあわせ': comboWords.map(c => c.phrase),
  'キャラクター': ['ちいかわ','おぱんちゅうさぎ','ハローキティ','ドラえもん','ピカチュウ','ミッキーマウス','アンパンマン','トトロ','クレヨンしんちゃん','スヌーピー','ミニオン','くまのプーさん','マリオ','カービィ','すみっコぐらし','リラックマ','ムーミン','ゴジラ','スライム','ウルトラマン','仮面ライダー','ちびまる子ちゃん','バイキンマン','ドラミちゃん','ピングー','ポムポムプリン','シナモロール','マイメロディ','コナン','孫悟空','ルフィ','ナルト','パックマン','ドンキーコング','ソニック','チョッパー','ピクミン','トーマス','きかんしゃトーマス','ガンダム'],
};

// =====================================
// ルーム管理
// =====================================
const rooms = {};
// 一時切断したプレイヤーの削除タイマー（30秒以内なら再参加できる）
const disconnectTimers = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ひらがな↔カタカナ正規化
function toKatakana(str) {
  return str.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

// =====================================
// 単語エイリアス
// =====================================
const wordAliases = {
  'ゾウ':['ぞう','象'],'クマ':['くま','熊'],'キリン':['きりん','麒麟'],
  'ライオン':['らいおん'],'サル':['さる','猿'],'うさぎ':['ウサギ','兎'],
  'カメ':['かめ','亀'],'タヌキ':['たぬき','狸'],'キツネ':['きつね','狐'],
  'パンダ':['ぱんだ'],'トラ':['とら','虎'],'ネコ':['ねこ','猫'],
  'イヌ':['いぬ','犬'],'ウマ':['うま','馬'],'ヒツジ':['ひつじ','羊'],
  'ブタ':['ぶた','豚'],'ニワトリ':['にわとり','鶏'],'コアラ':['こあら'],
  'カンガルー':['かんがるー'],'ゴリラ':['ごりら'],'シマウマ':['しまうま','縞馬'],
  'チーター':['ちーたー'],'オオカミ':['おおかみ','狼'],'ハムスター':['はむすたー'],
  'カバ':['かば','河馬'],'サイ':['さい','犀'],'ワニ':['わに','鰐'],
  'フラミンゴ':['ふらみんご'],'フクロウ':['ふくろう','梟'],'コウモリ':['こうもり','蝙蝠'],
  'カワウソ':['かわうそ'],'リス':['りす','栗鼠'],'ハリネズミ':['はりねずみ'],
  'トカゲ':['とかげ','蜥蜴'],'カエル':['かえる','蛙'],'ヘビ':['へび','蛇'],
  'クジャク':['くじゃく','孔雀'],'ラクダ':['らくだ','駱駝'],'ヤギ':['やぎ','山羊'],
  'ラーメン':['らーめん','拉麺'],'ピザ':['ぴざ'],'イチゴ':['いちご','苺'],
  'おにぎり':['オニギリ','御握り'],'ケーキ':['けーき'],
  'すし':['スシ','寿司','鮨'],'カレー':['かれー','カレーライス'],
  'たこやき':['タコヤキ','たこ焼き'],'アイスクリーム':['あいす','アイス'],
  'バナナ':['ばなな'],'リンゴ':['りんご','林檎'],
  'ハンバーガー':['はんばーがー'],'チョコレート':['チョコ','ちょこ'],
  'ミカン':['みかん','蜜柑'],'うどん':['ウドン','饂飩'],
  'やきとり':['ヤキトリ','焼き鳥'],'プリン':['ぷりん'],
  'ドーナツ':['どーなつ'],'ポテト':['ぽてと','じゃがいも','芋'],
  'たいやき':['タイヤキ','鯛焼き'],'やきそば':['ヤキソバ','焼きそば'],
  'チャーハン':['ちゃーはん','炒飯'],'パスタ':['ぱすた'],
  'エビフライ':['えびふらい','海老フライ'],'からあげ':['カラアゲ','唐揚げ'],
  'メロン':['めろん'],'スイカ':['すいか','西瓜'],
  'クレープ':['くれーぷ'],'まんじゅう':['マンジュウ','饅頭'],
  'だんご':['ダンゴ','団子'],'わたがし':['ワタガシ','わたあめ','綿あめ'],
  'おでん':['オデン'],'みそしる':['ミソシル','味噌汁'],
  'コロッケ':['ころっけ'],'かき氷':['かきごおり','カキゴオリ'],
  'ホットケーキ':['ほっとけーき','パンケーキ'],'ステーキ':['すてーき'],
  'サンドイッチ':['さんどいっち'],'グミ':['ぐみ'],
  'バス':['ばす'],'ロケット':['ろけっと'],'じてんしゃ':['ジテンシャ','自転車'],
  'でんしゃ':['デンシャ','電車'],'ひこうき':['ヒコウキ','飛行機'],
  'せんすいかん':['センスイカン','潜水艦'],'ヘリコプター':['へりこぷたー'],
  'オートバイ':['おーとばい','バイク'],'タクシー':['たくしー'],
  'しんかんせん':['シンカンセン','新幹線'],'ヨット':['よっと'],
  'きゅうきゅうしゃ':['キュウキュウシャ','救急車'],
  'しょうぼうしゃ':['ショウボウシャ','消防車'],'くるま':['クルマ','車'],
  'ふね':['フネ','船'],'スケートボード':['すけーとぼーど'],
  'UFO':['ゆーふぉー','ユーフォー'],'リムジン':['りむじん'],
  'パトカー':['ぱとかー'],'スクーター':['すくーたー'],
  'モノレール':['ものれーる'],'ケーブルカー':['けーぶるかー'],
  'カヌー':['かぬー'],'ジェットスキー':['じぇっとすきー'],
  'ききゅう':['キキュウ','気球'],'グライダー':['ぐらいだー'],
  'ドローン':['どろーん'],'じんりきしゃ':['ジンリキシャ','人力車'],
  'ゴンドラ':['ごんどら'],'ダンプカー':['だんぷかー'],
  'ロードバイク':['ろーどばいく'],'キックボード':['きっくぼーど'],
  'フェリー':['ふぇりー'],'リニアモーターカー':['りにあ','リニア'],
  'ちかてつ':['チカテツ','地下鉄'],'ばしゃ':['バシャ','馬車'],
  'そり':['ソリ'],'ローラースケート':['ろーらーすけーと'],
  'サッカー':['さっかー'],'すいえい':['スイエイ','水泳'],
  'すもう':['スモウ','相撲'],'テニス':['てにす'],'やきゅう':['ヤキュウ','野球'],
  'スキー':['すきー'],'ボクシング':['ぼくしんぐ'],'ゴルフ':['ごるふ'],
  'バレーボール':['ばれーぼーる','バレー'],'マラソン':['まらそん'],
  'じゅうどう':['ジュウドウ','柔道'],'バスケットボール':['バスケ','ばすけ'],
  'たいそう':['タイソウ','体操'],'サーフィン':['さーふぃん'],
  'スケート':['すけーと'],'バドミントン':['ばどみんとん'],
  'ピンポン':['ぴんぽん','卓球'],'ラグビー':['らぐびー'],
  'アーチェリー':['あーちぇりー'],'ボウリング':['ぼうりんぐ'],
  'なわとび':['ナワトビ','縄跳び'],'ドッジボール':['どっじぼーる'],
  'フットサル':['ふっとさる'],'フィギュアスケート':['ふぃぎゅあすけーと'],
  'スノーボード':['すのーぼーど'],'クライミング':['くらいみんぐ'],
  'フェンシング':['ふぇんしんぐ'],'レスリング':['れすりんぐ'],
  'けんどう':['ケンドウ','剣道'],'きゅうどう':['キュウドウ','弓道'],
  'からて':['カラテ','空手'],
  'おしろ':['オシロ','城','しろ'],'がっこう':['ガッコウ','学校'],
  'とうだい':['トウダイ','灯台'],'マンション':['まんしょん'],
  'じんじゃ':['ジンジャ','神社'],'えき':['エキ','駅'],
  'びょういん':['ビョウイン','病院'],'ピラミッド':['ぴらみっど'],
  'タワー':['たわー','塔'],'きょうかい':['キョウカイ','教会'],
  'ゆうえんち':['ユウエンチ','遊園地'],'としょかん':['トショカン','図書館'],
  'ホテル':['ほてる'],'トンネル':['とんねる'],'はし':['ハシ','橋'],
  'えいがかん':['エイガカン','映画館'],'スーパー':['すーぱー'],
  'こうえん':['コウエン','公園'],'どうぶつえん':['ドウブツエン','動物園'],
  'おてら':['オテラ','てら','寺'],'びじゅつかん':['ビジュツカン','美術館'],
  'こうじょう':['コウジョウ','工場'],'スタジアム':['すたじあむ'],
  'コンビニ':['こんびに'],'デパート':['でぱーと'],
  'ゆうびんきょく':['ユウビンキョク','郵便局'],'ぎんこう':['ギンコウ','銀行'],
  'すいぞくかん':['スイゾクカン','水族館'],'プラネタリウム':['ぷらねたりうむ'],
  'おんせん':['オンセン','温泉'],'みなと':['ミナト','港'],'くうこう':['クウコウ','空港'],
  'さくら':['サクラ','桜'],'かみなり':['カミナリ','雷'],
  'かざん':['カザン','火山'],'にじ':['ニジ','虹'],'つき':['ツキ','月'],
  'やま':['ヤマ','山'],'うみ':['ウミ','海'],'たき':['タキ','滝'],
  'ゆき':['ユキ','雪'],'たいふう':['タイフウ','台風'],
  'たいよう':['タイヨウ','太陽','お日様'],'ほし':['ホシ','星'],
  'かわ':['カワ','川'],'もり':['モリ','森'],'はな':['ハナ','花'],
  'きのこ':['キノコ','茸'],'かいがら':['カイガラ','貝殻','貝'],
  'こおり':['コオリ','氷'],'なみ':['ナミ','波'],'きり':['キリ','霧'],
  'みずうみ':['ミズウミ','湖'],'さばく':['サバク','砂漠'],
  'オーロラ':['おーろら'],'ちょうちょ':['チョウチョ','蝶','蝴蝶'],
  'りょうりにん':['リョウリニン','料理人','コック','シェフ'],
  'うちゅうひこうし':['ウチュウヒコウシ','宇宙飛行士'],
  'にんじゃ':['ニンジャ','忍者'],'けいさつかん':['ケイサツカン','警察官','警察'],
  'しょうぼうし':['ショウボウシ','消防士'],'いしゃ':['イシャ','医者','ドクター'],
  'のうか':['ノウカ','農家'],'きょうし':['キョウシ','教師','先生'],
  'まほうつかい':['マホウツカイ','魔法使い'],'かいぞく':['カイゾク','海賊'],
  'かがくしゃ':['カガクシャ','科学者'],'けんちくか':['ケンチクカ','建築家'],
  'ミュージシャン':['みゅーじしゃん','音楽家'],'かんごし':['カンゴシ','看護師'],
  'うんてんし':['ウンテンシ','運転士','運転手'],'げいにん':['ゲイニン','芸人'],
  'まんがか':['マンガカ','漫画家'],'パティシエ':['ぱてぃしえ'],
  'パイロット':['ぱいろっと'],'はいゆう':['ハイユウ','俳優'],
  'りょうし':['リョウシ','漁師'],'さむらい':['サムライ','侍'],
  'まいこ':['マイコ','舞妓'],'カメラマン':['かめらまん'],
  'まじょ':['マジョ','魔女'],'ゾンビ':['ぞんび'],
  'おこり':['オコリ','怒り','怒る'],'おどろき':['オドロキ','驚き','びっくり'],
  'はずかしい':['ハズカシイ','恥ずかしい'],'かなしい':['カナシイ','悲しい'],
  'うれしい':['ウレシイ','嬉しい'],'こわい':['コワイ','怖い'],
  'ねむい':['ネムイ','眠い'],'たのしい':['タノシイ','楽しい'],
  'さびしい':['サビシイ','寂しい'],'わくわく':['ワクワク'],
  'どきどき':['ドキドキ'],'なく':['ナク','泣く'],'わらう':['ワラウ','笑う'],
  'しんぱい':['シンパイ','心配'],'つかれる':['ツカレル','疲れる'],
  'くやしい':['クヤシイ','悔しい'],'がっかり':['ガッカリ'],
  'きんちょう':['キンチョウ','緊張'],'こうふん':['コウフン','興奮'],
  'ギター':['ぎたー'],'えいが':['エイガ','映画'],
  'おまつり':['オマツリ','祭り'],'まんが':['マンガ','漫画'],
  'ゲーム':['げーむ'],'おんがく':['オンガク','音楽'],
  'ダンス':['だんす'],'マジック':['まじっく'],'サーカス':['さーかす'],
  'えんげき':['エンゲキ','演劇'],'カメラ':['かめら'],
  'テレビ':['てれび'],'ピアノ':['ぴあの'],'えほん':['エホン','絵本'],
  'はなび':['ハナビ','花火'],'カラオケ':['からおけ'],
  'バンド':['ばんど'],'アニメ':['あにめ'],'アイドル':['あいどる'],
  'ドラム':['どらむ'],'バイオリン':['ばいおりん'],'コンサート':['こんさーと'],
  'トランプ':['とらんぷ'],'ジェンガ':['じぇんが'],'ボードゲーム':['ぼーどげーむ'],
  'コスプレ':['こすぷれ'],'ハロウィン':['はろうぃん'],'クリスマス':['くりすます'],
  'ファミコン':['ふぁみこん','ゲーム機'],'くろでんわ':['クロデンワ','黒電話'],
  'かみしばい':['カミシバイ','紙芝居'],'ちょうちん':['チョウチン','提灯'],
  'こま':['コマ','独楽'],'めんこ':['メンコ'],'そろばん':['ソロバン','算盤'],
  'ゆかた':['ユカタ','浴衣'],'たけとんぼ':['タケトンボ'],
  'ふろしき':['フロシキ','風呂敷'],'でんでんだいこ':['デンデンダイコ'],
  'おてだま':['オテダマ','お手玉'],'いろり':['イロリ','囲炉裏'],
  'がまぐち':['ガマグチ','財布'],'ふみきり':['フミキリ','踏切'],
  'よーよー':['ヨーヨー'],'けんだま':['ケンダマ','剣玉'],
  'べいごま':['ベイゴマ'],'おはじき':['オハジキ'],'しょうぎ':['ショウギ','将棋'],
  'たこ':['タコ','凧'],'ふうりん':['フウリン','風鈴'],
  'きんぎょすくい':['キンギョスクイ','金魚すくい'],'みこし':['ミコシ','神輿'],
  'ひなにんぎょう':['ヒナニンギョウ','雛人形'],'こいのぼり':['コイノボリ','鯉のぼり'],
  'でんしゃのつり革':['つりかわ','ツリカワ','つり革','吊り革','でんしゃのつりかわ','デンシャノツリカワ'],
  'タコ':['たこ','蛸'],'サメ':['さめ','鮫'],
  'にんぎょ':['ニンギョ','人魚'],'クラゲ':['くらげ','水母'],
  'イルカ':['いるか','海豚'],'ウミガメ':['うみがめ','海亀'],
  'カニ':['かに','蟹'],'エビ':['えび','海老'],
  'フグ':['ふぐ','河豚'],'ヒトデ':['ひとで'],
  'タツノオトシゴ':['たつのおとしご'],'クジラ':['くじら','鯨'],
  'マンタ':['まんた'],'ラッコ':['らっこ'],'アザラシ':['あざらし'],
  'サンゴ':['さんご','珊瑚'],'ウナギ':['うなぎ','鰻'],
  'チンアナゴ':['ちんあなご'],'ナマコ':['なまこ','海鼠'],'カキ':['かき','牡蠣'],
  'マグロ':['まぐろ','鮪'],'ヒラメ':['ひらめ','平目'],'イカ':['いか','烏賊'],
  'ウニ':['うに','雲丹'],'ホタテ':['ほたて','帆立'],'ヤドカリ':['やどかり'],
  'アンコウ':['あんこう'],'セイウチ':['せいうち'],'ジュゴン':['じゅごん'],
  'シャチ':['しゃち','鯱'],'アシカ':['あしか'],'カツオ':['かつお','鰹'],
  // キャラクター
  'ちいかわ':['チイカワ'],'おぱんちゅうさぎ':['おぱんちゅ','オパンチュウサギ'],
  'ハローキティ':['はろーきてぃ','キティ','きてぃ'],'ドラえもん':['どらえもん'],
  'ピカチュウ':['ぴかちゅう','ピカ'],'ミッキーマウス':['みっきー','ミッキー'],
  'アンパンマン':['あんぱんまん'],'トトロ':['となりのトトロ','となりのととろ'],
  'クレヨンしんちゃん':['しんちゃん','クレしん'],'スヌーピー':['すぬーぴー'],
  'ミニオン':['みにおん'],'くまのプーさん':['プーさん','ぷーさん'],
  'マリオ':['まりお'],'カービィ':['かーびぃ'],'すみっコぐらし':['すみっこ'],
  'リラックマ':['りらっくま'],'ムーミン':['むーみん'],'ゴジラ':['ごじら'],
  'スライム':['すらいむ'],'ウルトラマン':['うるとらまん'],'仮面ライダー':['かめんらいだー'],
  'ちびまる子ちゃん':['まるこ','ちびまる子'],'バイキンマン':['ばいきんまん'],
  'ドラミちゃん':['どらみ'],'ポムポムプリン':['ぽむぽむぷりん','プリン'],
  'シナモロール':['シナモン','しなもん'],'マイメロディ':['マイメロ','まいめろ'],
  'コナン':['めいたんていコナン'],'孫悟空':['そんごくう','ごくう'],
  'ルフィ':['るふぃ','モンキーDルフィ'],'ナルト':['なると','うずまきナルト'],
  'パックマン':['ぱっくまん'],'ドンキーコング':['どんきーこんぐ','ドンキー'],
  'ソニック':['そにっく'],'チョッパー':['ちょっぱー'],'ガンダム':['がんだむ'],
};

function checkAnswer(guess, correct) {
  const normalize = (s) => toKatakana(s.trim().toLowerCase()).replace(/\s/g, '');
  const g = normalize(guess);
  const c = normalize(correct);

  // くみあわせお題：各グループ内はOR、グループ間はAND
  // 例「確定申告するカバ」→ ['確定申告','かくていしんこく']のどちらか AND ['カバ','かば']のどちらか
  const combo = comboWords.find(cw => normalize(cw.phrase) === c);
  if (combo) {
    return combo.keywords.every(kwGroup => {
      const variants = Array.isArray(kwGroup) ? kwGroup : [kwGroup];
      return variants.some(v => g.includes(normalize(v)));
    });
  }

  // 通常お題：完全一致 or どちらかが相手を含む
  if (g === c || g.includes(c) || c.includes(g)) return true;
  // エイリアス：完全一致 or guessがaliasを含む のみ
  const aliases = wordAliases[correct] || [];
  for (const alias of aliases) {
    const a = normalize(alias);
    if (g === a || g.includes(a)) return true;
  }
  return false;
}

// =====================================
// Claude AI 判定
// =====================================
const difficultyPrompts = {
  easy: { system: 'あなたは絵を見て何が描かれているかを答えるAIです。しかしあなたは絵の読み取りがとても苦手で、よく間違えます。答えは必ず日本語で単語一つだけ答えてください。説明は不要です。' },
  normal: { system: 'あなたは絵を見て何が描かれているかを答えるAIです。描かれた絵を見て、何を表しているか日本語で単語一つだけ答えてください。説明は不要です。' },
  hard: { system: 'あなたは高精度な画像認識AIです。描かれた絵を細部まで徹底的に分析し、正確に判断してください。答えは日本語で単語一つだけ答えてください。説明は不要です。' },
};

async function askClaudeAI(imageBase64, difficulty, category) {
  const baseSystem = (difficultyPrompts[difficulty] || difficultyPrompts.normal).system;
  // ④ カテゴリを知った上で判定させる
  const system = category
    ? baseSystem + `\nこの絵のお題は「${category}」カテゴリの中の何かです。カテゴリを参考に、線や色の使い方もよく観察して判断してください。`
    : baseSystem;
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const userText = category
    ? `この絵は「${category}」カテゴリの中の何かを描いたものです。何を描いているか、日本語で単語一つだけ答えてください。`
    : 'この絵に何が描かれていますか？日本語で単語一つだけ答えてください。';
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5', max_tokens: 50, system,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } },
      { type: 'text', text: userText },
    ]}],
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
    code, hostId,
    players: [{ id: hostId, name: hostName, score: 0 }],
    gameStarted: false, difficulty: 'normal', totalRounds: 5, drawTime: 0, comboOnly: false,
    currentRound: 0, currentDrawerIndex: 0, currentWord: null, currentCategory: null,
    phase: 'lobby', canvasData: null, aiGuess: null, aiCorrect: false,
    humanGuesses: [], roundWinner: null,
    allDrawings: [],    // ギャラリー
    usedWords: {},      // 使用済みお題
  };
  return rooms[code];
}

function getRoom(code) { return rooms[code.toUpperCase()] || null; }

function removePlayer(roomCode, playerId) {
  const room = rooms[roomCode];
  if (!room) return;
  room.players = room.players.filter(p => p.id !== playerId);
  if (room.players.length === 0) { delete rooms[roomCode]; return null; }
  if (room.hostId === playerId) room.hostId = room.players[0].id;
  return room;
}

// =====================================
// Socket.io
// =====================================
io.on('connection', (socket) => {
  socket.on('create_room', ({ playerName }) => {
    const name = (playerName || '名無し').slice(0, 12);
    const room = createRoom(socket.id, name);
    socket.join(room.code); socket.roomCode = room.code;
    socket.emit('room_created', { roomCode: room.code, players: room.players, isHost: true });
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const name = (playerName || '名無し').slice(0, 12);
    const room = getRoom(code);
    if (!room) { socket.emit('error', { message: 'ルームが見つかりません。' }); return; }
    if (room.gameStarted) { socket.emit('error', { message: 'このゲームはすでに開始しています。' }); return; }
    if (room.players.length >= 6) { socket.emit('error', { message: 'このルームは満員です（最大6人）。' }); return; }
    room.players.push({ id: socket.id, name, score: 0 });
    socket.join(code); socket.roomCode = code;
    socket.emit('room_joined', { roomCode: code, players: room.players, isHost: false });
    socket.to(code).emit('player_updated', { players: room.players });
  });

  socket.on('start_game', ({ difficulty, totalRounds, drawTime, comboOnly }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error', { message: '2人以上必要です！' }); return; }
    room.gameStarted = true;
    room.difficulty = difficulty || 'normal';
    room.totalRounds = parseInt(totalRounds) || 5;
    room.drawTime = parseInt(drawTime) || 0;
    room.comboOnly = !!comboOnly;
    room.currentRound = 0; room.currentDrawerIndex = 0;
    room.allDrawings = []; room.usedWords = {};
    room.players.forEach(p => p.score = 0);
    io.to(room.code).emit('game_started', {
      difficulty: room.difficulty, totalRounds: room.totalRounds,
      drawTime: room.drawTime, players: room.players,
    });
    startNextRound(room);
  });

  // ④ カテゴリ選択 → お題を1つランダムに決定して描画開始
  socket.on('select_category', ({ category }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.id !== socket.id) return;
    if (room.phase !== 'word_select') return;
    if (!wordLists[category]) { socket.emit('error', { message: '無効なカテゴリです。' }); return; }

    // 使用済みを除いた残りから選ぶ ⑥
    const used = room.usedWords[category] || [];
    const available = wordLists[category].filter(w => !used.includes(w));
    const pool = available.length > 0 ? available : wordLists[category]; // 全部使ったらリセット
    const word = pool[Math.floor(Math.random() * pool.length)];
    if (!room.usedWords[category]) room.usedWords[category] = [];
    room.usedWords[category].push(word);

    room.currentWord = word;
    room.currentCategory = category;
    room.phase = 'drawing';
    room.canvasData = null;

    // 観戦者へ
    socket.to(room.code).emit('drawing_phase', {
      drawerName: drawer.name, category, drawTime: room.drawTime,
      round: room.currentRound, totalRounds: room.totalRounds,
    });
    // 描き手へ（お題を1つだけ）
    socket.emit('start_drawing', {
      word, category, drawTime: room.drawTime,
      round: room.currentRound, totalRounds: room.totalRounds,
    });
  });

  socket.on('draw_event', (data) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'drawing') return;
    socket.to(room.code).emit('draw_event', data);
  });

  socket.on('submit_drawing', async ({ imageData }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const drawer = room.players[room.currentDrawerIndex];
    if (!drawer || drawer.id !== socket.id) return;
    if (room.phase !== 'drawing') return;

    room.phase = 'ai_guessing';
    room.canvasData = imageData;
    room.humanGuesses = [];
    room.allDrawings.push({ round: room.currentRound, drawerName: drawer.name, imageData });

    io.to(room.code).emit('ai_guessing', { difficulty: room.difficulty });

    try {
      const aiGuess = await askClaudeAI(imageData, room.difficulty, room.currentCategory);
      room.aiGuess = aiGuess;
      room.aiCorrect = checkAnswer(aiGuess, room.currentWord);
      io.to(room.code).emit('ai_result', { guess: aiGuess, correct: room.aiCorrect, correctWord: room.aiCorrect ? room.currentWord : null });
      if (room.aiCorrect) {
        setTimeout(() => endRound(room, 'ai'), 3000);
      } else {
        room.phase = 'human_guessing';
        const nonDrawers = room.players.filter(p => p.id !== drawer.id);
        io.to(room.code).emit('human_guessing_phase', {
          drawerName: drawer.name, category: room.currentCategory,
          players: nonDrawers.map(p => ({ id: p.id, name: p.name, guessed: false })),
        });
      }
    } catch (err) {
      console.error('Claude API エラー:', err);
      io.to(room.code).emit('ai_result', { guess: 'エラーが発生しました', correct: false, correctWord: null });
      room.phase = 'human_guessing';
      const nonDrawers = room.players.filter(p => p.id !== drawer.id);
      io.to(room.code).emit('human_guessing_phase', {
        drawerName: drawer.name, category: room.currentCategory,
        players: nonDrawers.map(p => ({ id: p.id, name: p.name, guessed: false })),
      });
    }
  });

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
    if (room.humanGuesses.length >= nonDrawers.length) setTimeout(() => endRound(room, 'draw'), 2000);
  });

  // =====================================
  // 音声チャット シグナリング（WebRTC）
  // =====================================
  socket.on('voice_join', () => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    // 既存メンバーのIDを新規参加者に送る
    const otherIds = room.players.filter(p => p.id !== socket.id).map(p => p.id);
    socket.emit('voice_existing_peers', { peerIds: otherIds });
    // 他のメンバーに「新しい人が来たよ」と通知
    socket.to(room.code).emit('voice_peer_joined', { peerId: socket.id });
  });

  socket.on('voice_signal', ({ targetId, signal }) => {
    // SDP offer/answer や ICE candidate を中継するだけ
    io.to(targetId).emit('voice_signal', { fromId: socket.id, signal });
  });

  socket.on('voice_leave', () => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    socket.to(room.code).emit('voice_peer_left', { peerId: socket.id });
  });

  socket.on('chat_message', ({ text }) => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const msg = (text || '').trim().slice(0, 30);
    if (!msg) return;
    io.to(room.code).emit('chat_message', { playerId: socket.id, playerName: player.name, text: msg });
  });

  socket.on('next_round', () => {
    const room = getRoom(socket.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'round_result') return;
    startNextRound(room);
  });

  // =====================================
  // 再参加（ゲーム中に切断しても戻れる）
  // =====================================
  socket.on('rejoin_room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = getRoom(code);
    if (!room) { socket.emit('error', { message: 'ルームが見つかりません。ゲームが終了したかもしれません。' }); return; }
    const existing = room.players.find(p => p.name === playerName);
    if (!existing) { socket.emit('error', { message: 'このルームに同じ名前のプレイヤーが見つかりません。' }); return; }
    // 切断タイマーをキャンセル
    if (disconnectTimers[existing.id]) { clearTimeout(disconnectTimers[existing.id]); delete disconnectTimers[existing.id]; }
    const wasHost = room.hostId === existing.id;
    existing.id = socket.id;
    if (wasHost) room.hostId = socket.id;
    socket.join(code); socket.roomCode = code;
    socket.emit('rejoined', {
      roomCode: code, players: room.players, isHost: wasHost,
      phase: room.phase, currentRound: room.currentRound, totalRounds: room.totalRounds,
      drawerId: room.players[room.currentDrawerIndex]?.id,
      drawerName: room.players[room.currentDrawerIndex]?.name,
      canvasData: room.canvasData,
      comboOnly: room.comboOnly,
    });
    io.to(code).emit('player_updated', { players: room.players });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;
    io.to(code).emit('voice_peer_left', { peerId: socket.id });
    // 30秒以内に再参加しなければプレイヤーを削除
    disconnectTimers[socket.id] = setTimeout(() => {
      const room = removePlayer(code, socket.id);
      if (room) io.to(code).emit('player_updated', { players: room.players });
      delete disconnectTimers[socket.id];
    }, 30000);
  });
});

function startNextRound(room) {
  room.currentRound++;
  if (room.currentRound > room.totalRounds) { endGame(room); return; }
  room.currentDrawerIndex = (room.currentRound - 1) % room.players.length;
  room.phase = 'word_select';
  room.currentWord = null; room.currentCategory = null;
  room.aiGuess = null; room.aiCorrect = false;
  room.humanGuesses = []; room.roundWinner = null;
  const drawer = room.players[room.currentDrawerIndex];

  if (room.comboOnly) {
    // くみあわせのみモード：カテゴリ選択スキップ、自動でお題を選ぶ
    const category = 'くみあわせ';
    const used = room.usedWords[category] || [];
    const available = wordLists[category].filter(w => !used.includes(w));
    const pool = available.length > 0 ? available : wordLists[category];
    const word = pool[Math.floor(Math.random() * pool.length)];
    if (!room.usedWords[category]) room.usedWords[category] = [];
    room.usedWords[category].push(word);
    room.currentWord = word; room.currentCategory = category; room.phase = 'drawing';
    io.to(room.code).emit('round_started', {
      round: room.currentRound, totalRounds: room.totalRounds,
      drawerName: drawer.name, drawerId: drawer.id, comboOnly: true,
    });
    // 2秒後に描画フェーズへ
    setTimeout(() => {
      io.to(room.code).emit('drawing_phase', { drawerName: drawer.name, drawTime: room.drawTime });
      io.to(drawer.id).emit('start_drawing', { word, category, drawTime: room.drawTime,
        round: room.currentRound, totalRounds: room.totalRounds });
    }, 2000);
  } else {
    // 通常モード：カテゴリ選択あり（くみあわせカテゴリは除外）
    const availableCategories = Object.keys(wordLists).filter(k => k !== 'くみあわせ');
    io.to(room.code).emit('round_started', {
      round: room.currentRound, totalRounds: room.totalRounds,
      drawerName: drawer.name, drawerId: drawer.id,
      categories: availableCategories, comboOnly: false,
    });
  }
}

function endRound(room, winner, winnerId = null) {
  room.phase = 'round_result';
  const drawer = room.players[room.currentDrawerIndex];
  if (winner === 'human' && winnerId) {
    const w = room.players.find(p => p.id === winnerId);
    if (w) w.score += 2;
    if (drawer) drawer.score += 1;
  }
  io.to(room.code).emit('round_over', {
    winner, correctWord: room.currentWord, aiGuess: room.aiGuess,
    scores: room.players.map(p => ({ name: p.name, score: p.score })),
    round: room.currentRound, totalRounds: room.totalRounds,
    isLastRound: room.currentRound >= room.totalRounds,
    gallery: room.allDrawings,
  });
}

function endGame(room) {
  room.phase = 'game_over'; room.gameStarted = false;
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.code).emit('game_over', { scores: sorted.map(p => ({ name: p.name, score: p.score })), winner: sorted[0]?.name });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 AIをあざむけ！サーバー起動中 http://localhost:${PORT}`));
