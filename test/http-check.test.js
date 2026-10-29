import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { checkedFetch } from '../scripts/http-check.js';

test('public probes retry and record transient hosting errors, not broken 404 links', async t => {
  let requests = 0;
  const server = createServer((request,response) => {
    requests++;
    response.statusCode = request.url === '/missing' ? 404 : requests < 3 ? 503 : 200;
    response.end('test');
  }).listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`,retries=[];
  const response=await checkedFetch(origin,{delayMs:1,onRetry:retry=>retries.push(retry)});
  assert.equal(response.status,200);await response.text();
  assert.equal(requests,3);assert.equal(retries.length,2);assert.ok(retries.every(retry=>retry.status===503));
  requests=0;
  const missing=await checkedFetch(origin+'/missing',{delayMs:1});assert.equal(missing.status,404);await missing.text();assert.equal(requests,1);
});
test('public probes stop after the retry budget on persistent service failure', async t=>{
  let requests=0;const server=createServer((request,response)=>{requests++;response.statusCode=503;response.end('unavailable');}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await checkedFetch(`http://127.0.0.1:${server.address().port}`,{delayMs:1,attempts:3});
  assert.equal(response.status,503);await response.text();assert.equal(requests,3);
});
