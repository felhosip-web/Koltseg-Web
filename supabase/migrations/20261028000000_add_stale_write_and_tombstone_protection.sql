-- Migration: Add server-side stale-write and tombstone resurrection protection
-- PLG3-P4-1 — Server-Side Stale-Write and Tombstone Safety

CREATE OR REPLACE FUNCTION prevent_stale_upsert_and_tombstone_resurrect()
RETURNS TRIGGER AS $$
DECLARE
    rec_id TEXT;
    incoming_time TIMESTAMPTZ;
    tombstone_time TIMESTAMPTZ;
BEGIN
    -- 1. Extract target record ID string
    IF TG_TABLE_NAME = 'months' THEN
        rec_id := NEW.month;
    ELSE
        rec_id := NEW.id;
    END IF;

    IF rec_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 2. Determine incoming timestamp
    incoming_time := COALESCE(NEW.updated_at, NOW());

    -- 3. Check for active tombstone in deleted_records
    SELECT deleted_at INTO tombstone_time
    FROM deleted_records
    WHERE table_name = TG_TABLE_NAME
      AND record_id = rec_id
    ORDER BY deleted_at DESC
    LIMIT 1;

    IF tombstone_time IS NOT NULL AND tombstone_time >= incoming_time THEN
        -- Active tombstone exists with deleted_at >= incoming timestamp.
        -- Suppress write to prevent resurrecting deleted record.
        RETURN NULL;
    END IF;

    -- 4. For UPDATE operations: check stale-write protection
    IF TG_OP = 'UPDATE' THEN
        IF OLD.updated_at IS NOT NULL AND incoming_time <= OLD.updated_at THEN
            -- Incoming update has older or equal timestamp compared to stored row.
            -- Suppress update to protect newer stored row.
            RETURN NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to domain tables

-- 1. items
DROP TRIGGER IF EXISTS trigger_prevent_stale_items ON items;
CREATE TRIGGER trigger_prevent_stale_items
BEFORE INSERT OR UPDATE ON items
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 2. months
DROP TRIGGER IF EXISTS trigger_prevent_stale_months ON months;
CREATE TRIGGER trigger_prevent_stale_months
BEFORE INSERT OR UPDATE ON months
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 3. entries
DROP TRIGGER IF EXISTS trigger_prevent_stale_entries ON entries;
CREATE TRIGGER trigger_prevent_stale_entries
BEFORE INSERT OR UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 4. templates
DROP TRIGGER IF EXISTS trigger_prevent_stale_templates ON templates;
CREATE TRIGGER trigger_prevent_stale_templates
BEFORE INSERT OR UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 5. reminders
DROP TRIGGER IF EXISTS trigger_prevent_stale_reminders ON reminders;
CREATE TRIGGER trigger_prevent_stale_reminders
BEFORE INSERT OR UPDATE ON reminders
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 6. incomings
DROP TRIGGER IF EXISTS trigger_prevent_stale_incomings ON incomings;
CREATE TRIGGER trigger_prevent_stale_incomings
BEFORE INSERT OR UPDATE ON incomings
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 7. incoming_senders
DROP TRIGGER IF EXISTS trigger_prevent_stale_incoming_senders ON incoming_senders;
CREATE TRIGGER trigger_prevent_stale_incoming_senders
BEFORE INSERT OR UPDATE ON incoming_senders
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 8. works
DROP TRIGGER IF EXISTS trigger_prevent_stale_works ON works;
CREATE TRIGGER trigger_prevent_stale_works
BEFORE INSERT OR UPDATE ON works
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 9. app_settings
DROP TRIGGER IF EXISTS trigger_prevent_stale_app_settings ON app_settings;
CREATE TRIGGER trigger_prevent_stale_app_settings
BEFORE INSERT OR UPDATE ON app_settings
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();

-- 10. plugin_records
DROP TRIGGER IF EXISTS trigger_prevent_stale_plugin_records ON plugin_records;
CREATE TRIGGER trigger_prevent_stale_plugin_records
BEFORE INSERT OR UPDATE ON plugin_records
FOR EACH ROW
EXECUTE FUNCTION prevent_stale_upsert_and_tombstone_resurrect();
