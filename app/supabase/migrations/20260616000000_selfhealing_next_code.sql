-- =============================================================================
--  next_code() selbstheilend machen:
--  Die nächste Nummer wird IMMER aus dem tatsächlichen MAX der jeweiligen
--  Tabelle (damages/orders) abgeleitet — unabhängig vom code_counters-Stand.
--  Behebt "duplicate key ... damages_code_key" endgültig, auch nach Importen
--  mit explizitem Code.
-- =============================================================================

-- Prefix-LIKE-Indizes, damit der MAX-Scan schnell bleibt
CREATE INDEX IF NOT EXISTS damages_code_pattern_idx ON public.damages (code text_pattern_ops);
CREATE INDEX IF NOT EXISTS orders_code_pattern_idx  ON public.orders  (code text_pattern_ops);

CREATE OR REPLACE FUNCTION public.next_code(p_prefix text)
RETURNS text
LANGUAGE plpgsql
VOLATILE                       -- MUSS volatile sein (Seiteneffekt + eindeutig pro Aufruf)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year     int := extract(year from now())::int;
  v_existing int := 0;
  v_next     int;
BEGIN
  -- Höchste bereits vergebene Nummer für Prefix+Jahr ermitteln
  IF p_prefix = 'SCH' THEN
    SELECT COALESCE(MAX(split_part(code, '-', 3)::int), 0) INTO v_existing
    FROM public.damages
    WHERE code ~ ('^SCH-' || v_year || '-[0-9]+$');
  ELSIF p_prefix = 'AUF' THEN
    SELECT COALESCE(MAX(split_part(code, '-', 3)::int), 0) INTO v_existing
    FROM public.orders
    WHERE code ~ ('^AUF-' || v_year || '-[0-9]+$');
  END IF;

  -- Zähler atomar hochzählen, aber nie unter den Tabellen-Max fallen
  INSERT INTO public.code_counters (prefix, year, last_value)
    VALUES (p_prefix, v_year, v_existing + 1)
    ON CONFLICT (prefix, year) DO UPDATE
      SET last_value = GREATEST(code_counters.last_value, v_existing) + 1
    RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END $$;
