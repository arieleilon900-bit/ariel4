const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
 for(const [i,out] of [[1,'A_main'],[8,'C_test']]){const p=await b.newPage({viewport:{width:1080,height:1350}});
  await p.goto('file://'+__dirname+'/v3.html#'+i);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);
  await p.screenshot({path:__dirname+'/../test/'+out+'.png'});await p.close();}
 const ctx=await b.newContext({viewport:{width:1080,height:1350},recordVideo:{dir:'/tmp/claude-0/vidA',size:{width:1080,height:1350}}});
 const p=await ctx.newPage();
 await p.goto('file://'+__dirname+'/v3.html?anim#1');await p.waitForTimeout(10500);await ctx.close();
 await b.close();})();
