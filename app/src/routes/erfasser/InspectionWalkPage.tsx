/**
 * Kontrollgang: GPS mitschneiden (läuft via Store auch im Hintergrund weiter,
 * während man einen Schaden erfasst). Beim Beenden werden Abschnitte mit
 * >= 50 % Überdeckung serverseitig als kontrolliert markiert.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { LeafletMap } from '@/components/map/LeafletMap';
import { useInspectionWalk } from './inspectionWalkStore';
import { lineLength, formatLength } from '@/lib/geoMeasure';
import { supabase } from '@/lib/supabase';
import { Play, Square, Loader2, CheckCircle2, Footprints, AlertCircle, AlertTriangle } from 'lucide-react';

export function ErfasserInspectionWalkPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { active, track, current, start, stop, reset } = useInspectionWalk();
  const [result, setResult] = useState<{ count: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distance = track.length >= 2 ? lineLength(track) : 0;

  async function handleStop() {
    stop();
    if (track.length < 2) { setError('Zu wenig Strecke aufgezeichnet.'); return; }
    setSaving(true); setError(null);
    try {
      const geojson = { type: 'LineString', coordinates: track };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('mark_track_inspected', { track: geojson });
      if (error) throw new Error(error.message);
      setResult({ count: (data as number) ?? 0 });
      qc.invalidateQueries({ queryKey: ['segment-status'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const center: [number, number] = current ?? [50.9787, 11.0328];

  return (
    <AppShell accent="blue" title="Kontrollgang" subtitle="Begehung aufzeichnen">
      <div className="space-y-3 px-3 py-3">
        <div className="rounded-xl border bg-blue-50 p-3 text-xs text-blue-700">
          Starte die Aufzeichnung und gehe die Straße ab. Abschnitte, die du zu mindestens
          <b> 50 %</b> begehst, werden beim Beenden als kontrolliert markiert. Du kannst während
          des Gangs jederzeit einen <b>Schaden erfassen</b> — die Aufzeichnung läuft weiter.
        </div>

        {/* Karte mit Track */}
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ height: 'calc(100dvh - 320px)', minHeight: 280 }}>
          <LeafletMap
            center={center}
            zoom={17}
            markerPosition={current}
            line={track.length >= 2 ? track : null}
            allowOverlays={{ network: true, objects: false }}
          />
        </div>

        {/* Status */}
        <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-slate-600">
            <Footprints className="h-4 w-4 text-blue-500" />
            {track.length} Punkte · {formatLength(distance)}
          </span>
          {active && <span className="flex items-center gap-1.5 text-emerald-600"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>läuft</span>}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {result.count > 0 ? `${result.count} Abschnitt(e) als kontrolliert markiert.` : 'Kein Abschnitt ausreichend (≥ 50 %) begangen.'}
          </div>
        )}

        {/* Während der Aufzeichnung: Schaden erfassen */}
        {active && (
          <button
            onClick={() => nav('/erfasser/new/location', { state: { returnTo: '/erfasser/kontrollgang' } })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
            <AlertTriangle className="h-4 w-4" /> Schaden hier erfassen
          </button>
        )}

        {/* Steuerung */}
        {!active ? (
          <button onClick={() => { setResult(null); setError(null); start(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:scale-[0.98] transition">
            <Play className="h-4 w-4" /> {result ? 'Neuen Kontrollgang starten' : 'Aufzeichnung starten'}
          </button>
        ) : (
          <button onClick={handleStop} disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white active:scale-[0.98] transition disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            {saving ? 'Werte aus …' : 'Beenden & auswerten'}
          </button>
        )}

        <button onClick={() => { if (active) stop(); reset(); nav('/erfasser'); }} className="w-full py-2 text-sm text-slate-500">
          Zurück zur Startseite
        </button>
      </div>
    </AppShell>
  );
}
