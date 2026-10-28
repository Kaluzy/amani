import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createApp } from './serve-api.js';
import db from '../src/lib/database.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.env.PAGES_OUTPUT || path.join(root,'dist'));
const base=(process.env.PAGES_BASE || '/amani').replace(/\/$/,'');
if(!/^\/[A-Za-z0-9_-]+$/.test(base)) throw new Error('PAGES_BASE must be a single project path such as /amani');
const repository=process.env.PAGES_REPOSITORY || 'Kaluzy/amani';
if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid Pages repository');
const save=async(file,body)=>{const dest=path.join(output,file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,body);};
const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
try{
  const get=async(endpoint)=>{const response=await fetch(origin+endpoint);if(!response.ok)throw new Error(`${endpoint}: ${response.status}`);return response.json();};
  const repos=await get('/api/repos');const topics=await get('/api/topics');
  const routes=['/','/daily','/weekly','/monthly','/yearly','/stats','/insights','/live','/topics','/github-trending','/submit','/about','/privacy','/terms','/contact',...repos.map(r=>'/repositories/'+r.full_name),...topics.map(t=>'/topics/'+encodeURIComponent(t.slug))];
  let shell=await readFile(path.join(root,'public/shell.html'),'utf8');
  shell=shell.replace('<head>',`<head>\n  <meta name="amani-base" content="${base}">\n  <meta name="amani-hosting" content="github-pages">\n  <meta name="amani-repository" content="https://github.com/${repository}">`)
    .replace(/(href|src)="\/(?!\/)/g,`$1="${base}/`)
    .replace('A clearer view of open source.','Public snapshots · updated by GitHub Actions.');
  for(const route of routes) await save(route==='/'?'index.html':path.join(decodeURIComponent(route.slice(1)),'index.html'),shell);
  await save('404.html',shell);await save('.nojekyll','');
  const assets=['client.js','pages.js','ui.js','deployment.js','design.css','cards.css','favicon.svg'];
  for(const asset of assets){await mkdir(output,{recursive:true});await copyFile(path.join(root,'public',asset),path.join(output,asset));}
  await mkdir(path.join(output,'vendor'),{recursive:true});
  await copyFile(path.join(root,'node_modules/chart.js/dist/chart.umd.js'),path.join(output,'vendor/chart.js'));
  await copyFile(path.join(root,'node_modules/chart.js/LICENSE.md'),path.join(output,'vendor/chart.LICENSE.md'));
  const endpoints=['/api/status','/api/repos','/api/repos/daily','/api/repos/weekly','/api/repos/monthly','/api/repos/yearly','/api/stats','/api/stats/languages','/api/stats/charts','/api/insights','/api/live-mentions','/api/topics',...repos.map(r=>'/api/repos/detail/'+r.full_name),...topics.map(t=>'/api/topics/'+encodeURIComponent(t.slug)+'/repos')];
  for(const endpoint of endpoints) await save('data'+decodeURIComponent(endpoint.slice(4))+'.json',JSON.stringify(await get(endpoint)));
  await copyFile(path.resolve(process.env.PAGES_SEED || path.join(root,'data/public-seed.json')),path.join(output,'data/public-seed.json'));
  await save('build.json',JSON.stringify({built_at:new Date().toISOString(),repository,routes:routes.length,repositories:repos.length,base,hosting:'github-pages'}));
  console.log(`Built ${routes.length} routes and ${endpoints.length} public JSON endpoints in ${output}`);
}finally{await new Promise(resolve=>server.close(resolve));db.close();}
