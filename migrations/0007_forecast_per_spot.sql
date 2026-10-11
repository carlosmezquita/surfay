PRAGMA foreign_keys = ON;

CREATE TABLE "forecast_spot_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "spot_slug" text NOT NULL,
  "generated_at" text NOT NULL,
  "source" text NOT NULL,
  "model" text NOT NULL,
  "payload_json" text NOT NULL,
  "catalogue_version" integer NOT NULL,
  "created_at" integer NOT NULL,
  "expires_at" integer NOT NULL
);

CREATE INDEX "fss_created_at_idx"
  ON "forecast_spot_snapshot" ("created_at");

CREATE INDEX "fss_spot_created_idx"
  ON "forecast_spot_snapshot" ("spot_slug", "created_at" DESC);

CREATE INDEX "fss_catalogue_created_idx"
  ON "forecast_spot_snapshot" ("catalogue_version", "created_at" DESC);

CREATE INDEX "fss_expires_idx"
  ON "forecast_spot_snapshot" ("expires_at");
