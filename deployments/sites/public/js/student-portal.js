const base=(window.SADARA_API_BASE||'').replace(/\/$/,'');
const loginPanel=document.getElementById('student-login-panel');
const results=document.getElementById('student-results');
const form=document.getElementById('student-login-form');
const feedback=document.getElementById('student-login-feedback');
const liveStatus=document.getElementById('student-live-status');
let active=false,serial=0,loading=false,timer,loggingIn=false;
async function api(path,options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(base+path,{...options,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.message||'تعذر تحميل بيانات الطالب.');error.status=response.status;throw error;}
  return data;
 }catch(error){if(error.name==='AbortError')throw new Error('انتهت مهلة الاتصال. حاول مجددًا.');if(error instanceof TypeError)throw new Error('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مجددًا.');throw error;}
 finally{clearTimeout(timeout);}
}
function signedOut(message=''){
 active=false;document.body.classList.remove('student-authenticated');++serial;clearInterval(timer);timer=null;loginPanel.hidden=false;results.hidden=true;
 const password=document.getElementById('student-password');password.value='';password.type='password';
 const toggle=document.getElementById('student-password-toggle');toggle.textContent='إظهار';toggle.setAttribute('aria-pressed','false');
 ['student-result-name','student-result-id','student-result-grade','student-result-updated'].forEach(id=>document.getElementById(id).textContent='');
 feedback.hidden=!message;feedback.textContent=message;liveStatus.textContent='';
}
function render(student){
 if(!student||typeof student.full_name!=='string'||typeof student.university_id!=='string'||typeof student.grade!=='string')throw new Error('تعذر قراءة بيانات الطالب. حاول مجددًا.');
 active=true;document.body.classList.add('student-authenticated');loginPanel.hidden=true;results.hidden=false;feedback.hidden=true;
 document.getElementById('student-password').type='password';document.getElementById('student-password-toggle').textContent='إظهار';document.getElementById('student-password-toggle').setAttribute('aria-pressed','false');
 document.getElementById('student-result-name').textContent=student.full_name;
 document.getElementById('student-result-id').textContent=student.university_id;
 document.getElementById('student-result-grade').textContent=student.grade||'لم تُرصد بعد';
 document.getElementById('student-result-grade').classList.toggle('unpublished',!student.grade);
 const date=new Date(student.updated_at);
 document.getElementById('student-result-updated').textContent=Number.isNaN(date.getTime())?'—':date.toLocaleString('ar-YE',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
 liveStatus.textContent='البيانات محدثة · '+new Date().toLocaleTimeString('ar-YE',{hour:'2-digit',minute:'2-digit'});
 if(!timer)timer=setInterval(()=>{if(active&&!document.hidden)refresh(true);},15000);
}
async function refresh(silent=false){
 if(loading)return;loading=true;const current=++serial;
 const button=document.getElementById('student-refresh');button.disabled=true;
 if(active&&!silent)liveStatus.textContent='جاري تحديث بياناتك…';
 try{const student=await api('/api/student/me');if(current===serial)render(student);}
 catch(error){if(current!==serial)return;if(error.status===401)signedOut(active?'انتهت الجلسة. سجّل الدخول مرة أخرى.':'');else if(active)liveStatus.textContent='تعذر التحديث. آخر بيانات معروضة محفوظة حتى عودة الاتصال.';else{feedback.textContent='تعذر الاتصال. يمكنك محاولة تسجيل الدخول.';feedback.hidden=false;}}
 finally{loading=false;button.disabled=false;}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(loggingIn||!form.reportValidity())return;loggingIn=true;
 const current=++serial,button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='جاري تسجيل الدخول…';feedback.hidden=true;
 try{
  const data=await api('/api/student/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({university_id:document.getElementById('student-university-id').value.trim(),password:document.getElementById('student-password').value})});
  if(current===serial){document.getElementById('student-password').value='';render(data.student);document.getElementById('student-results-title').focus();}
 }catch(error){if(current===serial){feedback.textContent=error.message||'تعذر الاتصال بالخادم.';feedback.hidden=false;feedback.focus();}}
 finally{loggingIn=false;button.disabled=false;button.textContent='الدخول إلى نتيجتي ←';}
});
document.getElementById('student-refresh').addEventListener('click',()=>refresh());
document.getElementById('student-logout').addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;++serial;
 try{await api('/api/student/logout',{method:'POST'});signedOut();timer=null;document.getElementById('student-university-id').focus();}
 catch(error){liveStatus.textContent=error.message||'تعذر تسجيل الخروج. حاول مجددًا.';}
 finally{button.disabled=false;}
});
document.getElementById('student-password-toggle').addEventListener('click',event=>{
 const input=document.getElementById('student-password'),show=input.type==='password';input.type=show?'text':'password';event.currentTarget.textContent=show?'إخفاء':'إظهار';event.currentTarget.setAttribute('aria-pressed',String(show));
});
document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden)refresh(true);});
window.addEventListener('focus',()=>{if(active)refresh(true);});
window.addEventListener('pageshow',event=>{if(event.persisted){signedOut();refresh();}});
window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;});
refresh(true);
