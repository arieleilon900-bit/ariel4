const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();
  for (const [name,h,hash] of [['feed',1350,''],['story',1920,'#story']]){
    const p=await b.newPage({viewport:{width:1080,height:h},deviceScaleFactor:1});
    await p.goto('file://'+__dirname+'/ad.html'+hash);
    await p.evaluate(()=>document.fonts.ready);
    await p.waitForTimeout(800);
    await p.screenshot({path:__dirname+'/../ad_'+name+'.png'});
  }
  await b.close();
})();
