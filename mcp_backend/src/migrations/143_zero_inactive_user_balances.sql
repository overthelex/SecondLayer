-- Migration 143: Zero out balances for inactive/test accounts (2026-04-30).
-- These accounts were manually credited but never actively used the platform.
-- Balances zeroed to prevent accidental restoration via seed scripts.

UPDATE user_billing
SET balance_uah = 0, balance_usd = 0, updated_at = NOW()
FROM users u
WHERE user_billing.user_id = u.id
  AND u.email IN (
    'happiest.day@icloud.com',
    'test@legal.org.ua',
    'alehina@legal.org.ua',
    'gladilina_elena@ukr.net',
    'test_user@legal.org.ua',
    'ruslanyuryst@gmail.com'
  )
  AND (user_billing.balance_uah != 0 OR user_billing.balance_usd != 0);
