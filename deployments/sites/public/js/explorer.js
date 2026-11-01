import {filterPrograms, matchingFee, restoreCodes} from './program-utils.mjs?v=4.0.0';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const read = key => {try{return localStorage.getItem(key);}catch{return null;}};
const save = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const applyLink = program => 'admission.html?department=' + encodeURIComponent(program.code) + '#quick-admission-form';
const imageURL = value => {if(typeof value!=='string'||!value.trim())return 'assets/images/hero.png';try{const url=new URL(value,location.href);return ['http:','https:'].includes(url.protocol)?url.href:'assets/images/hero.png';}catch{return 'assets/images/hero.png';}};
const heart = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
let programs = [], fees = [], saved = [], compared = [], limit = 6;
let category = ['medical','tech','saved'].includes(new URLSearchParams(location.search).get('category')) ? new URLSearchParams(location.search).get('category') : 'all';
const explorer = document.querySelector('[data-program-explorer]');
let query = '', noticeTimer, feeState = 'loading';

function announce(message) {
    let status = document.getElementById('explorer-announcement');
    if (!status) {status=document.createElement('div');status.id='explorer-announcement';status.className='explorer-notice';status.setAttribute('role','status');document.body.append(status);}
    status.textContent=message;status.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>status.hidden=true,3500);
}
function tools(program) {
    return `<div class="program-tools"><button type="button" class="program-save" data-program-action="save" data-code="${escape(program.code)}" aria-pressed="false">${heart}<span>حفظ</span></button><button type="button" data-program-action="compare" data-code="${escape(program.code)}" aria-pressed="false"><span aria-hidden="true">⇄</span> أضف للمقارنة</button></div>`;
}
function enhanceCards() {
    document.querySelectorAll('[data-program-code]').forEach(card=>{
        const program=programs.find(item=>item.code===card.dataset.programCode);
        if(!program || card.querySelector('.program-tools'))return;
        if(card.classList.contains('dept-detail-card')) {
            const cover=document.createElement('div');cover.className='program-detail-cover';
            cover.innerHTML=`<img src="${escape(imageURL(program.image_url))}" alt="صورة توضيحية لتخصص ${escape(program.name)}" width="600" height="400" loading="lazy" decoding="async">`;
            cover.querySelector('img').addEventListener('error',event=>{event.currentTarget.src='assets/images/hero.png';},{once:true});
            card.prepend(cover);
            const table=card.querySelector('.table-responsive');
            if(table){const details=document.createElement('details');details.className='program-curriculum';const summary=document.createElement('summary');summary.textContent='عرض المساقات ومجالات العمل';details.append(summary,table);card.append(details);}
            const actions=document.createElement('div');actions.className='program-detail-actions';
            actions.innerHTML=`<a class="btn btn-primary btn-sm" href="${applyLink(program)}">قدّم على هذا التخصص <span aria-hidden="true">←</span></a>${tools(program)}`;
            card.append(actions);
        } else card.querySelector('.dept-card-body')?.insertAdjacentHTML('beforeend',tools(program));
    });
    updateButtons();
}
function updateButtons() {
    document.querySelectorAll('[data-program-action]').forEach(button=>{
        const list=button.dataset.programAction==='save'?saved:compared;
        const active=list.includes(button.dataset.code);button.setAttribute('aria-pressed',String(active));
        if(button.dataset.programAction==='save')button.querySelector('span').textContent=active?'محفوظ':'حفظ';
        else button.innerHTML=`<span aria-hidden="true">${active?'✓':'⇄'}</span> ${active?'في المقارنة':'أضف للمقارنة'}`;
    });
    document.querySelectorAll('[data-saved-count]').forEach(node=>node.textContent=String(saved.length));
}
function filter() {
    if(!explorer)return;
    const matches=filterPrograms(programs,{query,category,saved});
    const home=explorer.dataset.programExplorer==='home';
    const visible=home?matches.slice(0,limit):matches;
    const codes=new Set(visible.map(item=>item.code));
    document.querySelectorAll('[data-program-code]').forEach(card=>card.hidden=!codes.has(card.dataset.programCode));
    document.querySelectorAll('[data-program-category-heading]').forEach(heading=>heading.hidden=!visible.some(program=>program.category===heading.dataset.programCategoryHeading));
    const status=explorer.querySelector('[data-program-count]');
    if(status) status.textContent=home && visible.length<matches.length ? `عرض ${visible.length} من ${matches.length} تخصص` : `${matches.length} تخصص ${category==='saved'?'محفوظ':'متاح لاستكشافه'}`;
    const empty=explorer.querySelector('[data-program-empty]');if(empty)empty.hidden=matches.length>0;
    const more=explorer.querySelector('[data-program-more]');if(more)more.hidden=visible.length>=matches.length;
    explorer.querySelectorAll('[data-program-filter]').forEach(button=>button.setAttribute('aria-pressed',String(category===button.dataset.programFilter)));
    document.querySelectorAll('.dept-card:not([hidden])').forEach(card=>card.classList.add('animated'));
}
function updateTray() {
    const tray=document.getElementById('program-compare-tray');if(!tray)return;
    compared=restoreCodes(compared,programs,3);tray.hidden=!compared.length;
    document.body.classList.toggle('has-comparison',compared.length>0);
    tray.querySelector('[data-compare-count]').textContent=String(compared.length);
    tray.querySelector('[data-compare-names]').textContent=compared.map(code=>programs.find(item=>item.code===code)?.name).join(' · ');
    tray.querySelector('[data-open-comparison]').disabled=compared.length<2;
    updateButtons();
}
function renderComparison() {
    const grid=document.getElementById('comparison-programs');if(!grid)return;
    grid.replaceChildren();
    compared.forEach(code=>{
        const program=programs.find(item=>item.code===code);if(!program)return;
        const fee=matchingFee(program,fees);const card=document.createElement('article');card.className='comparison-program';
        card.innerHTML=`<img src="${escape(imageURL(program.image_url))}" alt="" width="600" height="400"><div class="comparison-program-body"><span class="program-category-label">${program.category==='medical'?'المسار الطبي والصحي':'المسار الإداري والتقني'}</span><h3>${escape(program.name)}</h3><dl><div><dt>مدة الدراسة</dt><dd>${escape(program.duration)}</dd></div><div><dt>الرسوم السنوية المنشورة</dt><dd>${escape(fee?.discounted_fee || fee?.official_fee || 'تواصل مع القبول')}</dd></div></dl><h4>من المساقات</h4><ul>${(Array.isArray(program.courses)?program.courses:[]).slice(0,3).map(course=>`<li>${escape(course.name)}</li>`).join('') || '<li>تفاصيل الخطة لدى القبول</li>'}</ul><a class="btn btn-primary" href="${applyLink(program)}">اختر هذا المسار ←</a><button type="button" class="comparison-remove" data-remove-comparison="${escape(code)}">إزالة من المقارنة</button></div>`;
        card.querySelector('img').addEventListener('error',event=>{event.currentTarget.src='assets/images/hero.png';},{once:true});
        grid.append(card);
    });
    if(!compared.length)grid.innerHTML='<p class="data-feedback">لم تختر تخصصات للمقارنة بعد.</p>';
}
function renderFeePlanner() {
    const select=document.getElementById('fee-program');if(!select)return;
    const previous=select.value || document.getElementById('student-dept')?.value || '';
    select.replaceChildren(new Option('اختر تخصصًا لعرض رسومه',''));
    programs.forEach(program=>select.add(new Option(program.name,program.code)));
    const requested=new URLSearchParams(location.search).get('department');
    const selected=programs.find(program=>program.code===previous || program.name===previous || program.code===requested);
    select.value=selected?.code || '';updateFeePlanner();
}
function updateFeePlanner() {
    const select=document.getElementById('fee-program'), output=document.getElementById('fee-plan-output');if(!select||!output)return;
    const program=programs.find(item=>item.code===select.value);
    if(!program){output.innerHTML='<p class="fee-plan-placeholder">اختر التخصص، وقارن الرسوم السنوية والقسط الأول في مكان واحد.</p>';return;}
    if(feeState!=='loaded'){output.innerHTML='<p class="fee-plan-placeholder">'+(feeState==='error'?'تعذر تحديث الرسوم. أعد المحاولة من جدول الرسوم أدناه.':'جاري تحميل الرسوم المنشورة…')+'</p>';return;}
    const fee=matchingFee(program,fees);
    if(!fee){output.innerHTML=`<p class="fee-plan-placeholder">لم تُنشر رسوم هذا التخصص بعد.</p><a class="btn btn-outline" href="contact.html">استفسر من القبول ←</a>`;return;}
    output.innerHTML=`<div class="fee-plan-values"><div><span>الرسوم الرسمية</span><strong>${escape(fee.official_fee)}</strong></div><div class="fee-plan-highlight"><span>الرسوم بعد الخصم المنشور</span><strong>${escape(fee.discounted_fee || fee.official_fee)}</strong></div><div><span>القسط الأول المنشور</span><strong>${escape(fee.installment || 'لدى القبول')}</strong></div></div><div class="fee-plan-footer"><p>${escape(fee.payment_options)}</p><a class="btn btn-primary btn-sm" href="${applyLink(program)}">التقديم على ${escape(program.name)} ←</a></div>`;
}
function receivePrograms(data) {
    programs=data;
    saved=restoreCodes(read('sadara_saved_programs'),programs);
    compared=restoreCodes(read('sadara_compared_programs'),programs,3);
    enhanceCards();filter();updateTray();renderFeePlanner();
    document.querySelectorAll('[data-pathway-count]').forEach(node=>node.textContent=String(programs.filter(item=>item.category===node.dataset.pathwayCount).length));
}
function init() {
    explorer?.querySelector('[data-program-search]')?.addEventListener('input',event=>{query=event.target.value;limit=6;filter();});
    explorer?.querySelectorAll('[data-program-filter]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.programFilter;limit=6;filter();}));
    explorer?.querySelector('[data-program-reset]')?.addEventListener('click',()=>{query='';category='all';limit=6;explorer.querySelector('[data-program-search]').value='';filter();explorer.querySelector('[data-program-search]').focus();});
    explorer?.querySelector('[data-program-more]')?.addEventListener('click',()=>{limit+=6;filter();});
    document.addEventListener('click',event=>{
        const button=event.target.closest('[data-program-action]');if(!button)return;
        const code=button.dataset.code;if(!programs.some(program=>program.code===code))return;
        if(button.dataset.programAction==='save'){
            saved=saved.includes(code)?saved.filter(item=>item!==code):[...saved,code];save('sadara_saved_programs',saved);filter();updateButtons();
            announce(saved.includes(code)?'حُفظ التخصص في مفضلتك على هذا الجهاز.':'أزيل التخصص من المفضلة.');
        }else{
            if(compared.includes(code))compared=compared.filter(item=>item!==code);
            else if(compared.length<3)compared.push(code);
            else{announce('يمكن مقارنة ثلاثة تخصصات معًا. أزل تخصصًا لإضافة آخر.');return;}
            save('sadara_compared_programs',compared);updateTray();
        }
    });
    const dialog=document.getElementById('program-comparison');
    document.querySelector('[data-open-comparison]')?.addEventListener('click',()=>{renderComparison();dialog?.showModal();});
    document.querySelector('[data-close-comparison]')?.addEventListener('click',()=>dialog?.close());
    dialog?.addEventListener('click',event=>{
        const remove=event.target.closest('[data-remove-comparison]');
        if(remove){compared=compared.filter(code=>code!==remove.dataset.removeComparison);save('sadara_compared_programs',compared);updateTray();renderComparison();dialog.querySelector('[data-close-comparison]').focus();}
        const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();
    });
    document.querySelector('[data-clear-comparison]')?.addEventListener('click',()=>{compared=[];save('sadara_compared_programs',[]);updateTray();});
    document.getElementById('fee-program')?.addEventListener('change',updateFeePlanner);
    window.addEventListener('sadara:departments',event=>receivePrograms(event.detail));
    window.addEventListener('sadara:fees-error',()=>{feeState='error';updateFeePlanner();});
    window.addEventListener('sadara:fees',event=>{feeState='loaded';fees=event.detail;updateFeePlanner();if(dialog?.open)renderComparison();});
    feeState=Array.isArray(window.sadaraFees)?'loaded':'loading';fees=window.sadaraFees || [];if(window.sadaraDepartments)receivePrograms(window.sadaraDepartments);
    const form=document.getElementById('quick-admission-form');
    form?.addEventListener('change',()=>{
        const note=document.getElementById('selected-program-note'),value=document.getElementById('student-dept')?.value;
        if(note){note.hidden=!value;note.textContent=value?'التخصص المختار: '+value:'';}
    });
    form?.dispatchEvent(new Event('change',{bubbles:true}));
    const checkboxes=[...document.querySelectorAll('[data-document-check]')];
    const updateChecklist=()=>{const done=checkboxes.filter(item=>item.checked).length;const progress=document.getElementById('documents-progress');if(progress){progress.value=done;document.getElementById('documents-progress-label').textContent=`جهّزت ${done} من ${checkboxes.length} مستندات`;}};
    checkboxes.forEach(box=>box.addEventListener('change',updateChecklist));updateChecklist();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
