-- =============================================================================
--  Auftragsnummer: AUF-JAHR-MONAT-TAG-laufende Nummer (täglich neu)
--  z. B. AUF-2026-06-07-01, AUF-2026-06-07-02 …
-- =============================================================================

CREATE OR REPLACE FUNCTION public.next_order_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text := to_char(now(), 'YYYY-MM-DD');
  n int;
BEGIN
  SELECT COALESCE(MAX((substring(code FROM '^AUF-\d{4}-\d{2}-\d{2}-(\d+)$'))::int), 0) + 1
    INTO n
  FROM public.orders
  WHERE code LIKE 'AUF-' || d || '-%';

  RETURN 'AUF-' || d || '-' || lpad(n::text, 2, '0');
END;
$$;

ALTER TABLE public.orders ALTER COLUMN code SET DEFAULT public.next_order_code();
