-- Migration 112: Drop ZakonOnline columns and table
-- ZakonOnline API is fully deprecated. Remove all ZO-specific columns and the zo_dictionaries table.

-- Drop ZO columns from cost_tracking
ALTER TABLE cost_tracking DROP COLUMN IF EXISTS zakononline_api_calls;
ALTER TABLE cost_tracking DROP COLUMN IF EXISTS zakononline_calls;
ALTER TABLE cost_tracking DROP COLUMN IF EXISTS zakononline_monthly_total;
ALTER TABLE cost_tracking DROP COLUMN IF EXISTS zakononline_cost_usd;

-- Drop ZO columns from monthly_api_usage
ALTER TABLE monthly_api_usage DROP COLUMN IF EXISTS zakononline_total_calls;
ALTER TABLE monthly_api_usage DROP COLUMN IF EXISTS zakononline_total_cost_usd;

-- Drop zo_dictionaries table
DROP TABLE IF EXISTS zo_dictionaries;
