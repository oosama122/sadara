import seed from './seed.json' with { type: 'json' };
import { refreshDefaultImages } from './image-assets.mjs';

class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const reply = (data, status = 200, headers = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(data, key, limit = 10000, required = true) {
  const value = data[key] ?? '';
  if (typeof value !== 'string') throw new ApiError(`قيمة الحقل ${key} يجب أن تكون نصاً.`);
  if (required && !value.trim()) throw new ApiError(`الحقل ${key} مطلوب.`);
  if (value.trim().length > limit) throw new ApiError(`قيمة الحقل ${key} أطول من الحد المسموح.`);
  return value.trim();
}
async function body(request) {
  const raw = await request.text();
  if (raw.length > 200000) throw new ApiError('حجم البيانات أكبر من المسموح.', 413);
  let data;
  try { data = JSON.parse(raw); } catch { throw new ApiError('صيغة البيانات غير صالحة.'); }
  if (!plain(data)) throw new ApiError('يجب إرسال البيانات ككائن JSON.');
  return data;
}
function method(request, allowed) {
  if (!allowed.includes(request.method)) throw new ApiError('طريقة الطلب غير مسموحة.', 405);
}
function admin(request, env) {
  const configured = String(env.SADARA_ADMIN_EMAIL || '').trim().toLowerCase();
  const email = String(request.headers.get('oai-authenticated-user-email') || '').trim().toLowerCase();
  if (!configured || !email || email !== configured) throw new ApiError('سجّل الدخول بحساب مالك الموقع للوصول إلى الإدارة.', 401);
  let name = request.headers.get('oai-authenticated-user-full-name') || '';
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = ''; }
  }
  return { username: email, full_name: name || 'مدير كلية الصدارة', role: 'superuser' };
}
function rejectCrossOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !['GET', 'HEAD'].includes(request.method)) {
    throw new ApiError('مصدر الطلب غير مسموح.', 403);
  }
}
function database(env) {
  if (!env.DB) throw new ApiError('خدمة البيانات غير متاحة حالياً.', 503);
  return env.DB;
}
const definitions = {
  departments: { table: 'departments', fields: {name:100,code:100,category:50,duration:100,description:20000,icon:100,image_url:20000,careers:20000,courses:'courses'} },
  labs: { table: 'labs', fields: {name:255,category:50,image_url:20000,description:20000,specs:'specs'} },
  fees: { table: 'tuition_fees', fields: {department_name:255,official_fee:100,discounted_fee:100,installment:100,payment_options:255} }
};
function parseContent(row) {
  const item = { ...row };
  for (const key of ['courses', 'specs']) {
    if (key in item) { try { item[key] = JSON.parse(item[key] || '[]'); } catch { item[key] = []; } }
  }
  return item;
}
async function ensureSeed(db) {
  if (await db.prepare('SELECT value FROM settings WHERE key=?').bind('__content_seed_v1').first()) return;
  const statements = Object.entries(seed.settings).map(([key, value]) => db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind(key, value));
  for (const [resource, definition] of Object.entries(definitions)) {
    const fields = Object.keys(definition.fields);
    for (const item of seed[resource]) {
      const unique = resource === 'departments' ? 'code' : resource === 'fees' ? 'department_name' : 'name';
      statements.push(db.prepare(`INSERT INTO ${definition.table} (${fields.join(',')}) SELECT ${fields.map(() => '?').join(',')} WHERE NOT EXISTS (SELECT 1 FROM ${definition.table} WHERE ${unique}=?)`).bind(
        ...fields.map(key => Array.isArray(item[key]) ? JSON.stringify(item[key]) : item[key]), item[unique]
      ));
    }
  }
  statements.push(db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('__content_seed_v1', '1'));
  await db.batch(statements);
}
function contentValues(definition, data) {
  const values = {};
  for (const [key, limit] of Object.entries(definition.fields)) {
    if (!(key in data)) throw new ApiError(`الحقل ${key} مطلوب.`);
    if (limit === 'courses' || limit === 'specs') {
      const value = data[key];
      if (!Array.isArray(value) || value.length > 100) throw new ApiError(`الحقل ${key} يجب أن يكون قائمة بحد أقصى 100 عنصر.`);
      if (key === 'courses') {
        values[key] = value.map(course => {
          if (!plain(course)) throw new ApiError('بيانات المساقات غير صالحة.');
          return { code: text(course, 'code', 500, false), name: text(course, 'name', 500), type: text(course, 'type', 500, false) };
        });
      } else {
        if (value.some(spec => typeof spec !== 'string' || !spec.trim() || spec.length > 500)) throw new ApiError('مواصفات المعمل يجب أن تكون نصوصاً غير فارغة.');
        values[key] = value;
      }
    } else values[key] = text(data, key, limit, !['description','careers','image_url','icon'].includes(key));
  }
  if ('category' in values && !['medical','tech'].includes(values.category)) throw new ApiError('نوع القسم يجب أن يكون طبياً أو تقنياً.');
  if ('code' in values && !/^[a-zA-Z0-9_-]+$/.test(values.code)) throw new ApiError('رمز التخصص يجب أن يحتوي حروفاً إنجليزية وأرقاماً وشرطات فقط.');
  return Object.entries(values).map(([key,value]) => [key, Array.isArray(value) ? JSON.stringify(value) : value]);
}
const contactItem = row => ({ ...row, is_read: Boolean(row.is_read) });
async function upload(request, env) {
  admin(request, env);
  if (!env.BUCKET) throw new ApiError('خدمة رفع الصور غير متاحة حالياً.', 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 6 * 1024 * 1024) throw new ApiError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.', 413);
  let data;
  try { data = await request.formData(); } catch { throw new ApiError('يرجى اختيار صورة للرفع.'); }
  const file = data.get('file');
  if (!file || typeof file === 'string' || !file.size) throw new ApiError('يرجى اختيار صورة للرفع.');
  if (file.size > 5 * 1024 * 1024) throw new ApiError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
  const bytes = new Uint8Array(await file.slice(0,16).arrayBuffer());
  const ext = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase();
  const ascii = (start,end) => String.fromCharCode(...bytes.slice(start,end));
  let mime;
  if (ext === '.png' && bytes[0] === 137 && ascii(1,8) === 'PNG\r\n\x1a\n') mime = 'image/png';
  if (['.jpg','.jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  if (ext === '.gif' && ['GIF87a','GIF89a'].includes(ascii(0,6))) mime = 'image/gif';
  if (ext === '.webp' && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') mime = 'image/webp';
  if (!mime) throw new ApiError('يرجى رفع صورة PNG أو JPG أو GIF أو WebP صالحة.');
  const key = crypto.randomUUID().replaceAll('-','') + ext;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  return reply({ message:'تم رفع الصورة بنجاح.', url:'/media/' + key });
}
export async function handleMedia(request, env) {
  if (!['GET','HEAD'].includes(request.method)) return reply({message:'طريقة الطلب غير مسموحة.'},405);
  const key = new URL(request.url).pathname.slice('/media/'.length);
  if (!/^[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/.test(key) || !env.BUCKET) return new Response('Not found',{status:404});
  const object = await env.BUCKET.get(key);
  if (!object) return new Response('Not found',{status:404});
  const headers = new Headers({'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=86400','ETag':object.httpEtag});
  object.writeHttpMetadata(headers);
  if (request.headers.get('if-none-match') === object.httpEtag) return new Response(null,{status:304,headers});
  return new Response(request.method === 'HEAD' ? null : object.body,{headers});
}
export async function handleApi(request, env) {
  try {
    rejectCrossOrigin(request);
    const path = new URL(request.url).pathname.replace(/\/$/,'');
    if (path === '/api/health') { method(request,['GET']); await database(env).prepare('SELECT 1 AS healthy').first(); return reply({status:'ok'}); }
    if (path === '/api/auth/me') { method(request,['GET']); return reply(admin(request,env)); }
    if (path === '/api/auth/login') { method(request,['POST']); return reply({token:'sites-session',user:admin(request,env)}); }
    if (path === '/api/upload') { method(request,['POST']); return await upload(request,env); }
    const db = database(env);
    await ensureSeed(db);
    await refreshDefaultImages(db);
    if (path === '/api/settings') {
      method(request,['GET','POST']);
      if (request.method === 'GET') {
        const {results} = await db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE '\\_\\_%' ESCAPE '\\'").all();
        return reply(Object.fromEntries(results.map(row => [row.key,row.value])));
      }
      admin(request,env); const data = await body(request); const entries = Object.entries(data);
      if (!entries.length || entries.length > 100) throw new ApiError('لا توجد بيانات صالحة للحفظ.');
      for (const [key,value] of entries) if (!/^[a-z][a-z0-9_]{0,254}$/.test(key) || !['string','number','boolean'].includes(typeof value) || String(value).length > 20000 || (typeof value === 'number' && !Number.isFinite(value))) throw new ApiError('اسم أو قيمة أحد الإعدادات غير صالح.');
      await db.batch(entries.map(([key,value]) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,String(value))));
      return reply({message:'تم تحديث الإعدادات بنجاح.'});
    }
    const match = /^\/api\/(departments|labs|fees)(?:\/(\d+))?$/.exec(path);
    if (match) {
      const [,resource,id] = match; const definition = definitions[resource];
      method(request,id ? ['PUT','DELETE'] : ['GET','POST']);
      if (request.method === 'GET') { const {results} = await db.prepare(`SELECT * FROM ${definition.table} ORDER BY id`).all(); return reply(results.map(parseContent)); }
      admin(request,env);
      if (id && !await db.prepare(`SELECT id FROM ${definition.table} WHERE id=?`).bind(Number(id)).first()) throw new ApiError('العنصر غير موجود.',404);
      if (request.method === 'DELETE') { await db.prepare(`DELETE FROM ${definition.table} WHERE id=?`).bind(Number(id)).run(); return reply({message:'تم الحذف بنجاح.'}); }
      const values = contentValues(definition,await body(request));
      if (id) {
        await db.prepare(`UPDATE ${definition.table} SET ${values.map(([key]) => key+'=?').join(',')} WHERE id=?`).bind(...values.map(([,value]) => value),Number(id)).run();
        return reply({message:'تم التحديث بنجاح.'});
      }
      const result = await db.prepare(`INSERT INTO ${definition.table} (${values.map(([key])=>key).join(',')}) VALUES (${values.map(()=>'?').join(',')})`).bind(...values.map(([,value])=>value)).run();
      return reply({message:'تمت الإضافة بنجاح.',id:result.meta.last_row_id},201);
    }
    if (path === '/api/applicants') {
      method(request,['GET','POST']);
      if (request.method === 'GET') { admin(request,env); const {results} = await db.prepare('SELECT * FROM applicants ORDER BY id DESC').all(); return reply(results); }
      const data = await body(request);
      const name = text(data,'name',255),phone = text(data,'phone',50),stream = text(data,'stream',100),department = text(data,'department',100);
      if (phone.replace(/[^\p{Nd}]/gu,'').length < 7 || !/^[+\p{Nd}\s()-]+$/u.test(phone)) throw new ApiError('يرجى إدخال رقم هاتف صحيح.');
      if (!['scientific','literary'].includes(stream)) throw new ApiError('يرجى اختيار نوع الثانوية.');
      if (!['number','string'].includes(typeof data.gpa) || String(data.gpa).trim() === '') throw new ApiError('يرجى إدخال معدل صحيح.');
      const gpa = Number(data.gpa);
      if (!Number.isFinite(gpa) || gpa < 0 || gpa > 100) throw new ApiError('المعدل يجب أن يكون من 0 إلى 100.');
      const result = await db.prepare('INSERT INTO applicants (name,phone,gpa,stream,department,status,created_at) VALUES (?,?,?,?,?,?,?)').bind(name,phone,gpa,stream,department,'pending',new Date().toISOString()).run();
      const count = await db.prepare("SELECT COUNT(*) AS count FROM applicants WHERE status='pending'").first();
      return reply({message:'تم إرسال طلبك بنجاح.',id:result.meta.last_row_id,pending_count:count.count},201);
    }
    const applicant = /^\/api\/applicants\/(\d+)$/.exec(path);
    if (applicant) {
      method(request,['PUT','DELETE']);admin(request,env); const id = Number(applicant[1]);
      if (!await db.prepare('SELECT id FROM applicants WHERE id=?').bind(id).first()) throw new ApiError('الطلب غير موجود.',404);
      if (request.method === 'DELETE') {await db.prepare('DELETE FROM applicants WHERE id=?').bind(id).run();return reply({message:'تم حذف الطلب.'});}
      const data = await body(request);
      if (!['pending','approved','rejected'].includes(data.status)) throw new ApiError('حالة الطلب غير صالحة.');
      await db.prepare('UPDATE applicants SET status=? WHERE id=?').bind(data.status,id).run();
      return reply({message:'تم تحديث حالة الطلب.',applicant:await db.prepare('SELECT * FROM applicants WHERE id=?').bind(id).first()});
    }
    if (path === '/api/contact') {
      method(request,['GET','POST']);
      if (request.method === 'GET') {admin(request,env);const {results} = await db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC,id DESC').all();return reply(results.map(contactItem));}
      const data = await body(request);
      const values = [['name',255],['email',255],['phone',50],['subject',500],['message',10000]].map(([key,limit])=>text(data,key,limit,key!=='phone'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[1])) throw new ApiError('يرجى إدخال بريد إلكتروني صحيح.');
      const result = await db.prepare('INSERT INTO contact_messages (name,email,phone,subject,message,is_read,created_at) VALUES (?,?,?,?,?,0,?)').bind(...values,new Date().toISOString()).run();
      return reply({message:'تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.',id:result.meta.last_row_id},201);
    }
    const contact = /^\/api\/contact\/(\d+)$/.exec(path);
    if (contact) {
      method(request,['PUT','DELETE']);admin(request,env);const id = Number(contact[1]);
      if (!await db.prepare('SELECT id FROM contact_messages WHERE id=?').bind(id).first()) throw new ApiError('الرسالة غير موجودة.',404);
      if (request.method === 'DELETE') {await db.prepare('DELETE FROM contact_messages WHERE id=?').bind(id).run();return reply({message:'تم حذف الرسالة.'});}
      const data = await body(request);if (typeof data.is_read !== 'boolean') throw new ApiError('حالة القراءة يجب أن تكون true أو false.');
      await db.prepare('UPDATE contact_messages SET is_read=? WHERE id=?').bind(Number(data.is_read),id).run();return reply({message:'تم تحديث الرسالة.'});
    }
    return reply({message:'المسار غير موجود.'},404);
  } catch (error) {
    if (error instanceof ApiError) return reply({message:error.message},error.status);
    if (/unique constraint/i.test(String(error))) return reply({message:'تعذر الحفظ لوجود بيانات مكررة.'},400);
    console.error('Site API request failed', error);
    return reply({message:'تعذر إتمام الطلب حالياً. يرجى المحاولة مجدداً.'},503);
  }
}
