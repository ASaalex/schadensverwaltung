-- =============================================================================
--  Code-Zähler mit den tatsächlich vergebenen Codes resynchronisieren.
--  Behebt "duplicate key ... damages_code_key", wenn Datensätze mit explizitem
--  Code eingespielt wurden, ohne code_counters hochzuzählen.
-- =============================================================================

-- SCH (Schäden) — pro Jahr auf MAX(Suffix) setzen
INSERT INTO public.code_counters (prefix, year, last_value)
SELECT 'SCH',
       split_part(code, '-', 2)::int                         AS year,
       COALESCE(MAX(split_part(code, '-', 3)::int), 0)        AS last_value
FROM public.damages
WHERE code ~ '^SCH-\d+-\d+$'
GROUP BY split_part(code, '-', 2)::int
ON CONFLICT (prefix, year)
  DO UPDATE SET last_value = GREATEST(code_counters.last_value, EXCLUDED.last_value);

-- AUF (Aufträge) — analog
INSERT INTO public.code_counters (prefix, year, last_value)
SELECT 'AUF',
       split_part(code, '-', 2)::int,
       COALESCE(MAX(split_part(code, '-', 3)::int), 0)
FROM public.orders
WHERE code ~ '^AUF-\d+-\d+$'
GROUP BY split_part(code, '-', 2)::int
ON CONFLICT (prefix, year)
  DO UPDATE SET last_value = GREATEST(code_counters.last_value, EXCLUDED.last_value);
