import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync} from 'node:crypto';
import {handleApi,handleMedia} from '../app/server/service.mjs';
import {imageReplacements,refreshDefaultImages} from '../app/server/image-assets.mjs';

const loginCredentials={username:'test-admin',password:'test-only-password'};
const testSalt='0123456789abcdef0123456789abcdef';
const passwordHash='pbkdf2-sha256$100000$'+testSalt+'$'+pbkdf2Sync(loginCredentials.password,Buffer.from(testSalt,'hex'),100000,32,'sha256').toString('hex');

function fixture(t) {
 const sqlite = new DatabaseSync(':memory:');
 const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const migration of journal.entries) sqlite.exec(readFileSync(new URL('../drizzle/'+migration.tag+'.sql',import.meta.url),'utf8'));
 t.after(()=>sqlite.close());
 const prepare = (sql,args=[])=>({bind:(...a)=>prepare(sql,a),first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>{const result=sqlite.prepare(sql).run(...args);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:result.changes}};}});
 const db={prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const files=new Map();const bucket={put:async(key,data,opts)=>{files.set(key,{data:new Uint8Array(data),type:opts.httpMetadata.contentType});},get:async key=>{const file=files.get(key);return file?{body:file.data,httpEtag:'"'+key+'"',writeHttpMetadata:headers=>headers.set('Content-Type',file.type)}:null;}};
 const env={DB:db,BUCKET:bucket,SADARA_ADMIN_EMAIL:'owner@example.test',SADARA_ADMIN_USERNAME:loginCredentials.username,SADARA_ADMIN_PASSWORD_HASH:passwordHash};
 const owner={'oai-authenticated-user-email':'owner@example.test','oai-authenticated-user-id':'owner-id'};
 const call=async(path,{method='GET',body,admin=false,headers={}}={})=>handleApi(new Request('https://college.test'+path,{method,headers:{...(admin?owner:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 return {sqlite,env,owner,call,files};
}
const applicant={name:'طالب اختبار',phone:'+967777123456',gpa:88.5,stream:'scientific',department:'صيدلة'};
const contact={name:'طالب اختبار',email:'student@example.com',phone:'',subject:'طلب معلومات',message:'استفسار عن التخصصات.'};

test('existing content replaces broken default images once and preserves owner changes',async t=>{
 const {call,sqlite,env}=fixture(t);
 await call('/api/departments');
 sqlite.prepare('DELETE FROM settings WHERE key=?').run('__image_assets_v2');
 const [oldUrl,newUrl]=imageReplacements[0];
 sqlite.prepare('UPDATE departments SET image_url=? WHERE code=?').run(oldUrl,'pharmacy');
 sqlite.prepare('UPDATE labs SET image_url=? WHERE id=?').run(oldUrl,1);
 sqlite.prepare('UPDATE departments SET image_url=? WHERE code=?').run('/media/owner-photo.webp','nursing');
 const response=await call('/api/departments');
 const departments=await response.json();
 assert.equal(departments.find(row=>row.code==='pharmacy').image_url,newUrl);
 assert.equal(departments.find(row=>row.code==='nursing').image_url,'/media/owner-photo.webp');
 assert.equal(sqlite.prepare('SELECT image_url FROM labs WHERE id=1').get().image_url,newUrl);
 sqlite.prepare('UPDATE departments SET image_url=? WHERE code=?').run('/media/new-owner-photo.webp','pharmacy');
 await refreshDefaultImages(env.DB);
 assert.equal(sqlite.prepare('SELECT image_url FROM departments WHERE code=?').get('pharmacy').image_url,'/media/new-owner-photo.webp');
 assert.ok(!('__image_assets_v2' in await (await call('/api/settings')).json()));
});

test('health verifies the database and returns no-store JSON',async t=>{const {call}=fixture(t);const response=await call('/api/health');assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await handleApi(new Request('https://college.test/api/health'),{})).status,503);});
test('public defaults seed once and exclude internal keys',async t=>{const {call}=fixture(t);const settings=await (await call('/api/settings')).json();assert.equal(settings.top_email,'info@alsadara.edu.ye');assert.ok(!('__content_seed_v1' in settings));for(let i=0;i<3;i++){assert.equal((await (await call('/api/departments')).json()).length,11);assert.equal((await (await call('/api/labs')).json()).length,6);}});
test('anonymous bearer markers cannot authorize administrative requests',async t=>{const {call}=fixture(t);for(const path of ['/api/auth/me','/api/applicants','/api/contact'])assert.equal((await call(path,{headers:{Authorization:'Bearer sites-session'}})).status,401);assert.equal((await call('/api/auth/login',{method:'POST',body:{username:'admin',password:'anything'}})).status,401);});
test('only the configured owner identity can administer',async t=>{const {call}=fixture(t);assert.equal((await call('/api/auth/me',{headers:{'oai-authenticated-user-email':'other@example.test'}})).status,401);const response=await call('/api/auth/me',{admin:true,headers:{'oai-authenticated-user-full-name':encodeURIComponent('أسامة'),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'}});assert.equal((await response.json()).full_name,'أسامة');});
test('public application moves through owner approval and deletion',async t=>{const {call}=fixture(t);let response=await call('/api/applicants',{method:'POST',body:applicant});assert.equal(response.status,201);const {id}=await response.json();response=await call('/api/applicants/'+id,{method:'PUT',admin:true,body:{status:'approved'}});assert.equal((await response.json()).applicant.status,'approved');assert.equal((await (await call('/api/applicants',{admin:true})).json()).length,1);assert.equal((await call('/api/applicants/'+id,{method:'DELETE',admin:true})).status,200);assert.deepEqual(await (await call('/api/applicants',{admin:true})).json(),[]);});
test('invalid applicant values never write private records',async t=>{const {call,sqlite}=fixture(t);for(const [key,value] of [['name',''],['name',[]],['phone','abc'],['stream','unknown'],['gpa',null],['gpa',true],['gpa',[]],['gpa','NaN'],['gpa','Infinity'],['gpa',101],['gpa',-1]])assert.equal((await call('/api/applicants',{method:'POST',body:{...applicant,[key]:value}})).status,400,key);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM applicants').get().n,0);});
test('Arabic phone digits are accepted',async t=>{const {call}=fixture(t);assert.equal((await call('/api/applicants',{method:'POST',body:{...applicant,phone:'٧٧٧١٢٣٤٥٦'}})).status,201);});
test('JSON mutation APIs reject malformed and non-object input',async t=>{const {call,owner,env}=fixture(t);for(const path of ['/api/applicants','/api/contact','/api/settings','/api/departments','/api/labs','/api/fees']){for(const value of [[],null,true,'text'])assert.equal((await call(path,{method:'POST',body:value,admin:true})).status,400,path);const request=new Request('https://college.test'+path,{method:'POST',headers:{...owner,'Content-Type':'application/json'},body:'{'});assert.equal((await handleApi(request,env)).status,400,path);}});
test('contact submission can be read, marked and removed by owner',async t=>{const {call}=fixture(t);const response=await call('/api/contact',{method:'POST',body:contact});assert.equal(response.status,201);const {id}=await response.json();assert.equal((await call('/api/contact/'+id,{method:'PUT',admin:true,body:{is_read:true}})).status,200);assert.equal((await (await call('/api/contact',{admin:true})).json())[0].is_read,true);assert.equal((await call('/api/contact/'+id,{method:'DELETE',admin:true})).status,200);});
test('invalid email and non-boolean read flags are rejected',async t=>{const {call}=fixture(t);assert.equal((await call('/api/contact',{method:'POST',body:{...contact,email:'bad'}})).status,400);const {id}=await (await call('/api/contact',{method:'POST',body:contact})).json();assert.equal((await call('/api/contact/'+id,{method:'PUT',admin:true,body:{is_read:'false'}})).status,400);});
test('settings updates preserve unrelated values and reject reserved keys atomically',async t=>{const {call}=fixture(t);assert.equal((await call('/api/settings',{method:'POST',admin:true,body:{top_phone:'+967777000000'}})).status,200);assert.equal((await call('/api/settings',{method:'POST',admin:true,body:{top_phone:'bad',__content_seed_v1:'bad'}})).status,400);const settings=await (await call('/api/settings')).json();assert.equal(settings.top_phone,'+967777000000');assert.equal(settings.top_email,'info@alsadara.edu.ye');});
test('owner content CRUD covers departments, laboratories and fees',async t=>{const {call}=fixture(t);for(const [resource,data] of [['departments',{name:'اختبار',code:'qa',category:'tech',duration:'سنة',description:'',icon:'fa-laptop',image_url:'',careers:'',courses:[{code:'Q1',name:'اختبار',type:'عملي'}]}],['labs',{name:'اختبار',category:'tech',image_url:'',description:'',specs:['حاسوب']}],['fees',{department_name:'اختبار',official_fee:'100',discounted_fee:'90',installment:'30',payment_options:'3 دفعات'}]]){const response=await call('/api/'+resource,{method:'POST',admin:true,body:data});assert.equal(response.status,201,resource);const {id}=await response.json();assert.equal((await call('/api/'+resource+'/'+id,{method:'PUT',admin:true,body:data})).status,200);assert.equal((await call('/api/'+resource+'/'+id,{method:'DELETE',admin:true})).status,200);assert.ok(!(await (await call('/api/'+resource)).json()).some(item=>item.id===id));}});
test('all administrative writes reject anonymous visitors',async t=>{const {call}=fixture(t);for(const resource of ['settings','departments','labs','fees'])assert.equal((await call('/api/'+resource,{method:'POST',body:{}})).status,401);for(const resource of ['departments','labs','fees','applicants','contact'])assert.equal((await call('/api/'+resource+'/1',{method:'DELETE'})).status,401);});
test('images persist in object storage and support public ETags',async t=>{const {env,owner,files}=fixture(t);const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4yXcAAAAASUVORK5CYII=','base64');const form=new FormData();form.set('file',new File([png],'test.png',{type:'image/png'}));const response=await handleApi(new Request('https://college.test/api/upload',{method:'POST',headers:owner,body:form}),env);assert.equal(response.status,200);const {url}=await response.json();const media=await handleMedia(new Request('https://college.test'+url),env);assert.equal(media.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await media.arrayBuffer()),png);assert.equal(files.size,1);assert.equal((await handleMedia(new Request('https://college.test'+url,{headers:{'If-None-Match':media.headers.get('etag')}}),env)).status,304);assert.equal((await handleMedia(new Request('https://college.test/media/../secret'),env)).status,404);});
test('executable uploads and anonymous uploads are denied',async t=>{const {env,owner}=fixture(t);const form=new FormData();form.set('file',new File(['<svg onload=alert(1)>'],'bad.svg',{type:'image/svg+xml'}));assert.equal((await handleApi(new Request('https://college.test/api/upload',{method:'POST',headers:owner,body:form}),env)).status,400);assert.equal((await handleApi(new Request('https://college.test/api/upload',{method:'POST',body:form}),env)).status,401);});
test('cross-origin administrative writes are blocked',async t=>{const {call}=fixture(t);assert.equal((await call('/api/settings',{method:'POST',admin:true,headers:{Origin:'https://attacker.test'},body:{top_phone:'bad'}})).status,403);});
test('unsupported methods, missing records and routes have explicit statuses',async t=>{const {call}=fixture(t);assert.equal((await call('/api/applicants',{method:'DELETE',admin:true})).status,405);assert.equal((await call('/api/contact/999',{method:'DELETE',admin:true})).status,404);assert.equal((await call('/api/unknown')).status,404);});

async function signIn(call, headers={}) {
 const response=await call('/api/auth/login',{method:'POST',body:loginCredentials,headers});
 assert.equal(response.status,200);
 return {response,cookie:response.headers.get('set-cookie').split(';')[0]};
}
test('password login establishes a private server session without returning its secret',async t=>{
 const {call,sqlite}=fixture(t);const {response,cookie}=await signIn(call);
 const data=await response.json();assert.equal(data.token,'cookie-session');assert.equal(data.user.username,loginCredentials.username);assert.equal(data.user.auth_method,'password');
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.match(cookie,/^__Host-sadara_admin=[a-f0-9]{64}$/);
 const stored=sqlite.prepare('SELECT * FROM admin_sessions').get();assert.notEqual(stored.token_hash,cookie.split('=')[1]);assert.equal(stored.token_hash.length,64);
 const headers={Cookie:cookie};assert.equal((await call('/api/auth/me',{headers})).status,200);assert.equal((await call('/api/applicants',{headers})).status,200);assert.equal((await call('/api/contact',{headers})).status,200);
 assert.equal((await call('/api/settings',{method:'POST',headers,body:{top_phone:'777123456'}})).status,200);
 assert.equal((await call('/api/applicants')).status,401);
});
test('incorrect credentials never create an administrative session',async t=>{
 const {call,sqlite}=fixture(t);
 for(const body of [{...loginCredentials,password:'wrong'},{...loginCredentials,username:'wrong'}]) assert.equal((await call('/api/auth/login',{method:'POST',body})).status,401);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count,0);
 for(const value of ['',null,[],true]) assert.equal((await call('/api/auth/login',{method:'POST',body:{...loginCredentials,password:value}})).status,400);
});
test('logout revokes the session even if its previous cookie is replayed',async t=>{
 const {call}=fixture(t);const {cookie}=await signIn(call);
 const response=await call('/api/auth/logout',{method:'POST',headers:{Cookie:cookie}});
 assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call('/api/auth/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await call('/api/settings',{method:'POST',headers:{Cookie:cookie},body:{top_phone:'bad'}})).status,401);
});
test('expired sessions and changed credentials invalidate prior cookies',async t=>{
 const {call,sqlite,env}=fixture(t);let {cookie}=await signIn(call);
 sqlite.prepare('UPDATE admin_sessions SET expires_at=0').run();assert.equal((await call('/api/auth/me',{headers:{Cookie:cookie}})).status,401);
 ({cookie}=await signIn(call));env.SADARA_ADMIN_PASSWORD_HASH=passwordHash.slice(0,-1)+(passwordHash.endsWith('0')?'1':'0');
 assert.equal((await call('/api/auth/me',{headers:{Cookie:cookie}})).status,401);
});
test('repeated failures throttle each client and recover after the window',async t=>{
 const {call,sqlite}=fixture(t);const headers={'cf-connecting-ip':'192.0.2.10'};
 for(let i=0;i<5;i++) assert.equal((await call('/api/auth/login',{method:'POST',headers,body:{...loginCredentials,password:'wrong'}})).status,401);
 const blocked=await call('/api/auth/login',{method:'POST',headers,body:loginCredentials});assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);
 await signIn(call,{'cf-connecting-ip':'192.0.2.11'});
 sqlite.prepare('UPDATE admin_login_limits SET window_end=0').run();await signIn(call,headers);
});
test('login rotates an existing session and fabricated cookies cannot authorize',async t=>{
 const {call}=fixture(t);const first=await signIn(call);const second=await signIn(call,{Cookie:first.cookie});
 assert.notEqual(first.cookie,second.cookie);assert.equal((await call('/api/auth/me',{headers:{Cookie:first.cookie}})).status,401);
 assert.equal((await call('/api/auth/me',{headers:{Cookie:'__Host-sadara_admin='+'f'.repeat(64)}})).status,401);
 assert.equal((await call('/api/auth/me',{headers:{Authorization:'Bearer '+second.cookie.split('=')[1]}})).status,401);
});
test('cross-origin login and logout cannot create or revoke a session',async t=>{
 const {call}=fixture(t);assert.equal((await call('/api/auth/login',{method:'POST',headers:{Origin:'https://elsewhere.test'},body:loginCredentials})).status,403);
 const {cookie}=await signIn(call);assert.equal((await call('/api/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://elsewhere.test'}})).status,403);
 assert.equal((await call('/api/auth/me',{headers:{Cookie:cookie}})).status,200);
});

const studentRecord={university_id:'2026-CS-001',full_name:'طالب اختبار البوابة',password:'student-test-pass',grade:'95/100'};
async function createStudent(call,overrides={}){
 const response=await call('/api/students',{method:'POST',admin:true,body:{...studentRecord,...overrides}});
 assert.equal(response.status,201);return (await response.json()).student;
}
async function studentSignIn(call,overrides={},headers={}){
 const response=await call('/api/student/login',{method:'POST',body:{university_id:studentRecord.university_id,password:studentRecord.password,...overrides},headers});
 assert.equal(response.status,200);return {response,cookie:response.headers.get('set-cookie').split(';')[0]};
}
test('student accounts start empty and only administrators can create or list them',async t=>{
 const {call,sqlite}=fixture(t);
 assert.equal((await call('/api/students')).status,401);assert.equal((await call('/api/students',{method:'POST',body:studentRecord})).status,401);
 assert.deepEqual(await (await call('/api/students',{admin:true})).json(),[]);
 const student=await createStudent(call);assert.equal(student.grade,'95/100');assert.equal(student.full_name,studentRecord.full_name);
 assert.deepEqual(Object.keys(student).sort(),['created_at','full_name','grade','id','university_id','updated_at']);
 const row=sqlite.prepare('SELECT * FROM student_accounts WHERE id=?').get(student.id);assert.match(row.password_hash,/^pbkdf2-sha256\$100000\$/);assert.ok(!row.password_hash.includes(studentRecord.password));
 assert.ok(!(await (await call('/api/students',{admin:true})).text()).includes('password'));
});
test('a student sees only their own current profile and cannot access administrative operations',async t=>{
 const {call}=fixture(t);const first=await createStudent(call);const other=await createStudent(call,{university_id:'2026-CS-002',full_name:'طالب آخر',grade:'67'});
 const {response,cookie}=await studentSignIn(call);assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const headers={Cookie:cookie};const profile=await (await call('/api/student/me?university_id='+other.university_id,{headers})).json();
 assert.equal(profile.id,first.id);assert.equal(profile.full_name,first.full_name);assert.equal(profile.grade,'95/100');assert.ok(!('password_hash' in profile));assert.ok(!('credential_version' in profile));
 assert.equal((await call('/api/students',{headers})).status,401);assert.equal((await call('/api/students/'+other.id,{method:'PUT',headers,body:{...studentRecord,grade:'100'}})).status,401);
 assert.equal((await call('/api/auth/me',{headers})).status,401);assert.equal((await call('/api/applicants',{headers})).status,401);
 assert.equal((await call('/api/student/me')).status,401);assert.equal((await call('/api/student/'+other.id,{headers})).status,404);
});
test('grade and name changes appear in the existing student session while blank passwords preserve credentials',async t=>{
 const {call,sqlite}=fixture(t);const student=await createStudent(call);const {cookie}=await studentSignIn(call);
 const before=sqlite.prepare('SELECT password_hash,credential_version FROM student_accounts WHERE id=?').get(student.id);
 const response=await call('/api/students/'+student.id,{method:'PUT',admin:true,body:{...studentRecord,password:'',full_name:'الاسم بعد التعديل',grade:'ممتاز'}});assert.equal(response.status,200);
 const after=sqlite.prepare('SELECT password_hash,credential_version FROM student_accounts WHERE id=?').get(student.id);assert.deepEqual(after,before);
 const profileResponse=await call('/api/student/me',{headers:{Cookie:cookie}});assert.equal(profileResponse.headers.get('cache-control'),'no-store');assert.equal(profileResponse.headers.get('vary'),'Cookie');
 const profile=await profileResponse.json();assert.equal(profile.full_name,'الاسم بعد التعديل');assert.equal(profile.grade,'ممتاز');
});
test('password resets revoke existing student sessions and old passwords stop working',async t=>{
 const {call}=fixture(t);const student=await createStudent(call);const {cookie}=await studentSignIn(call);
 assert.equal((await call('/api/students/'+student.id,{method:'PUT',admin:true,body:{...studentRecord,password:'replacement-student-pass'}})).status,200);
 assert.equal((await call('/api/student/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await call('/api/student/login',{method:'POST',body:{university_id:studentRecord.university_id,password:studentRecord.password}})).status,401);
 await studentSignIn(call,{password:'replacement-student-pass'});
});
test('changing a university identifier revokes old sessions and supports the new identifier',async t=>{
 const {call}=fixture(t);const student=await createStudent(call);const {cookie}=await studentSignIn(call);
 assert.equal((await call('/api/students/'+student.id,{method:'PUT',admin:true,body:{...studentRecord,university_id:'2026-CS-099',password:''}})).status,200);
 assert.equal((await call('/api/student/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await call('/api/student/login',{method:'POST',body:{university_id:studentRecord.university_id,password:studentRecord.password}})).status,401);
 await studentSignIn(call,{university_id:'2026-CS-099'});
});
test('university identifiers normalize Arabic digits and case and cannot be duplicated',async t=>{
 const {call}=fixture(t);await createStudent(call,{university_id:'٢٠٢٦-cs-٠٠١'});
 await studentSignIn(call);
 assert.equal((await call('/api/students',{method:'POST',admin:true,body:studentRecord})).status,409);
 assert.equal((await (await call('/api/students',{admin:true})).json()).length,1);
});
test('student logout revokes its cookie without signing out the administrator',async t=>{
 const {call}=fixture(t);await createStudent(call);const adminSession=await signIn(call);const studentSession=await studentSignIn(call);
 const headers={Cookie:adminSession.cookie+'; '+studentSession.cookie};const response=await call('/api/student/logout',{method:'POST',headers});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call('/api/student/me',{headers})).status,401);assert.equal((await call('/api/auth/me',{headers})).status,200);
});
test('deleting a student removes their sessions and does not recreate the account',async t=>{
 const {call,sqlite}=fixture(t);const student=await createStudent(call);const {cookie}=await studentSignIn(call);
 assert.equal((await call('/api/students/'+student.id,{method:'DELETE',admin:true})).status,200);
 assert.equal((await call('/api/student/me',{headers:{Cookie:cookie}})).status,401);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM student_sessions').get().n,0);
 assert.deepEqual(await (await call('/api/students',{admin:true})).json(),[]);assert.equal((await call('/api/students/'+student.id,{method:'DELETE',admin:true})).status,404);
});
test('student credential validation rejects malformed or overlong fields without partial writes',async t=>{
 const {call,sqlite}=fixture(t);
 for(const [key,value] of [['university_id','bad id'],['university_id',[]],['full_name',''],['full_name',true],['password','12345'],['password',null],['grade',[]],['grade',true],['grade','x'.repeat(101)]]){
  assert.equal((await call('/api/students',{method:'POST',admin:true,body:{...studentRecord,[key]:value}})).status,400,key);
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM student_accounts').get().n,0);
 for(const value of [[],null,true,'text'])assert.equal((await call('/api/students',{method:'POST',admin:true,body:value})).status,400);
});
test('unpublished and zero grades remain accurate without guessing results',async t=>{
 const {call}=fixture(t);const student=await createStudent(call,{grade:''});const {cookie}=await studentSignIn(call);
 assert.equal((await (await call('/api/student/me',{headers:{Cookie:cookie}})).json()).grade,'');
 assert.equal((await call('/api/students/'+student.id,{method:'PUT',admin:true,body:{...studentRecord,password:'',grade:0}})).status,200);
 assert.equal((await (await call('/api/student/me',{headers:{Cookie:cookie}})).json()).grade,'0');
});
test('expired, fabricated and bearer-only student credentials cannot authorize',async t=>{
 const {call,sqlite}=fixture(t);await createStudent(call);const {cookie}=await studentSignIn(call);
 assert.equal((await call('/api/student/me',{headers:{Cookie:'__Host-sadara_student='+'f'.repeat(64)}})).status,401);
 assert.equal((await call('/api/student/me',{headers:{Authorization:'Bearer '+cookie.split('=')[1]}})).status,401);
 sqlite.prepare('UPDATE student_sessions SET expires_at=0').run();assert.equal((await call('/api/student/me',{headers:{Cookie:cookie}})).status,401);
});
test('student login throttles per student and client, then recovers after the window',async t=>{
 const {call,sqlite}=fixture(t);await createStudent(call);await createStudent(call,{university_id:'2026-CS-002'});
 const headers={'cf-connecting-ip':'192.0.2.20'};
 for(let i=0;i<5;i++)assert.equal((await call('/api/student/login',{method:'POST',headers,body:{university_id:studentRecord.university_id,password:'wrong'}})).status,401);
 const response=await call('/api/student/login',{method:'POST',headers,body:{university_id:studentRecord.university_id,password:studentRecord.password}});assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);
 await studentSignIn(call,{university_id:'2026-CS-002'},headers);
 sqlite.prepare('UPDATE student_login_limits SET window_end=0').run();await studentSignIn(call,{},headers);
});
test('student login does not reveal whether a valid university identifier exists',async t=>{
 const {call}=fixture(t);await createStudent(call);
 const wrong=await call('/api/student/login',{method:'POST',body:{university_id:studentRecord.university_id,password:'wrong'}});
 const missing=await call('/api/student/login',{method:'POST',body:{university_id:'99999999',password:'wrong'}});
 assert.equal(wrong.status,401);assert.equal(missing.status,401);assert.deepEqual(await wrong.json(),await missing.json());
});
test('cross-origin student and administrative mutations are blocked',async t=>{
 const {call}=fixture(t);await createStudent(call);
 for(const path of ['/api/student/login','/api/student/logout','/api/students'])assert.equal((await call(path,{method:'POST',admin:true,headers:{Origin:'https://attacker.test'},body:studentRecord})).status,403);
});
