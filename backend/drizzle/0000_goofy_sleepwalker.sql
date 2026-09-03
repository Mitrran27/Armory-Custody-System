CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."access_request_type" AS ENUM('zone_access', 'firearm_assignment');--> statement-breakpoint
CREATE TYPE "public"."audit_event_type" AS ENUM('qr_scan', 'facial_match', 'facial_fail', 'firearm_taken', 'firearm_returned', 'maintenance', 'override', 'admin_action', 'alert');--> statement-breakpoint
CREATE TYPE "public"."audit_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."camera_status" AS ENUM('online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."clearance_level" AS ENUM('level_1', 'level_2', 'level_3');--> statement-breakpoint
CREATE TYPE "public"."door_gate" AS ENUM('qr', 'facial', 'rfid_threshold', 'none');--> statement-breakpoint
CREATE TYPE "public"."firearm_status" AS ENUM('in_armory', 'checked_out', 'maintenance', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."guard_status" AS ENUM('active', 'suspended', 'off_duty');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('assigned', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('access_request_submitted');--> statement-breakpoint
CREATE TYPE "public"."rack_wall" AS ENUM('north', 'south', 'east', 'west');--> statement-breakpoint
CREATE TYPE "public"."system_user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."tag_health" AS ENUM('ok', 'weak', 'tamper');--> statement-breakpoint
CREATE TYPE "public"."zone_status" AS ENUM('clear', 'occupied', 'alert');--> statement-breakpoint
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
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "audit_event_type" NOT NULL,
	"severity" "audit_severity" DEFAULT 'info' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_name" text NOT NULL,
	"actor_guard_id" text,
	"actor_user_id" text,
	"zone_id" text,
	"firearm_id" text,
	"detail" text NOT NULL,
	"hash" text NOT NULL,
	"prev_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cameras" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"zone_id" text NOT NULL,
	"pos_x" double precision NOT NULL,
	"pos_y" double precision NOT NULL,
	"pos_z" double precision NOT NULL,
	"target_x" double precision NOT NULL,
	"target_y" double precision NOT NULL,
	"target_z" double precision NOT NULL,
	"fov_deg" double precision NOT NULL,
	"status" "camera_status" DEFAULT 'online' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doors" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"room_id" text NOT NULL,
	"wall" "rack_wall" NOT NULL,
	"t" double precision NOT NULL,
	"width" double precision NOT NULL,
	"gate" "door_gate" NOT NULL,
	"connects_to_zone_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "firearms" (
	"id" text PRIMARY KEY NOT NULL,
	"serial" text NOT NULL,
	"rfid_tag" text NOT NULL,
	"model" text NOT NULL,
	"caliber" text NOT NULL,
	"rack" text NOT NULL,
	"slot" text NOT NULL,
	"status" "firearm_status" DEFAULT 'in_armory' NOT NULL,
	"holder_id" text,
	"checked_out_at" timestamp with time zone,
	"tag_health" "tag_health" DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guard_otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"guard_id" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rank" text NOT NULL,
	"company_id" text NOT NULL,
	"clearance" "clearance_level" NOT NULL,
	"status" "guard_status" DEFAULT 'active' NOT NULL,
	"photo_initials" text NOT NULL,
	"biometric_enrolled" boolean DEFAULT false NOT NULL,
	"token_issued" boolean DEFAULT false NOT NULL,
	"shift" text NOT NULL,
	"last_seen" timestamp with time zone,
	"current_zone_id" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"firearm_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"armorer_id" text,
	"assigned_by_user_id" text,
	"status" "maintenance_status" DEFAULT 'completed' NOT NULL,
	"work" text NOT NULL,
	"next_due" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
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
CREATE TABLE "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_scanners" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"pos_x" double precision NOT NULL,
	"pos_y" double precision NOT NULL,
	"pos_z" double precision NOT NULL,
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
CREATE TABLE "rack_wall_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"wall" "rack_wall" NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"width" double precision NOT NULL,
	"depth" double precision NOT NULL,
	"origin_x" double precision NOT NULL,
	"origin_z" double precision NOT NULL,
	"height" double precision NOT NULL,
	"walls_built" "rack_wall"[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role_id" text NOT NULL,
	"status" "system_user_status" DEFAULT 'active' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "zone_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"guard_id" text NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exited_at" timestamp with time zone,
	"method" "door_gate" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"status" "zone_status" DEFAULT 'clear' NOT NULL,
	"requires_authorization" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_firearm_id_firearms_id_fk" FOREIGN KEY ("firearm_id") REFERENCES "public"."firearms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requested_by_user_id_system_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_user_id_system_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_guard_id_guards_id_fk" FOREIGN KEY ("actor_guard_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_system_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_firearm_id_firearms_id_fk" FOREIGN KEY ("firearm_id") REFERENCES "public"."firearms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doors" ADD CONSTRAINT "doors_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doors" ADD CONSTRAINT "doors_connects_to_zone_id_zones_id_fk" FOREIGN KEY ("connects_to_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firearms" ADD CONSTRAINT "firearms_holder_id_guards_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_otp_codes" ADD CONSTRAINT "guard_otp_codes_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guards" ADD CONSTRAINT "guards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guards" ADD CONSTRAINT "guards_current_zone_id_zones_id_fk" FOREIGN KEY ("current_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_firearm_id_firearms_id_fk" FOREIGN KEY ("firearm_id") REFERENCES "public"."firearms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_armorer_id_system_users_id_fk" FOREIGN KEY ("armorer_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_assigned_by_user_id_system_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_role_roles_id_fk" FOREIGN KEY ("recipient_role") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_access_request_id_access_requests_id_fk" FOREIGN KEY ("related_access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_scanners" ADD CONSTRAINT "qr_scanners_id_doors_id_fk" FOREIGN KEY ("id") REFERENCES "public"."doors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_door_id_doors_id_fk" FOREIGN KEY ("door_id") REFERENCES "public"."doors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rack_wall_configs" ADD CONSTRAINT "rack_wall_configs_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_id_zones_id_fk" FOREIGN KEY ("id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_sessions" ADD CONSTRAINT "zone_sessions_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_sessions" ADD CONSTRAINT "zone_sessions_guard_id_guards_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."guards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_guard_idx" ON "access_requests" USING btree ("guard_id");--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "access_requests_deleted_at_idx" ON "access_requests" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_hash_idx" ON "audit_events" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_type_idx" ON "audit_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cameras_deleted_at_idx" ON "cameras" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "doors_deleted_at_idx" ON "doors" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "firearms_serial_idx" ON "firearms" USING btree ("serial");--> statement-breakpoint
CREATE UNIQUE INDEX "firearms_rfid_tag_idx" ON "firearms" USING btree ("rfid_tag");--> statement-breakpoint
CREATE INDEX "firearms_deleted_at_idx" ON "firearms" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "guard_otp_codes_guard_code_idx" ON "guard_otp_codes" USING btree ("guard_id","code");--> statement-breakpoint
CREATE INDEX "guards_deleted_at_idx" ON "guards" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guards_email_idx" ON "guards" USING btree ("email");--> statement-breakpoint
CREATE INDEX "guards_company_idx" ON "guards" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "maintenance_deleted_at_idx" ON "maintenance_records" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "maintenance_firearm_idx" ON "maintenance_records" USING btree ("firearm_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_role_idx" ON "notifications" USING btree ("recipient_role","read");--> statement-breakpoint
CREATE INDEX "otp_codes_user_code_idx" ON "otp_codes" USING btree ("user_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_tokens_code_idx" ON "qr_tokens" USING btree ("code");--> statement-breakpoint
CREATE INDEX "qr_tokens_guard_idx" ON "qr_tokens" USING btree ("guard_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_email_idx" ON "system_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "system_users_deleted_at_idx" ON "system_users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "zone_sessions_zone_exit_idx" ON "zone_sessions" USING btree ("zone_id","exited_at");--> statement-breakpoint
CREATE INDEX "zone_sessions_guard_exit_idx" ON "zone_sessions" USING btree ("guard_id","exited_at");