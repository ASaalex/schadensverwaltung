/**
 * Mobiles Objekt-Erfassen für Feldmitarbeiter
 * Schritte: Typ → Position → Details → Geometrie (bei Linie/Fläche) → Fertig
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { useNetworkObjectTypes, type NetworkObjectType } from '@/hooks/useNetworkObjectTypes';
import { useGeolocation } from '@/hooks/useGeolocation';
import { GeometryDrawer } from '@/components/map/GeometryDrawer';
import { LeafletMap } from '@/components/map/LeafletMap';
import {
  ArrowLeft, X, MapPin, CheckCircle2, Loader2,
  ChevronRight, Box, Navigation, Minus, Hexagon,
} from 'lucide-react';
import { lineLength, formatLength, polygonArea, formatArea } from '@/lib/geoMeasure';

// ── Typen ─────────────────────────────────────────────────────────────────────

type Step = 'type' | 'position' | 'details' | 'geometry' | 'done';

const GEOM_ICON = { point: MapPin, line: Minus, polygon: Hexagon } as const;
const GEOM_LABEL: Record<string, string> = { point: 'Punkt', line: 'Linie', polygon: 'Fläche' };
const GEOM_DESC: Record<string, string> = {
  point:   'Wird automatisch an deiner GPS-Position gesetzt.',
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

  const [step,     setStep]     = useState<Step>('type');
  const [selType,  setSelType]  = useState<NetworkObjectType | null>(null);
  const [name,     setName]     = useState('');
  const [kennung,  setKennung]  = useState('');
  const [geomPts,  setGeomPts]  = useState<number[][]>([]);

  // GPS beim Laden starten
  useEffect(() => { startGps(); }, [startGps]);

  // Gespeichertes Objekt (für Done-Seite)
  const [savedCode, setSavedCode] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selType || !position) throw new Error('Kein Typ oder keine Position');
      let geometry: { type: string; coordinates: unknown };
      if (selType.geometry_type === 'point') {
        geometry = { type: 'Point', coordinates: [position.lng, position.lat] };
      } else if (selType.geometry_type === 'line') {
        if (geomPts.length < 2) throw new Error('Mindestens 2 Punkte für eine Linie nötig');
        geometry = { type: 'LineString', coordinates: geomPts };
      } else {
        if (geomPts.length < 3) throw new Error('Mindestens 3 Punkte für eine Fläche nötig');
        geometry = { type: 'Polygon', coordinates: [[...geomPts, geomPts[0]]] };
      }
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
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      setSavedCode(id.slice(0, 8).toUpperCase());
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

  if (step === 'position') return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24">
      <Header />
      <div className="flex-1 px-4 py-4 space-y-3">
        {/* GPS-Status */}
        <div className={`flex items-center gap-3 rounded-xl border p-3 ${position ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`}>
          <Navigation className={`h-5 w-5 flex-shrink-0 ${gpsLoading ? 'animate-pulse text-blue-500' : position ? 'text-emerald-600' : 'text-slate-400'}`} />
          <div className="flex-1">
            {gpsLoading && <div className="text-sm text-blue-600 font-medium">GPS wird ermittelt …</div>}
            {position && !gpsLoading && (
              <>
                <div className="text-sm font-medium text-emerald-700">Position ermittelt</div>
                <div className="font-mono text-xs text-emerald-600">
                  {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
                  {position.accuracy && <span className="ml-2 text-emerald-500"> ±{Math.round(position.accuracy)} m</span>}
                </div>
              </>
            )}
            {gpsError && !position && (
              <div className="text-sm text-red-600">GPS-Fehler: {gpsError}</div>
            )}
          </div>
          <button onClick={startGps} className="rounded-lg border px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
            Neu
          </button>
        </div>

        {/* Karte */}
        {position && (
          <div className="h-64 overflow-hidden rounded-2xl border shadow-sm">
            <LeafletMap
              center={mapCenter}
              zoom={18}
              markerPosition={[position.lat, position.lng]}
              zoomable={false}
              showLayerSwitcher={false}
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {selType?.geometry_type === 'point'
            ? 'Das Objekt wird an dieser GPS-Position gespeichert.'
            : 'GPS-Position dient als Ausgangspunkt. Geometrie wird im nächsten Schritt gezeichnet.'}
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3">
        <button onClick={() => setStep('details')}
          disabled={!position}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition">
          Weiter <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

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

  // Punkt-Typen: Mutation starten wenn wir zu 'done' wechseln ohne Geometrie
  useEffect(() => {
    if (step === 'done' && !savedCode && !saveMut.isPending && !saveMut.isSuccess) {
      saveMut.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
          <div className="mb-4 text-5xl">⚠️</div>
          <div className="mb-2 text-lg font-semibold text-red-700">Fehler beim Speichern</div>
          <p className="mb-6 text-sm text-slate-500">{(saveMut.error as Error).message}</p>
          <button onClick={() => saveMut.mutate()} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white">
            Erneut versuchen
          </button>
        </>
      ) : (
        <>
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="mb-1 text-2xl font-bold">Objekt erfasst!</h1>
          <p className="mb-1 text-sm text-muted-foreground">
            {selType?.name ?? 'Objekt'} wurde gespeichert.
          </p>
          {savedCode && (
            <p className="mb-6 font-mono text-xs text-slate-400">ID: {savedCode}</p>
          )}

          <div className="w-full max-w-sm space-y-3">
            <button onClick={reset}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
              <Box className="h-4 w-4" /> Weiteres Objekt erfassen
            </button>
            <button onClick={() => nav('/erfasser')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-white py-3 text-sm font-medium text-slate-700 active:scale-[0.98] transition">
              Zurück zur Startseite
            </button>
          </div>
        </>
      )}
    </div>
  );

  return null;
}
