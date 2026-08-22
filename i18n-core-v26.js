(function(){
 const KEY='conference_language_v1',langs=['de','en'],packs={de:{},en:{}},legacy={},placeholders={};let queued=false;
 const language=()=>langs.includes(localStorage.getItem(KEY))?localStorage.getItem(KEY):'de';
 const format=(s,v={})=>String(s??'').replace(/\{(\w+)\}/g,(_,k)=>v[k]??'');
 const t=(k,v)=>format(packs[language()][k]??packs.de[k]??k,v);
 function register(p){Object.assign(packs.de,p.de||{});Object.assign(packs.en,p.en||{});Object.assign(legacy,p.legacy||{});Object.assign(placeholders,p.placeholders||{})}
 function setLanguage(v){if(!langs.includes(v))return;localStorage.setItem(KEY,v);document.documentElement.lang=v;location.reload()}
 const date=(v,o={day:'2-digit',month:'2-digit',year:'numeric'})=>v?new Date(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+'T12:00:00':v).toLocaleDateString(language()==='en'?'en-GB':'de-DE',o):'';
 const status=s=>t(({Submitted:'status.submitted','In Review':'status.review',Confirmed:'status.confirmed',Rejected:'status.rejected','Change Requested':'status.change',Cancelled:'status.cancelled'})[s]||s);
 const role=v=>t(v==='manager'?'profile.role.manager':'profile.role.employee');
 function dynamic(s){
   if(language()!=='en')return s;let m;
   if((m=s.match(/^(\d+) Teilnehmende$/)))return `${m[1]} participants`;
   if((m=s.match(/^(\d+) Personen$/)))return `${m[1]} people`;
   if((m=s.match(/^Kapazität (\d+) · (\d+) benötigt$/)))return t('room.fit',{capacity:m[1],needed:m[2]});
   if((m=s.match(/^(\d+) Plätze Reserve$/)))return t('room.reserve.many',{count:m[1]});if(s==='1 Platz Reserve')return t('room.reserve.one');
   if((m=s.match(/^Willkommen,\s*(.+)\.$/)))return t('welcome.greeting',{name:m[1]});
   if((m=s.match(/^(\d+) von (\d+) Buchungen angezeigt$/)))return t('manager.shown',{shown:m[1],total:m[2]});
   if((m=s.match(/^(\d+) Buchungen mit Catering$/)))return t('reports.cateringBookings',{count:m[1]});
   if((m=s.match(/^(\d+) % Catering-Abdeckung$/)))return t('reports.coverage',{percent:m[1]});
   if((m=s.match(/^(\d+) Teilnehmende mit Catering$/)))return t('reports.cateringParticipants',{count:m[1]});
   if((m=s.match(/^(\d+)\/(\d+) Kernangaben gepflegt$/)))return t('admin.maintained',{n:m[1],total:m[2]});
   if((m=s.match(/^(.+): Standortinformationen gespeichert\.$/)))return t('admin.siteSaved',{location:m[1]});
   if((m=s.match(/^Neue Anfrage auf Basis von\s+(CR-\S+)$/)))return `New request based on ${m[1]}`;
   if((m=s.match(/^(\d+) Aktion erforderlich$/)))return `${m[1]} action required`;if((m=s.match(/^(\d+) Aktionen erforderlich$/)))return `${m[1]} actions required`;
   if((m=s.match(/^Summe:\s*(\d+)\s*%$/)))return `Total: ${m[1]}%`;
   if((m=s.match(/^(\d+) intern · (\d+) extern$/)))return `${m[1]} internal · ${m[2]} external`;
   if((m=s.match(/^Anfrage (CR-\S+) erstellt · Raum (?:tentative|vorläufig) reserviert\.$/)))return `Request ${m[1]} created · room provisionally reserved.`;
   if((m=s.match(/^(CR-\S+) bestätigt · Kalenderbuchung verbindlich\.$/)))return `${m[1]} confirmed · calendar booking is binding.`;
   if((m=s.match(/^(CR-\S+) abgelehnt · Reservierung freigegeben\.$/)))return `${m[1]} rejected · reservation released.`;
   if((m=s.match(/^(CR-\S+): Änderung angefordert\.$/)))return `${m[1]}: changes requested.`;
   if((m=s.match(/^(CR-\S+) storniert · Raumreservierung freigegeben\.$/)))return `${m[1]} cancelled · room reservation released.`;
   if(s==='Raum wurde zwischenzeitlich gebucht. Bitte einen anderen Raum wählen.')return 'The room was booked in the meantime. Please choose another room.';
   const days={Montag:'Monday',Dienstag:'Tuesday',Mittwoch:'Wednesday',Donnerstag:'Thursday',Freitag:'Friday',Samstag:'Saturday',Sonntag:'Sunday'},months={Januar:'January',Februar:'February',März:'March',April:'April',Mai:'May',Juni:'June',Juli:'July',August:'August',September:'September',Oktober:'October',November:'November',Dezember:'December'};
   let out=s;for(const [a,b] of Object.entries(days))out=out.replace(a,b);for(const [a,b] of Object.entries(months))out=out.replace(a,b);out=out.replace(/ \/ Person/g,' / person');return out;
 }
 function translateSource(s){const raw=String(s??''),k=legacy[raw];return k?t(k):dynamic(raw)}
 function text(n){const raw=n.nodeValue;if(!raw||!raw.trim())return;const a=raw.match(/^\s*/)?.[0]||'',b=raw.match(/\s*$/)?.[0]||'',s=raw.trim(),out=translateSource(s);if(out!==s)n.nodeValue=a+out+b}
 function apply(root=document.body){document.documentElement.lang=language();root.querySelectorAll?.('[data-i18n-key]').forEach(e=>e.textContent=t(e.dataset.i18nKey));const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p=n.parentElement;if(!p||['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(p.tagName))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});let n;while(n=w.nextNode())text(n);root.querySelectorAll?.('[placeholder]').forEach(e=>{const x=placeholders[e.getAttribute('placeholder')];if(x)e.setAttribute('placeholder',x[language()]||x.de)});root.querySelectorAll?.('[aria-label]').forEach(e=>{const v=e.getAttribute('aria-label'),out=translateSource(v);if(out!==v)e.setAttribute('aria-label',out)});const s=document.getElementById('profileLanguage');if(s)s.value=language()}
 function schedule(root=document.body){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply(root)})}
 function observe(){for(const el of [document.querySelector('main.main'),document.querySelector('.sidebar')])if(el&&!el.__cmI18n){const o=new MutationObserver(()=>schedule(el));o.observe(el,{childList:true,subtree:true});el.__cmI18n=o}if(!document.body.__cmI18n){const o=new MutationObserver(m=>{if(m.some(x=>x.addedNodes.length))schedule(document.body)});o.observe(document.body,{childList:true,subtree:false});document.body.__cmI18n=o}}
 window.cmI18n={register,language,setLanguage,t,date,status,role,translateSource,apply,supported:[...langs]};
 function init(){window.CM_I18N_PACKS?.forEach(register);apply();observe();['click','change','input'].forEach(e=>document.addEventListener(e,()=>schedule(),true));['conference-request-updated','conference-notifications-changed','conference-edit-loaded'].forEach(e=>window.addEventListener(e,()=>schedule()));document.documentElement.dataset.i18nBuild='2026.08.22.26'}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
