const {chromium}=require('playwright');
const out=__dirname+'/..';
(async()=>{
  const b=await chromium.launch();
  for (const [name,h,hash] of [['feed',1350,''],['story',1920,'#story']]){
    const p=await b.newPage({viewport:{width:1080,height:h}});
    await p.goto('file://'+__dirname+'/ad.html'+hash);
    await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(600);
    await p.screenshot({path:out+'/ad_'+name+'.png'}); await p.close();
    const ctx=await b.newContext({viewport:{width:1080,height:h},recordVideo:{dir:'/tmp/claude-0/vid_'+name,size:{width:1080,height:h}}});
    const v=await ctx.newPage(); await v.goto('file://'+__dirname+'/ad.html'+hash);
    await v.evaluate(()=>document.fonts.ready); await v.waitForTimeout(11000); await ctx.close();
  }
  await b.close();
})();
