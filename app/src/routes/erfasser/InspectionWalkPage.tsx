/**
 * Kontrollgang: GPS mitschneiden (läuft via Store auch im Hintergrund weiter,
 * während man einen Schaden erfasst). Beim Beenden werden Abschnitte mit
 * >= 50 % Überdeckung serverseitig als kontrolliert markiert.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { InspectionStatusMap } from '@/components/map/InspectionStatusMap';
import { useInspectionWalk } from './inspectionWalkStore';
import { lineLength, formatLength } from '@/lib/geoMeasure';
import { supabase } from '@/lib/supabase';
import { Play, Square, Loader2, CheckCircle2, Footprints, AlertCircle, AlertTriangle } from 'lucide-react';

export function ErfasserInspectionWalkPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { active, track, current, start, stop, reset } = useInspectionWalk();
  const [result, setResult] = useState<{ count: number } | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markingRef = useRef(false);   // verhindert überlappende Live-Aufrufe
  const totalRef = useRef(0);          // markierte Abschnitte dieses Gangs

  const distance = track.length >= 2 ? lineLength(track) : 0;

  // Live-Markierung: während des Gangs regelmäßig auswerten, damit Abschnitte
  // schon bei 50 % Überdeckung grün werden – nicht erst beim Beenden.
  // dedup_minutes verhindert Mehrfach-Markierung desselben Abschnitts im Gang.
  async function markLive() {
    if (markingRef.current) return;
    const t = useInspectionWalk.getState().track;
    if (t.length < 2) return;
    markingRef.current = true;
    try {
      const geojson = { type: 'LineString', coordinates: t };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('mark_track_inspected', { track: geojson, dedup_minutes: 720 });
      if (!error && (data as number) > 0) {
        totalRef.current += data as number;
        setLiveCount(totalRef.current);
        qc.invalidateQueries({ queryKey: ['segment-status'] });
      }
    } finally {
      markingRef.current = false;
    }
  }

  useEffect(() => {
    if (!active) return;
    totalRef.current = 0;
    setLiveCount(0);
    const iv = setInterval(markLive, 15_000); // alle 15 s auswerten
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function handleStop() {
    stop();
    if (track.length < 2) { setError('Zu wenig Strecke aufgezeichnet.'); return; }
    setSaving(true); setError(null);
    try {
      const geojson = { type: 'LineString', coordinates: track };
      // Abschluss-Auswertung – dedup verhindert Doppelung der live markierten
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('mark_track_inspected', { track: geojson, dedup_minutes: 720 });
      if (error) throw new Error(error.message);
      totalRef.current += (data as number) ?? 0;
      setResult({ count: totalRef.current });
      qc.invalidateQueries({ queryKey: ['segment-status'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }


  return (
    <AppShell accent="blue" title="Kontrollgang" subtitle="Begehung aufzeichnen">
      <div className="space-y-3 px-3 py-3">
        <div className="rounded-xl border bg-blue-50 p-3 text-xs text-blue-700">
          Starte die Aufzeichnung und gehe die Straße ab. Abschnitte werden <b>schon während des
          Gangs</b> grün, sobald du sie zu mindestens <b>50 %</b> begangen hast. Du kannst jederzeit
          einen <b>Schaden erfassen</b> — die Aufzeichnung läuft weiter.
        </div>

        {/* Karte mit Track */}
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ height: 'calc(100dvh - 320px)', minHeight: 280 }}>
          {/* Netz nach Fälligkeit eingefärbt; Klick auf Abschnitt zeigt letzte Begehung */}
          <InspectionStatusMap track={track} current={current} />
        </div>

        {/* Status */}
        <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-slate-600">
            <Footprints className="h-4 w-4 text-blue-500" />
            {track.length} Punkte · {formatLength(distance)}
          </span>
          {active && (
            <span className="flex items-center gap-3">
              {liveCount > 0 && <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />{liveCount} grün</span>}
              <span className="flex items-center gap-1.5 text-emerald-600"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>läuft</span>
            </span>
          )}
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
