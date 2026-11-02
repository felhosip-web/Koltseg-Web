-- Add currency column to incomings table if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'incomings' AND column_name = 'currency'
    ) THEN
        ALTER TABLE incomings ADD COLUMN currency TEXT DEFAULT 'HUF';
    END IF;
END $$;
