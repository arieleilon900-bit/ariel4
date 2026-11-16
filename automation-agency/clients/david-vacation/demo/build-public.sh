#!/bin/bash
# builds the public standalone page from the artifact source
src=david-demo/david-demo.html; out=pub; mkdir -p $out/p; cp david-demo/p/*.jpg $out/p/
{ printf '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="robots" content="noindex">\n<meta property="og:title" content="דוד, תכיר את המזכירה החדשה שלך">\n<meta property="og:description" content="תכתוב לה כמו לקוח ותראה איך היא סוגרת הזמנה">\n<meta property="og:image" content="p/a1-1.jpg">\n'; sed -n '1,/<\/style>/p' $src; printf '</head>\n<body>\n'; sed '1,/<\/style>/d' $src; printf '\n</body>\n</html>\n'; } > $out/index.html
