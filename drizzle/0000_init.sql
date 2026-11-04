CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`mandate_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mandates` (
	`id` text PRIMARY KEY NOT NULL,
	`goal` text NOT NULL,
	`cap_cents` integer NOT NULL,
	`max_per_purchase_cents` integer,
	`allowed_retailers` text,
	`max_purchases` integer,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'pending_approval' NOT NULL,
	`spent_cents` integer DEFAULT 0 NOT NULL,
	`paypal_order_id` text,
	`approve_url` text,
	`authorization_id` text,
	`authorization_expires_at` integer,
	`signed_mandate` text,
	`created_at` integer NOT NULL,
	`activated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mandates_paypal_order_id_unique` ON `mandates` (`paypal_order_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`mandate_id` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`retailer` text NOT NULL,
	`product_url` text NOT NULL,
	`image_url` text,
	`amount_cents` integer NOT NULL,
	`reasoning` text NOT NULL,
	`capture_id` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`signed_receipt` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_capture_id_unique` ON `purchases` (`capture_id`);