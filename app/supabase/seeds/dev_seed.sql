-- =============================================================================
--  Schadensverwaltung — Development Seed
--
--  In Supabase Cloud auszuführen NACH der initial-migration.
--  Liefert:
--    - Bauhof Erfurt (interne Org)
--    - Eine externe Beispiel-Firma
--    - Schadenskatalog-Baum mit Beispiel-Custom-Fields
--    - Karten-Layer für Thüringen (OSM + Luftbild + ALKIS)
--    - App-Einstellungen
--
--  Nutzer werden NICHT geseedet — die werden über Supabase Auth Dashboard
--  angelegt (E-Mail + Passwort), danach manuell in public.users verknüpft
--  (siehe README.md "Ersten Admin anlegen").
-- =============================================================================

-- Bauhof Erfurt (interne Hauptorganisation)
insert into public.companies (id, name, type, contact_email, address, active)
values (
  '00000000-0000-0000-0000-000000000001',
  'Bauhof Erfurt',
  'internal_bauhof',
  'bauhof@erfurt.de',
  'Fischmarkt 1, 99084 Erfurt',
  true
) on conflict (id) do nothing;

-- Beispiel externe Firma
insert into public.companies (id, name, type, contact_email, address, active)
values (
  '00000000-0000-0000-0000-000000000002',
  'Müller Bau GmbH',
  'external_company',
  'mueller@muellerbau.de',
  'Industriestraße 47, 99086 Erfurt',
  true
) on conflict (id) do nothing;

-- App-Einstellungen für Bauhof Erfurt (Erfurt Zentrum als Karten-Default)
insert into public.app_settings (company_id, default_map_lat, default_map_lng, default_map_zoom)
values ('00000000-0000-0000-0000-000000000001', 50.9787, 11.0328, 13)
on conflict (company_id) do nothing;

-- Karten-Layer für Thüringen
insert into public.map_layers (company_id, name, type, url_template, attribution, is_default, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'OpenStreetMap', 'xyz',
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    '© OpenStreetMap-Mitwirkende', true, 1),
  ('00000000-0000-0000-0000-000000000001', 'Luftbild Thüringen', 'wms',
    'https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP?service=WMS&version=1.3.0&request=GetMap&layers=th_dop&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox={bbox}',
    '© GDI-Th, Geobasisdaten Thüringen', false, 2),
  ('00000000-0000-0000-0000-000000000001', 'ALKIS Kataster', 'wms',
    'https://www.geoproxy.geoportal-th.de/geoproxy/services/ALKIS?service=WMS&version=1.3.0&request=GetMap&layers=th_alkis&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox={bbox}',
    '© GDI-Th, Liegenschaftskataster Thüringen', false, 3)
on conflict do nothing;

-- =============================================================================
--  Schadenskatalog-Baum
-- =============================================================================
-- Wurzel 1: Straße
with
  c_strasse as (
    insert into public.damage_categories (company_id, name, code, sort_order)
    values ('00000000-0000-0000-0000-000000000001', 'Straße', 'STR', 1)
    returning id
  ),
  c_belag as (
    insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'Belag', 'STR-BEL', 1 from c_strasse
    returning id
  ),
  c_schlagloch as (
    insert into public.damage_categories
      (company_id, parent_id, name, code, sort_order, geometry_type, default_priority, property_schema)
    select '00000000-0000-0000-0000-000000000001', id, 'Schlagloch', 'STR-BEL-SCHL', 1,
      'point'::geometry_type, 'normal'::priority,
      '[
        {"name":"diameter","label":"Durchmesser","field_type":"decimal","unit":"cm","required":false},
        {"name":"depth","label":"Tiefe","field_type":"decimal","unit":"cm","required":false},
        {"name":"material","label":"Material","field_type":"select","options":["Asphalt","Pflaster","Beton"],"required":false},
        {"name":"barrier_needed","label":"Absperrung erforderlich","field_type":"boolean","required":false}
       ]'::jsonb
    from c_belag returning id
  ),
  c_riss as (
    insert into public.damage_categories
      (company_id, parent_id, name, code, sort_order, geometry_type, property_schema)
    select '00000000-0000-0000-0000-000000000001', id, 'Riss', 'STR-BEL-RISS', 2,
      'line'::geometry_type,
      '[{"name":"width","label":"Breite","field_type":"decimal","unit":"cm","required":false}]'::jsonb
    from c_belag returning id
  ),
  c_absackung as (
    insert into public.damage_categories (company_id, parent_id, name, code, sort_order, geometry_type)
    select '00000000-0000-0000-0000-000000000001', id, 'Absackung', 'STR-BEL-ABS', 3, 'polygon'::geometry_type
    from c_belag returning id
  ),
  c_schild as (
    insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'Verkehrsschild', 'STR-SCHILD', 2 from c_strasse
    returning id
  ),
  _s1 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'verbogen', 'STR-SCHILD-VB', 1 from c_schild returning id),
  _s2 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'verschmutzt', 'STR-SCHILD-VS', 2 from c_schild returning id),
  _s3 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'fehlt', 'STR-SCHILD-FH', 3 from c_schild returning id),
  c_markierung as (
    insert into public.damage_categories (company_id, parent_id, name, code, sort_order, geometry_type)
    select '00000000-0000-0000-0000-000000000001', id, 'Markierung', 'STR-MARK', 3, 'line'::geometry_type
    from c_strasse returning id
  ),
