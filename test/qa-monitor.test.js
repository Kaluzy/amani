import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('ongoing QA distinguishes missing yearly history from broken production dependencies', async t => {
  const { checkWebsite } = await import('../scripts/qa-check.js').catch(() => ({}));
  assert.equal(typeof checkWebsite,'function','daily QA check is not implemented');
  let fail = false;
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/health')return res.end(JSON.stringify({status:'ok',version:'3.0.0'}));
    if(req.url==='/api/status')return res.end(JSON.stringify({periods:Object.fromEntries(['daily','weekly','monthly','yearly'].map(period=>[period,{count:period==='yearly'?0:1,latest:new Date().toISOString()}]))}));
    if(req.url==='/api/stats/charts'){
      if(fail){res.statusCode=503;return res.end('{"error":"Unavailable"}');}
      return res.end(JSON.stringify({monthlyStars:{labels:[],datasets:[]},monthlyForks:{labels:[],datasets:[]},yearlyStars:{labels:[],datasets:[]},yearlyForks:{labels:[],datasets:[]}}));
    }
    if(req.url==='/api/insights')return res.end(JSON.stringify({most_starred:[],fastest_growing:[],recently_created:[],languages:[]}));
    return res.end('[]');
  }).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const good=await checkWebsite(origin);
  assert.equal(good.ok,true,'yearly may have no growth history without breaking QA');
  fail=true;
  const bad=await checkWebsite(origin);
  assert.equal(bad.ok,false,'a failed chart dependency must be reported');
  assert.ok(bad.checks.some(check=>check.status==='fail'&&check.name.includes('charts')));
  await t.test('a briefly unavailable listener is retried before reporting failure',async()=>{
    fail=false;
    const delayed=createServer(server.listeners('request')[0]);
    delayed.listen(0,'127.0.0.1');await once(delayed,'listening');
    const port=delayed.address().port;await new Promise(resolve=>delayed.close(resolve));
    const start=setTimeout(()=>delayed.listen(port,'127.0.0.1'),60);
    try{
      const result=await checkWebsite(`http://127.0.0.1:${port}`,{timeoutMs:1000,retryDelayMs:50});
      assert.equal(result.ok,true,'brief connection refusal during server startup should recover');
    }finally{clearTimeout(start);if(delayed.listening)await new Promise(resolve=>delayed.close(resolve));}
  });
});
