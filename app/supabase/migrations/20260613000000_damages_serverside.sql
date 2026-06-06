-- =============================================================================
--  Serverseitiges Filtern/Suchen/Sortieren/Paginieren für Schäden
--  - Sicht damages_list mit denormalisiertem Kategorie-/Erfassername
--    (security_invoker → RLS der Basistabellen greift weiter)
--  - Rang-Spalten für semantische Sortierung von Priorität/Status
--  - Indizes für Filter, Sortierung, BBox-Karte und Trigram-Suche
-- =============================================================================

CREATE OR REPLACE VIEW damages_list
WITH (security_invoker = on) AS
SELECT
  d.id, d.company_id, d.code, d.status, d.priority, d.created_at, d.created_by,
  d.description, d.gps_lat, d.gps_lng, d.gps_accuracy_m, d.geometry,
  d.address_street, d.address_house_number, d.address_postal_code, d.address_city,
  d.category_id,
  c.name        AS category_name,
  u.full_name   AS creator_name,
  CASE d.priority WHEN 'niedrig' THEN 0 WHEN 'normal' THEN 1
                  WHEN 'hoch' THEN 2 WHEN 'dringend' THEN 3 ELSE -1 END AS priority_rank,
  CASE d.status   WHEN 'neu' THEN 0 WHEN 'geprueft' THEN 1 WHEN 'zugewiesen' THEN 2
                  WHEN 'bearbeitung' THEN 3 WHEN 'erledigt' THEN 4
                  WHEN 'abgelehnt' THEN 5 ELSE -1 END AS status_rank
FROM damages d
LEFT JOIN damage_categories c ON c.id = d.category_id
LEFT JOIN users u            ON u.id = d.created_by;

-- ── Btree-Indizes (Filter / Sortierung / Pagination) ─────────────────────────
CREATE INDEX IF NOT EXISTS damages_company_created_idx ON damages (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS damages_company_status_idx  ON damages (company_id, status);
CREATE INDEX IF NOT EXISTS damages_company_prio_idx    ON damages (company_id, priority);
CREATE INDEX IF NOT EXISTS damages_company_cat_idx     ON damages (company_id, category_id);
CREATE INDEX IF NOT EXISTS damages_company_code_idx    ON damages (company_id, code);

-- ── BBox-Karte ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS damages_company_gps_idx ON damages (company_id, gps_lat, gps_lng);

-- ── Trigram-Suche (ilike) auf den Haupt-Textspalten ──────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS damages_code_trgm   ON damages USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS damages_desc_trgm   ON damages USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS damages_street_trgm ON damages USING gin (address_street gin_trgm_ops);
CREATE INDEX IF NOT EXISTS damages_city_trgm   ON damages USING gin (address_city gin_trgm_ops);
