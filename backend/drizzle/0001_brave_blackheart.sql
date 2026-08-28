CREATE TYPE "public"."notification_type" AS ENUM('access_request_submitted');--> statement-breakpoint
CREATE TABLE "guard_otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"guard_id" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_role" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_access_request_id" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guards" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "guard_otp_codes" ADD CONSTRAINT "guard_otp_codes_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_role_roles_id_fk" FOREIGN KEY ("recipient_role") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_access_request_id_access_requests_id_fk" FOREIGN KEY ("related_access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guard_otp_codes_guard_code_idx" ON "guard_otp_codes" USING btree ("guard_id","code");--> statement-breakpoint
CREATE INDEX "notifications_recipient_role_idx" ON "notifications" USING btree ("recipient_role","read");--> statement-breakpoint
CREATE UNIQUE INDEX "guards_email_idx" ON "guards" USING btree ("email");