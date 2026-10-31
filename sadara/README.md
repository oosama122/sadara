# كلية الصدارة للعلوم الطبية والتقنية

موقع عربي متجاوب مع لوحة إدارة، يعملان من خادم Django واحد. صفحات الموقع في `sadara/`، ولوحة الإدارة في `dashbord/`، وواجهات البيانات وقاعدة SQLite في `backend/`.

تستخدم الواجهتان نفس خدمات القبول والتخصصات والمعامل والرسوم والرسائل والإعدادات. تتضمن الواجهة مظهراً فاتحاً وداكناً، ونماذج تتحقق من البيانات، ورسائل واضحة لحالة الإرسال والاتصال.

## التشغيل المحلي

نفّذ الأوامر من **جذر المستودع**، باستخدام Python 3.12. قائمة الاعتماديات في `backend/requirements.txt`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
export DEBUG=True
python backend/manage.py migrate
python backend/manage.py seed_site
python backend/manage.py runserver 8000
```

افتح:

- الموقع: <http://127.0.0.1:8000/>
- لوحة الإدارة: <http://127.0.0.1:8000/dashbord/>
- فحص الخدمة: <http://127.0.0.1:8000/api/health>

يضيف `seed_site` المحتوى الافتراضي المفقود، ويحافظ على السجلات الحالية. لا ينشئ طلبات طلاب تجريبية أو مديراً بكلمة مرور افتراضية. لا يكفي فتح ملفات HTML مباشرة أو تشغيل خادم ملفات ثابت لتشغيل خدمات التسجيل والإدارة.

`backend/app.py` مدخل توافق يستخدم تطبيق Django نفسه؛ التشغيل المحلي الموصى به هو `manage.py` كما في الأوامر أعلاه.

## إنشاء حساب الإدارة

عند التهيئة الأولى، عيّن اسم المدير وكلمة مروره عبر متغيرات البيئة ثم شغّل `seed_site`. مثال في Bash يطلب كلمة المرور دون إظهارها:

```bash
export SADARA_ADMIN_USERNAME=admin
read -rs -p 'كلمة مرور المدير: ' SADARA_ADMIN_PASSWORD
export SADARA_ADMIN_PASSWORD
python backend/manage.py seed_site
unset SADARA_ADMIN_USERNAME SADARA_ADMIN_PASSWORD
```

يجب أن تتراوح كلمة المرور بين 12 و72 بايت بترميز UTF-8. يمكن تعيين الاسم المعروض عبر `SADARA_ADMIN_NAME`. يحافظ الأمر على حساب المدير الموجود ولا يعيد تعيين كلمة مروره. تستخدم لوحة الإدارة حسابات التطبيق الموجودة في جدول `users`.

## إعدادات البيئة

ملف `.env.example` قالب للمتغيرات المتاحة. **Django لا يحمّل ملفات `.env` تلقائياً**؛ صدّر القيم في جلسة الطرفية أو أضفها إلى إعدادات منصة الاستضافة. ملفات الأسرار المحلية مستثناة من Git.

| المتغير | الاستخدام |
| --- | --- |
| `DEBUG` | `True` للتطوير، و`False` للإنتاج. |
| `SECRET_KEY` | مفتاح عشوائي طويل مطلوب للإنتاج؛ يرفض التطبيق مفتاح التطوير عند تعطيل `DEBUG`. |
| `JWT_SECRET` | مفتاح مستقل اختياري لجلسات الإدارة؛ يستخدم `SECRET_KEY` عند تركه فارغاً. |
| `ALLOWED_HOSTS` | أسماء المضيفين المسموحة مفصولة بفواصل، دون `https://` أو المسارات. |
| `SADARA_DB_PATH` | مسار SQLite؛ الافتراضي `backend/sadara.db`. |
| `SADARA_MEDIA_ROOT` | مجلد الصور المرفوعة؛ الافتراضي `backend/media/`. |
| `CORS_ALLOWED_ORIGINS` | الأصول المسموحة عند فصل الواجهة عن الخادم، مفصولة بفواصل. |

تستخدم طلبات الواجهة عنوان الموقع نفسه افتراضياً. عند الحاجة إلى واجهة منفصلة، أضف قبل تحميل `js/main.js` في الواجهة المطلوبة:

```html
<script>window.SADARA_API_BASE = 'http://127.0.0.1:8000';</script>
```

ثم أضف أصل الواجهة إلى `CORS_ALLOWED_ORIGINS`. يدعم الموقع العام أيضاً وسم `<meta name="api-base" content="http://127.0.0.1:8000">`. التشغيل من خادم Django واحد لا يحتاج هذه الإعدادات الإضافية.

## الاختبارات

من جذر المستودع وبعد تفعيل البيئة الافتراضية:

```bash
DEBUG=True python backend/manage.py check
DEBUG=True python backend/manage.py makemigrations --check --dry-run
DEBUG=True python backend/manage.py test core --noinput
```