-- Wurzel 2: Beleuchtung
  c_licht as (
    insert into public.damage_categories (company_id, name, code, sort_order)
    values ('00000000-0000-0000-0000-000000000001', 'Beleuchtung', 'BEL', 2)
    returning id
  ),
  _b1 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order, default_priority)
    select '00000000-0000-0000-0000-000000000001', id, 'Lampe defekt', 'BEL-LAM', 1, 'normal'::priority
    from c_licht returning id),
  _b2 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order, default_priority)
    select '00000000-0000-0000-0000-000000000001', id, 'Mast beschädigt', 'BEL-MAST', 2, 'hoch'::priority
    from c_licht returning id),
-- Wurzel 3: Grünflächen
  c_gruen as (
    insert into public.damage_categories (company_id, name, code, sort_order)
    values ('00000000-0000-0000-0000-000000000001', 'Grünflächen', 'GRU', 3)
    returning id
  ),
  c_baum as (
    insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'Baum', 'GRU-BAUM', 1 from c_gruen returning id
  ),
  _g1 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order, default_priority)
    select '00000000-0000-0000-0000-000000000001', id, 'umgestürzt', 'GRU-BAUM-UG', 1, 'dringend'::priority
    from c_baum returning id),
  _g2 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order, default_priority)
    select '00000000-0000-0000-0000-000000000001', id, 'Astbruch', 'GRU-BAUM-AB', 2, 'hoch'::priority
    from c_baum returning id),
  c_sturm as (
    insert into public.damage_categories
      (company_id, parent_id, name, code, sort_order, geometry_type, property_schema)
    select '00000000-0000-0000-0000-000000000001', id, 'Sturmschaden', 'GRU-STURM', 2,
      'polygon'::geometry_type,
      '[
        {"name":"cleanup_effort","label":"Aufräumbedarf","field_type":"select","options":["gering","mittel","hoch"],"required":true},
        {"name":"affected_trees","label":"Anzahl Bäume betroffen","field_type":"number","required":false}
       ]'::jsonb
    from c_gruen returning id
  ),
  _g3 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order)
    select '00000000-0000-0000-0000-000000000001', id, 'Hecke', 'GRU-HECKE', 3 from c_gruen returning id),
-- Wurzel 4: Spielplatz
  c_spielplatz as (
    insert into public.damage_categories (company_id, name, code, sort_order)
    values ('00000000-0000-0000-0000-000000000001', 'Spielplatz', 'SPL', 4)
    returning id
  ),
  _sp1 as (insert into public.damage_categories (company_id, parent_id, name, code, sort_order, default_priority)
    select '00000000-0000-0000-0000-000000000001', id, 'Gerät defekt', 'SPL-GER', 1, 'hoch'::priority
    from c_spielplatz returning id)
select 'seed done' as status;
