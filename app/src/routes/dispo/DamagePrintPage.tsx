import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDamageDetail } from '@/hooks/useDamageDetail';
import { DamagePrintCard } from '@/components/print/DamagePrintCard';
import { ArrowLeft, Printer, FileDown } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

export function DispoDamagePrintPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data, isLoading, error } = useDamageDetail(id);

  useEffect(() => {
    if (data?.damage.code) {
      const prev = document.title;
      document.title = `Schadensmeldung_${data.damage.code}`;
      return () => { document.title = prev; };
    }
  }, [data]);

  const printDate = new Date().toLocaleString('de-DE');

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          body { margin: 0; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; }
          .leaflet-tile-pane img { display: inline-block !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .break-before-page { break-before: page; page-break-before: always; }
        }
        .print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 18mm 14mm 18mm;
          background: white;
        }
      `}</style>

      <div className="no-print sticky top-0 z-50 flex items-center justify-between bg-slate-900 px-4 py-2.5 text-white">
        <button
          onClick={() => nav(`/dispo/damages/${id}`)}
          className="flex items-center gap-1 text-sm hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zum Detail
        </button>
        <div className="text-xs text-slate-400">
          Druckansicht · Browser-"Drucken" liefert A4 oder PDF
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700"
          >
            <Printer className="h-3.5 w-3.5" /> Drucken
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
            title="Im Druckdialog ‚Als PDF speichern' wählen"
          >
            <FileDown className="h-3.5 w-3.5" /> Als PDF
          </button>
        </div>
      </div>

      {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Lade …</div>}
      {error && (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <DamagePrintCard data={data} printDate={printDate} authorName={profile?.full_name ?? null} standalone />
      )}
    </>
  );
}
