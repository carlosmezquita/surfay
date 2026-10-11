-- Hand-written integrity migration; existing generated migrations remain unchanged.
PRAGMA foreign_keys = ON;

ALTER TABLE condition_report ADD COLUMN forecast_spot_snapshot_id text
  REFERENCES forecast_spot_snapshot(id) ON DELETE SET NULL;
ALTER TABLE condition_report ADD COLUMN forecast_hour_json text;
ALTER TABLE condition_report ADD COLUMN forecast_generated_at text;
ALTER TABLE condition_report ADD COLUMN forecast_catalogue_version integer;

-- This row only exists inside a publication batch. A failed precondition aborts
-- the batch before any spot, catalogue version or forecast is changed.
CREATE TABLE catalogue_publication_guard (
  id integer PRIMARY KEY CHECK (id = 1),
  spot_id text NOT NULL,
  revision integer NOT NULL,
  catalogue_version integer NOT NULL
);
CREATE TRIGGER catalogue_publication_precondition
BEFORE INSERT ON catalogue_publication_guard
BEGIN
  SELECT RAISE(ABORT, 'SURFAY_PUBLICATION_CONFLICT')
    WHERE NOT EXISTS (SELECT 1 FROM surf_spot WHERE id = NEW.spot_id AND revision = NEW.revision)
       OR NOT EXISTS (SELECT 1 FROM spot_catalogue_state WHERE id = 1 AND version = NEW.catalogue_version);
END;

-- Better Auth writes directly to user. Protect the invariant on that path too.
CREATE TRIGGER protect_last_active_admin
BEFORE UPDATE OF role, banned ON user
WHEN OLD.role = 'admin' AND COALESCE(OLD.banned, 0) = 0
 AND (NEW.role <> 'admin' OR COALESCE(NEW.banned, 0) <> 0)
BEGIN
  SELECT RAISE(ABORT, 'SURFAY_LAST_ADMIN') WHERE
    (SELECT COUNT(*) FROM user WHERE role = 'admin' AND COALESCE(banned, 0) = 0) <= 1;
END;

CREATE TABLE forecast_refresh_lease (
  id integer PRIMARY KEY CHECK (id = 1),
  token text NOT NULL,
  expires_at integer NOT NULL
);
