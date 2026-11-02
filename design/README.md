# GALLERYの写真を追加する手順

## 1. 元画像を置く

撮影した写真（スマホ写真でもそのままで構いません）を、次のフォルダに入れます。

```
design/originals/gallery/
```

ここはサイトには公開されません。元画像の保管場所です。

## 2. 公開用に変換する

```bash
python3 design/convert-gallery.py
```

`public/assets/gallery/` に、公開用のWebPが書き出されます。

- 長辺1200px
- 品質80が基準（200KBを超える場合は、収まるまで品質を自動で下げます）
- ファイル名は元画像と同じ（拡張子だけ `.webp` になります）
- EXIF（撮影位置・日時などのメタデータ）はすべて除去されます

## 3. LPに1行追記する

`public/index.html` のGALLERYセクション（`<div class="gallery-grid">` の中）に、
写真1枚につき1行を追記します。

```html
<button class="gallery-item" type="button"><img src="assets/gallery/bbq-01.webp" alt="写真の説明" loading="lazy"><span class="gallery-tag">BBQ</span></button>
```

- `src` … 変換後のファイル名
- `alt` … 写真の内容の説明（読み上げと、拡大表示時のキャプションに使われます）
- `<span class="gallery-tag">` … 左下に出る小さなタグ。不要なら `<span>` ごと削除してください

写真は4:3の枠に中央を基準に収まります。端の人が切れてしまうときは、その1枚だけ表示位置をずらせます。

```html
<button class="gallery-item" type="button" style="--pos:50% 30%"> ... </button>
```

左右の値が「横位置 縦位置」です。`50% 30%` なら少し上寄り、`30% 50%` なら少し左寄りになります。

並び順は、書いた順にそのまま表示されます。

## 注意

- 元画像（`design/originals/`）は `public/` に置かないでください。そのまま公開されてしまいます。
- 参加者が写っている写真は、本人の許可を得たものだけを掲載してください。
