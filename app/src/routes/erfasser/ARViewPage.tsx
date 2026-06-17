/**
 * Geo-AR: Kamerabild als Hintergrund, Wimpel für Schäden/Objekte im Umkreis
 * (150 m), platziert nach GPS-Peilung + Geräte-Kompass. Tippen → Info.
 * Echtes welt-verankertes AR ist im Browser/iOS nicht verfügbar — daher
 * Richtungs-AR (grobe Lage + Distanz).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useGpsWatch } from '@/hooks/useGeolocation';
import { useDeviceHeading, requestOrientationPermission, bearingTo } from '@/hooks/useDeviceHeading';
import { useDamagesInBounds, type DamageFilters } from '@/hooks/useDamagesQuery';
import { useObjectsInBounds } from '@/hooks/useObjectsInBounds';
import { objectCenter, useNetworkObject } from '@/hooks/useNetworkObjects';
import { useDamageDetail } from '@/hooks/useDamageDetail';
import { haversineDistance } from '@/lib/geoMeasure';
import { Camera, X, AlertTriangle, Box, Navigation2, Compass } from 'lucide-react';

const RADIUS_M = 150;
const FOV = 60; // angenommenes horizontales Sichtfeld der Kamera in Grad

type Target = {
  kind: 'damage' | 'object';
  id: string;
  lat: number; lng: number;
  title: string; subtitle: string;
  color: string;
};

export function ARViewPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Target | null>(null);

  const [zoom, setZoom] = useState(1);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const { position } = useGpsWatch(started);
  const { heading } = useDeviceHeading(started);

  // Kamerabild zuverlässig anbinden — erst NACHDEM das <video> gemountet ist
  useEffect(() => {
    if (!started || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [started]);

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (!pinchRef.current) { pinchRef.current = { dist, zoom }; return; }
    const ratio = dist / pinchRef.current.dist;
    setZoom(Math.max(1, Math.min(4, pinchRef.current.zoom * ratio)));
  }
  function onTouchEnd() { pinchRef.current = null; }

  // Daten im 150-m-Umkreis (kleiner BBox)
  const bounds = useMemo(() => {
    if (!position) return null;
    const dLat = 0.0014; // ~155 m
    const dLng = dLat / Math.max(0.2, Math.cos((position.lat * Math.PI) / 180));
    return { minLat: position.lat - dLat, maxLat: position.lat + dLat, minLng: position.lng - dLng, maxLng: position.lng + dLng };
  }, [position]);

  const damageFilters: DamageFilters = useMemo(() => ({
    search: '', status: [], priority: [], categoryIds: null, dateFrom: '', dateTo: '', showCompleted: false,
  }), []);
  const { data: damageData } = useDamagesInBounds(damageFilters, bounds, started && !!bounds);
  const { data: objects = [] } = useObjectsInBounds(bounds, started && !!bounds);

  // Kamera starten
  async function start() {
    setError(null);
    try {
      await requestOrientationPermission();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
      streamRef.current = stream;
      setStarted(true); // <video> wird gemountet → Effekt bindet den Stream an

    } catch (e) {
      setError('Kamera-/Sensorzugriff nicht möglich: ' + (e as Error).message);
    }
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Ziele aufbauen
  const targets: Target[] = useMemo(() => {
    if (!position) return [];
    const out: Target[] = [];
    for (const d of damageData?.items ?? []) {
      if (d.gps_lat == null || d.gps_lng == null) continue;
      out.push({
        kind: 'damage', id: d.id, lat: d.gps_lat, lng: d.gps_lng,
        title: d.category_name ?? 'Schaden', subtitle: d.code,
        color: d.priority === 'dringend' ? '#dc2626' : d.priority === 'hoch' ? '#ea580c' : '#3b82f6',
      });
    }
    for (const o of objects) {
      const [lng, lat] = objectCenter(o);
      out.push({
        kind: 'object', id: o.id, lat, lng,
        title: o.name ?? o.identifier ?? o.type_name ?? 'Objekt', subtitle: o.type_name ?? '',
        color: o.type_color ?? '#6366f1',
      });
    }
    return out;
  }, [position, damageData, objects]);

  // Sichtbare Wimpel berechnen (innerhalb FOV, ≤ Radius)
  const visible = useMemo(() => {
    if (!position || heading == null) return [];
    return targets.map((t) => {
      const dist = haversineDistance([position.lng, position.lat], [t.lng, t.lat]);
      const brg = bearingTo(position.lat, position.lng, t.lat, t.lng);
      let diff = ((brg - heading + 540) % 360) - 180; // -180..180
      return { t, dist, diff };
    }).filter((v) => v.dist <= RADIUS_M && Math.abs(v.diff) <= FOV / 2 + 8)
      .sort((a, b) => b.dist - a.dist); // ferne zuerst zeichnen
  }, [targets, position, heading]);

  // ── Start-Gate ──────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-900 px-6 text-center text-white">
        <Camera className="mb-4 h-14 w-14 text-white/80" />
        <h1 className="mb-2 text-xl font-bold">AR-Ansicht</h1>
        <p className="mb-6 max-w-sm text-sm text-white/70">
          Halte das Handy hoch und schwenke umher. Schäden und Objekte im Umkreis von 150 m
          werden als Wimpel im Kamerabild angezeigt. Lage ist ungefähr (GPS + Kompass).
        </p>
        {error && <p className="mb-4 max-w-sm rounded-lg bg-red-500/20 p-3 text-sm text-red-200">{error}</p>}
        <button onClick={start} className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold">
          Kamera & Kompass aktivieren
        </button>
        <button onClick={() => nav('/erfasser')} className="mt-4 text-sm text-white/60">Zurück</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] overflow-hidden bg-black"
      onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Skalierbare Szene: Kamera + Wimpel zoomen gemeinsam → bleiben ausgerichtet */}
      <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
        <div className="absolute inset-0">
          {visible.map(({ t, dist, diff }) => {
            const xPct = 50 + (diff / (FOV / 2)) * 50;
            const mscale = Math.max(0.6, Math.min(1.3, 1.3 - dist / 300));
            const yPct = 42 + Math.min(18, dist / 12);
            const Icon = t.kind === 'object' ? Box : AlertTriangle;
            return (
              <button key={`${t.kind}-${t.id}`}
                onClick={() => setSelected(t)}
                style={{ left: `${xPct}%`, top: `${yPct}%`, transform: `translate(-50%,-100%) scale(${mscale})` }}
                className="absolute flex flex-col items-center">
                <div className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white shadow-lg"
                  style={{ background: t.color }}>
                  <Icon className="h-3.5 w-3.5" /> {Math.round(dist)} m
                </div>
                <div className="max-w-[120px] truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{t.title}</div>
                <div style={{ borderTopColor: t.color }} className="h-0 w-0 border-x-[6px] border-t-[10px] border-x-transparent" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Kompass-Hinweis (nicht skaliert) */}
      {heading == null && (
        <div className="absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5 animate-pulse" /> Kompass wird kalibriert … (Gerät in Acht bewegen)
        </div>
      )}

      {/* Zoom-Steuerung */}
      <div className="absolute bottom-4 right-3 z-[2050] flex flex-col gap-2">
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-2xl font-light text-white">+</button>
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-2xl font-light text-white">−</button>
        {zoom > 1 && <div className="rounded-full bg-black/55 px-2 py-0.5 text-center text-[10px] text-white">{zoom.toFixed(1)}×</div>}
      </div>

      {/* Kopfzeile */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 text-white">
        <span className="flex items-center gap-1.5 text-sm">
          <Navigation2 className="h-4 w-4" /> {visible.length} im Blick · {targets.length} im Umkreis
        </span>
        <button onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); nav('/erfasser'); }}
          className="rounded-full bg-black/50 p-2"><X className="h-5 w-5" /></button>
      </div>

      {/* Info-Sheet (Details inline) */}
      {selected && (
        <ARDetailSheet
          selected={selected}
          canOpen={profile?.role === 'admin' || profile?.role === 'dispatcher'}
          onOpen={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); nav(selected.kind === 'damage' ? `/dispo/damages/${selected.id}` : `/dispo/objects/${selected.id}`); }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

const PRIO_LABEL: Record<string, string> = { niedrig: 'Niedrig', normal: 'Normal', hoch: 'Hoch', dringend: 'Dringend' };

function ARDetailSheet({ selected, canOpen, onOpen, onClose }: {
  selected: Target; canOpen: boolean; onOpen: () => void; onClose: () => void;
}) {
  const dmg = useDamageDetail(selected.kind === 'damage' ? selected.id : undefined);
  const objQ = useNetworkObject(selected.kind === 'object' ? selected.id : undefined);
  const d = dmg.data;
  const o = objQ.data;

  return (
    <div className="absolute inset-x-0 bottom-0 z-[2100] max-h-[60%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <span className="h-3 w-3 rounded-full" style={{ background: selected.color }} />
            {selected.title}
          </div>
          <div className="text-xs text-muted-foreground">{selected.subtitle}</div>
        </div>
        <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
      </div>

      {/* Schaden-Details */}
      {selected.kind === 'damage' && (
        <div className="space-y-1.5 text-sm">
          {dmg.isLoading && <div className="text-muted-foreground">Lade …</div>}
          {d && (
            <>
              <Row label="Kategorie" value={d.categoryPath.join(' › ') || '—'} />
              <Row label="Status" value={d.damage.status} />
              <Row label="Priorität" value={PRIO_LABEL[d.damage.priority] ?? d.damage.priority} />
              <Row label="Adresse" value={[d.damage.address_street, d.damage.address_city].filter(Boolean).join(', ') || '—'} />
              {d.damage.description && <Row label="Bemerkung" value={d.damage.description} />}
              {d.creatorName && <Row label="Erfasser" value={d.creatorName} />}
              {d.photos[0]?.url && <img src={d.photos[0].url} alt="" className="mt-2 max-h-40 w-full rounded-lg object-cover" />}
            </>
          )}
        </div>
      )}

      {/* Objekt-Details */}
      {selected.kind === 'object' && (
        <div className="space-y-1.5 text-sm">
          {objQ.isLoading && <div className="text-muted-foreground">Lade …</div>}
          {o && (
            <>
              <Row label="Typ" value={o.type_name ?? '—'} />
              {o.identifier && <Row label="Kennung" value={o.identifier} />}
              {Object.entries(o.attributes ?? {}).map(([k, v]) => <Row key={k} label={k} value={String(v)} />)}
            </>
          )}
        </div>
      )}

      {canOpen && (
        <button onClick={onOpen} className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white">
          Vollständige Detailseite öffnen
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="flex-shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
