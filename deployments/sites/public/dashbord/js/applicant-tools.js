import {normalizeText,csvDocument} from '../../js/program-utils.mjs?v=4.0.0';
const tools=document.getElementById('applicant-tools');
let applicants=[],filtered=[],ready=false;
function applyFilters() {
    if(!tools||!ready)return;
    const query=normalizeText(document.getElementById('applicant-search').value);
    const status=document.getElementById('applicant-status-filter').value;
    const department=document.getElementById('applicant-department-filter').value;
    filtered=applicants.filter(item=>(!status||item.status===status)&&(!department||item.department===department)&&normalizeText([item.name,item.phone,item.department,item.id].join(' ')).includes(query));
    const ids=new Set(filtered.map(item=>String(item.id)));
    const tbody=document.querySelector('#applicants-full-table tbody');
    tbody.querySelectorAll('tr:not([data-applicant-id])').forEach(row=>row.remove());
    tbody.querySelectorAll('[data-applicant-id]').forEach(row=>row.hidden=!ids.has(row.dataset.applicantId));
    if(!filtered.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=7;cell.className='empty-state';cell.textContent=applicants.length?'لا توجد طلبات تطابق البحث. جرّب تعديل المرشحات.':'لا توجد طلبات تسجيل حالياً.';row.append(cell);tbody.append(row);}
    document.getElementById('applicant-results-count').textContent=`${filtered.length} من ${applicants.length} طلب`;
    document.getElementById('applicant-export').disabled=!filtered.length;
}
function receive(data) {
    applicants=data;ready=true;
    const select=document.getElementById('applicant-department-filter'),previous=select.value;
    select.replaceChildren(new Option('كل التخصصات',''));
    [...new Set(data.map(item=>item.department))].sort((a,b)=>a.localeCompare(b,'ar')).forEach(name=>select.add(new Option(name,name)));
    select.value=[...select.options].some(option=>option.value===previous)?previous:'';applyFilters();
}
if(tools){
    document.getElementById('applicant-search').addEventListener('input',applyFilters);
    ['applicant-status-filter','applicant-department-filter'].forEach(id=>document.getElementById(id).addEventListener('change',applyFilters));
    document.getElementById('applicant-clear-filters').addEventListener('click',()=>{document.getElementById('applicant-search').value='';document.getElementById('applicant-status-filter').value='';document.getElementById('applicant-department-filter').value='';applyFilters();document.getElementById('applicant-search').focus();});
    document.getElementById('applicant-export').addEventListener('click',()=>{
        if(!ready||!filtered.length)return;
        const labels={pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض'};
        const rows=[['رقم الطلب','اسم الطالب','التخصص','المعدل','الهاتف','المسار','الحالة','تاريخ التقديم'],...filtered.map(item=>[item.id,item.name,item.department,item.gpa,item.phone,item.stream==='scientific'?'علمي':'أدبي',labels[item.status]||item.status,item.created_at])];
        const url=URL.createObjectURL(new Blob([csvDocument(rows)],{type:'text/csv;charset=utf-8;'}));
        const link=document.createElement('a');link.href=url;link.download='sadara-applicants-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    document.getElementById('applicant-refresh').addEventListener('click',()=>window.loadApplicantsDashboard?.());
    window.addEventListener('sadara:applicants-loading',()=>{ready=false;document.getElementById('applicant-export').disabled=true;document.getElementById('applicant-results-count').textContent='جاري تحديث الطلبات…';});
    window.addEventListener('sadara:applicants',event=>receive(event.detail));
    window.addEventListener('sadara:applicants-error',()=>{ready=false;document.getElementById('applicant-export').disabled=true;document.getElementById('applicant-results-count').textContent='تعذر تحديث الطلبات. اضغط تحديث للمحاولة.';});
    if(window.sadaraAdminApplicants)receive(window.sadaraAdminApplicants);
}
