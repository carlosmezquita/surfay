PRAGMA foreign_keys = ON;

ALTER TABLE "user" ADD COLUMN "role" text NOT NULL DEFAULT 'user';
ALTER TABLE "user" ADD COLUMN "banned" integer NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "banReason" text;
ALTER TABLE "user" ADD COLUMN "banExpires" date;
ALTER TABLE "session" ADD COLUMN "impersonatedBy" text;

ALTER TABLE "condition_report" ADD COLUMN "moderated_by" text REFERENCES "user" ("id") ON DELETE SET NULL;
ALTER TABLE "condition_report" ADD COLUMN "moderated_at" integer;
ALTER TABLE "condition_report" ADD COLUMN "moderation_note" text NOT NULL DEFAULT '';
CREATE INDEX "condition_report_moderation_idx" ON "condition_report" ("moderation_status", "submitted_at" DESC);

ALTER TABLE "forecast_snapshot" ADD COLUMN "catalogue_version" integer NOT NULL DEFAULT 1;
CREATE INDEX "forecast_snapshot_catalogue_created_idx" ON "forecast_snapshot" ("catalogue_version", "created_at" DESC);

CREATE TABLE "spot_catalogue_state" (
  "id" integer PRIMARY KEY NOT NULL CHECK ("id" = 1),
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" integer NOT NULL
);
INSERT INTO "spot_catalogue_state" ("id", "version", "updated_at") VALUES (1, 1, unixepoch() * 1000);

CREATE TABLE "surf_spot" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
  "draft_json" text NOT NULL,
  "published_json" text,
  "draft_exposure_json" text,
  "published_exposure_json" text,
  "revision" integer NOT NULL DEFAULT 1,
  "created_by" text REFERENCES "user" ("id") ON DELETE SET NULL,
  "updated_by" text REFERENCES "user" ("id") ON DELETE SET NULL,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  "published_at" integer
);
CREATE INDEX "surf_spot_status_updated_idx" ON "surf_spot" ("status", "updated_at" DESC);
