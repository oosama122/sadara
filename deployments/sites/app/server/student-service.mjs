const COOKIE='__Host-sadara_student';
const SESSION_SECONDS=8*60*60, WINDOW_SECONDS=15*60;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random=bytes=>hex(crypto.getRandomValues(new Uint8Array(bytes)));
const fields='id,university_id,full_name,grade,created_at,updated_at';
const publicStudent=row=>Object.fromEntries(fields.split(',').map(key=>[key,row[key]]));
export class StudentError extends Error {
 constructor(message,status=400,headers={}){super(message);this.status=status;this.headers=headers;}
}
export function normalizeUniversityId(value){
 if(typeof value!=='string')throw new StudentError('يرجى إدخال الرقم الجامعي.');
 const normalized=value.normalize('NFKC').trim().replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x6f0)).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9/_-]{0,49}$/.test(normalized))throw new StudentError('الرقم الجامعي يقبل الأرقام والحروف الإنجليزية والشرطات فقط، بحد أقصى 50 رمزًا.');
 return normalized;
}
async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g),byte=>parseInt(byte,16)),iterations:100000,hash:'SHA-256'},key,256));
}
async function hashPassword(password){const salt=random(16);return `pbkdf2-sha256$100000$${salt}$${await derive(password,salt)}`;}
async function validPassword(password,hash){
 const parts=/^pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(hash||'');
 const computed=await derive(password,parts?.[1]||'0'.repeat(32)),expected=parts?.[2]||'0'.repeat(64);
 let difference=0;for(let i=0;i<64;i++)difference|=computed.charCodeAt(i)^expected.charCodeAt(i);
 return Boolean(parts)&&difference===0;
}
function token(request){const value=(request.headers.get('cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
const cookie=(value,age=SESSION_SECONDS)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export async function studentMe(request,env){
 const value=token(request);if(!value)throw new StudentError('سجّل الدخول برقمك الجامعي وكلمة المرور.',401);
 const row=await env.DB.prepare('SELECT a.* FROM student_accounts a JOIN student_sessions s ON s.student_id=a.id AND s.credential_version=a.credential_version WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(value),Math.floor(Date.now()/1000)).first();
 if(!row)throw new StudentError('انتهت جلستك أو تغيّرت بيانات الدخول. سجّل الدخول مجددًا.',401);
 return publicStudent(row);
}
export async function studentLogin(request,env,data){
 const universityId=normalizeUniversityId(data.university_id);
 if(typeof data.password!=='string'||!data.password||data.password.length>128)throw new StudentError('يرجى إدخال كلمة مرور صالحة.');
 const now=Math.floor(Date.now()/1000),client=await digest((env.SADARA_ADMIN_PASSWORD_HASH||'student-login')+'\0'+(request.headers.get('cf-connecting-ip')||'unknown')+'\0'+universityId);
 await env.DB.prepare('INSERT INTO student_login_limits (client_hash,failures,window_end) VALUES (?,1,?) ON CONFLICT(client_hash) DO UPDATE SET failures=CASE WHEN window_end<=? THEN 1 ELSE failures+1 END,window_end=CASE WHEN window_end<=? THEN excluded.window_end ELSE window_end END').bind(client,now+WINDOW_SECONDS,now,now).run();
 const attempts=await env.DB.prepare('SELECT failures,window_end FROM student_login_limits WHERE client_hash=?').bind(client).first();
 if(attempts.failures>5)throw new StudentError('محاولات دخول كثيرة. أعد المحاولة بعد 15 دقيقة.',429,{'Retry-After':String(Math.max(1,attempts.window_end-now))});
 const account=await env.DB.prepare('SELECT * FROM student_accounts WHERE university_id=?').bind(universityId).first();
 const valid=await validPassword(data.password,account?.password_hash);
 if(!account||!valid)throw new StudentError('الرقم الجامعي أو كلمة المرور غير صحيحة.',401);
 const value=random(32),old=token(request);
 const statements=[env.DB.prepare('DELETE FROM student_sessions WHERE expires_at<=?').bind(now),env.DB.prepare('DELETE FROM student_login_limits WHERE client_hash=? OR window_end<=?').bind(client,now),env.DB.prepare('INSERT INTO student_sessions (token_hash,student_id,credential_version,expires_at) VALUES (?,?,?,?)').bind(await digest(value),account.id,account.credential_version,now+SESSION_SECONDS)];
 if(old)statements.push(env.DB.prepare('DELETE FROM student_sessions WHERE token_hash=?').bind(await digest(old)));
 await env.DB.batch(statements);return {student:publicStudent(account),cookie:cookie(value)};
}
export async function studentLogout(request,env){const value=token(request);if(value)await env.DB.prepare('DELETE FROM student_sessions WHERE token_hash=?').bind(await digest(value)).run();return cookie('',0);}
export async function listStudents(env){return (await env.DB.prepare(`SELECT ${fields} FROM student_accounts ORDER BY id DESC`).all()).results;}
export async function saveStudent(env,data,id=null){
 const universityId=normalizeUniversityId(data.university_id);
 if(typeof data.full_name!=='string'||!data.full_name.trim()||data.full_name.trim().length>255)throw new StudentError('يرجى إدخال اسم الطالب بحد أقصى 255 حرفًا.');
 if(data.grade!==undefined&&typeof data.grade!=='string'&&!(typeof data.grade==='number'&&Number.isFinite(data.grade)))throw new StudentError('يرجى إدخال الدرجة كنص أو رقم.');
 const grade=String(data.grade??'').trim();if(grade.length>100)throw new StudentError('الدرجة يجب ألا تتجاوز 100 حرف.');
 const current=id?await env.DB.prepare('SELECT * FROM student_accounts WHERE id=?').bind(id).first():null;
 if(id&&!current)throw new StudentError('حساب الطالب غير موجود.',404);
 const password=data.password;
 if((!id||password!==undefined&&password!=='')&&(typeof password!=='string'||password.length<6||password.length>128))throw new StudentError('كلمة المرور يجب أن تكون بين 6 و128 حرفًا.');
 if(await env.DB.prepare('SELECT id FROM student_accounts WHERE university_id=? AND id<>?').bind(universityId,id||0).first())throw new StudentError('هذا الرقم الجامعي مستخدم لحساب طالب آخر.',409);
 const changed=!current||Boolean(password)||current.university_id!==universityId;
 const passwordHash=password?await hashPassword(password):current.password_hash;
 const version=changed?random(16):current.credential_version,now=new Date().toISOString();
 if(!id){const result=await env.DB.prepare('INSERT INTO student_accounts (university_id,full_name,password_hash,grade,credential_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(universityId,data.full_name.trim(),passwordHash,grade,version,now,now).run();id=result.meta.last_row_id;}
 else{
  const statements=[env.DB.prepare('UPDATE student_accounts SET university_id=?,full_name=?,password_hash=?,grade=?,credential_version=?,updated_at=? WHERE id=?').bind(universityId,data.full_name.trim(),passwordHash,grade,version,now,id)];
  if(changed)statements.push(env.DB.prepare('DELETE FROM student_sessions WHERE student_id=?').bind(id));await env.DB.batch(statements);
 }
 return publicStudent(await env.DB.prepare('SELECT * FROM student_accounts WHERE id=?').bind(id).first());
}
export async function deleteStudent(env,id){
 if(!await env.DB.prepare('SELECT id FROM student_accounts WHERE id=?').bind(id).first())throw new StudentError('حساب الطالب غير موجود.',404);
 await env.DB.batch([env.DB.prepare('DELETE FROM student_sessions WHERE student_id=?').bind(id),env.DB.prepare('DELETE FROM student_accounts WHERE id=?').bind(id)]);
}
