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

## النشر على Render

يتضمن الجذر `render.yaml` لبناء الواجهة والباك إند وتشغيلهما في خدمة واحدة، مع نقطة فحص الخدمة `/api/health`. اربط Blueprint بمستودع `oosama122/sadara` وفرع `main` من حساب الاستضافة الجديد.

إعدادات الخدمة:

1. مجلد المصدر هو جذر المستودع (`.`)؛ تحديد `backend` وحده يمنع وصول الخادم إلى `sadara/` و`dashbord/`.
2. أمر البناء: `pip install -r backend/requirements.txt && python backend/manage.py collectstatic --noinput`.
3. أمر التشغيل كما هو محدد في `render.yaml`: الانتقال إلى `backend`، ثم الترحيلات وتهيئة المحتوى وتشغيل Gunicorn.
4. ينشئ Blueprint مفاتيح مستقلة `SECRET_KEY` و`JWT_SECRET` ويعطّل `DEBUG`. يضيف التطبيق `RENDER_EXTERNAL_HOSTNAME` إلى المضيفين المسموحين تلقائياً.
5. لقاعدة جديدة، عيّن بيانات المدير `SADARA_ADMIN_USERNAME` و`SADARA_ADMIN_PASSWORD` في إعدادات الخدمة قبل البداية الأولى. لا تضع كلمات المرور في GitHub؛ ولا تغيّر هذه المتغيرات كلمات مرور الحسابات الموجودة.

لحفظ طلبات القبول والرسائل والصور عبر عمليات النشر، يحتاج SQLite والصور إلى قرص دائم. عند إرفاق قرص بالخدمة عند `/var/data`، اضبط `SADARA_DB_PATH=/var/data/sadara.db` و`SADARA_MEDIA_ROOT=/var/data/media`، واستخدم نسخة خدمة واحدة. أقراص Render الدائمة تتطلب خدمة مدفوعة؛ ملف Blueprint الحالي لا يضيف قرصاً أو يطلب ترقية تلقائياً. التخزين المحلي المؤقت في الخدمة المجانية لا يحفظ هذه البيانات بعد الاستبدال أو إعادة التشغيل.

عند نقل خدمة قائمة، انسخ قاعدة البيانات والصور الحالية إلى المسارات الجديدة قبل تحويل التطبيق إليها، واحتفظ بنسخة احتياطية. الخدمة المستقلة الجديدة تبدأ ببياناتها ومفاتيحها الخاصة.

المراجع: [مجلد المصدر في Render](https://render.com/docs/monorepo-support)، [الأقراص الدائمة](https://render.com/docs/disks).
