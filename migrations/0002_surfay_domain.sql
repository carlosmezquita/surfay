PRAGMA foreign_keys = ON;

CREATE TABLE "forecast_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "generated_at" text NOT NULL,
  "source" text NOT NULL,
  "model" text NOT NULL,
  "payload_json" text NOT NULL,
  "expires_at" integer NOT NULL,
  "created_at" integer NOT NULL
);

CREATE INDEX "forecast_snapshot_expires_at_idx"
  ON "forecast_snapshot" ("expires_at");

CREATE INDEX "forecast_snapshot_created_at_idx"
  ON "forecast_snapshot" ("created_at");

CREATE TABLE "condition_report" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "spot_slug" text NOT NULL,
  "forecast_time" text NOT NULL,
  "observed_at" text NOT NULL,
  "submitted_at" integer NOT NULL,
  "observed_score" integer NOT NULL CHECK ("observed_score" BETWEEN 1 AND 5),
  "observed_height" text NOT NULL CHECK ("observed_height" IN ('smaller', 'matched', 'larger')),
  "wind_matched" integer CHECK ("wind_matched" IN (0, 1)),
  "note" text NOT NULL DEFAULT '',
  "forecast_snapshot_id" text REFERENCES "forecast_snapshot" ("id") ON DELETE SET NULL,
  "model_version" text,
  "trust_weight" real NOT NULL DEFAULT 0.5,
  "moderation_status" text NOT NULL DEFAULT 'pending'
    CHECK ("moderation_status" IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX "condition_report_user_submitted_idx"
  ON "condition_report" ("user_id", "submitted_at" DESC);

CREATE INDEX "condition_report_spot_observed_idx"
  ON "condition_report" ("spot_slug", "observed_at" DESC);

CREATE TABLE "membership" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "plan" text NOT NULL DEFAULT 'free' CHECK ("plan" IN ('free', 'member', 'contributor', 'admin')),
  "status" text NOT NULL DEFAULT 'inactive' CHECK ("status" IN ('inactive', 'active', 'past_due', 'cancelled')),
  "provider" text,
  "provider_customer_id" text,
  "provider_subscription_id" text,
  "current_period_end" integer,
  "updated_at" integer NOT NULL
);

CREATE UNIQUE INDEX "membership_provider_customer_idx"
  ON "membership" ("provider", "provider_customer_id")
  WHERE "provider_customer_id" IS NOT NULL;
