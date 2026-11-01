# Dashboard authentication

The public dashboard at `/dashbord/index.html` accepts a username and password without requiring a ChatGPT account. Configure `SADARA_ADMIN_USERNAME` and `SADARA_ADMIN_PASSWORD_HASH` with the native Sites runtime secret tools, then deploy to apply them. No password is embedded in source or browser code.

The password hash format is `pbkdf2-sha256$100000$<16-byte hex salt>$<32-byte hex digest>` using PBKDF2-HMAC-SHA256. Generate a fresh random salt when changing the password. Changing either runtime credential invalidates existing password sessions.

Password sessions use random 256-bit tokens in Secure, HttpOnly, SameSite=Strict cookies and store only token hashes in D1. They expire after eight hours; logging out revokes the session immediately. Five failed logins from a client trigger a fifteen-minute cooldown. All protected operations verify the session on the server.

The existing Sites identity integration remains available as an optional owner sign-in. `SADARA_ADMIN_EMAIL` identifies that owner. Public college pages remain accessible without signing in.

## Student accounts

Administrators create and update student accounts at `/api/students`. Each has a unique normalized university identifier, name, salted PBKDF2-SHA256 password hash, grade text, and update timestamp. The grade can be pending (empty), numeric text, or the college's own result format. No student records are seeded automatically.

`/api/student/login` establishes a separate Secure, HttpOnly, SameSite=Strict cookie. `/api/student/me` identifies the account only through that session; it accepts no account selector. Student sessions grant no administrative access. Responses explicitly omit password hashes and credential versions. Student profiles and grades are never cached in browser storage, and the page refreshes the current account every 15 seconds while visible.

Editing a name or grade preserves a valid student session so changes appear immediately on refresh. Password resets, university identifier changes, deletion, and logout revoke sessions. Failed logins are throttled per account and client for fifteen minutes. Changing a student's password never changes administrator credentials or other students' sessions.

Schema migrations are in `drizzle/`. Run `node tests/service.test.mjs` with Node 22 to verify session handling, login limits, access checks, and the college API flows.
