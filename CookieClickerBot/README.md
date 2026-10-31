# 🍪 Cookie Clicker Bot

[Cookie Clicker](https://orteil.dashnet.org/cookieclicker/) を **ブラウザごと自動で遊び倒す** ボットです。
クッキーのクリックだけでなく、アップグレード・施設の購入、砂糖ランプ、農業(庭)、クッキー取引所、
神殿、魔法書、ドラゴン、サンタ、季節、そして **転生(昇天)と天界スキルツリー** まで自動化します。

操作はすべて **ブラウザで開く管理画面** から行え、ボットが何をいつやったかは
**JSONL / テキスト / ローテーションログ** の 3 形式で細かく記録されます。

---

## 目次

1. [できること](#できること)
2. [動作環境](#動作環境)
3. [インストール](#インストール)
4. [起動と停止](#起動と停止)
5. [管理画面](#管理画面)
6. [ログ](#ログ)
7. [セーブのバックアップと復元](#セーブのバックアップと復元)
8. [アンインストール](#アンインストール)
9. [⚠ 最初に必ず読むこと (人間認証 / セーブ)](#-最初に必ず読むこと)
10. [設定リファレンス](#設定リファレンス)
11. [中身のしくみ](#中身のしくみ)
12. [トラブルシューティング](#トラブルシューティング)
13. [テスト](#テスト)
14. [免責](#免責)

---

## できること

| 分類 | 内容 |
|---|---|
| 🖱 **クリック** | 大きなクッキーを自動クリック。ゲーム側の検出(15回/秒)を超えないよう **最大14.5回/秒** に制限。Click frenzy 等のバフ中は自動増速 |
| 🌟 **ゴールデン** | ゴールデン/レイス/トナカイ/クッキーストームの欠片を出現 直後に回収 |
| 🐛 **シワシワ** | シワシワおばあちゃんを管理。shiny は優先破裂、残す匹数や閾値を設定可能 |
| ⬆️ **アップグレード** | ショップの UP を価格順に自動購入。ブラックリスト/ホワイトリスト、大惨事(One mind 系)の方針指定、確保クッキー指定可 |
| 🏭 **施設** | **「価格 ÷ 増加CpS」= 回収効率** を実測して最も効率的な施設を購入(シナジー込みで `Game.CalculateGains()` を呼び差分計測)。最安優先モードも選択可 |
| 🍬 **砂糖ランプ** | 熟したら自動収穫。建物レベルを **優先順位リスト** に従って自動強化(ミニゲーム解放を優先) |
| 🌱 **農業(庭)** | 植栽・収穫・土壌自動選択・雑草除去。**変異テーブルを内蔵し、未解放の種を全部自動で集めます**。juicy queenbeet による **ランプ農園** も自動運用 |
| 📈 **取引所** | 基準値に対する割安/割高 + モメンタムで **スイング売買**。損切り・利確・ブローカー自動雇用・オフィス自動拡張 |
| ⛩ **神殿** | 礼拝スワップの範囲内で 3 スロットに神を自動配置(ロードアウト設定可) |
| 🔮 **魔法書** | 魔力が溜まったら指定呪文を優先順に自動詠唱(暴走率が高い呪文は既定で回避) |
| 🐉 **ドラゴン** | クランブラーの自動育成 + オーラ2枠の自動設定 |
| 🎅 **サンタ/🎄季節** | サンタの自動レベルアップ、季節の自動切替(既定OFF) |
| ✨ **転生** | 獲得チップが条件を満たすと自動で昇天。**転生前に必ずセーブをバックアップ** し、天界スキルツリーを **推奨順** に購入 → 自動で現世復帰 |
| 🌌 **天界スキルツリー** | 102種のプレステージUPを「親の前提」を守りながら推奨順/最安順で購入。恒久アップグレード枠も自動割当 |
| 🧹 **保守** | ミュート、ダイアログ自動クローズ、スリープ(タイムアウト画面)自動復帰、パーティクル削減、オートセーブ |

---

## 動作環境

| | |
|---|---|
| OS | Windows 10 / 11 (bat 同梱)。macOS / Linux は `python run.py` で動作 |
| Python | **3.9 以上** (PATH に入っていること) |
| 追加ライブラリ | **playwright のみ** (他はすべて Python 標準ライブラリ) |
| ブラウザ | Playwright 同梱の Chromium を自動DL。または既存の Chrome / Edge を使用可 |
| 通信 | ゲーム本体 (orteil.dashnet.org) にアクセスできること |

---

## インストール

`install.bat` を **ダブルクリック** するだけです。

```
install.bat
```

中身は以下を順に実行します。

1. Python の存在確認
2. 仮想環境 `.venv` の作成 (システムを汚しません)
3. `pip install -r requirements.txt` (= playwright)
4. `python -m playwright install chromium` (初回のみ 約150MB)
5. `run.py --doctor` による環境診断

> Chrome / Edge がすでに入っているなら Chromium のDLに失敗しても動きます。
> `config.json` の `browser.channel` を `"chrome"` または `"msedge"` にしてください。

診断だけやり直したいときは `doctor.bat`。

---

## 起動と停止

### 起動

```
start_bot.bat
```

- ゲームのブラウザ窓が開きます
- 管理画面 `http://127.0.0.1:8765/` が自動で開きます
- コンソールにも状況が表示されます

引数を渡すこともできます。

```
start_bot.bat --port 8888            # 管理画面のポート変更
start_bot.bat --headless             # ブラウザを表示しない
start_bot.bat --channel msedge       # Edge を使う
start_bot.bat --no-open              # 管理画面を自動で開かない
```

### 停止

- コンソール窓で **Ctrl+C**、または
- 管理画面 右上の **[停止]** ボタン

どちらの場合も **終了前にセーブを自動バックアップ** してからブラウザを閉じます。

---

## 管理画面

`http://127.0.0.1:8765/` (ローカル専用。外部からはアクセスできません)

| タブ | 内容 |
|---|---|
| **📊 ダッシュボード** | クッキー/CpS/プレステージの推移グラフ、モジュールのON/OFFと即時実行、クイック操作、バフ一覧、ゴールデン/シワシワの状況、エンジン診断、施設一覧 |
| **⚙️ モジュール設定** | 全モジュールの全パラメータを日本語の説明付きで編集。**変更は即ゲームに反映**され `config.json` にも保存されます |
| **🏪 施設・ストア** | 施設の +1/+10/+100/最大 購入、ショップのUP一覧と個別購入、「買えるものを全部買う」 |
| **🌱 農業(庭)** | 6×6 の畑を可視化(成熟度バー付き)。**マスをクリックで植える/収穫する**、種と土壌の選択、一括収穫、凍結、庭の供儀、種のコンプリート状況と変異条件の一覧、自動計画の進捗 |
| **📈 取引所** | 全銘柄の価格・基準値・トレンド・**推移スパークライン**・保有数・買値平均、売買ボタン、ブローカー雇用、オフィス拡張、取引戦略のパラメータ編集 |
| **🔮 神殿・魔法** | 3スロットへの神の割当(ドロップダウン)、神の一覧と効果、呪文の一覧と詠唱ボタン、ドラゴンのオーラ選択、サンタ、季節切替 |
| **✨ 転生・天界** | 現在のプレステージ/転生後の値/獲得チップ/必要数の一覧、[今すぐ転生]、恒久UP枠の設定、**天界スキルツリー全102種の状態**(取得済・購入可・チップ不足・前提未達)と個別購入 |
| **📜 ログ** | ライブ行動ログ(モジュール絞り込み・全文検索)、ログファイル一覧とダウンロード |
| **💾 セーブ** | バックアップ一覧(復元/DL/削除)、セーブコードの書き出し・読み込み、ゲームページの再読み込み |
| **🧩 設定(JSON)** | `config.json` を直接編集して保存・反映 |

画面下部には **直近の行動ティッカー** が常時表示されます。

スクリーンショットは [`docs/`](docs/) にあります
(`admin-dash.png` / `admin-garden.png` / `admin-market.png` / `admin-ascend.png` / `admin-logs.png` など)。
再生成する場合は `python tests/gen_screenshots.py`。

---

## ログ

`logs/` に保存されます。

```
logs/
├── ccbot.log                     システム全体のログ (8MB × 6 でローテーション)
├── error.log                     WARNING 以上だけ (4MB × 3)
├── actions/
│   ├── 2026-10-21.jsonl          ★ bot の全行動 (機械可読 / 1行1イベント)
│   └── 2026-10-21.log            ★ bot の全行動 (人間可読)
└── stats/
    └── 2026-10-21.jsonl          60秒ごとの数値スナップショット (時系列分析用)
```

### 行動ログの中身

人間可読版 (`actions/YYYY-MM-DD.log`) の例:

```
2026-10-21 14:19:34.465 [農業/土壌変更] soil=clay name=Clay -> tickMin=15
2026-10-21 14:19:34.465 [農業/植栽] x=0 y=0 plant=bakerWheat reason=farm -> cost=6.981 quintillion
2026-10-21 14:19:34.468 [魔法/魔法詠唱] spell=Conjure Baked Goods cost=28 magicLeft=38 backfire=0 -> cookieDelta=0
2026-10-21 14:19:35.500 [ドラゴン/オーラ変更] slot=0 aura=Dragon God index=8
2026-10-21 14:21:16.798 [天界ツリー/購入] name=Archangels -> chips=49 chipsLeft=99999999611 priority=12
2026-10-21 14:21:26.434 [転生/現世復帰] reason=auto prestige=99999999999 -> chipsLeft=99889737939 ascensions=1
```

JSONL 版は同じ内容を構造化して持ちます:

```json
{"ts":"2026-10-21 14:21:16.798","epoch":1792592476.798,"seq":4123,
 "module":"prestige","module_jp":"天界ツリー","action":"buy","action_jp":"購入",
 "detail":{"name":"Archangels","internal":"Archangels"},
 "result":{"chips":49,"chipsLeft":99999999611,"priority":12},
 "line":"2026-10-21 14:21:16.798 [天界ツリー/購入] name=Archangels ..."}
```

記録されるイベント(例):

- `clicker` 自動クリック(バッチ集約) / 手動クリック
- `golden` ゴールデン・レイス・トナカイの回収と獲得量
- `wrinkler` 破裂と吸われていた量
- `upgrade` / `building` 購入した名前・価格・残クッキー・回収効率
- `lump` ランプ収穫(種類・経過時間・獲得数) / 建物レベルアップ(消費ランプ)
- `garden` 植栽・収穫・土壌変更・**種の解放**・変異計画の開始/完了/タイムアウト
- `market` 買い/売り(価格・数量・買値平均・損益)・ブローカー雇用・オフィス拡張
- `grimoire` 詠唱(消費魔力・暴走の有無)
- `pantheon` 神の配置(スロット・入れ替わった神・残りスワップ)
- `dragon` / `santa` / `season` 育成・オーラ・レベル・季節切替
- `ascend` 転生要求 → バックアップ → 実行 → 現世復帰(獲得チップ)
- `prestige` 天界UP購入(消費チップ・優先順位) / 恒久スロット設定
- `save` バックアップ(ファイル名・バイト数) / 復元
- `core` / `engine` 設定変更・モジュールON/OFF・エラー・復帰

`logging.keepDays` (既定30日) より古い日別ログは起動時に自動削除されます。

---

## セーブのバックアップと復元

`saves/` に `save-YYYYMMDD-HHMMSS-<タグ>.txt` として保存されます。

| タグ | タイミング |
|---|---|
| `periodic` | `save.backupEverySec` ごと (既定15分) |
| `pre-ascend` | **転生の直前** (既定ON) |
| `exit` | ボット終了時 |
| `before-restore` | 復元を実行する直前 |
| `manual` | 管理画面から手動で |

`save.keepBackups` (既定60件) を超えた古いものは自動削除されます。

**復元**: 管理画面 [💾 セーブ] → 対象の [復元]。
現在の進行は自動的に `before-restore` として退避されるので、失敗しても戻せます。

---

## アンインストール

```
uninstall.bat
```

対話式で、以下を選べます。

1. **追加ライブラリの削除** — 仮想環境 `.venv` をまるごと削除 + `pip uninstall playwright`
2. **ブラウザ本体の削除(任意)** — `playwright uninstall --all` と `%LOCALAPPDATA%\ms-playwright`
3. **データの削除(任意)** — `config.json` / `logs/` / `saves/` / `browser_profile/`

「1だけ」「1+2」「全部」が選べるので、**再インストールしたいだけならデータを残せます**。

> 手動で消す場合:
> ```
> rmdir /s /q .venv
> rmdir /s /q %LOCALAPPDATA%\ms-playwright
> ```

---

## ⚠ 最初に必ず読むこと

### 1. 人間認証 (Cloudflare) が出ることがあります

ゲームサイトにアクセスすると、初回に

> **Just a moment...** / パフォーマンスとセキュリティを Cloudflare で保護

という確認画面が出ることがあります。**これはボットでは解除しません(できません)。**

- 既定では **ブラウザ窓が表示される** ので、その中のチェックボックスを **一度クリック** してください。
- 解除すると `browser_profile/` に保存され、次回からは通常そのまま通ります。
- 管理画面の上部に黄色いバナーで「認証待ち」が表示されます。
- `--headless` では認証を通せないことがあるため、**初回は必ず表示モードで** 起動してください。

### 2. ゲームの進行はブラウザプロファイルに入ります

セーブは `browser_profile/` (Chromium の localStorage) に保存されます。
**このフォルダを消すと進行も消えます。** 定期的に `saves/` のバックアップを別の場所にコピーしておくと安全です。

### 3. 転生は破壊的な操作です

既定では「現在のプレステージが **+50%** になるまで転生しない」かつ「**転生前に必ずバックアップ**」する設定です。
不安な場合は `ascend.enabled` を `false` にして、管理画面の [今すぐ転生する] を手動で押してください。

### 4. ブラウザ窓は最小化しないでください

Chromium は裏に回ったタブのタイマーを止めます。起動時に抑制フラグを付けていますが、
**最小化すると環境によってはゲームが止まる** ことがあります。他の窓の後ろに隠す程度に留めてください。

---

## 設定リファレンス

`config.json` は初回起動時に自動生成されます。管理画面 [⚙️ モジュール設定] から編集するのが手軽です。

### browser

| キー | 既定 | 説明 |
|---|---|---|
| `url` | 公式URL | ゲームのURL |
| `headless` | `false` | ブラウザを非表示にする |
| `channel` | `"auto"` | `chrome` / `msedge` / `auto`(同梱Chromium) |
| `userDataDir` | `browser_profile` | セーブとプロファイルの保存先 |
| `windowSize` | `[1440,900]` | 窓のサイズ |
| `stealthFlags` | `true` | バックグラウンドスロットリング抑制などの起動フラグ |
| `waitTimeoutSec` | `300` | ゲーム起動(人間認証の解除含む)を待つ秒数 |
| `startRetries` | `3` | ブラウザ起動失敗時の再試行回数 |

### server / loop / logging / save

| キー | 既定 | 説明 |
|---|---|---|
| `server.port` | `8765` | 管理画面のポート |
| `server.host` | `127.0.0.1` | バインド先 (**0.0.0.0 にすると外部から操作されます**) |
| `server.openBrowser` | `true` | 起動時に管理画面を自動で開く |
| `server.historyPoints` | `720` | グラフに保持する点数 |
| `loop.pollMs` | `400` | イベント回収の間隔 |
| `loop.snapshotMs` | `1000` | 状態取得の間隔 |
| `logging.level` | `INFO` | ログレベル |
| `logging.statsEverySec` | `60` | 統計スナップショットの間隔 |
| `logging.ringBuffer` | `3000` | 管理画面に表示する直近ログ件数 |
| `logging.keepDays` | `30` | 日別ログの保持日数 |
| `save.backupEverySec` | `900` | 定期バックアップ間隔 |
| `save.keepBackups` | `60` | 保持するバックアップ数 |

### モジュール (抜粋)

| キー | 既定 | 説明 |
|---|---|---|
| `master` | `true` | 全体の停止スイッチ |
| `clicker.cps` | `12` | クリック/秒 (実効上限 14.5) |
| `clicker.direct` | `false` | `true` でクリック処理を介さず直接加算(高速) |
| `clicker.boostOnFrenzy` | `true` | Click frenzy 中に増速 |
| `golden.popWrath` | `true` | レイスクッキーも回収 |
| `wrinkler.popShiny` | `true` | shiny wrinkler を破裂 |
| `wrinkler.keep` | `10` | 残す匹数 |
| `upgrade.grandmapocalypse` | `"ignore"` | `off`=大惨事を止める / `on`=進める / `ignore`=放任 |
| `upgrade.buyToggles` | `false` | 季節トリガー等のトグルUPを買うか |
| `upgrade.blacklist` | `[]` | 買わないUP名 |
| `building.strategy` | `"payback"` | `payback`=回収効率 / `cheapest`=最安 |
| `building.reserveCookies` | `0` | 施設購入に使わず残すクッキー |
| `lump.priority` | Farm→Temple→… | レベル上げの優先順 (先頭ほど優先) |
| `lump.maxLevel` | `10` | 自動で上げる最大レベル |
| `garden.mode` | `"auto"` | `auto` / `unlock` / `farm` / `lumpfarm` / `off` |
| `garden.farmSeed` | `"bakerWheat"` | 栽培する種 (各 +1% CpS で最安) |
| `garden.harvestMature` | `false` | 成熟したら収穫 (**OFF推奨**: 植栽コストの方が高くつく作物が多い) |
| `garden.unlockAll` | `true` | 未解放の種を変異で自動収集 |
| `garden.lumpFarm` | `true` | queenbeet 8株で juicy queenbeet → 砂糖ランプ狙い |
| `garden.soil` | `"auto"` | モードに応じて dirt/fertilizer/clay/woodchips を選択 |
| `market.buyBelowRatio` | `0.80` | 基準値×これ以下で買う |
| `market.sellAboveRatio` | `1.35` | 基準値×これ以上で売る |
| `market.stopLossRatio` | `0.55` | 買値×これを下回ったら損切り (0=無効) |
| `market.spendRatio` | `0.6` | 手持ちクッキーの何割まで使うか |
| `market.autoBrokers` | `true` | ブローカー自動雇用 (手数料 -5%/人) |
| `grimoire.spells` | `["conjure baked goods","hand of fate"]` | 詠唱する呪文(上から優先) |
| `grimoire.minMagicRatio` | `1.0` | 魔力がこの割合以上で詠唱 |
| `pantheon.loadout` | `["creation","scorn","order"]` | ダイヤ/ルビー/ヒスイ に置く神 |
| `dragon.aura1` / `aura2` | `Dragon God` / `Reality Bending` | オーラ |
| `ascend.mode` | `"percent"` | 転生判定 |
| `ascend.percent` | `50` | 現在のプレステージが +50% になったら転生 |
| `ascend.backupFirst` | `true` | **転生前に必ずバックアップ** |
| `ascend.reincarnateDelaySec` | `3` | 転生画面に留まる秒数(天界ツリー購入に使用) |
| `prestige.strategy` | `"priority"` | `priority`=推奨順 / `cheapest`=安い順 |
| `prestige.autoAssignPermanent` | `true` | 恒久UP枠を自動設定 |
| `housekeep.muteSound` | `true` | 効果音をミュート |
| `housekeep.reduceParticles` | `true` | パーティクルを削減(処理落ち防止) |

全項目の意味は管理画面 [⚙️ モジュール設定] にインラインで表示されます。

---

## 中身のしくみ

```
start_bot.bat
   └─ run.py                     エントリポイント
        ├─ ccbot/config.py       config.json (設定の唯一の source of truth)
        ├─ ccbot/log.py          ロギング (rotating + JSONL + ring buffer)
        ├─ ccbot/bridge.py       Playwright 起動・JS注入・呼び出し・人間認証検出
        ├─ ccbot/engine.py       ★メインループ (Playwright はこのスレッド専用)
        ├─ ccbot/saves.py        セーブのバックアップ/復元
        ├─ ccbot/server.py       管理画面 HTTP サーバ (別スレッド / 標準ライブラリのみ)
        ├─ ccbot/js/*.js         ★ページ内エンジン (Game の 'logic' フックで毎フレーム駆動)
        └─ ccbot/web/*           管理画面 UI (依存ライブラリなし)
```

### なぜ「ページ内エンジン」方式なのか

Cookie Clicker には公式の mod フック (`Game.registerHook('logic', fn)`) があり、
**毎フレーム呼ばれる JS 関数** を登録できます。ボットの判断逻辑をそこに置くことで:

- Python ⇔ ブラウザの往復が **秒2〜3回** で済む (1行動ごとに往復しない)
- ゴールデンクッキーを取り逃さない (120ms 周期でページ内が直接チェック)
- 通信が一瞬途切れても **ゲーム側は正しく動き続ける**
- `Game.CalculateGains()` を呼んだ **正確な** 施設効率の計測ができる

Python 側は「設定を配る / イベントを回収してログに書く / 管理画面を出す / セーブを保存する」
を担当します。両者は `window.__CCBOT.run(name, args)` という 1 本の API だけでつながっています。

### 施設購入の「回収効率」計測

```js
g.CalculateGains();               base = Game.cookiesPs;
building.amount++;                // 1個だけ増やして
g.CalculateGains();               gain = Game.cookiesPs - base;
building.amount--;                // 元に戻す (try/finally で必ず復元)
score = gain / price;             // これが一番高い施設を買う
```

子猫・シナジー・パンテオン・オーラ・庭の効果まで全部込みで **実際に測って** 判断します。
計測は 1.5 秒に 1 回・上位10施設までに制限して負荷を抑えています。

### 転生の安全装置

```
JS: 条件達成 → pendingAscend を立てる (自分では転生しない)
        ↓
Python: セーブコードを書き出し → saves/save-...-pre-ascend.txt
        ↓
Python: clearAscendBackup() を呼ぶ
        ↓
JS: Game.Ascend(1) → 天界ツリー購入 → Game.Reincarnate(1)
```

Python が応答しなくても `ascend.backupTimeoutSec` (既定60秒) で先に進みますが、
その場合は `backup-timeout` としてログに残ります。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `install.bat` で Python が見つからない | Python を入れ直し、**「Add python.exe to PATH」にチェック** |
| Chromium のDLに失敗する | `config.json` の `browser.channel` を `"chrome"` か `"msedge"` に |
| ブラウザが真っ白 / `Just a moment...` | 人間認証です。ブラウザ窓のチェックボックスを手で押してください |
| 管理画面が開かない | ポート競合。`start_bot.bat --port 8888` |
| `game not ready` が出続ける | `logs/ccbot.log` を確認。ページ再読み込み(管理画面 [💾 セーブ] タブ)も試す |
| ゲームが止まる(スリープ画面) | 窓を最小化していないか。`housekeep.autoResume` は既定でON |
| 音がうるさい | `housekeep.muteSound` / `muteMusic` は既定でON。反映されない場合 `--channel` のブラウザ設定を確認 |
| CPU が高い | `building.maxMeasure` を下げる / `housekeep.reduceParticles=true` / `clicker.cps` を下げる |
| 庭が動かない | Farm(農場) の **レベルが1以上** 必要です。`lump.autoLevel` が自動で上げます |
| 取引所/神殿/魔法が動かない | Bank / Temple / Wizard tower の **レベルが1以上** 必要です |
| 進行を戻したい | 管理画面 [💾 セーブ] → バックアップ一覧 → [復元] |
| 詳細な原因を知りたい | `logs/error.log` と `logs/ccbot.log` を確認 |

---

## テスト

開発時に使っている検証スイートです (任意)。

```bash
# JS エンジンの単体テスト (ゲームのモックを使用 / 96 項目)
node tests/run_engine_test.js

# Python 側の単体テスト (設定・ログ・セーブ・管理画面API / 80 項目)
python tests/test_python.py

# 管理画面 UI のスモークテスト (ヘッドレスで全タブ描画 / 28 項目)
python tests/test_ui.py

# 実物の Cookie Clicker に対するエンドツーエンドテスト
python tests/test_live.py                 # 基本フロー (35 項目)
python tests/test_advanced.py             # ミニゲーム + 転生 (38 項目)

# 管理画面のスクリーンショット再生成
python tests/gen_screenshots.py
```

`test_live.py` / `test_advanced.py` は実際にブラウザを起動して本物のゲームで検証します。
`--url` で任意のURLを指定できます。

---

## ファイル構成

```
CookieClickerBot/
├── install.bat            ← 追加ライブラリのインストール
├── start_bot.bat          ← 起動
├── uninstall.bat          ← 追加ライブラリのアンインストール
├── doctor.bat             ← 環境診断
├── run.py                 ← エントリポイント
├── requirements.txt       ← playwright のみ
├── config.json            ← 設定 (初回起動時に自動生成)
├── README.md
├── ccbot/
│   ├── config.py  engine.py  bridge.py  server.py  log.py  saves.py  paths.py
│   ├── js/                ← ページ内エンジン (辞書順に連結して注入)
│   │   ├── 00_core.js     名前空間 / イベント / 設定 / スケジューラ
│   │   ├── 10_state.js    状態取得 / 施設効率の実測
│   │   ├── 20_basic.js    クリック / ゴールデン / シワシワ / ランプ / サンタ / ドラゴン / 季節 / 保守
│   │   ├── 30_store.js    アップグレード / 施設の購入
│   │   ├── 40_garden.js   農業 (変異テーブル内蔵)
│   │   ├── 50_market.js   クッキー取引所
│   │   ├── 60_temple_grimoire.js  神殿 / 魔法書
│   │   ├── 70_ascend.js   転生 / 天界スキルツリー (推奨購入順を内蔵)
│   │   └── 90_api.js      Python からの呼び出し口
│   └── web/               ← 管理画面 (index.html / app.js / style.css)
├── tests/                 ← 検証スイート
├── logs/                  ← ログ (自動生成)
├── saves/                 ← セーブのバックアップ (自動生成)
└── browser_profile/       ← ゲームの進行データ (自動生成・消すと進行が消えます)
```

---

## 免責

- 本ツールは **自分が遊ぶ Cookie Clicker の進行を自動化する** ためのものです。
  他者と競う要素・ランキング・課金はありませんが、**利用は自己責任** でお願いします。
- 公式の mod API (`Game.registerHook`) を使うため、ゲーム本体の改変やファイルの書き換えは行いません。
  ただし `Game.Win('Third-party')` (MOD使用の実績) が付与されます。
- Cookie Clicker のバージョンアップで内部APIが変わると動かなくなることがあります。
  その場合は `logs/error.log` を見て `ccbot/js/` を調整してください。
- Cookie Clicker は Orteil / Dashnet 様の作品です。本リポジトリにゲーム本体のファイルは含まれていません。
