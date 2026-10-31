// Basic, opt-in GA4. An empty measurement ID means no analytics network traffic.
import { basePath } from './deployment.js';

const KEY='amani:analytics-consent:v1';
const id=typeof document==='undefined'?'':document.querySelector('meta[name="amani-ga4"]')?.content || '';
const validID=/^G-[A-Z0-9]{6,20}$/.test(id);
const events=new Set(['save_repository','compare_projects','outbound_click','filter_used','rss_open','search_used']);
let memory='unknown',loaded=false,lastPath='',previousPath='';
const privacySignal=()=>navigator.globalPrivacyControl===true || navigator.doNotTrack==='1' || window.doNotTrack==='1';
function choice(){try{const value=localStorage.getItem(KEY);return ['granted','denied'].includes(value)?value:memory;}catch{return memory;}}
function persist(value){memory=value;try{localStorage.setItem(KEY,value);}catch{/* This tab still honors the choice. */}}
export function analyticsStatus(){return {configured:validID,consent:choice(),blocked:privacySignal()};}
const allowed=()=>validID && choice()==='granted' && !privacySignal();
function tag(){window.dataLayer.push(arguments);}
function pagePath(){return location.origin+location.pathname;}
function referrerOrigin(){try{const url=new URL(document.referrer);return /^https?:$/.test(url.protocol)?url.origin:'';}catch{return '';}}
function enable(){
  if(!allowed())return;
  window['ga-disable-'+id]=false;
  if(loaded)return;
  loaded=true;window.dataLayer=window.dataLayer||[];
  tag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  tag('js',new Date());
  tag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_domain:'none',cookie_path:basePath||'/',cookie_prefix:'amani',cookie_expires:2592000,page_location:pagePath(),page_referrer:referrerOrigin()});
  const script=document.createElement('script');script.async=true;script.id='amaniAnalyticsTag';script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);
  script.addEventListener('error',()=>{document.getElementById('announcements').textContent='Analytics could not load. Browsing still works.';});
  document.head.append(script);
}
function clearCookies(){
  for(const cookie of document.cookie.split(';')){
    const name=cookie.trim().split('=')[0];
    if(!/^amani_ga(?:_|$)/.test(name))continue;
    for(const path of new Set([basePath||'/',(basePath||'')+'/']))document.cookie=`${name}=; Max-Age=0; Path=${path}; SameSite=Lax`;
  }
}
export function analyticsPageView(){
  if(!allowed())return;
  enable();const path=pagePath();if(path===lastPath)return;
  previousPath=lastPath;lastPath=path;
  tag('event','page_view',{page_location:path,page_referrer:previousPath||referrerOrigin(),page_title:document.title,send_to:id});
}
export function trackAction(name){
  if(!events.has(name)||!allowed())return;
  enable();tag('event',name,{page_location:pagePath(),page_referrer:'',send_to:id});
}
export function showAnalyticsSettings(){
  document.getElementById('analyticsPanel')?.remove();
  const panel=document.createElement('section');panel.id='analyticsPanel';panel.className='analytics-panel';panel.setAttribute('role','region');panel.setAttribute('aria-label','Optional visitor analytics');
  const blocked=privacySignal();
  const title=document.createElement('h2');title.textContent='Your analytics choice';
  const text=document.createElement('p');text.textContent=!validID?'Visitor analytics is not configured. No Google Analytics tag is loaded.':blocked?'Your browser requests privacy protection. Analytics stays off.':'Optional Google Analytics helps us understand page visits and which tools people use. It may store analytics cookies. We omit search terms, shared comparisons and advertising features. You can change your choice here at any time.';
  const actions=document.createElement('div');actions.className='analytics-actions';
  const close=()=>{panel.remove();document.getElementById('analyticsSettings')?.focus();};
  const button=(label,callback)=>{const element=document.createElement('button');element.className='button';element.textContent=label;element.addEventListener('click',callback);actions.append(element);};
  if(validID&&!blocked){
    button('Decline analytics',()=>{
      const wasLoaded=loaded;persist('denied');window['ga-disable-'+id]=true;clearCookies();close();
      // A clean document prevents an already-loaded SDK from sending later events.
      if(wasLoaded)location.reload();
    });
    button('Allow analytics',()=>{persist('granted');enable();analyticsPageView();close();});
  }
  button('Close',close);panel.append(title,text,actions);document.body.append(panel);
}
export function initAnalytics(){
  document.getElementById('analyticsSettings')?.addEventListener('click',showAnalyticsSettings);
  if(validID&&choice()==='unknown'&&!privacySignal())showAnalyticsSettings();
  if(allowed())enable();
  window.addEventListener('storage',event=>{
    if(event.key!==KEY&&event.key!==null)return;
    if(!allowed()&&loaded){window['ga-disable-'+id]=true;clearCookies();location.reload();}
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.matches('[data-save-repo]'))trackAction('save_repository');
    else if(target.id==='copyComparison')trackAction('compare_projects');
    else if(target.matches('a[href*="/feeds/"]'))trackAction('rss_open');
    else if(target.matches('a[href^="https://"]')&&new URL(target.href).origin!==location.origin)trackAction('outbound_click');
  });
  document.addEventListener('change',event=>{if(event.target.matches('select,[data-finder]'))trackAction('filter_used');});
  document.getElementById('searchForm')?.addEventListener('submit',()=>trackAction('search_used'));
}
