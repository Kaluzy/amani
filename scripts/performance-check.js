// Reproducible cold-browser lab smoke test, not field Core Web Vitals or Lighthouse.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const base = (process.env.AMANI_PUBLIC_URL || 'https://kaluzy.github.io/amani/').replace(/\/?$/, '/');
const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const samples=[];
  for (const width of [390,1440]) {
    const context=await browser.createBrowserContext(),page=await context.newPage();
    // A fresh context is cold. Keep normal in-page cache reuse (logo/favicon).
    await page.setViewport({width,height:1000});
    const session=await page.createCDPSession();await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.evaluateOnNewDocument(()=>{
      window.labVitals={lcp:null,cls:0};
      new PerformanceObserver(list=>{for(const entry of list.getEntries())window.labVitals.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.labVitals.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
    });
    const requests=[];page.on('request',request=>requests.push(request.url()));
    await page.goto(base,{waitUntil:'networkidle0',timeout:45000});await page.waitForSelector('#mainContent:not([aria-busy])');
    await page.bringToFront();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const sample=await page.evaluate(()=>{
      const entries=performance.getEntriesByType('resource');
      const unique=[...new Map(entries.map(entry=>[entry.name,entry])).values()],js=unique.filter(entry=>/\.js(?:\?|$)/.test(entry.name));
      return {navigationMs:Math.round(performance.now()),javascriptDecodedBytes:js.reduce((sum,entry)=>sum+entry.decodedBodySize,0),uniqueAssetDecodedBytes:unique.reduce((sum,entry)=>sum+entry.decodedBodySize,0),networkTransferBytes:entries.reduce((sum,entry)=>sum+entry.transferSize,0),lcpMs:window.labVitals.lcp==null?null:Math.round(window.labVitals.lcp),cls:Math.round(window.labVitals.cls*10000)/10000};
    });
    assert.ok(!requests.some(url=>url.includes('/vendor/chart.js')),'Discovery must not download the chart library');
    assert.ok(!requests.some(url=>/google-analytics|googletagmanager/.test(url)),'Analytics remains off for the current release');
    assert.ok(sample.javascriptDecodedBytes<180000,'Home JavaScript exceeds the 180 KB decoded budget');
    assert.ok(sample.uniqueAssetDecodedBytes<1200000,'Unique home assets exceed the 1.2 MB decoded budget');
    assert.ok(sample.networkTransferBytes<1200000,'Home resource transfers exceed the 1.2 MB network budget');
    assert.ok(sample.cls<=0.1,'Homepage loading shifts exceed the 0.1 lab CLS budget');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
    samples.push({width,cpuSlowdown:4,...sample});await context.close();
  }
  console.log(JSON.stringify({result:'pass',base,checkedAt:new Date().toISOString(),kind:'Cold Chromium lab, 4× CPU slowdown; no network emulation. LCP/CLS are diagnostics, not field guarantees.',samples},null,2));
} finally {await browser.close();}
