/**
 * Mobiles Objekt-Erfassen für Feldmitarbeiter
 * Schritte: Typ → Position (mit Editor) → Details → Geometrie (bei Linie/Fläche) → Fertig
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { useNetworkObjectTypes, type NetworkObjectType } from '@/hooks/useNetworkObjectTypes';
import { useGeolocation } from '@/hooks/useGeolocation';
import { GeometryDrawer } from '@/components/map/GeometryDrawer';
import { PositionMap } from '@/components/map/PositionMap';
import {
  ArrowLeft, X, MapPin, CheckCircle2, Loader2,
  ChevronRight, Box, Navigation, Minus, Hexagon, Edit3, AlertCircle,
} from 'lucide-react';
import { lineLength, formatLength, polygonArea, formatArea } from '@/lib/geoMeasure';

// ── Typen ─────────────────────────────────────────────────────────────────────

type Step = 'type' | 'position' | 'details' | 'geometry' | 'done';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
const GEOM_LABEL: Record<string, string> = { point: 'Punkt', line: 'Linie', polygon: 'Fläche' };
const GEOM_DESC: Record<string, string> = {
  point:   'Kannst du manuell anpassen oder automatisch ermitteln.',
  line:    'Zeichne die Linie auf der Karte.',
  polygon: 'Zeichne die Fläche auf der Karte.',
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function stepNumber(step: Step, type: NetworkObjectType | null): number {
  const steps: Step[] = ['type', 'position', 'details'];
  if (type?.geometry_type !== 'point') steps.push('geometry');
  steps.push('done');
  return steps.indexOf(step) + 1;
}

function totalSteps(type: NetworkObjectType | null): number {
  return type?.geometry_type !== 'point' ? 5 : 4;
}

// ── Komponente ────────────────────────────────────────────────────────────────

export function ErfasserObjectNewPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { query: typesQ } = useNetworkObjectTypes();
  const types = typesQ.data ?? [];
  const { position, error: gpsError, loading: gpsLoading, fetchPosition: startGps } = useGeolocation();

  const qc = useQueryClient();
  const [step,     setStep]     = useState<Step>('type');
  const [selType,  setSelType]  = useState<NetworkObjectType | null>(null);
  const [name,     setName]     = useState('');
  const [kennung,  setKennung]  = useState('');
  const [geomPts,  setGeomPts]  = useState<number[][]>([]);
  const [editingPos, setEditingPos] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');

  // GPS beim Laden starten (nur einmal)
  useEffect(() => {
    startGps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bei Position-Wechsel Edit-Felder aktualisieren
  useEffect(() => {
    if (position && !editingPos) {
      setEditLat(position.lat.toFixed(6));
      setEditLng(position.lng.toFixed(6));
    }
  }, [position, editingPos]);

  // Gespeichertes Objekt (für Done-Seite)
  const [savedCode, setSavedCode] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selType) throw new Error('Kein Objekttyp ausgewählt');

      // Position von Edit-Feldern oder automatischer Position
      const lat = editingPos ? parseFloat(editLat) : position?.lat;
      const lng = editingPos ? parseFloat(editLng) : position?.lng;

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        throw new Error('Ungültige GPS-Position');
      }

      let geometry: { type: string; coordinates: unknown };
      if (selType.geometry_type === 'point') {
        geometry = { type: 'Point', coordinates: [lng, lat] };
      } else if (selType.geometry_type === 'line') {
        if (geomPts.length < 2) throw new Error('Mindestens 2 Punkte für eine Linie nötig');
        geometry = { type: 'LineString', coordinates: geomPts };
      } else {
        if (geomPts.length < 3) throw new Error('Mindestens 3 Punkte für eine Fläche nötig');
        geometry = { type: 'Polygon', coordinates: [[...geomPts, geomPts[0]]] };
      }

      console.log('[ObjectSave] Payload:', {
        company_id: profile!.company_id,
        object_type_id: selType.id,
        name: name.trim() || null,
        identifier: kennung.trim() || null,
        geometry,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('network_objects')
        .insert({
          company_id:     profile!.company_id,
          object_type_id: selType.id,
          name:           name.trim() || null,
          identifier:     kennung.trim() || null,
          geometry,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[ObjectSave] Error:', error);
        throw new Error(`Speicherfehler: ${error.message}`);
      }

      console.log('[ObjectSave] Success:', data);
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      setSavedCode(id.slice(0, 8).toUpperCase());
      qc.invalidateQueries({ queryKey: ['network-objects'] });
      setStep('done');
    },
  });

  function reset() {
    setStep('type'); setSelType(null);
    setName(''); setKennung(''); setGeomPts([]);
    setSavedCode(null);
    startGps();
  }

  const mapCenter: [number, number] = position
    ? [position.lat, position.lng]
    : [50.9787, 11.0328];

  // ── Header ─────────────────────────────────────────────────────────────────

  function Header() {
    if (step === 'done') return null;
    const n = stepNumber(step, selType);
    const total = totalSteps(selType);
    return (
      <header className="bg-blue-600 text-white">
        <div className="flex items-center gap-3 px-4 pb-3 pt-6">
          <button onClick={() => step === 'type' ? nav('/erfasser') : setStep(step === 'position' ? 'type' : step === 'details' ? 'position' : step === 'geometry' ? 'details' : 'type')}
            className="rounded-full bg-white/15 p-1.5">
            {step === 'type' ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          </button>
          <div className="flex-1">
            <div className="text-xs text-white/70">Schritt {n}/{total} · Objekt erfassen</div>
            <div className="text-base font-medium">
              {step === 'type'     && 'Objekttyp wählen'}
              {step === 'position' && 'Position'}
              {step === 'details'  && 'Details'}
              {step === 'geometry' && 'Geometrie zeichnen'}
            </div>
          </div>
          {selType && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: selType.color }} />
              {selType.name}
            </div>
          )}
        </div>
        <div className="flex gap-1 px-4 pb-2">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded ${i < n ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
      </header>
    );
  }

  // ── Step: Typ wählen ────────────────────────────────────────────────────────

  if (step === 'type') return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-6">
      <Header />
      <div className="flex-1 px-4 py-4 space-y-3">
        {typesQ.isLoading && <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Lade Objekttypen …</div>}
        {!typesQ.isLoading && types.length === 0 && (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">
            <Box className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            Noch keine Objekttypen definiert. Bitte zuerst in der Administration anlegen.
          </div>
        )}
        {/* Gruppiert nach Geometrietyp */}
        {(['point', 'line', 'polygon'] as const).map((gt) => {
          const group = types.filter((t) => t.geometry_type === gt);
          if (group.length === 0) return null;
          const Icon = GEOM_ICON[gt];
          return (
            <div key={gt}>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Icon className="h-3 w-3" /> {GEOM_LABEL[gt]}
              </div>
              <div className="space-y-2">
                {group.map((t) => (
                  <button key={t.id}
                    onClick={() => { setSelType(t); setStep('position'); }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.98] transition hover:bg-slate-50">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${t.color}22` }}>
                      <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{t.name}</div>
                      {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                      <div className="mt-0.5 text-xs text-slate-400">{GEOM_DESC[gt]}</div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Step: Position ──────────────────────────────────────────────────────────

  if (step === 'position') {
    const displayPos = editingPos
      ? { lat: parseFloat(editLat) || 0, lng: parseFloat(editLng) || 0 }
      : position || { lat: 50.9787, lng: 11.0328 };
    const canContinue = editingPos
      ? (editLat && editLng && !isNaN(parseFloat(editLat)) && !isNaN(parseFloat(editLng)))
      : !!position;

    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Header />

        {/* Loading-State wenn GPS noch wird ermittelt */}
        {gpsLoading && !position && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <div className="text-sm text-muted-foreground">GPS wird ermittelt …</div>
            <div className="text-xs text-muted-foreground">Dies kann 10-30 Sekunden dauern</div>
          </div>
        )}

        {/* Karte (volle Höhe) */}
        {(!gpsLoading || position) && (
        <div className="flex-1 overflow-hidden">
          <PositionMap
            center={[displayPos.lat, displayPos.lng]}
            zoom={18}
            markerLat={displayPos.lat}
            markerLng={displayPos.lng}
            onMarkerMove={(lat, lng) => {
              setEditingPos(true);
              setEditLat(lat.toFixed(6));
              setEditLng(lng.toFixed(6));
            }}
          />
        </div>
        )}

        {/* Footer mit GPS-Editor */}
        <div className="border-t bg-white px-4 py-3 space-y-3">
          {/* GPS-Status */}
          <div className={`flex items-center gap-3 rounded-xl border p-2.5 ${!editingPos && position ? 'border-emerald-200 bg-emerald-50' : 'bg-slate-50'}`}>
            <Navigation className={`h-4 w-4 flex-shrink-0 ${gpsLoading ? 'animate-pulse text-blue-500' : !editingPos && position ? 'text-emerald-600' : 'text-slate-400'}`} />
            <div className="flex-1 min-w-0">
              {gpsLoading && <div className="text-xs text-blue-600 font-medium">GPS wird ermittelt …</div>}
              {!editingPos && position && (
                <div className="text-xs text-emerald-700">
                  <span className="font-medium">GPS aktiv:</span>
                  {position.accuracy && <span className="ml-1">±{Math.round(position.accuracy)} m</span>}
                </div>
              )}
              {editingPos && (
                <div className="text-xs text-slate-600">
                  <span className="font-medium text-orange-600">Position wird manuell bearbeitet</span>
                </div>
              )}
              {gpsError && !position && (
                <div className="text-xs text-red-600">GPS-Fehler: {gpsError}</div>
              )}
            </div>
            <div className="flex gap-1">
              {!editingPos && (
                <button onClick={() => { setEditingPos(true); setEditLat(position?.lat.toFixed(6) ?? ''); setEditLng(position?.lng.toFixed(6) ?? ''); }}
                  className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200 flex items-center gap-1">
                  <Edit3 className="h-3 w-3" /> Bearbeiten
                </button>
              )}
              {editingPos && (
                <button onClick={() => setEditingPos(false)}
                  className="rounded-lg border px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">
                  Fertig
                </button>
              )}
              {!editingPos && (
                <button onClick={startGps} disabled={gpsLoading}
                  className="rounded-lg border px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                  Neu
                </button>
              )}
            </div>
          </div>

          {/* Koordinaten-Editor */}
          {editingPos && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-2.5 space-y-2">
              <div className="text-[10px] font-medium text-orange-700 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Position manuell anpassen
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">Breite (Lat)</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    placeholder="z. B. 50.978700"
                    className="w-full rounded-lg border px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">Länge (Lng)</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={editLng}
                    onChange={(e) => setEditLng(e.target.value)}
                    placeholder="z. B. 11.032800"
                    className="w-full rounded-lg border px-2 py-1 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Weiter-Button */}
          <button
            onClick={() => setStep('details')}
            disabled={!canContinue}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition">
            Weiter <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Details ───────────────────────────────────────────────────────────

  if (step === 'details') return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24">
      <Header />
      <div className="flex-1 px-4 py-4 space-y-4">
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Bezeichnung</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`z. B. ${selType?.name ?? 'Objekt'} Nordseite`}
              className="w-full rounded-xl border px-4 py-3 text-base"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Kennung / Nummer</label>
            <input
              value={kennung}
              onChange={(e) => setKennung(e.target.value)}
              placeholder="Interne ID oder Nummer (optional)"
              className="w-full rounded-xl border px-4 py-3 text-base"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Beide Felder sind optional. Du kannst das Objekt auch ohne Angaben erfassen.
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3">
        <button
          onClick={() => setStep(selType?.geometry_type !== 'point' ? 'geometry' : 'done')}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
          {selType?.geometry_type !== 'point' ? (<>Weiter zur Geometrie <ChevronRight className="h-4 w-4" /></>)
            : (<>Objekt speichern <CheckCircle2 className="h-4 w-4" /></>)}
        </button>
        {selType?.geometry_type !== 'point' && (
          <button onClick={() => { saveMut.mutate(); }}
            disabled={saveMut.isPending}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm text-slate-500 active:scale-[0.98] transition">
            Ohne Geometrie speichern
          </button>
        )}
      </div>
    </div>
  );

  // ── Step: Geometrie ─────────────────────────────────────────────────────────

  if (step === 'geometry' && selType?.geometry_type !== 'point') {
    const isLine = selType?.geometry_type === 'line';
    const measure = isLine
      ? (geomPts.length >= 2 ? formatLength(lineLength(geomPts)) : null)
      : (geomPts.length >= 3 ? formatArea(polygonArea(geomPts)) : null);
    const canSave = isLine ? geomPts.length >= 2 : geomPts.length >= 3;

    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Header />
        {/* Messanzeige */}
        {measure && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-medium text-emerald-700 text-center">
            {isLine ? `Länge: ${measure}` : `Fläche: ${measure}`} · {geomPts.length} Punkte
          </div>
        )}
        {/* Karte (volle Höhe minus Header) */}
        <div className="flex-1" style={{ minHeight: 0 }}>
          <GeometryDrawer
            center={mapCenter}
            zoom={18}
            type={isLine ? 'line' : 'polygon'}
            points={geomPts}
            onChange={setGeomPts}
            anchorPoint={position ? [position.lat, position.lng] : null}
          />
        </div>
        {/* Footer */}
        <div className="bg-white border-t px-4 py-3 space-y-2">
          {saveMut.isError && (
            <p className="text-xs text-red-600 text-center">{(saveMut.error as Error).message}</p>
          )}
          <button
            onClick={() => saveMut.mutate()}
            disabled={!canSave || saveMut.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition">
            {saveMut.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Speichern …</>
              : <><CheckCircle2 className="h-4 w-4" /> Objekt speichern ({geomPts.length} Pkt.)</>}
          </button>
        </div>
      </div>
    );
  }

  // Mutation wird über den Button oder Details-Schritt ausgelöst

  // ── Step: Fertig ────────────────────────────────────────────────────────────

  if (step === 'done') return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-8 text-center">
      {saveMut.isPending ? (
        <>
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-500" />
          <div className="text-lg font-semibold">Objekt wird gespeichert …</div>
        </>
      ) : saveMut.isError ? (
        <>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <div className="mb-3 text-lg font-semibold text-red-700">Fehler beim Speichern</div>
          <p className="mb-6 max-w-xs text-sm text-slate-600 bg-red-50 rounded-lg p-3 border border-red-200">
            {(saveMut.error as Error).message}
          </p>
          <div className="w-full max-w-sm space-y-2">
            <button onClick={() => saveMut.mutate()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              <Loader2 className="h-4 w-4" /> Erneut versuchen
            </button>
            <button onClick={() => setStep('details')}
              className="w-full flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Zurück
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Objekt erfasst!</h1>
          <p className="mb-3 text-sm text-muted-foreground">
            {selType?.name ?? 'Objekt'} wurde erfolgreich gespeichert.
          </p>
          {savedCode && (
            <p className="mb-8 font-mono text-sm font-semibold text-slate-500 bg-slate-100 rounded-lg px-3 py-2">
              ID: {savedCode}
            </p>
          )}

          <div className="w-full max-w-sm space-y-3">
            <button onClick={reset}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:scale-[0.98] transition hover:bg-blue-700">
              <Box className="h-4 w-4" /> Weiteres Objekt erfassen
            </button>
            <button onClick={() => nav('/erfasser')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-white py-3 text-sm font-medium text-slate-700 active:scale-[0.98] transition hover:bg-slate-50">
              Zurück zur Startseite
            </button>
          </div>
        </>
      )}
    </div>
  );

  return null;
}
