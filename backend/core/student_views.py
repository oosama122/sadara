"""Private student results and administrator-managed student credentials."""
import hashlib
import hmac
import math
import re
import secrets
import time
import unicodedata
from functools import wraps

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from core.models import StudentAccount, StudentLoginLimit, StudentSession
from core.views import APIError, json_body, verify_token

COOKIE = '__Host-sadara_student'
SESSION_SECONDS = 8 * 60 * 60
WINDOW_SECONDS = 15 * 60


class StudentError(Exception):
    def __init__(self, message, status=400, headers=None):
        super().__init__(message)
        self.status = status
        self.headers = headers or {}


def endpoint(methods, admin=False):
    def decorate(view):
        @csrf_exempt
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            try:
                if request.method not in methods:
                    raise StudentError('طريقة الطلب غير مسموحة.', 405, {'Allow': ', '.join(methods)})
                origin = request.headers.get('Origin')
                if origin and request.method not in ('GET', 'HEAD') and origin.rstrip('/') != request.build_absolute_uri('/').rstrip('/'):
                    raise StudentError('مصدر الطلب غير مسموح.', 403)
                if admin and not verify_token(request):
                    raise StudentError('يلزم تسجيل الدخول إلى الإدارة.', 401)
                response = view(request, *args, **kwargs)
            except StudentError as error:
                response = JsonResponse({'message': str(error)}, status=error.status)
                for key, value in error.headers.items():
                    response[key] = value
            except APIError as error:
                response = JsonResponse({'message': str(error)}, status=400)
            except IntegrityError:
                response = JsonResponse({'message': 'هذا الرقم الجامعي مستخدم لحساب آخر.'}, status=409)
            response['Cache-Control'] = 'no-store'
            response['Vary'] = 'Cookie'
            response['X-Content-Type-Options'] = 'nosniff'
            return response
        return wrapped
    return decorate


def normalize_id(value):
    if not isinstance(value, str):
        raise StudentError('يرجى إدخال الرقم الجامعي.')
    value = unicodedata.normalize('NFKC', value).strip().translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')).upper()
    if not re.fullmatch(r'[A-Z0-9][A-Z0-9/_-]{0,49}', value):
        raise StudentError('الرقم الجامعي يقبل الأرقام والحروف الإنجليزية والشرطات فقط، بحد أقصى 50 رمزًا.')
    return value


def password_hash(password):
    salt = secrets.token_hex(16)
    result = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 100000).hex()
    return f'pbkdf2-sha256$100000${salt}${result}'


def password_valid(password, stored):
    match = re.fullmatch(r'pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})', stored or '')
    salt, expected = match.groups() if match else ('0' * 32, '0' * 64)
    result = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 100000).hex()
    return hmac.compare_digest(result, expected) and bool(match)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def session_token(request):
    value = request.COOKIES.get(COOKIE, '')
    return value if re.fullmatch(r'[a-f0-9]{64}', value) else None


def set_cookie(response, value, age=SESSION_SECONDS):
    response.set_cookie(COOKIE, value, max_age=age, path='/', secure=True, httponly=True, samesite='Strict')
    return response


def student_json(student):
    return {'id': student.id, 'university_id': student.university_id, 'full_name': student.full_name,
            'grade': student.grade, 'created_at': student.created_at.isoformat(), 'updated_at': student.updated_at.isoformat()}


@endpoint(('GET', 'POST'), admin=True)
def students(request):
    if request.method == 'GET':
        return JsonResponse([student_json(item) for item in StudentAccount.objects.order_by('-id')], safe=False)
    item = save_student(json_body(request))
    return JsonResponse({'message': 'تم إنشاء حساب الطالب.', 'student': student_json(item)}, status=201)


