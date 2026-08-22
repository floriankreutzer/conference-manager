(function(){
 const RK='conference_requests',NK='conference_notifications_v1';
 const get=()=>{try{return JSON.parse(localStorage.getItem(RK)||'[]')}catch{return[]}};
 let known=new Set(get().map(r=>r.id));
 function notify(r){let list=[];try{list=JSON.parse(localStorage.getItem(NK)||'[]')}catch(_){}const text=`${r.title} wurde zur Prüfung eingereicht.`,key=`Anfrage eingegangen|${r.id}|${text}`;if(list.some(n=>n.key===key))return;list.unshift({id:'N-'+Date.now(),key,title:'Anfrage eingegangen',text,requestId:r.id,at:new Date().toISOString()});localStorage.setItem(NK,JSON.stringify(list.slice(0,30)));window.dispatchEvent(new CustomEvent('conference-notifications-changed'))}
 function check(){const rs=get();rs.forEach(r=>{if(!known.has(r.id))notify(r)});known=new Set(rs.map(r=>r.id))}
 window.addEventListener('conference-request-updated',check);
 document.documentElement.dataset.submitNotifyBuild='2026.08.22.23';
})();