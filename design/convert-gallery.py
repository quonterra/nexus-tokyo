#!/usr/bin/env python3
"""GALLERY用の写真を、公開用のWebPに変換します。

  入力: design/originals/gallery/   （元画像。公開されません）
  出力: public/assets/gallery/       （WebP。LPから読み込まれます）

使い方:
  python3 design/convert-gallery.py

長辺1200px・品質80を基準に、1枚200KB以下になるまで品質を少しずつ下げます。
変換後、public/index.html のGALLERYセクションに1行追記すれば表示されます。
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillowが必要です:  pip3 install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design", "originals", "gallery")
DST = os.path.join(ROOT, "public", "assets", "gallery")

MAX_EDGE = 1200
MAX_BYTES = 200 * 1024
QUALITIES = [80, 72, 65, 58, 50]
EXTS = (".jpg", ".jpeg", ".png", ".heic", ".webp", ".tif", ".tiff")


def convert(path, out):
    im = Image.open(path)
    im = im.convert("RGB")
    if max(im.size) > MAX_EDGE:
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    for q in QUALITIES:
        im.save(out, "WEBP", quality=q, method=6)
        size = os.path.getsize(out)
        if size <= MAX_BYTES:
            return im.size, q, size
    return im.size, QUALITIES[-1], os.path.getsize(out)


def main():
    if not os.path.isdir(SRC):
        sys.exit("元画像フォルダがありません: %s" % SRC)
    os.makedirs(DST, exist_ok=True)

    names = sorted(n for n in os.listdir(SRC) if n.lower().endswith(EXTS))
    if not names:
        print("変換する画像がありません: %s" % SRC)
        return

    for name in names:
        stem = os.path.splitext(name)[0]
        out = os.path.join(DST, stem + ".webp")
        (w, h), q, size = convert(os.path.join(SRC, name), out)
        flag = "" if size <= MAX_BYTES else "  ← 200KBを超えています"
        print("%-34s -> %s  %dx%d  q%d  %dKB%s"
              % (name, stem + ".webp", w, h, q, size / 1024, flag))

    print("\n完了しました。public/index.html に次のような行を追記してください:")
    print('<button class="gallery-item" type="button">'
          '<img src="assets/gallery/%s.webp" alt="写真の説明" loading="lazy">'
          '<span class="gallery-tag">タグ</span></button>'
          % os.path.splitext(names[0])[0])


if __name__ == "__main__":
    main()
