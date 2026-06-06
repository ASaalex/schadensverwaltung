import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { useNetworkObjectTypes } from '@/hooks/useNetworkObjectTypes';
import {
  parseCsv, validateObjectCsv, autoObjectMapping, OBJ_TARGET_FIELDS,
  type ObjCsvMapping, type ObjCsvRowResult, type ObjTargetKey, type ObjTypeLookup,
} from '@/lib/objectCsvImport';
import { Upload, FileText, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'upload' | 'mapping' | 'preview' | 'done';

export function DispoObjectImportPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { query: typesQ } = useNetworkObjectTypes();

  const types: ObjTypeLookup[] = useMemo(
    () => (typesQ.data ?? []).map((t) => ({ id: t.id, name: t.name, geometry_type: t.geometry_type })),
    [typesQ.data],
  );

  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ObjCsvMapping>({});
  const [results, setResults] = useState<ObjCsvRowResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setHeaders([]); setRows([]); setMapping({}); setResults([]);
    setProgress({ done: 0, failed: 0 }); setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) { alert('Keine Spalten im CSV gefunden.'); return; }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(autoObjectMapping(parsed.headers));
    setStep('mapping');
  }

  function proceedToPreview() {
    setResults(validateObjectCsv(rows, mapping, types));
    setStep('preview');
  }

  async function doImport() {
    if (!profile) return;
    setImporting(true);
    setProgress({ done: 0, failed: 0 });
    const validRows = results.filter((r) => r.ok && r.parsed);
    let done = 0, failed = 0;
    const BATCH = 50;
    for (let i = 0; i < validRows.length; i += BATCH) {
      const slice = validRows.slice(i, i + BATCH);
      const payload = slice.map((r) => ({
        company_id: profile.company_id,
        object_type_id: r.parsed!.object_type_id,
        name: r.parsed!.name,
        identifier: r.parsed!.identifier,
        geometry: r.parsed!.geometry,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('network_objects').insert(payload);
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[Objekt-Import] Batch-Fehler:', error);
        failed += slice.length;
      } else {
        done += slice.length;
      }
      setProgress({ done, failed });
    }
    await qc.invalidateQueries({ queryKey: ['network-objects'] });
    await qc.invalidateQueries({ queryKey: ['objects-in-bounds'] });
    setImporting(false);
    setStep('done');
  }

  const validCount = results.filter((r) => r.ok).length;

  return (
    <AppShell title="Disposition" subtitle="Objekt-Import" sidebar={DISPO_SIDEBAR}>
      <button onClick={() => nav('/dispo/objects')} className="mb-3 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück zu den Objekten
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Objekte importieren</h2>
        <p className="text-sm text-muted-foreground">CSV einlesen, Spalten zuordnen, prüfen, importieren.</p>
      </div>

      {/* Schritte */}
      <div className="mb-6 flex items-center gap-3 text-xs">
        {(['upload', 'mapping', 'preview', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${step === s ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {i + 1}
            </div>
            <span className={step === s ? 'font-medium' : 'text-muted-foreground'}>
              {s === 'upload' ? 'Datei wählen' : s === 'mapping' ? 'Spalten zuordnen' : s === 'preview' ? 'Vorschau' : 'Fertig'}
            </span>
            {i < 3 && <span className="text-slate-300">›</span>}
          </div>
        ))}
      </div>

      {/* SCHRITT 1: UPLOAD */}
      {step === 'upload' && (
        <div className="rounded-xl border bg-white p-6">
          {types.length === 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Noch keine Objekttypen definiert. Lege zuerst unter Administration › Straßennetz › Objekte Typen an.
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-10 text-center hover:border-blue-400 hover:bg-blue-50/40">
            <Upload className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <div className="font-medium">CSV-Datei wählen</div>
            <p className="mt-1 text-sm text-muted-foreground">Trennzeichen wird automatisch erkannt (`,` oder `;`).</p>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <div className="mb-2 font-medium">Erwartete Spalten</div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs">
              <li><strong>Objekttyp</strong> — Name eines vorhandenen Typs (z. B. <code>Laterne</code>)</li>
              <li><strong>Bezeichnung</strong>, <strong>Kennung</strong> — optional</li>
              <li><strong>GPS-Lat / GPS-Lng</strong> — für Punkt-Objekte (Dezimalgrad)</li>
              <li><strong>Geometrie</strong> — GeoJSON für Linien/Flächen, z. B.
                <code className="ml-1 break-all">{'{"type":"LineString","coordinates":[[11.0,50.9],[11.1,50.95]]}'}</code></li>
            </ul>
          </div>
        </div>
      )}

      {/* SCHRITT 2: MAPPING */}
      {step === 'mapping' && (
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-slate-400" />
            {rows.length} Datenzeile{rows.length === 1 ? '' : 'n'} · {headers.length} Spalte{headers.length === 1 ? '' : 'n'}
          </div>

          <div className="mb-4 overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>{headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 3).map((r, i) => (
                  <tr key={i} className="border-t">{r.map((cell, j) => <td key={j} className="px-2 py-1 text-slate-600">{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <div className="border-t bg-slate-50 px-2 py-1 text-xs text-muted-foreground">Vorschau · erste 3 Zeilen</div>
          </div>

          <div className="space-y-2">
            {OBJ_TARGET_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="w-72 text-sm">{f.label}</label>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => { const v = Number(e.target.value); setMapping((m) => ({ ...m, [f.key]: v === -1 ? null : v })); }}
                  className="flex-1 rounded-lg border px-2 py-1.5 text-sm">
                  <option value={-1}>— nicht zuordnen —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button onClick={reset} className="rounded-lg border bg-white px-4 py-2 text-sm">Neue Datei</button>
            <button onClick={proceedToPreview} disabled={mapping.object_type == null}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Vorschau zeigen
            </button>
          </div>
        </div>
      )}

      {/* SCHRITT 3: PREVIEW */}
      {step === 'preview' && (
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {validCount} gültig</span>
            {results.length - validCount > 0 && (
              <span className="flex items-center gap-1 text-red-700"><AlertCircle className="h-4 w-4" /> {results.length - validCount} mit Fehlern (übersprungen)</span>
            )}
          </div>

          <div className="mb-4 max-h-96 overflow-y-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-2 py-1.5 text-left w-8">#</th>
                  <th className="px-2 py-1.5 text-left w-8">OK</th>
                  <th className="px-2 py-1.5 text-left">Inhalt</th>
                  <th className="px-2 py-1.5 text-left">Fehler</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-t ${!r.ok ? 'bg-red-50' : ''}`}>
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1">{r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-red-600" />}</td>
                    <td className="px-2 py-1 text-slate-600">
                      {(['object_type', 'name', 'identifier'] as ObjTargetKey[])
                        .map((k) => { const idx = mapping[k]; return idx == null ? null : r.row[idx]; })
                        .filter(Boolean).join(' · ')}
                    </td>
                    <td className="px-2 py-1 text-red-600">{r.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importing && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="flex items-center gap-2 text-blue-900">
                <Loader2 className="h-4 w-4 animate-spin" /> Import läuft … {progress.done + progress.failed} / {validCount}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={importing}>Zurück</button>
            <button onClick={doImport} disabled={importing || validCount === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {importing ? 'Importiere …' : `${validCount} Objekte importieren`}
            </button>
          </div>
        </div>
      )}

      {/* SCHRITT 4: DONE */}
      {step === 'done' && (
        <div className="rounded-xl border bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
          <div className="text-lg font-semibold">Import abgeschlossen</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.done} Objekte angelegt{progress.failed > 0 && `, ${progress.failed} Fehler`}.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={reset} className="rounded-lg border bg-white px-4 py-2 text-sm">Neuen Import starten</button>
            <button onClick={() => nav('/dispo/objects')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Zur Objektliste</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
