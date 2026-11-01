CREATE TABLE `student_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`university_id` text NOT NULL,
	`full_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`grade` text DEFAULT '' NOT NULL,
	`credential_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_accounts_university_id_unique` ON `student_accounts` (`university_id`);--> statement-breakpoint
CREATE TABLE `student_login_limits` (
	`client_hash` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_end` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `student_login_limits_expiry_idx` ON `student_login_limits` (`window_end`);--> statement-breakpoint
CREATE TABLE `student_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student_id` integer NOT NULL,
	`credential_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `student_sessions_student_idx` ON `student_sessions` (`student_id`);--> statement-breakpoint
CREATE INDEX `student_sessions_expiry_idx` ON `student_sessions` (`expires_at`);