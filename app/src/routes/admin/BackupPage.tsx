import { useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_SIDEBAR } from './sidebar';
import { useAuth } from '@/auth/AuthContext';
import {
  exportBackup, importBackup, downloadBackup,
  exportStorageZip, importStorageZip, downloadBlob,
  BACKUP_TABLES, type BackupFile, type ImportResult,
} from '@/lib/backup';
import { DatabaseBackup, Download, Upload, ShieldAlert, CheckCircle2, Loader2, Images } from 'lucide-react';

export function AdminBackupPage() {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  // Import-Zustand
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [results, setResults] = useState<ImportResult[] | null>(null);

  async function handleExport() {
    setError(null); setResults(null); setBusy(true);
    try {
      const file = await exportBackup(profile?.company_id ?? null, setProgress);
      downloadBackup(file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setProgress('');
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); setResults(null); setPending(null); setConfirmText('');
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as BackupFile;
        if (parsed.format !== 'schadensverwaltung-backup') throw new Error('Keine gültige Sicherungsdatei.');
        setPending(parsed);
      } catch (err) {
        setError('Datei konnte nicht gelesen werden: ' + (err as Error).message);
      }
    };
    reader.readAsText(f);
    e.target.value = ''; // erneutes Auswählen derselben Datei erlauben
  }

  async function runImport() {
    if (!pending) return;
    setError(null); setBusy(true);
    try {
      const res = await importBackup(pending, setProgress);
      setResults(res);
      setPending(null); setConfirmText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setProgress('');
    }
  }

  async function handleStorageExport() {
    setError(null); setFileMsg(null); setResults(null); setBusy(true);
    try {
      const { blob, count, missing } = await exportStorageZip(setProgress);
      if (count === 0) { setFileMsg('Keine Dateien gefunden — es gibt nichts zu sichern.'); return; }
      downloadBlob(blob, `schadensverwaltung-dateien_${new Date().toISOString().slice(0, 10)}.zip`);
      setFileMsg(`${count} Dateien gesichert${missing ? `, ${missing} nicht abrufbar (übersprungen)` : ''}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false); setProgress('');
    }
  }

  function handleZipPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); setFileMsg(null); setResults(null);
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setProgress('Lese ZIP …');
    importStorageZip(f, setProgress)
      .then((r) => setFileMsg(`${r.ok} Dateien wiederhergestellt${r.failed ? `, ${r.failed} fehlgeschlagen` : ''}.`))
      .catch((err) => setError((err as Error).message))
      .finally(() => { setBusy(false); setProgress(''); });
  }

  const totalRows = pending ? Object.values(pending.tables).reduce((s, a) => s + (a?.length ?? 0), 0) : 0;

  return (
    <AppShell title="Administration" subtitle="Datensicherung" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <DatabaseBackup className="h-6 w-6 text-blue-500" /> Datensicherung
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Exportiere alle Daten deiner Firma (Schäden, Objekte, Straßennetz, Aufträge und
          Konfigurationen wie Nutzer & Schadenskatalog) als eine JSON-Datei. Über den Import
          lässt sich der Stand auf demselben oder einem neuen System wiederherstellen.
        </p>
      </div>

      {/* EXPORT */}
      <section className="mb-6 max-w-2xl rounded-xl border bg-white p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-emerald-600" /> Sicherung erstellen</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Lädt eine vollständige Kopie deiner Firmendaten als <code>.json</code> herunter. Bewahre die
          Datei sicher auf — sie enthält alle erfassten Daten.
        </p>
        <button onClick={handleExport} disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy && progress.startsWith('Export') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Sicherung herunterladen
        </button>
      </section>

      {/* IMPORT */}
      <section className="max-w-2xl rounded-xl border bg-white p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold"><Upload className="h-4 w-4 text-blue-600" /> Sicherung einspielen</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Spielt eine zuvor erstellte Sicherungsdatei ein. Vorhandene Datensätze mit gleicher ID werden
          überschrieben (aktualisiert), fehlende werden neu angelegt — die Daten werden also auf den
          Stand der Sicherung gebracht.
        </p>

        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFilePick} className="hidden" />
        {!pending && (
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            <Upload className="h-4 w-4" /> Sicherungsdatei wählen …
          </button>
        )}

        {/* Bestätigung vor dem Import */}
        {pending && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="mb-2 flex items-start gap-2 text-amber-800">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Wiederherstellung bestätigen</p>
                <p>
                  Sicherung vom{' '}
                  <strong>{pending.exported_at ? new Date(pending.exported_at).toLocaleString('de-DE') : '—'}</strong>{' '}
                  mit <strong>{totalRows}</strong> Datensätzen. Dieser Vorgang überschreibt bestehende
                  Daten mit gleicher ID.
                </p>
              </div>
            </div>
            <label className="mb-3 block text-sm">
              Zum Bestätigen <code className="rounded bg-white px-1">WIEDERHERSTELLEN</code> eingeben:
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm" placeholder="WIEDERHERSTELLEN" />
            </label>
            <div className="flex items-center gap-2">
              <button onClick={runImport} disabled={busy || confirmText !== 'WIEDERHERSTELLEN'}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Wiederherstellen
              </button>
              <button onClick={() => { setPending(null); setConfirmText(''); }} disabled={busy}
                className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">Abbrechen</button>
            </div>
          </div>
        )}
      </section>

      {/* DATEIEN (Storage) */}
      <section className="mt-6 max-w-2xl rounded-xl border bg-white p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold"><Images className="h-4 w-4 text-violet-600" /> Dateien (Fotos &amp; Dokumente)</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Fotos und Dokumente liegen im Datei-Speicher und werden separat als <code>.zip</code>{' '}
          gesichert, damit die JSON-Sicherung klein bleibt. Für eine vollständige Wiederherstellung
          spiele <strong>erst die Daten-Sicherung (JSON)</strong> und anschließend dieses ZIP ein.
        </p>
        <input ref={zipRef} type="file" accept="application/zip,.zip" onChange={handleZipPick} className="hidden" />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleStorageExport} disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {busy && progress.startsWith('Lade') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Dateien-ZIP herunterladen
          </button>
          <button onClick={() => zipRef.current?.click()} disabled={busy}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            <Upload className="h-4 w-4" /> Dateien-ZIP einspielen …
          </button>
        </div>
        {fileMsg && <p className="mt-3 text-sm text-emerald-700">{fileMsg}</p>}
      </section>

      {/* Fortschritt / Fehler / Ergebnis */}
      {busy && progress && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {progress}
        </p>
      )}
      {error && <p className="mt-4 max-w-2xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {results && (
        <div className="mt-6 max-w-2xl rounded-xl border bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Wiederherstellung abgeschlossen
          </h3>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-1 text-left">Bereich</th><th className="py-1 text-right">Übernommen</th><th className="py-1 text-right">Fehler</th></tr>
            </thead>
            <tbody className="divide-y">
              {results.filter((r) => r.ok || r.failed).map((r) => (
                <tr key={r.table}>
                  <td className="py-1.5">{r.table}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.ok}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.failed > 0 ? <span className="text-red-600" title={r.error}>{r.failed}</span> : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.some((r) => r.failed > 0) && (
            <p className="mt-3 text-xs text-amber-700">
              Einige Datensätze konnten nicht übernommen werden (Details per Maus-Tooltip über der Zahl).
              Häufige Ursache: ein referenzierter Datensatz fehlt oder die Sicherung stammt aus einer
              anderen Firma.
            </p>
          )}
        </div>
      )}

      <p className="mt-6 max-w-2xl text-xs text-muted-foreground">
        Enthaltene Bereiche (JSON): {BACKUP_TABLES.map((t) => t.name).join(', ')}.<br />
        Fotos &amp; Dokumente werden separat über das Dateien-ZIP gesichert. Für eine vollständige
        Wiederherstellung beide Sicherungen aufbewahren und in der Reihenfolge JSON → ZIP einspielen.
      </p>
    </AppShell>
  );
}
