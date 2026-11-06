CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text,
	`capture_id` text,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`amount_cents` integer,
	`messages` text NOT NULL,
	`actions` text NOT NULL,
	`seller_response_due_at` integer,
	`analysis` text,
	`resolution` text,
	`opened_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action
);