def save_student(data, student=None):
    university_id = normalize_id(data.get('university_id'))
    name = data.get('full_name')
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 255:
        raise StudentError('يرجى إدخال اسم الطالب بحد أقصى 255 حرفًا.')
    grade = data.get('grade', '')
    if isinstance(grade, bool) or not isinstance(grade, (str, int, float)) or isinstance(grade, float) and not math.isfinite(grade):
        raise StudentError('يرجى إدخال الدرجة كنص أو رقم.')
    grade = str(grade).strip()
    if len(grade) > 100:
        raise StudentError('الدرجة يجب ألا تتجاوز 100 حرف.')
    password = data.get('password')
    if student is None or 'password' in data and password != '':
        if not isinstance(password, str) or not 6 <= len(password.encode('utf-16-le')) // 2 <= 128:
            raise StudentError('كلمة المرور يجب أن تكون بين 6 و128 حرفًا.')
    if StudentAccount.objects.filter(university_id=university_id).exclude(pk=student.pk if student else None).exists():
        raise StudentError('هذا الرقم الجامعي مستخدم لحساب طالب آخر.', 409)
    changed = student is None or bool(password) or student.university_id != university_id
    item = student or StudentAccount()
    if password:
        item.password_hash = password_hash(password)
    if changed:
        item.credential_version = secrets.token_hex(16)
    item.university_id, item.full_name, item.grade = university_id, name.strip(), grade
    with transaction.atomic():
        item.save()
        if changed:
            StudentSession.objects.filter(student=item).delete()
    return item


@endpoint(('PUT', 'DELETE'), admin=True)
def student_detail(request, student_id):
    item = StudentAccount.objects.filter(pk=student_id).first()
    if not item:
        raise StudentError('حساب الطالب غير موجود.', 404)
    if request.method == 'DELETE':
        item.delete()
        return JsonResponse({'message': 'تم حذف حساب الطالب.'})
    item = save_student(json_body(request), item)
    return JsonResponse({'message': 'تم تحديث بيانات الطالب.', 'student': student_json(item)})


@endpoint(('POST',))
def login(request):
    data = json_body(request)
    university_id = normalize_id(data.get('university_id'))
    password = data.get('password')
    if not isinstance(password, str) or not password or len(password.encode('utf-16-le')) // 2 > 128:
        raise StudentError('يرجى إدخال كلمة مرور صالحة.')
    now = int(time.time())
    client = digest(settings.SECRET_KEY + '\0' + request.META.get('REMOTE_ADDR', 'unknown') + '\0' + university_id)
    with transaction.atomic():
        limit, _ = StudentLoginLimit.objects.select_for_update().get_or_create(client_hash=client, defaults={'window_end': now + WINDOW_SECONDS})
        if limit.window_end <= now:
            limit.failures, limit.window_end = 0, now + WINDOW_SECONDS
        limit.failures += 1
        limit.save()
    if limit.failures > 5:
        raise StudentError('محاولات دخول كثيرة. أعد المحاولة بعد 15 دقيقة.', 429, {'Retry-After': str(max(1, limit.window_end - now))})
    item = StudentAccount.objects.filter(university_id=university_id).first()
    valid = password_valid(password, item.password_hash if item else None)
    if not item or not valid:
        raise StudentError('الرقم الجامعي أو كلمة المرور غير صحيحة.', 401)
    value = secrets.token_hex(32)
    with transaction.atomic():
        StudentSession.objects.filter(expires_at__lte=now).delete()
        StudentLoginLimit.objects.filter(window_end__lte=now).delete()
        StudentLoginLimit.objects.filter(client_hash=client).delete()
        old = session_token(request)
        if old:
            StudentSession.objects.filter(token_hash=digest(old)).delete()
        StudentSession.objects.create(token_hash=digest(value), student=item, credential_version=item.credential_version, expires_at=now + SESSION_SECONDS)
    return set_cookie(JsonResponse({'student': student_json(item)}), value)


@endpoint(('GET',))
def me(request):
    token = session_token(request)
    session = StudentSession.objects.select_related('student').filter(token_hash=digest(token), expires_at__gt=int(time.time())).first() if token else None
    if not session or session.credential_version != session.student.credential_version:
        raise StudentError('انتهت جلستك أو يلزم تسجيل الدخول برقمك الجامعي وكلمة المرور.', 401)
    return JsonResponse(student_json(session.student))


@endpoint(('POST',))
def logout(request):
    token = session_token(request)
    if token:
        StudentSession.objects.filter(token_hash=digest(token)).delete()
    return set_cookie(JsonResponse({'message': 'تم تسجيل خروج الطالب.'}), '', 0)
