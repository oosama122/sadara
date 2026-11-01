import datetime
import json
import time

import jwt
from django.conf import settings
from django.test import Client, TestCase

from core.models import StudentAccount, StudentLoginLimit, StudentSession, User


class StudentPortalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create(username='student-test-admin', password_hash='unused-test-hash', full_name='Test Admin', role='superuser')

    def setUp(self):
        self.client = Client()
        self.student = Client()
        token = jwt.encode({'user_id': self.admin.id, 'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)}, settings.JWT_SECRET, algorithm='HS256')
        self.auth = {'HTTP_AUTHORIZATION': 'Bearer ' + token}
        self.data = {'university_id': '2026-CS-001', 'full_name': 'طالب اختبار البوابة', 'password': 'student-test-pass', 'grade': '95/100'}

    def send(self, path, payload, method='post', admin=False, client=None, **headers):
        return getattr(client or self.client, method)(path, data=json.dumps(payload), content_type='application/json', **(self.auth if admin else {}), **headers)

    def create(self, **overrides):
        response = self.send('/api/students', {**self.data, **overrides}, admin=True)
        self.assertEqual(response.status_code, 201)
        return response.json()['student']

    def login_student(self, **overrides):
        response = self.send('/api/student/login', {'university_id': self.data['university_id'], 'password': self.data['password'], **overrides}, client=self.student)
        self.assertEqual(response.status_code, 200)
        return response

    def test_only_admin_can_create_list_and_update_accounts(self):
        self.assertEqual(self.client.get('/api/students').status_code, 401)
        self.assertEqual(self.send('/api/students', self.data).status_code, 401)
        self.assertEqual(self.client.get('/api/students', **self.auth).json(), [])
        item = self.create()
        self.assertNotIn('password_hash', item)
        self.assertNotIn('credential_version', item)
        self.assertTrue(StudentAccount.objects.get(pk=item['id']).password_hash.startswith('pbkdf2-sha256$100000$'))
        self.assertNotIn(self.data['password'], self.client.get('/api/students', **self.auth).content.decode())

    def test_student_results_are_private_to_their_session(self):
        first = self.create()
        other = self.create(university_id='2026-CS-002', full_name='طالب آخر', grade='67')
        response = self.login_student()
        self.assertTrue(response.cookies['__Host-sadara_student']['httponly'])
        self.assertTrue(response.cookies['__Host-sadara_student']['secure'])
        self.assertEqual(response.cookies['__Host-sadara_student']['samesite'], 'Strict')
        profile = self.student.get('/api/student/me?university_id=' + other['university_id'])
        self.assertEqual(profile.json()['id'], first['id'])
        self.assertEqual(profile.json()['grade'], '95/100')
        self.assertEqual(profile['Cache-Control'], 'no-store')
        self.assertEqual(self.student.get('/api/students').status_code, 401)
        self.assertEqual(self.student.get('/api/applicants').status_code, 401)
        self.assertEqual(self.client.get('/api/student/me').status_code, 401)
        self.assertEqual(self.send('/api/students/' + str(other['id']), self.data, method='put', client=self.student).status_code, 401)

    def test_grade_updates_preserve_blank_password_and_appear_in_existing_session(self):
        item = self.create()
        self.login_student()
        before = StudentAccount.objects.get(pk=item['id'])
        result = self.send('/api/students/' + str(item['id']), {**self.data, 'password': '', 'full_name': 'الاسم الجديد', 'grade': 'ممتاز'}, method='put', admin=True)
        self.assertEqual(result.status_code, 200)
        after = StudentAccount.objects.get(pk=item['id'])
        self.assertEqual(before.password_hash, after.password_hash)
        self.assertEqual(before.credential_version, after.credential_version)
        profile = self.student.get('/api/student/me').json()
        self.assertEqual(profile['grade'], 'ممتاز')
        self.assertEqual(profile['full_name'], 'الاسم الجديد')

    def test_reset_password_and_identifier_revoke_sessions(self):
        item = self.create()
        self.login_student()
        updated = {**self.data, 'password': 'new-student-password'}
        self.assertEqual(self.send('/api/students/' + str(item['id']), updated, method='put', admin=True).status_code, 200)
        self.assertEqual(self.student.get('/api/student/me').status_code, 401)
        self.assertEqual(self.send('/api/student/login', {'university_id': self.data['university_id'], 'password': self.data['password']}, client=self.student).status_code, 401)
        self.login_student(password=updated['password'])
        self.assertEqual(self.send('/api/students/' + str(item['id']), {**updated, 'password': '', 'university_id': '2026-CS-099'}, method='put', admin=True).status_code, 200)
        self.assertEqual(self.student.get('/api/student/me').status_code, 401)
        self.login_student(university_id='2026-CS-099', password=updated['password'])

    def test_logout_and_delete_revoke_old_tokens(self):
        item = self.create()
        self.login_student()
        old_cookie = self.student.cookies['__Host-sadara_student'].value
        self.assertEqual(self.student.post('/api/student/logout').status_code, 200)
        self.student.cookies['__Host-sadara_student'] = old_cookie
        self.assertEqual(self.student.get('/api/student/me').status_code, 401)
        self.login_student()
        self.assertEqual(self.client.delete('/api/students/' + str(item['id']), **self.auth).status_code, 200)
        self.assertEqual(self.student.get('/api/student/me').status_code, 401)
        self.assertEqual(StudentSession.objects.count(), 0)
        self.assertEqual(StudentAccount.objects.count(), 0)

    def test_normalized_identifiers_are_unique(self):
        self.create(university_id='٢٠٢٦-cs-٠٠١')
        self.login_student()
        self.assertEqual(self.send('/api/students', self.data, admin=True).status_code, 409)
        self.assertEqual(StudentAccount.objects.count(), 1)

    def test_validation_does_not_write_partial_accounts(self):
        for key, value in [('university_id', 'invalid id'), ('university_id', []), ('full_name', ''), ('full_name', True), ('password', '12345'), ('password', None), ('grade', []), ('grade', True), ('grade', 'x' * 101)]:
            with self.subTest(key=key, value=value):
                self.assertEqual(self.send('/api/students', {**self.data, key: value}, admin=True).status_code, 400)
        self.assertEqual(StudentAccount.objects.count(), 0)
        for value in [None, [], True, 'text']:
            self.assertEqual(self.send('/api/students', value, admin=True).status_code, 400)

    def test_pending_zero_and_expired_results(self):
        item = self.create(grade='')
        self.login_student()
        self.assertEqual(self.student.get('/api/student/me').json()['grade'], '')
        self.assertEqual(self.send('/api/students/' + str(item['id']), {**self.data, 'password': '', 'grade': 0}, method='put', admin=True).status_code, 200)
        self.assertEqual(self.student.get('/api/student/me').json()['grade'], '0')
        StudentSession.objects.update(expires_at=0)
        self.assertEqual(self.student.get('/api/student/me').status_code, 401)

    def test_login_limits_are_per_student_and_recover(self):
        self.create()
        self.create(university_id='2026-CS-002')
        for _ in range(5):
            self.assertEqual(self.send('/api/student/login', {'university_id': self.data['university_id'], 'password': 'wrong'}, client=self.student).status_code, 401)
        response = self.send('/api/student/login', {'university_id': self.data['university_id'], 'password': self.data['password']}, client=self.student)
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response['Retry-After']), 0)
        self.login_student(university_id='2026-CS-002')
        StudentLoginLimit.objects.update(window_end=int(time.time()) - 1)
        self.login_student()

    def test_cross_origin_student_mutations_are_rejected(self):
        self.create()
        for path in ['/api/student/login', '/api/student/logout', '/api/students']:
            self.assertEqual(self.send(path, self.data, admin=True, HTTP_ORIGIN='https://attacker.test').status_code, 403)
