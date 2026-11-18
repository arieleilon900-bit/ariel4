# בונה קובץ דמו אחד עם כל התמונות בפנים: menu-bot/david-menu-demo.html
import re,base64,io,os
from PIL import Image
here=os.path.dirname(os.path.abspath(__file__)); pics=os.path.join(here,'..','public','p')
s=open(os.path.join(here,'index.html'),encoding='utf-8').read(); cache={}
def b64(name):
  if name not in cache:
    im=Image.open(os.path.join(pics,name)).convert('RGB'); im.thumbnail((1000,1000)); bio=io.BytesIO(); im.save(bio,'JPEG',quality=74)
    cache[name]='data:image/jpeg;base64,'+base64.b64encode(bio.getvalue()).decode()
  return cache[name]
for n,cnt in (('1',6),('2',9),('3',7)):
  arr='['+','.join("'"+b64(f'all{n}-{i}.jpg')+"'" for i in range(1,cnt+1))+']'
  s,k=re.subn(r"\[[\d,]+\]\.map\(\(i\) => '\.\./p/all"+n+r"-' \+ i \+ '\.jpg'\)",arr,s); assert k==1
assert '../p/' not in s
out=os.path.join(here,'..','..','menu-bot','david-menu-demo.html'); open(out,'w',encoding='utf-8').write(s); print(os.path.getsize(out)//1024,'KB')
