CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."access_request_type" AS ENUM('zone_access', 'firearm_assignment');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('assigned', 'in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "access_request_type" NOT NULL,
	"guard_id" text NOT NULL,
	"zone_id" text,
	"firearm_id" text,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qr_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"guard_id" text NOT NULL,
	"door_id" text NOT NULL,
	"code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD COLUMN "assigned_by_user_id" text;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD COLUMN "status" "maintenance_status" DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "requires_authorization" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_firearm_id_firearms_id_fk" FOREIGN KEY ("firearm_id") REFERENCES "public"."firearms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requested_by_user_id_system_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_user_id_system_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_door_id_doors_id_fk" FOREIGN KEY ("door_id") REFERENCES "public"."doors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_guard_idx" ON "access_requests" USING btree ("guard_id");--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "access_requests_deleted_at_idx" ON "access_requests" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_tokens_code_idx" ON "qr_tokens" USING btree ("code");--> statement-breakpoint
CREATE INDEX "qr_tokens_guard_idx" ON "qr_tokens" USING btree ("guard_id");--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_assigned_by_user_id_system_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;