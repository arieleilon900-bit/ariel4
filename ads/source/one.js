const {chromium}=require('playwright');
const i=process.argv[2];
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350}});
 await p.goto('file://'+__dirname+'/v3.html#'+i);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);
 await p.screenshot({path:__dirname+'/../final_'+i+'.png'});await b.close();})();
