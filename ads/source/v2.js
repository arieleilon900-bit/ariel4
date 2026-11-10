const {chromium}=require('playwright');
const ids=process.argv.slice(2).map(Number);
(async()=>{const b=await chromium.launch();
 for(const i of ids){const p=await b.newPage({viewport:{width:1080,height:1350}});
  await p.goto('file://'+__dirname+'/v2.html#'+i);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);
  await p.screenshot({path:__dirname+'/../new_'+i+'.png'});await p.close();}
 await b.close();})();
