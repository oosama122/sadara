import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', {key:text('key').primaryKey(),value:text('value')});
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
