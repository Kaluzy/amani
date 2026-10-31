import { escapeHTML as e, heading, getJSON, card, number, state } from './ui.js';
import { prepareLinks, sitePath, staticMode } from './deployment.js';
import { refreshSaveButtons, savedNames } from './shortlist.js';

export function discussionLinks(query){
  const text=String(query||'').trim().slice(0,160);
  return {reddit:'https://www.reddit.com/search/?q='+encodeURIComponent(text)+'&sort=relevance',x:'https://x.com/search?q='+encodeURIComponent(text)+'&src=typed_query&f=live'};
}
export function filterProjects(repos,filters){
  const query=(filters.q||'').trim().toLowerCase();
  const minimum=Number(filters.min)||0;
  const saved=new Set(filters.saved||[]);
  const rows=repos.filter(repo=>(!query||`${repo.full_name} ${repo.description||''} ${(repo.topics||[]).join(' ')}`.toLowerCase().includes(query))&&(!filters.language||repo.language===filters.language)&&(!filters.license|| (typeof repo.license==='string'?repo.license:repo.license?.name)===filters.license)&&(!filters.active||!repo.archived)&&(!filters.savedOnly||saved.has(repo.full_name))&&(!minimum||(repo.stargazers_count!=null&&repo.stargazers_count>=minimum)));
  return rows.sort((a,b)=>filters.sort==='forks'?(b.forks_count??-1)-(a.forks_count??-1):filters.sort==='updated'?(b.updated_at||'').localeCompare(a.updated_at||''):(b.stargazers_count??-1)-(a.stargazers_count??-1));
}
export async function discover(ctx){
  const repos=await getJSON('/api/repos',ctx.signal);
  const options=(values)=>[...new Set(values.filter(Boolean))].sort().map(value=>`<option value="${e(value)}">${e(value)}</option>`).join('');
  ctx.main.innerHTML=heading('Find a tool that fits.', 'Filter the evidence. Save a shortlist. Share what you discover.', 'PROJECT FINDER')+`<section class="panel finder-panel"><div class="finder-fields"><label>Search<input id="finderQuery" data-finder type="search" placeholder="A project, purpose or topic"></label><label>Language<select id="finderLanguage" data-finder><option value="">Any language</option>${options(repos.map(repo=>repo.language))}</select></label><label>License<select id="finderLicense" data-finder><option value="">Any recorded license</option>${options(repos.map(repo=>typeof repo.license==='string'?repo.license:repo.license?.name))}</select></label><label>Minimum stars<select id="finderMinimum" data-finder><option value="0">Any count</option><option value="100">100+</option><option value="1000">1,000+</option><option value="10000">10,000+</option></select></label><label>Sort by<select id="finderSort" data-finder><option value="stars">Most stars</option><option value="forks">Most forks</option><option value="updated">Recently updated</option></select></label></div><div class="finder-options"><label><input id="finderActive" data-finder type="checkbox"> Exclude archived projects</label><label><input id="finderSaved" data-finder type="checkbox"> My saved projects only</label><button class="button" id="finderReset">Reset filters</button><button class="button" id="finderShare">Copy search link</button></div><p id="finderStatus" class="panel-description" role="status"></p></section><div class="repo-grid" id="finderResults"></div><div class="pagination" id="finderPagination"></div>`;
  const fields={q:'finderQuery',language:'finderLanguage',license:'finderLicense',min:'finderMinimum',sort:'finderSort'};
  for(const [key,id]of Object.entries(fields)){const input=document.getElementById(id);const value=ctx.url.searchParams.get(key);if(value!=null)input.value=value;if(input.tagName==='SELECT'&&!input.value)input.value=key==='min'?'0':key==='sort'?'stars':'';}
  document.getElementById('finderActive').checked=ctx.url.searchParams.get('active')==='1';document.getElementById('finderSaved').checked=ctx.url.searchParams.get('saved')==='1';
  let visible=12;
  const render=()=>{
    const filters=Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,document.getElementById(id).value]));
    filters.active=document.getElementById('finderActive').checked;filters.savedOnly=document.getElementById('finderSaved').checked;filters.saved=savedNames();
    const rows=filterProjects(repos,filters),url=new URL(location.href);url.search='';
    for(const [key,value]of Object.entries(filters))if(['q','language','license','min','sort'].includes(key)&&value&&value!=='0'&&!(key==='sort'&&value==='stars'))url.searchParams.set(key,value);
    if(filters.active)url.searchParams.set('active','1');if(filters.savedOnly)url.searchParams.set('saved','1');history.replaceState(null,'',url);
    document.getElementById('finderStatus').textContent=`${number(rows.length)} matching projects. Stars are attention, not a quality rating. Missing metadata is never estimated.`;
    document.getElementById('finderResults').innerHTML=rows.length?rows.slice(0,visible).map((repo,index)=>card(repo,index,'all')).join(''):state('No matching projects.', 'Try fewer filters or save projects from the collection.');
    document.getElementById('finderPagination').innerHTML=rows.length>visible?'<button class="button" id="finderMore">Load more projects ↓</button>':'';
    document.getElementById('finderMore')?.addEventListener('click',()=>{visible+=12;render();});prepareLinks(ctx.main);refreshSaveButtons(ctx.main);
  };
  const reset=()=>{visible=12;render();};
  for(const input of ctx.main.querySelectorAll('[data-finder]'))input.addEventListener(input.type==='search'?'input':'change',reset);
  document.getElementById('finderReset').addEventListener('click',()=>{for(const [key,id]of Object.entries(fields))document.getElementById(id).value=key==='min'?'0':key==='sort'?'stars':'';document.getElementById('finderActive').checked=false;document.getElementById('finderSaved').checked=false;reset();});
  document.getElementById('finderShare').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);document.getElementById('finderStatus').textContent='Search link copied. The URL contains your selected filters.';}catch{document.getElementById('finderStatus').textContent='Copy the page address to share these filters.';}});
  window.addEventListener('amani:saved-change',render);ctx.signal.addEventListener('abort',()=>window.removeEventListener('amani:saved-change',render),{once:true});render();
}
export function community(ctx){
  ctx.main.innerHTML=heading('Find the conversation.', 'Follow a project beyond its star count. Read what people are actually discussing.', 'COMMUNITY DISCOVERY')+`<section class="panel"><h2>Look up a project or topic</h2><p class="panel-description">Search opens Reddit or X in a new tab. These are external discovery links—not connected feeds, mention counts or social rankings. Results may require a platform account.</p><form id="communityForm"><label class="form-field" for="communityQuery">Repository, GitHub URL or topic<input id="communityQuery" type="search" required maxlength="160" placeholder="github.com/obra/superpowers"></label><button class="button button-dark" type="submit">Find discussions →</button></form><div id="communityLinks" class="community-links" aria-live="polite"></div></section><div class="two-column community-panels"><section class="panel"><h2>Reddit & X rankings</h2><p class="panel-description">Not connected. We do not infer social popularity from GitHub stars or invent mentions. Automated rankings require approved API access, a defined observation window and a published scoring method.</p></section><section class="panel"><h2>Bring discoveries to your reader</h2><p class="panel-description">Subscribe to the latest recorded GitHub collections. No email address or account required.</p>${staticMode?['daily','weekly','monthly'].map(period=>`<a class="button" href="${sitePath('/feeds/'+period+'.xml')}" target="_blank" rel="noopener">${period[0].toUpperCase()+period.slice(1)} RSS ↗</a>`).join(' '):'<p class="panel-description">RSS subscriptions are available on the published static site.</p>'}</section></div>`;
  const input=document.getElementById('communityQuery');input.value=(ctx.url.searchParams.get('q')||'').slice(0,160);
  const render=()=>{const query=input.value.trim().slice(0,160);const container=document.getElementById('communityLinks');container.replaceChildren();if(!query)return;const links=discussionLinks(query);for(const [platform,href]of Object.entries(links)){const link=document.createElement('a');link.className='button';link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`Search ${platform==='x'?'X':'Reddit'} ↗`;container.append(link);}const url=new URL(location.href);url.search='';url.searchParams.set('q',query);history.replaceState(null,'',url);};
  document.getElementById('communityForm').addEventListener('submit',event=>{event.preventDefault();render();});render();prepareLinks(ctx.main);
}
