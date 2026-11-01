import {normalizeText} from '../../js/program-utils.mjs?v=4.0.0';
const base=(window.SADARA_API_BASE||'').replace(/\/$/,'');
const panel=document.getElementById('student-accounts-tab-content'),tbody=document.getElementById('student-accounts-body');
const dialog=document.getElementById('student-account-editor'),form=document.getElementById('student-account-form');
const deleteDialog=document.getElementById('student-account-delete');
const notice=document.getElementById('student-accounts-status'),feedback=document.getElementById('student-account-feedback');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let accounts=[],editing=null,deleting=null,loading=false,saving=false,loadVersion=0,deleteBusy=false;
async function api(path,options={}){
 let token;try{token=localStorage.getItem('sadara_token');}catch{}
 const fetcher=typeof window.apiFetch==='function'?window.apiFetch:fetch;
 let response;try{response=await fetcher(base+path,{...options,cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});}catch(error){
  if(error.status===401){accounts=[];if(dialog.open)dialog.close();if(deleteDialog.open)deleteDialog.close();render();}
  if(error instanceof TypeError)throw new Error('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مجددًا.');throw error;
 }
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(data.message||'تعذر تنفيذ الطلب.');error.status=response.status;throw error;}return data;
}
function announce(message,error=false){notice.textContent=message;notice.dataset.state=error?'error':'success';}
function render(){
 const search=normalizeText(document.getElementById('student-account-search').value),filter=document.getElementById('student-grade-filter').value;
 const rows=accounts.filter(item=>normalizeText(item.full_name+' '+item.university_id).includes(search)&&(!filter||(filter==='published'?Boolean(item.grade):!item.grade)));
 tbody.replaceChildren();
 for(const item of rows){
  const row=document.createElement('tr');row.dataset.studentId=String(item.id);
  const date=new Date(item.updated_at),updated=Number.isNaN(date.getTime())?'—':date.toLocaleString('ar-YE',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  row.innerHTML=`<td><strong>${escape(item.full_name)}</strong></td><td><bdi>${escape(item.university_id)}</bdi></td><td><span class="student-admin-grade ${item.grade?'':'unpublished'}">${escape(item.grade||'لم تُرصد بعد')}</span></td><td>${escape(updated)}</td><td><div class="student-row-actions"><button type="button" data-student-edit="${item.id}">تعديل البيانات والدرجة</button><button type="button" data-student-delete="${item.id}" class="student-delete-button">حذف</button></div></td>`;
  tbody.append(row);
 }
 if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.className='empty-state';cell.textContent=accounts.length?'لا توجد حسابات تطابق البحث.':'لم تُضف حسابات طلاب بعد. ابدأ بإضافة طالب.';row.append(cell);tbody.append(row);}
 document.getElementById('student-accounts-count').textContent=`${rows.length} من ${accounts.length} طالب`;
 document.getElementById('student-total-count').textContent=String(accounts.length);
 document.getElementById('student-published-count').textContent=String(accounts.filter(item=>item.grade).length);
}
async function load(){
 const version=++loadVersion;loading=true;document.getElementById('student-accounts-refresh').disabled=true;announce('جاري تحميل حسابات الطلاب…');
 try{const items=await api('/api/students');if(version!==loadVersion)return;accounts=items;render();announce('الحسابات والدرجات محدثة.');}
 catch(error){if(version!==loadVersion)return;if(error.status===401){accounts=[];render();}announce(error.message||'تعذر تحميل الحسابات. حاول مجددًا.',true);}
 finally{if(version===loadVersion){loading=false;document.getElementById('student-accounts-refresh').disabled=false;}}
}
function openEditor(item=null){
 editing=item;form.reset();feedback.hidden=true;
 document.getElementById('student-account-editor-title').textContent=item?'تعديل حساب الطالب ودرجته':'إضافة حساب طالب';
 document.getElementById('account-full-name').value=item?.full_name||'';
 document.getElementById('account-university-id').value=item?.university_id||'';
 document.getElementById('account-grade').value=item?.grade||'';
 const password=document.getElementById('account-password');password.required=!item;password.value='';
 document.getElementById('account-password-help').textContent=item?'اترك كلمة المرور فارغة للاحتفاظ بها. وضع كلمة جديدة ينهي الجلسات السابقة.':'كلمة مرور من 6 أحرف على الأقل؛ سلّمها للطالب بعد حفظ الحساب.';
 dialog.showModal();document.getElementById('account-full-name').focus();
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(saving||!form.reportValidity())return;saving=true;feedback.hidden=true;
 const button=document.getElementById('student-account-save');button.disabled=true;button.textContent='جاري الحفظ…';
 const payload={full_name:document.getElementById('account-full-name').value.trim(),university_id:document.getElementById('account-university-id').value.trim(),grade:document.getElementById('account-grade').value.trim()};
 const password=document.getElementById('account-password').value;if(!editing||password)payload.password=password;
 try{
  const result=await api('/api/students'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  document.getElementById('account-password').value='';dialog.close();await load();announce(result.message);
 }catch(error){feedback.textContent=error.message||'تعذر الحفظ. حاول مجددًا.';feedback.hidden=false;feedback.focus();}
 finally{saving=false;button.disabled=false;button.textContent='حفظ الحساب والدرجة';}
});
dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
dialog.addEventListener('close',()=>{document.getElementById('account-password').value='';});
document.getElementById('student-account-add').addEventListener('click',()=>openEditor());
document.querySelectorAll('[data-student-editor-close]').forEach(button=>button.addEventListener('click',()=>{if(!saving)dialog.close();}));
tbody.addEventListener('click',event=>{
 const edit=event.target.closest('[data-student-edit]'),remove=event.target.closest('[data-student-delete]');
 if(edit){const item=accounts.find(item=>item.id===Number(edit.dataset.studentEdit));if(item)openEditor(item);}
 if(remove){deleting=accounts.find(item=>item.id===Number(remove.dataset.studentDelete));if(deleting){document.getElementById('student-delete-name').textContent=deleting.full_name+' — '+deleting.university_id;document.getElementById('student-delete-feedback').hidden=true;deleteDialog.showModal();}}
});
deleteDialog.addEventListener('cancel',event=>{if(deleteBusy)event.preventDefault();});
document.getElementById('student-delete-cancel').addEventListener('click',()=>{if(!deleteBusy)deleteDialog.close();});
document.getElementById('student-delete-confirm').addEventListener('click',async event=>{
 if(!deleting||deleteBusy)return;deleteBusy=true;const button=event.currentTarget;button.disabled=true;document.getElementById('student-delete-cancel').disabled=true;
 try{await api('/api/students/'+deleting.id,{method:'DELETE'});deleteDialog.close();deleting=null;await load();announce('تم حذف حساب الطالب وإنهاء جلساته.');}
 catch(error){const message=document.getElementById('student-delete-feedback');message.textContent=error.message||'تعذر الحذف. حاول مجددًا.';message.hidden=false;}
 finally{deleteBusy=false;button.disabled=false;document.getElementById('student-delete-cancel').disabled=false;}
});
document.getElementById('student-account-search').addEventListener('input',render);
document.getElementById('student-grade-filter').addEventListener('change',render);
document.getElementById('student-accounts-refresh').addEventListener('click',load);
window.addEventListener('sadara:students-open',load);
if(panel.style.display!=='none')load();
