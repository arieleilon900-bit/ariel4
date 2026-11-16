#!/bin/bash
# wrap a page source into a full standalone html document
src=$1; out=$2; og_t=$3; og_d=$4; og_i=$5
{ printf '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta property="og:title" content="%s">\n<meta property="og:description" content="%s">\n<meta property="og:image" content="https://onerishon-demo.pages.dev/%s">\n<meta property="og:type" content="website">\n' "$og_t" "$og_d" "$og_i"; sed -n '1,/<\/style>/p' "$src"; printf '</head>\n<body>\n'; sed '1,/<\/style>/d' "$src"; printf '\n</body>\n</html>\n'; } > "$out"
