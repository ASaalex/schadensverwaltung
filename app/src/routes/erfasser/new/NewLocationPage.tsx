import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardHeader } from './WizardHeader';
import { LeafletMap } from '@/components/map/LeafletMap';
import { useGeolocation, useGpsWatch } from '@/hooks/useGeolocation';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import { useAddressSearch } from '@/hooks/useAddressSearch';
import { useWizardStore } from '../wizardStore';
import type { ResolvedAddress } from '@/hooks/useReverseGeocode';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Crosshair,
  Search,
  Info,
  Pause,
  Play,
} from 'lucide-react';

const DEFAULT_CENTER: [number, number] = [50.9787, 11.0328];

export function NewLocationPage() {
  const nav = useNavigate();
  const { position: oneShot, setPosition: setOneShot, loading: gpsLoading, error: gpsError, fetchPosition } = useGeolocation();
  const storePos = useWizardStore((s) => s.position);
  const storeAddress = useWizardStore((s) => s.address);
  const setStorePos = useWizardStore((s) => s.setPosition);
  const setStoreAddress = useWizardStore((s) => s.setAddress);

  // Live-Tracking: an, solange User nicht manuell die Position überschreibt
  const [tracking, setTracking] = useState(true);
  const { position: livePos, error: liveErr } = useGpsWatch(tracking);

  // Sobald Live-Position kommt, in Store übernehmen (überschreibt One-Shot)
  useEffect(() => {
    if (tracking && livePos) {
      setStorePos(livePos);
      setOneShot(livePos);
    }
  }, [livePos, tracking, setStorePos, setOneShot]);

  // Adresssuche
  const [searchText, setSearchText] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { results, loading: searchLoading } = useAddressSearch(searchText);

  // Falls vom One-Shot was kommt und noch nichts im Store ist
  useEffect(() => {
    if (oneShot && !storePos) {
      setStorePos(oneShot);
    }
  }, [oneShot, storePos, setStorePos]);

  const activePos = storePos ?? oneShot;
  const center: [number, number] = activePos ? [activePos.lat, activePos.lng] : DEFAULT_CENTER;

  const { address: reversed, loading: addrLoading } = useReverseGeocode(
    activePos?.lat ?? null,
    activePos?.lng ?? null,
  );
  useEffect(() => {
    if (reversed) setStoreAddress(reversed);
  }, [reversed, setStoreAddress]);

  function setPositionFromLatLng(lat: number, lng: number, accuracy?: number) {
    const newPos = { lat, lng, accuracy: accuracy ?? 0 };
    setStorePos(newPos);
    setOneShot(newPos);
    // Manuelle Position → Tracking pausieren (sonst überschreibt es uns wieder)
    setTracking(false);
  }

  function handleMapClick(lat: number, lng: number) {
    setPositionFromLatLng(lat, lng);
  }
  function handleMarkerDrag(lat: number, lng: number) {
    setPositionFromLatLng(lat, lng, activePos?.accuracy);
  }
  function pickSearchResult(r: typeof results[number]) {
    setPositionFromLatLng(r.lat, r.lng);
    const addr: ResolvedAddress = {
      street: r.street,
      house_number: r.house_number,
      postal_code: r.postal_code,
      city: r.city,
      display_name: r.display_name,
    };
    setStoreAddress(addr);
    setSearchText('');
    setShowResults(false);
  }

  function handleNext() {
    if (!activePos) return;
    nav('/erfasser/new/category');
  }

  const showGpsError = (!!gpsError || !!liveErr) && !activePos;

  return (
    // 100dvh fängt das iPhone-Safari-Viewport-Problem ab
    <div className="flex flex-col bg-slate-50" style={{ minHeight: '100dvh' }}>
      <WizardHeader step={1} title="Position bestimmen" back={null} />

      {/* Adresssuche */}
      <div className="relative bg-white px-4 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder="Adresse suchen — z.B. Domplatz Erfurt"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />
          )}
        </div>
        {showResults && searchText.trim().length >= 3 && (
          <div className="absolute left-4 right-4 top-full z-[1100] mt-1 max-h-72 overflow-y-auto rounded-lg border bg-white shadow-lg">
            {!searchLoading && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Keine Treffer.</div>
            )}
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => pickSearchResult(r)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
              >
                <div className="font-medium">
                  {[r.street, r.house_number].filter(Boolean).join(' ') || r.display_name.split(',')[0]}
                </div>
                <div className="text-xs text-muted-foreground">{r.display_name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Karte */}
      <div className="relative h-64 w-full">
        <LeafletMap
          center={center}
          zoom={activePos ? 17 : 13}
          markerPosition={activePos ? [activePos.lat, activePos.lng] : null}
          draggableMarker
          onMarkerDrag={handleMarkerDrag}
          onMapClick={handleMapClick}
        />
        {!activePos && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] mx-auto w-fit max-w-[90%] rounded bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow">
            Tippe auf die Karte, um die Position zu setzen — oder nutze Suche / GPS.
          </div>
        )}
        {/* Live-Tracking-Indikator */}
        {tracking && activePos && (
          <div className="absolute right-2 top-2 z-[1000] flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
            </span>
            GPS live
          </div>
        )}
      </div>

      {/* Detail-Bereich */}
      <div className="flex-1 overflow-y-auto bg-white px-4 py-4">
        {gpsLoading && !activePos && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> GPS-Position wird ermittelt …
          </div>
        )}
        {showGpsError && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" /> GPS nicht verfügbar
            </div>
            <div className="text-xs">
              {gpsError ?? liveErr} — kein Problem, nutze die Adresssuche oder tippe direkt auf die Karte.
            </div>
          </div>
        )}
        {activePos && (
          <div className="mb-3 flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Position gesetzt
            {activePos.accuracy > 0 && ` · GPS ±${Math.round(activePos.accuracy)} m`}
          </div>
        )}

        {activePos && (
          <>
            <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Adresse</div>
            <div className="rounded-lg bg-slate-50 p-3">
              {addrLoading && !storeAddress && (
                <div className="text-sm text-slate-500">Adresse wird aufgelöst …</div>
              )}
              {storeAddress && (
                <>
                  <div className="font-medium text-slate-900">
                    {storeAddress.street ?? '—'}
                    {storeAddress.house_number ? ` ${storeAddress.house_number}` : ''}
                  </div>
                  <div className="text-sm text-slate-600">
                    {storeAddress.postal_code} {storeAddress.city}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {activePos.lat.toFixed(5)}, {activePos.lng.toFixed(5)}
                  </div>
                </>
              )}
              {!storeAddress && !addrLoading && (
                <div className="text-xs text-slate-500">
                  Adresse nicht verfügbar — {activePos.lat.toFixed(5)}, {activePos.lng.toFixed(5)}
                </div>
              )}
            </div>
          </>
        )}

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          <Info className="h-4 w-4 flex-shrink-0" />
          <div>
            <strong>So setzt du die Position:</strong> tippen auf der Karte, Pin verschieben,
            Adresse oben suchen, oder GPS aktivieren. Bei aktivem Live-GPS folgt der Pin deiner
            Bewegung — praktisch wenn du zum Schaden hinläufst.
          </div>
        </div>

        {/* GPS-Tracking-Toggle + Re-Fetch */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setTracking((t) => !t)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
              tracking ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'bg-white hover:bg-slate-50'
            }`}
          >
            {tracking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {tracking ? 'Live-Tracking pausieren' : 'Live-Tracking starten'}
          </button>
          <button
            onClick={fetchPosition}
            disabled={gpsLoading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Crosshair className="h-4 w-4" /> Einzel-Position
          </button>
        </div>
      </div>

      {/* Sticky-Footer-Button — funktioniert auch bei iPhone-Bottom-Bar */}
      <div
        className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="min-w-0 text-xs text-slate-500">
          {activePos
            ? `Bereit · ${activePos.lat.toFixed(4)}, ${activePos.lng.toFixed(4)}`
            : 'Erst Position setzen'}
        </div>
        <button
          onClick={handleNext}
          disabled={!activePos}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white shadow disabled:opacity-50"
        >
          Weiter <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