تستخدم اختبارات Django قاعدة اختبار معزولة. تشمل المصادقة، وإرسال الطلبات والرسائل، وصلاحيات الإدارة، وتعديل المحتوى، والتحقق من المدخلات، ورفع الصور، ومسارات الملفات والتخزين المؤقت، وتهيئة المحتوى. يقبل رفع الصور PNG وJPG وGIF وWebP حتى 5 ميجابايت.

لإنشاء بيانات معاينة منفصلة عن بياناتك الحالية، صدّر `SADARA_DB_PATH` لمسار مثل `/tmp/sadara-preview.sqlite3` قبل تشغيل أوامر التهيئة والخادم.

## GitHub

المستودع الحالي: [oosama122/sadara](https://github.com/oosama122/sadara)، والفرع `main`. اسم الاتصال المحلي الخاص به `origin`:

```bash
git push origin main
```

تحقّق من الوجهة عبر `git remote -v` قبل الدفع. يجب أن تشير إلى `oosama122/sadara`.

## النشر على Railway

يستخدم المشروع `Dockerfile` في جذر المستودع لبناء الواجهة والباك إند معاً. يبدأ `backend/start.sh` بترحيل قاعدة البيانات وتهيئة المحتوى، ثم يشغّل Gunicorn على منفذ `PORT` الذي تحدده Railway. يحتوي البناء على ملفات WhiteNoise المجمّعة مسبقاً.

خطوات إعداد حساب مستقل:

1. شغّل `railway login` وأكمل التسجيل في المتصفح بحساب GitHub الجديد. يستخدم Railway خطوة واحدة لتسجيل الدخول وإنشاء حساب جديد عند الحاجة.
2. أنشئ مشروعاً خاصاً بهذا الموقع، وخدمة مرتبطة بمستودع `oosama122/sadara` وفرع `main`. اجعل جذر المصدر هو جذر المستودع كي يتوفر `Dockerfile` والمجلدان `sadara/` و`dashbord/`.
3. أرفق وحدة تخزين دائمة بالخدمة عند `/data`، واضبط `SADARA_DB_PATH=/data/sadara.db` و`SADARA_MEDIA_ROOT=/data/media`. استخدم نسخة خدمة واحدة مع SQLite.
4. اضبط `DEBUG=False`، وأنشئ قيمتين عشوائيتين مستقلتين لـ`SECRET_KEY` و`JWT_SECRET` في متغيرات Railway. لا تحفظ الأسرار في Git.
5. لإنشاء مدير الموقع لأول مرة، عيّن `SADARA_ADMIN_USERNAME` و`SADARA_ADMIN_PASSWORD` قبل التشغيل. يحافظ `seed_site` على الحسابات والسجلات الموجودة.
6. اضبط مسار فحص الخدمة على `/api/health`، ثم أنشئ نطاق Railway للخدمة. يضيف التطبيق `RAILWAY_PUBLIC_DOMAIN` ومضيف فحص الخدمة تلقائياً إلى المضيفين المسموحين.

تحفظ وحدة التخزين طلبات التسجيل والرسائل والصور بعد إعادة النشر. تُنفّذ الترحيلات وقت التشغيل حتى تكون وحدة التخزين مركبة. تستثني `.dockerignore` قواعد البيانات المحلية والصور المرفوعة وملفات الأسرار والبيئات الافتراضية من حاوية النشر؛ تبدأ الخدمة الجديدة ببياناتها ومفاتيحها الخاصة.

لا ينشئ وجود ملفات النشر حساب Railway أو مشروعاً منشوراً تلقائياً؛ يجب إكمال تسجيل الحساب وربط الخدمة أولاً. ملف `render.yaml` يبقى خياراً احتياطياً منفصلاً ولا ينشئ ربطاً بحساب Render.

المراجع: [إنشاء الحساب وتسجيل الدخول](https://docs.railway.com/cli/login)، [نشر Dockerfile](https://docs.railway.com/builds/dockerfiles)، [وحدات التخزين](https://docs.railway.com/volumes)، [فحص الخدمة](https://docs.railway.com/deployments/healthchecks).

## النسخة المنشورة على Sites

الموقع: https://sadara-college-oosama122.alsaifi-3224.chatgpt.site

مصدر النسخة المستضافة المتوافقة مع Cloudflare Workers في `deployments/sites/`. تستخدم قاعدة D1 وتخزين R2 مستقلين. الموقع وصفحة دخول الإدارة عامّان، بينما تتحقق واجهات الإدارة من الجلسة في كل طلب. يمكن الدخول باسم المستخدم وكلمة المرور دون حساب ChatGPT؛ يظل الدخول بهوية المالك خياراً إضافياً. تُحفظ إعدادات `SADARA_ADMIN_USERNAME` و`SADARA_ADMIN_PASSWORD_HASH` و`SADARA_ADMIN_EMAIL` في متغيرات الاستضافة السرية ولا تُضمّن بيانات الدخول في المصدر. تفاصيل الجلسات والتهيئة في `deployments/sites/AUTHENTICATION.md`. يبقى باك إند Django الأصلي متاحاً للنشر التقليدي عبر Docker.
