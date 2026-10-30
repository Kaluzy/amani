import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createApp } from './serve-api.js';
import db from '../src/lib/database.js';
import { exportPublicSeed } from '../src/lib/public-data.js';
import { createHash } from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.env.PAGES_OUTPUT || path.join(root,'dist'));
const base=(process.env.PAGES_BASE ?? '/amani').replace(/\/$/,'');
if(base && !/^\/[A-Za-z0-9_-]+$/.test(base)) throw new Error('PAGES_BASE must be empty or a single project path such as /amani');
const siteOrigin=process.env.PAGES_ORIGIN || 'https://kaluzy.github.io';
if(new URL(siteOrigin).origin !== siteOrigin || !siteOrigin.startsWith('https://')) throw new Error('PAGES_ORIGIN must be an HTTPS origin');
const repository=process.env.PAGES_REPOSITORY || 'Kaluzy/amani';
if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid Pages repository');
const save=async(file,body)=>{const dest=path.join(output,file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,body);};
const assets=['client.js','pages.js','ui.js','deployment.js','shortlist.js','workbench.js','guide.js','design.css','cards.css','premium.css','favicon.svg'];
const sources=new Map(await Promise.all(assets.map(async asset=>[asset,await readFile(path.join(root,'public',asset),'utf8')])));
const revision=(process.env.GITHUB_SHA || createHash('sha256').update([...sources.values()].join('\n')+await readFile(path.join(root,'package-lock.json'),'utf8')).digest('hex')).slice(0,12);
const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
try{
  const get=async(endpoint)=>{const response=await fetch(origin+endpoint);if(!response.ok)throw new Error(`${endpoint}: ${response.status}`);return response.json();};
  const repos=await get('/api/repos');const topics=await get('/api/topics');
  const routes=['/','/daily','/weekly','/monthly','/yearly','/stats','/insights','/live','/topics','/github-trending','/workbench','/guide','/submit','/about','/privacy','/terms','/contact',...repos.map(r=>'/repositories/'+r.full_name),...topics.map(t=>'/topics/'+encodeURIComponent(t.slug))];
  let shell=await readFile(path.join(root,'public/shell.html'),'utf8');
  shell=shell.replace('<head>',`<head>\n  <meta name="amani-base" content="${base}">\n  <meta name="amani-hosting" content="github-pages">\n  <meta name="amani-repository" content="https://github.com/${repository}">`)
    .replace(/(href|src)="\/(?!\/)/g,`$1="${base}/`)
    .replace('Find. Compare. Build.','Find. Compare. Build. · Public snapshots')
    .replace(/(src|href)="(\/[^"?]+\.(?:js|css|svg))(?:\?[^\"]*)?"/g,`$1="$2?v=${revision}"`);
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const titles={'/':'Your open-source field guide','/daily':'Daily discoveries','/weekly':'Weekly discoveries','/monthly':'Monthly discoveries','/yearly':'Observed yearly growth','/stats':'Collection statistics','/insights':'Open-source signals','/live':'Latest recorded activity','/topics':'Browse topics','/github-trending':'Explore the collection','/workbench':'Your comparison workbench','/guide':'From interesting to useful: the Amani field guide','/submit':'Suggest a repository','/about':'Our methodology and data','/privacy':'Privacy','/terms':'Terms','/contact':'Contact'};
  const repoMap=new Map(repos.map(repo=>['/repositories/'+repo.full_name,repo]));
  for(const route of routes){
    const repo=repoMap.get(route);
    const title=(titles[route] || (repo ? repo.full_name : 'Topic: '+decodeURIComponent(route.slice('/topics/'.length))))+' — Amani';
    const description=repo ? `Explore ${repo.full_name} on Amani. Compare public project signals, inspect the source, and save it to your workbench.` : 'Discover open-source projects, compare the evidence, and choose your next building block with Amani’s independent field guide.';
    const canonical=siteOrigin+base+(route==='/'?'/':route+'/');
    const page=shell.replace(/<title>.*?<\/title>/,`<title>${escape(title)}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escape(description)}">`)
      .replace('</head>',`  <link rel="canonical" href="${escape(canonical)}">\n  <meta property="og:title" content="${escape(title)}">\n  <meta property="og:description" content="${escape(description)}">\n  <meta property="og:type" content="website">\n  <meta property="og:url" content="${escape(canonical)}">\n  ${route==='/workbench'?'<meta name="robots" content="noindex,follow">':''}\n</head>`);
    await save(route==='/'?'index.html':path.join(decodeURIComponent(route.slice(1)),'index.html'),page);
  }
  await save('404.html',shell.replace('</head>','<meta name="robots" content="noindex,follow"></head>'));await save('.nojekyll','');
  await save('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+routes.filter(route=>route!=='/workbench').map(route=>`<url><loc>${escape(siteOrigin+base+(route==='/'?'/':route+'/'))}</loc></url>`).join('')+'</urlset>');
  for(const asset of assets){
    const source=sources.get(asset);
    await save(asset,asset.endsWith('.js')?source.replace(/(\bfrom\s*['"])(\.\/[^'"?]+\.js)(['"])/g,`$1$2?v=${revision}$3`):source);
  }
  await mkdir(path.join(output,'vendor'),{recursive:true});
  await copyFile(path.join(root,'node_modules/chart.js/dist/chart.umd.js'),path.join(output,'vendor/chart.js'));
  await copyFile(path.join(root,'node_modules/chart.js/LICENSE.md'),path.join(output,'vendor/chart.LICENSE.md'));
  const endpoints=['/api/status','/api/repos','/api/repos/daily','/api/repos/weekly','/api/repos/monthly','/api/repos/yearly','/api/stats','/api/stats/languages','/api/stats/charts','/api/insights','/api/live-mentions','/api/topics',...repos.map(r=>'/api/repos/detail/'+r.full_name),...topics.map(t=>'/api/topics/'+encodeURIComponent(t.slug)+'/repos')];
  for(const endpoint of endpoints) await save('data'+decodeURIComponent(endpoint.slice(4))+'.json',JSON.stringify(await get(endpoint)));
  await exportPublicSeed(path.join(output,'data/public-seed.json'));
  await save('release-manifest.json',JSON.stringify({routes,endpoints,assets,base,origin:siteOrigin}));
  await save('build.json',JSON.stringify({built_at:new Date().toISOString(),commit:process.env.GITHUB_SHA || null,assetRevision:revision,version:'3.1.0',repository,routes:routes.length,repositories:repos.length,base,hosting:'github-pages'}));
  console.log(`Built ${routes.length} routes and ${endpoints.length} public JSON endpoints in ${output}`);
}finally{await new Promise(resolve=>server.close(resolve));db.close();}
