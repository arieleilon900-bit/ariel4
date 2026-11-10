const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();
  for (const [name,h,hash] of [['feed',1350,''],['story',1920,'#story']]){
    const ctx=await b.newContext({viewport:{width:1080,height:h},recordVideo:{dir:__dirname+'/v_'+name,size:{width:1080,height:h}}});
    const p=await ctx.newPage();
    await p.goto('file://'+__dirname+'/ad.html'+hash);
    await p.evaluate(()=>document.fonts.ready);
    await p.waitForTimeout(11000);
    await ctx.close();
  }
  await b.close();
})();
