CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`host_name` text NOT NULL,
	`guest_id` text,
	`guest_name` text,
	`moves` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`winner` text,
	`reason` text,
	`created` text NOT NULL,
	`expires` text NOT NULL
);
