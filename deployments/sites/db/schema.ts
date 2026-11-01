import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
export const studentAccounts = sqliteTable('student_accounts', {
 id:integer('id').primaryKey({autoIncrement:true}),university_id:text('university_id').notNull().unique(),full_name:text('full_name').notNull(),password_hash:text('password_hash').notNull(),grade:text('grade').notNull().default(''),credential_version:text('credential_version').notNull(),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull()
});
export const studentSessions = sqliteTable('student_sessions', {
 token_hash:text('token_hash').primaryKey(),student_id:integer('student_id').notNull().references(()=>studentAccounts.id,{onDelete:'cascade'}),credential_version:text('credential_version').notNull(),expires_at:integer('expires_at').notNull()
}, table=>[index('student_sessions_student_idx').on(table.student_id),index('student_sessions_expiry_idx').on(table.expires_at)]);
export const studentLoginLimits = sqliteTable('student_login_limits', {
 client_hash:text('client_hash').primaryKey(),failures:integer('failures').notNull().default(0),window_end:integer('window_end').notNull()
},table=>[index('student_login_limits_expiry_idx').on(table.window_end)]);
export const settings = sqliteTable('settings', {key:text('key').primaryKey(),value:text('value')});
export const adminSessions = sqliteTable('admin_sessions', {
 token_hash:text('token_hash').primaryKey(),username:text('username').notNull(),credential_version:text('credential_version').notNull(),expires_at:integer('expires_at').notNull()
});
export const adminLoginLimits = sqliteTable('admin_login_limits', {
 client_hash:text('client_hash').primaryKey(),failures:integer('failures').notNull().default(0),window_end:integer('window_end').notNull()
});
export const applicants = sqliteTable('applicants', {
 id:integer('id').primaryKey({autoIncrement:true}),name:text('name').notNull(),phone:text('phone').notNull(),gpa:real('gpa').notNull(),stream:text('stream').notNull(),department:text('department').notNull(),status:text('status').notNull().default('pending'),created_at:text('created_at').notNull()
});
export const departments = sqliteTable('departments', {
 id:integer('id').primaryKey({autoIncrement:true}),name:text('name').notNull(),code:text('code').notNull().unique(),category:text('category').notNull(),duration:text('duration').notNull(),description:text('description').notNull().default(''),icon:text('icon').notNull().default(''),image_url:text('image_url').notNull().default(''),careers:text('careers').notNull().default(''),courses:text('courses').notNull().default('[]')
});
export const labs = sqliteTable('labs', {
 id:integer('id').primaryKey({autoIncrement:true}),name:text('name').notNull(),category:text('category').notNull(),image_url:text('image_url').notNull().default(''),description:text('description').notNull().default(''),specs:text('specs').notNull().default('[]')
});
export const tuitionFees = sqliteTable('tuition_fees', {
 id:integer('id').primaryKey({autoIncrement:true}),department_name:text('department_name').notNull(),official_fee:text('official_fee').notNull(),discounted_fee:text('discounted_fee').notNull(),installment:text('installment').notNull(),payment_options:text('payment_options').notNull()
});
export const contactMessages = sqliteTable('contact_messages', {
 id:integer('id').primaryKey({autoIncrement:true}),name:text('name').notNull(),email:text('email').notNull(),phone:text('phone').notNull().default(''),subject:text('subject').notNull(),message:text('message').notNull(),is_read:integer('is_read').notNull().default(0),created_at:text('created_at').notNull()
});
