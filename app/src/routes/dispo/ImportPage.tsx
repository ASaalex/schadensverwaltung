import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { DISPO_SIDEBAR } from './sidebar';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { useCategoryTree } from '@/hooks/useCategoryTree';
import {
  parseCsv,
  validateCsv,
  autoMapping,
  TARGET_FIELDS,
  type CsvMapping,
  type CsvRowResult,
  type TargetKey,
  type CategoryLookup,
} from '@/lib/csvImport';
import { Upload, FileText, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'upload' | 'mapping' | 'preview' | 'done';

export function DispoImportPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: tree = [] } = useCategoryTree();

  // Flacher Katalog zur Validierung
  const categories: CategoryLookup[] = useMemo(() => {
    const out: CategoryLookup[] = [];
    function walk(nodes: typeof tree) {
      for (const n of nodes) {
        out.push({ id: n.id, name: n.name, code: n.code });
        walk(n.children);
      }
    }
    walk(tree);
    return out;
  }, [tree]);

  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [results, setResults] = useState<CsvRowResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResults([]);
    setProgress({ done: 0, failed: 0 });
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      alert('Keine Spalten im CSV gefunden.');
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(autoMapping(parsed.headers));
    setStep('mapping');
  }

  function proceedToPreview() {
    const res = validateCsv(headers, rows, mapping, categories);
    setResults(res);
    setStep('preview');
  }

  async function doImport() {
    if (!profile) return;
    setImporting(true);
    setProgress({ done: 0, failed: 0 });
    const validRows = results.filter((r) => r.ok && r.parsed);
    let done = 0;
    let failed = 0;
    // In Batches von 50 inserten — schneller als 1 für 1
    const BATCH = 50;
    for (let i = 0; i < validRows.length; i += BATCH) {
      const slice = validRows.slice(i, i + BATCH);
      const payload = slice.map((r) => ({
        company_id: profile.company_id,
        category_id: r.parsed!.category_id,
        status: 'neu' as const,
        priority: r.parsed!.priority,
        gps_lat: r.parsed!.gps_lat,
        gps_lng: r.parsed!.gps_lng,
        gps_accuracy_m: null,
        geometry: null,
        property_values: {},
        address_street: r.parsed!.address_street,
        address_house_number: r.parsed!.address_house_number,
        address_postal_code: r.parsed!.address_postal_code,
        address_city: r.parsed!.address_city,
        address_resolved_at: null,
        description: r.parsed!.description,
        created_by: profile.id,
      }));
      const { error } = await supabase.from('damages').insert(payload as never);
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[CSV-Import] Batch-Fehler:', error);
        failed += slice.length;
      } else {
        done += slice.length;
      }
      setProgress({ done, failed });
    }
    await qc.invalidateQueries({ queryKey: ['damage-list'] });
    setImporting(false);
    setStep('done');
  }

  return (
    <AppShell title="Disposition" subtitle="CSV-Import" sidebar={DISPO_SIDEBAR}>
      <button onClick={() => nav('/dispo/damages')} className="mb-3 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Zurück zu den Schäden
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Schäden importieren</h2>
        <p className="text-sm text-muted-foreground">CSV-Datei einlesen, Spalten zuordnen, prüfen, importieren.</p>
      </div>

      {/* Schritte */}
      <div className="mb-6 flex items-center gap-3 text-xs">
        {(['upload', 'mapping', 'preview', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                step === s ? 'bg-blue-600 text-white' : results.length > 0 && (s === 'mapping' || s === 'upload') ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {i + 1}
            </div>
            <span className={step === s ? 'font-medium' : 'text-muted-foreground'}>
              {s === 'upload' ? 'Datei wählen' : s === 'mapping' ? 'Spalten zuordnen' : s === 'preview' ? 'Vorschau' : 'Fertig'}
            </span>
            {i < 3 && <span className="text-slate-300">›</span>}
          </div>
        ))}
      </div>

      {/* ============ SCHRITT 1: UPLOAD ============ */}
      {step === 'upload' && (
        <div className="rounded-xl border bg-white p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-10 text-center hover:border-blue-400 hover:bg-blue-50/40"
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <div className="font-medium">CSV-Datei wählen</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Klicken oder Datei hierher ziehen. Trennzeichen wird automatisch erkannt (`,` oder `;`).
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <div className="mb-2 font-medium">Erwartete Spalten (alle optional bis auf Kategorie)</div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs">
              <li><strong>Kategorie</strong> — Code oder Name (z.B. <code>STR-BEL-SCHL</code> oder <code>Schlagloch</code>)</li>
              <li><strong>GPS-Lat / GPS-Lng</strong> — Dezimalgrad (Komma oder Punkt)</li>
              <li><strong>Priorität</strong> — niedrig / normal / hoch / dringend (Default: normal)</li>
              <li><strong>Bemerkung</strong>, <strong>Straße</strong>, <strong>Hausnummer</strong>, <strong>PLZ</strong>, <strong>Ort</strong></li>
            </ul>
          </div>
        </div>
      )}

      {/* ============ SCHRITT 2: MAPPING ============ */}
      {step === 'mapping' && (
        <div className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-slate-400" />
            {rows.length} Datenzeile{rows.length === 1 ? '' : 'n'} · {headers.length} Spalte{headers.length === 1 ? '' : 'n'}
          </div>

          <div className="mb-4 overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((cell, j) => (
                      <td key={j} className="px-2 py-1 text-slate-600">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t bg-slate-50 px-2 py-1 text-xs text-muted-foreground">
              Vorschau · erste 3 Zeilen
            </div>
          </div>

          <div className="space-y-2">
            {TARGET_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="w-64 text-sm">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </label>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMapping((m) => ({ ...m, [f.key]: v === -1 ? null : v }));
                  }}
                  className="flex-1 rounded-lg border px-2 py-1.5 text-sm"
                >
                  <option value={-1}>— nicht zuordnen —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button onClick={reset} className="rounded-lg border bg-white px-4 py-2 text-sm">
              Neue Datei
            </button>
            <button
              onClick={proceedToPreview}
              disabled={mapping.category == null}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Vorschau zeigen
            </button>
          </div>
        </div>
      )}

      {/* ============ SCHRITT 3: PREVIEW ============ */}
      {step === 'preview' && (
        <div className="rounded-xl border bg-white p-6">
          {(() => {
            const ok = results.filter((r) => r.ok).length;
            const failed = results.length - ok;
            return (
              <div className="mb-4 flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> {ok} gültig
                </span>
                {failed > 0 && (
                  <span className="flex items-center gap-1 text-red-700">
                    <AlertCircle className="h-4 w-4" /> {failed} mit Fehlern (werden übersprungen)
                  </span>
                )}
              </div>
            );
          })()}

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
                    <td className="px-2 py-1">
                      {r.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                      )}
                    </td>
                    <td className="px-2 py-1 text-slate-600">
                      {(['category', 'address_street', 'address_city'] as TargetKey[])
                        .map((k) => {
                          const idx = mapping[k];
                          if (idx == null) return null;
                          return r.row[idx];
                        })
                        .filter(Boolean)
                        .join(' · ')}
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
                <Loader2 className="h-4 w-4 animate-spin" /> Import läuft … {progress.done + progress.failed} / {results.filter((r) => r.ok).length}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={importing}>
              Zurück
            </button>
            <button
              onClick={doImport}
              disabled={importing || results.filter((r) => r.ok).length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {importing ? 'Importiere …' : `${results.filter((r) => r.ok).length} Schäden importieren`}
            </button>
          </div>
        </div>
      )}

      {/* ============ SCHRITT 4: DONE ============ */}
      {step === 'done' && (
        <div className="rounded-xl border bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
          <div className="text-lg font-semibold">Import abgeschlossen</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.done} Schäden erfolgreich angelegt
            {progress.failed > 0 && `, ${progress.failed} Fehler beim Import`}.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={reset}
              className="rounded-lg border bg-white px-4 py-2 text-sm"
            >
              Neuen Import starten
            </button>
            <button
              onClick={() => nav('/dispo/damages')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Zur Schadensliste
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
