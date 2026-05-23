-- =============================================================================
--  Mehrere Geometrie-Typen pro Kategorie
--
--  Vorher: damage_categories.geometry_type — genau ein Typ
--  Jetzt:  damage_categories.geometry_types — Array von Typen
--
--  Der Erfasser kann zwischen den erlaubten Typen wählen, wenn mehr als einer
--  konfiguriert ist. Beispiel: "Sturmschaden" könnte sowohl als Punkt (eine
--  Stelle) oder als Polygon (großer Bereich) erfasst werden.
--
--  Die alte Spalte bleibt für RLS und Backward-Compat als "primärer" Typ.
--  Beide werden in sync gehalten durch einen Trigger (siehe unten).
-- =============================================================================

-- 1) Neue Spalte als Array, initial mit dem alten Wert
alter table public.damage_categories
  add column if not exists geometry_types geometry_type[]
  not null
  default array['point']::geometry_type[];

-- 2) Bestehende Daten übernehmen
update public.damage_categories
  set geometry_types = array[geometry_type]::geometry_type[]
  where array_length(geometry_types, 1) = 1 and geometry_types[1] is null;

-- Genauer: für alle Zeilen, deren geometry_types noch dem Default ['point']
-- entsprechen, aber geometry_type was anderes ist:
update public.damage_categories
  set geometry_types = array[geometry_type]::geometry_type[]
  where geometry_types = array['point']::geometry_type[] and geometry_type <> 'point';

-- 3) Trigger: wenn geometry_types geändert wird, übernimm Element 1 als
--    geometry_type (Backward-Compat). Wenn umgekehrt geometry_type geändert
--    wird ohne geometry_types-Update, synchronisieren wir auch.
create or replace function public.tg_sync_geometry_types()
returns trigger language plpgsql as $$
begin
  -- Wenn geometry_types[] geliefert: erstes Element ist der "primäre" Typ
  if new.geometry_types is not null and array_length(new.geometry_types, 1) > 0 then
    new.geometry_type := new.geometry_types[1];
  -- Wenn nur geometry_type geliefert: setze geometry_types auf [type]
  elsif new.geometry_type is not null then
    new.geometry_types := array[new.geometry_type]::geometry_type[];
  end if;
  return new;
end $$;

drop trigger if exists sync_geometry_types on public.damage_categories;
create trigger sync_geometry_types
  before insert or update on public.damage_categories
  for each row execute function public.tg_sync_geometry_types();
