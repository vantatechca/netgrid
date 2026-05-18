-- ─── Sample data seed ──────────────────────────────────────────────────────
-- Run AFTER 0000_heavy_frog_thor.sql creates the schema.
-- Idempotent: uses INSERT … ON CONFLICT DO NOTHING so you can re-run safely.
--
-- Admin credentials after running this file:
--   email:    admin@netgrid.app
--   password: admin123

-- ─── Admin user ───────────────────────────────────────────────────────────
INSERT INTO users (email, name, password_hash, role)
VALUES (
  'admin@netgrid.app',
  'Admin User',
  '$2b$10$bLMUJt71Nh2.EzQ8Q0Ue3.1sCegdUHv.w7XtxQLZobi3DDJV2qcom',
  'super_admin'
)
ON CONFLICT (email) DO NOTHING;

-- ─── Sample clients ───────────────────────────────────────────────────────
INSERT INTO clients (
  name, contact_name, contact_email, contact_phone, niche,
  total_blogs_target, billing_type, billing_amount, setup_fee, setup_fee_paid,
  billing_start_date, next_billing_date, billing_status, status, notes_internal
)
VALUES
  (
    'Acme SaaS Inc', 'Jane Doe', 'jane@acmesaas.com', '+1-555-0101', 'SaaS',
    10, 'monthly', 2500.00, 1500.00, true,
    '2025-01-15', '2026-05-01', 'active', 'active',
    'Premium plan — VIP support priority.'
  ),
  (
    'BrightStore Commerce', 'Mark Lee', 'mark@brightstore.com', '+1-555-0202', 'E-commerce',
    5, 'monthly', 1200.00, 800.00, true,
    '2025-03-01', '2026-05-01', 'active', 'active',
    NULL
  ),
  (
    'VitalityHealth Co', 'Sarah Chen', 'sarah@vitality.health', '+1-555-0303', 'Health & Wellness',
    8, 'monthly', 1800.00, 1200.00, false,
    '2026-04-15', '2026-05-15', 'active', 'onboarding',
    'New client — onboarding in progress. Setup fee pending.'
  ),
  (
    'FinanceForward', 'Tom Wilson', 'tom@financeforward.io', '+1-555-0404', 'Finance',
    3, 'yearly', 15000.00, 0.00, true,
    '2024-11-01', '2025-11-01', 'overdue', 'active',
    'Payment 30 days overdue. Follow up with Tom.'
  ),
  (
    'Wanderlust Travel', 'Emma Rodriguez', 'emma@wanderlust.travel', '+1-555-0505', 'Travel',
    6, 'monthly', 900.00, 500.00, true,
    '2024-06-01', '2026-06-01', 'paused', 'paused',
    'Paused for seasonal slow period; resume in June.'
  )
ON CONFLICT DO NOTHING;

-- ─── Portal users (client-role logins) ────────────────────────────────────
INSERT INTO users (email, name, role, client_id)
SELECT 'jane@acmesaas.com', 'Jane Doe', 'client', id
FROM clients WHERE name = 'Acme SaaS Inc'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, name, role, client_id)
SELECT 'mark@brightstore.com', 'Mark Lee', 'client', id
FROM clients WHERE name = 'BrightStore Commerce'
ON CONFLICT (email) DO NOTHING;

-- ─── Sample blogs ─────────────────────────────────────────────────────────
INSERT INTO blogs (
  client_id, domain, platform, wp_url, seo_plugin,
  posting_frequency, posting_frequency_days, status
)
SELECT id, 'acme-insights.com', 'wordpress', 'https://acme-insights.com', 'yoast',
       '3x per week', 2, 'active'
FROM clients WHERE name = 'Acme SaaS Inc'
ON CONFLICT (domain) DO NOTHING;

INSERT INTO blogs (
  client_id, domain, platform, wp_url, seo_plugin,
  posting_frequency, posting_frequency_days, status
)
SELECT id, 'acme-devblog.io', 'wordpress', 'https://acme-devblog.io', 'rankmath',
       'Weekly', 7, 'active'
FROM clients WHERE name = 'Acme SaaS Inc'
ON CONFLICT (domain) DO NOTHING;

INSERT INTO blogs (
  client_id, domain, platform, shopify_store_url, shopify_api_version,
  posting_frequency, posting_frequency_days, status
)
SELECT id, 'brightstore-guide.shop', 'shopify', 'brightstore.myshopify.com', '2024-07',
       '2x per week', 3, 'active'
FROM clients WHERE name = 'BrightStore Commerce'
ON CONFLICT (domain) DO NOTHING;

INSERT INTO blogs (
  client_id, domain, platform, wp_url, seo_plugin,
  posting_frequency, posting_frequency_days, status
)
SELECT id, 'vitality-wellness.co', 'wordpress', 'https://vitality-wellness.co', 'yoast',
       'Weekly', 7, 'setup'
FROM clients WHERE name = 'VitalityHealth Co'
ON CONFLICT (domain) DO NOTHING;
