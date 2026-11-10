const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
 for(let i=1;i<=5;i++){const p=await b.newPage({viewport:{width:1080,height:1350}});
  await p.goto('file://'+__dirname+'/five.html#'+i);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);
  await p.screenshot({path:__dirname+'/../mod_'+i+'.png'});await p.close();}
 await b.close();})();
