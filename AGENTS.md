# このリポジトリの注意（Web のゲーム）

- ゲームの本体は `src/`（`src/main.ts` が入口）。`index.html` は canvas を1枚置くだけ。Vercel が `npm run build` の `dist/` を公開する
- スマホ（縦の画面・タッチ）と PC（キーボード・マウス）の両方で遊べるようにする。画面の大きさが変わっても崩れない
- 画面を撮る：`npm run build` のあと `node .github/scripts/shot.mjs --serve --widths 390,1440 /`。遊んでいる途中の場面は、`/?scene=play` のように URL で直接開けるようにしておくと撮れる（`--steps` でキーを押してもよい）
- 音は Web Audio API で作る（外の音のファイルを読み込まない）。ブラウザは最初に触るまで音を出せないので、最初のタップ・キーで鳴らし始める
