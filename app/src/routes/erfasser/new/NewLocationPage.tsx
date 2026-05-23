import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardHeader } from './WizardHeader';
import { LeafletMap } from '@/components/map/LeafletMap';
import { useGeolocation } from '@/hooks/useGeolocation';
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
} from 'lucide-react';

// Erfurt-Zentrum als Default, falls noch keine Position gewählt
const DEFAULT_CENTER: [number, number] = [50.9787, 11.0328];

export function NewLocationPage() {
  const nav = useNavigate();
  const { position, setPosition, loading: gpsLoading, error: gpsError, fetchPosition } = useGeolocation();
  const storePos = useWizardStore((s) => s.position);
  const storeAddress = useWizardStore((s) => s.address);
  const setStorePos = useWizardStore((s) => s.setPosition);
  const setStoreAddress = useWizardStore((s) => s.setAddress);

  // Adresssuche
  const [searchText, setSearchText] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { results, loading: searchLoading } = useAddressSearch(searchText);

  // Beim ersten Öffnen GPS leise abrufen, sofern noch keine Position vorhanden.
  // Schlägt es fehl (z.B. Desktop ohne GPS, Berechtigung verweigert), fängt das
  // die Fehler-UI auf und der Nutzer kann Suche oder Karten-Klick benutzen.
  useEffect(() => {
    if (!storePos && !position && !gpsLoading && !gpsError) {
      fetchPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wenn GPS-Position neu kommt und noch keine im Store ist, übernehmen
  useEffect(() => {
    if (position && !storePos) {
      setStorePos(position);
    }
  }, [position, storePos, setStorePos]);

  const activePos = storePos ?? position;
  const center: [number, number] = activePos ? [activePos.lat, activePos.lng] : DEFAULT_CENTER;

  // Reverse-Geocoding nur, wenn keine Adresse explizit gesetzt wurde
  // (z.B. nach Treffer aus Adress-Suche brauchen wir keinen erneuten Lookup)
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
    setPosition(newPos);
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

  const showGpsError = !!gpsError && !activePos;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <WizardHeader step={1} title="Position bestimmen" back={null} />

      {/* Adresssuche */}
      <div className="relative bg-white px-4 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setShowResults(true);
            }}
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
      </div>

      {/* Detail-Bereich */}
      <div className="flex-1 overflow-y-auto bg-white px-4 py-4">
        {/* GPS-Status */}
        {gpsLoading && (
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
              {gpsError} — kein Problem, nutze einfach die Adresssuche oben oder tippe direkt auf die Karte.
            </div>
          </div>
        )}
        {activePos && !gpsError && (
          <div className="mb-3 flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Position gesetzt
            {activePos.accuracy > 0 && ` · GPS-Genauigkeit ±${Math.round(activePos.accuracy)} m`}
          </div>
        )}

        {/* Adresse */}
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
                  Adresse nicht verfügbar — Koordinaten {activePos.lat.toFixed(5)}, {activePos.lng.toFixed(5)}
                </div>
              )}
            </div>
          </>
        )}

        {/* Hilfen */}
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          <Info className="h-4 w-4 flex-shrink-0" />
          <div>
            <strong>So setzt du die Position:</strong>{' '}
            tippen auf der Karte, Pin verschieben, Adresse oben suchen, oder GPS abrufen.
          </div>
        </div>

        {/* GPS-Knopf */}
        <button
          onClick={fetchPosition}
          disabled={gpsLoading}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <Crosshair className="h-4 w-4" />
          {activePos ? 'GPS-Position erneut abrufen' : 'GPS-Position abrufen'}
        </button>
      </div>

      <div className="flex items-center justify-end border-t bg-white px-4 py-3">
        <button
          onClick={handleNext}
          disabled={!activePos}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Weiter <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
