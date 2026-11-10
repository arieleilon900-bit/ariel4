const {chromium}=require('playwright');
const [img,bx,out]=process.argv.slice(2);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350}});
 await p.goto('file://'+__dirname+'/v2.html#7');
 await p.evaluate(([img,bx])=>{const e=document.querySelector('#a7 .bg');e.style.backgroundImage='url('+img+')';e.style.setProperty('--bx',bx);},[img,bx]);
 await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(900);
 await p.screenshot({path:out});await b.close();})();
