import { useRef, useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { AppShell } from '@/components/layout/AppShell';
import { LeafletMap } from '@/components/map/LeafletMap';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { useDamageDetail } from '@/hooks/useDamageDetail';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { setPositionStatus, type PositionStatus } from '@/lib/orderActions';
import { DamageChat } from '@/components/chat/DamageChat';
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  X,
  Check,
  SkipForward,
  Loader2,
  AlertCircle,
  Navigation,
  Save,
} from 'lucide-react';

const MAX_AFTER_PHOTOS = 5;

const STATUS_BUTTONS: { value: PositionStatus; label: string; color: string }[] = [
  { value: 'offen', label: 'Offen', color: 'bg-slate-100 text-slate-600' },
  { value: 'bearbeitung', label: 'In Arbeit', color: 'bg-amber-500 text-white' },
  { value: 'erledigt', label: 'Erledigt', color: 'bg-emerald-600 text-white' },
];

export function FirmaPositionEditPage() {
  const { id, positionId } = useParams<{ id: string; positionId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const { data: order } = useOrderDetail(id);
  const position = order?.positions.find((p) => p.id === positionId);

  // Vor-Foto und Eigenschaften vom Damage holen
  const { data: damageDetail } = useDamageDetail(position?.damage_id);

  // Lokaler State
  const [status, setStatus] = useState<PositionStatus>('offen');
  const [companyNotes, setCompanyNotes] = useState('');
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [afterPreviews, setAfterPreviews] = useState<string[]>([]);
  const [skipReason, setSkipReason] = useState('');
  const [showSkipPrompt, setShowSkipPrompt] = useState(false);

  // Wenn position gefunden, initialisiere
  useEffect(() => {
    if (position) {
      setStatus((position.status as PositionStatus) ?? 'offen');
      setCompanyNotes(position.company_notes ?? '');
    }
  }, [position]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = [...afterPhotos];
    const previews = [...afterPreviews];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_AFTER_PHOTOS) break;
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.25,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.8,
        });
        next.push(compressed);
        previews.push(URL.createObjectURL(compressed));
      } catch {
        next.push(file);
        previews.push(URL.createObjectURL(file));
      }
    }
    setAfterPhotos(next);
    setAfterPreviews(previews);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  function removePhoto(idx: number) {
    const newP = afterPhotos.filter((_, i) => i !== idx);
    const newPv = afterPreviews.filter((_, i) => i !== idx);
    URL.revokeObjectURL(afterPreviews[idx]);
    setAfterPhotos(newP);
    setAfterPreviews(newPv);
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function uploadAfterPhotos(): Promise<number> {
    if (afterPhotos.length === 0 || !profile || !position) return 0;
    // eslint-disable-next-line no-console
    console.log(`[FirmaPositionEdit] Lade ${afterPhotos.length} Foto(s) hoch …`);
    let uploaded = 0;
    for (const photo of afterPhotos) {
      const ext = photo.type.includes('png') ? 'png' : 'jpg';
      const uuid = crypto.randomUUID();
      const storagePath = `${profile.company_id}/${position.damage_id}/after/${uuid}.${ext}`;
      // eslint-disable-next-line no-console
      console.log('[FirmaPositionEdit] [1/3] Storage-Upload start:', storagePath, photo.size, 'bytes', photo.type);

      const uploadRes = await supabase.storage
        .from('damage-photos')
        .upload(storagePath, photo, {
          contentType: photo.type || 'image/jpeg',
          upsert: true, // bei Retry nicht failen, falls Pfad existiert
        });
      // eslint-disable-next-line no-console
      console.log('[FirmaPositionEdit] [1/3] Storage-Upload-Ergebnis:', uploadRes);
      if (uploadRes.error) {
        // eslint-disable-next-line no-console
        console.error('[FirmaPositionEdit] Storage-Upload-FEHLER:', uploadRes.error);
        throw new Error(
          `Foto ${uploaded + 1}/${afterPhotos.length}: Upload fehlgeschlagen — ${uploadRes.error.message}`,
        );
      }

      // eslint-disable-next-line no-console
      console.log('[FirmaPositionEdit] [2/3] damage_photos-INSERT start');
      const photoRow = {
        damage_id: position.damage_id,
        storage_path: storagePath,
        photo_type: 'after' as const,
        taken_at: new Date().toISOString(),
        uploaded_by: profile.id,
      };
      const insertRes = await supabase
        .from('damage_photos')
        .insert(photoRow as never)
        .select('id')
        .single();
      // eslint-disable-next-line no-console
      console.log('[FirmaPositionEdit] [2/3] damage_photos-INSERT-Ergebnis:', insertRes);
      if (insertRes.error) {
        // eslint-disable-next-line no-console
        console.error('[FirmaPositionEdit] damage_photos-INSERT-FEHLER:', insertRes.error);
        throw new Error(
          `Foto ${uploaded + 1}/${afterPhotos.length}: Storage OK, DB-Eintrag fehlgeschlagen — ` +
            `${insertRes.error.message}. RLS-Policy auf damage_photos prüfen.`,
        );
      }

      // eslint-disable-next-line no-console
      console.log(`[FirmaPositionEdit] [3/3] Foto ${uploaded + 1} fertig`);
      uploaded += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`[FirmaPositionEdit] Alle ${uploaded} Fotos gespeichert.`);
    return uploaded;
  }

  async function handleSave(finalStatus?: PositionStatus, reason?: string) {
    if (!positionId) return;
    const useStatus = finalStatus ?? status;
    const noteToSave = reason
      ? (companyNotes ? companyNotes + '\n' : '') + 'Übersprungen: ' + reason
      : companyNotes.trim() || null;
    setSaving(true);
    setSaveError(null);
    try {
      await uploadAfterPhotos();
      await setPositionStatus(positionId, useStatus, noteToSave);
      await qc.invalidateQueries({ queryKey: ['order-detail', id] });
      // Damage-Detail aktualisieren falls offen
      if (position) await qc.invalidateQueries({ queryKey: ['damage-detail', position.damage_id] });
      nav(`/firma/orders/${id}`);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  }

  if (!order || !position) {
    return (
      <AppShell title="Firmenportal" subtitle="Position" accent="orange">
        <Link to={`/firma/orders/${id}`} className="mb-3 flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </Link>
        <div className="text-sm text-muted-foreground">Lade …</div>
      </AppShell>
    );
  }

  const navigateUrl = position.damage_lat && position.damage_lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${position.damage_lat},${position.damage_lng}`
    : null;

  return (
    <AppShell title="Firmenportal" subtitle={`${order.code} · Position ${position.sort_order}`} accent="orange">
      <Link to={`/firma/orders/${id}`} className="mb-3 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Arbeitsliste
      </Link>

      <div className="mb-4">
        <div className="text-xs text-muted-foreground">
          Position {position.sort_order} von {order.positions.length}
        </div>
        <h1 className="text-2xl font-semibold">{position.damage_category ?? '—'}</h1>
        <div className="text-sm text-slate-600">
          {position.damage_address || '—'}
        </div>
      </div>

      {saveError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {saveError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LINKS — Schadens-Info */}
        <div className="space-y-4">
          {/* Vor-Fotos vom Schaden */}
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-medium">Vor-Fotos &amp; Bemerkung</div>
            {damageDetail?.photos.filter((p) => p.photo_type === 'before').length === 0 ? (
              <div className="text-sm text-muted-foreground">Keine Vor-Fotos.</div>
            ) : (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {damageDetail?.photos
                  .filter((p) => p.photo_type === 'before')
                  .map((p) => (
                    <a
                      key={p.id}
                      href={p.url ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square overflow-hidden rounded-lg bg-slate-100"
                    >
                      {p.url ? (
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-400">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                    </a>
                  ))}
              </div>
            )}
            {position.damage_description && (
              <div className="rounded bg-slate-50 p-3 text-sm text-slate-600">
                {position.damage_description}
              </div>
            )}
          </div>

          {/* Karte */}
          {position.damage_lat != null && position.damage_lng != null && (
            <div className="overflow-hidden rounded-xl border bg-white">
              <div className="h-48">
                <LeafletMap
                  center={[position.damage_lat, position.damage_lng]}
                  zoom={17}
                  markerPosition={[position.damage_lat, position.damage_lng]}
                  polygon={
                    (position.damage_geometry as { type?: string; coordinates?: number[][][] } | null)
                      ?.type === 'Polygon'
                      ? (position.damage_geometry as { coordinates: number[][][] }).coordinates[0]
                      : null
                  }
                  line={
                    (position.damage_geometry as { type?: string; coordinates?: number[][] } | null)
                      ?.type === 'LineString'
                      ? (position.damage_geometry as { coordinates: number[][] }).coordinates
                      : null
                  }
                />
              </div>
              {navigateUrl && (
                <a
                  href={navigateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-2 text-xs text-blue-600 hover:bg-slate-50"
                >
                  <Navigation className="h-3.5 w-3.5" /> In Navi öffnen
                </a>
              )}
            </div>
          )}
        </div>

        {/* RECHTS — Bearbeitung */}
        <div className="space-y-4">
          {/* Status-Auswahl */}
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-medium">Status</div>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_BUTTONS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setStatus(b.value)}
                  className={`rounded-lg py-2 text-sm font-medium ${
                    status === b.value ? b.color : 'border bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {!showSkipPrompt && (
              <button
                onClick={() => setShowSkipPrompt(true)}
                className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <SkipForward className="h-3.5 w-3.5" /> Überspringen (mit Begründung)
              </button>
            )}
            {showSkipPrompt && (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs text-amber-900">Begründung fürs Überspringen</div>
                <textarea
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-amber-300 px-2 py-1 text-sm"
                  placeholder="z.B. Material fehlt, kein Zugang …"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave('uebersprungen', skipReason)}
                    disabled={saving || !skipReason.trim()}
                    className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Als übersprungen speichern
                  </button>
                  <button
                    onClick={() => { setShowSkipPrompt(false); setSkipReason(''); }}
                    className="rounded border bg-white px-3 py-1.5 text-sm"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Nach-Fotos hochladen */}
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Nach-Fotos</div>
              <div className="text-xs text-muted-foreground">
                {(position.photos?.filter((p) => p.photo_type === 'after').length ?? 0) + afterPhotos.length} insgesamt
                {afterPhotos.length > 0 && ` · ${afterPhotos.length} neu`}
              </div>
            </div>

            {/* Bereits gespeicherte Nach-Fotos */}
            {position.photos && position.photos.filter((p) => p.photo_type === 'after').length > 0 && (
              <div className="mb-3">
                <div className="mb-1 text-xs text-muted-foreground">Bereits hochgeladen:</div>
                <div className="grid grid-cols-3 gap-2">
                  {position.photos
                    .filter((p) => p.photo_type === 'after')
                    .map((p) => (
                      <a
                        key={p.id}
                        href={p.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="aspect-square overflow-hidden rounded-lg bg-slate-100"
                        title="Foto öffnen"
                      >
                        {p.url ? (
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-400">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                      </a>
                    ))}
                </div>
              </div>
            )}
            {afterPhotos.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {afterPreviews.map((src, idx) => (
                  <div key={idx} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow"
                      aria-label="Foto entfernen"
                    >
                      <X className="h-3 w-3 text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {afterPhotos.length < MAX_AFTER_PHOTOS && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white"
                >
                  <Camera className="h-4 w-4" /> Aufnehmen
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-700"
                >
                  <ImageIcon className="h-4 w-4" /> Galerie
                </button>
              </div>
            )}
          </div>

          {/* Bemerkung als Notiz für Disposition (wird auch in Chat geloggt) */}
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 text-sm font-medium">Position-Notiz (für Disposition)</div>
            <textarea
              value={companyNotes}
              onChange={(e) => setCompanyNotes(e.target.value)}
              rows={2}
              placeholder="Kurzhinweis zur Position — wird beim Speichern als Mitteilung gepostet"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          {/* Chat-Bereich pro Schaden */}
          <DamageChat
            damageId={position.damage_id}
            title="Chat zum Schaden"
            accent="orange"
          />

          {/* Speichern */}
          <button
            onClick={() => handleSave()}
            disabled={saving || showSkipPrompt}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-medium text-white disabled:opacity-50 ${
              status === 'erledigt' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> :
              status === 'erledigt' ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {status === 'erledigt' ? 'Als erledigt speichern' : 'Speichern'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
