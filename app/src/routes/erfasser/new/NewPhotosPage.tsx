import { useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import { WizardHeader } from './WizardHeader';
import { useWizardStore } from '../wizardStore';
import { saveDamage, type SaveProgress } from '@/lib/saveDamage';
import { useAuth } from '@/auth/AuthContext';
import { Camera, ImageIcon, Plus, X, Loader2, Check, AlertCircle } from 'lucide-react';

const MAX_PHOTOS = 5;

export function NewPhotosPage() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const photos = useWizardStore((s) => s.photos);
  const addPhoto = useWizardStore((s) => s.addPhoto);
  const removePhoto = useWizardStore((s) => s.removePhoto);
  const wizardState = useWizardStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SaveProgress | null>(null);

  if (!wizardState.position) return <Navigate to="/erfasser/new/location" replace />;
  if (!wizardState.category) return <Navigate to="/erfasser/new/category" replace />;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (photos.length >= MAX_PHOTOS) break;
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.25,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.8,
        });
        const preview = URL.createObjectURL(compressed);
        addPhoto({ file: compressed, preview });
      } catch (e) {
        // Fallback: Original-File ohne Komprimierung
        const preview = URL.createObjectURL(file);
        addPhoto({ file, preview });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  async function handleSave(_withPhotos: boolean) {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    setProgress(null);
    try {
      const code = await saveDamage(profile, wizardState, (p) => setProgress(p));
      wizardState.reset();
      nav('/erfasser/new/done', { state: { code }, replace: true });
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
      setProgress(null);
    }
  }

  const progressLabel = (() => {
    if (!progress) return 'Speichern …';
    if (progress.step === 'inserting') return 'Schaden wird angelegt …';
    if (progress.step === 'uploading_photo')
      return `Foto ${progress.photoIndex}/${progress.photoTotal} wird hochgeladen …`;
    if (progress.step === 'inserting_photo_row') return 'Foto-Eintrag wird gespeichert …';
    return 'Fertig';
  })();

  const remaining = MAX_PHOTOS - photos.length;

  return (
    <div className="flex h-screen flex-col bg-white">
      <WizardHeader step={4} title="Fotos (optional)" back="/erfasser/new/details" />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Bilder helfen der Disposition. Du kannst diesen Schritt überspringen.
          </div>
          <div className={`text-xs font-medium ${photos.length >= MAX_PHOTOS ? 'text-red-600' : 'text-slate-700'}`}>
            {photos.length} / {MAX_PHOTOS}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {photos.map((p, idx) => (
            <div key={idx} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removePhoto(idx)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow"
                aria-label="Foto entfernen"
              >
                <X className="h-3 w-3 text-red-600" />
              </button>
            </div>
          ))}
          {remaining > 0 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:bg-slate-50"
            >
              <Plus className="h-6 w-6" />
              <span className="mt-1 text-xs">Weiteres</span>
            </button>
          )}
        </div>

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

        {remaining > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 font-medium text-white"
            >
              <Camera className="h-5 w-5" /> Foto aufnehmen
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 font-medium text-slate-700"
            >
              <ImageIcon className="h-5 w-5" /> Aus Galerie wählen
            </button>
          </div>
        )}

        {saveError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" /> Speichern fehlgeschlagen
            </div>
            <div className="text-xs">{saveError}</div>
          </div>
        )}
      </div>

      {saving && (
        <div className="border-t bg-blue-50 px-4 py-2 text-xs text-blue-800">{progressLabel}</div>
      )}
      <div className="flex items-center gap-2 border-t bg-white px-4 py-3">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          Ohne Fotos speichern
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving || photos.length === 0}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Speichern
        </button>
      </div>
    </div>
  );
}
