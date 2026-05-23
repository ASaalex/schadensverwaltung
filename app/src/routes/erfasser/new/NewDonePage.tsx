import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';

export function NewDonePage() {
  const nav = useNavigate();
  const location = useLocation();
  const code = (location.state as { code?: string } | null)?.code;

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-10 w-10 text-emerald-600" />
        </div>
        <div className="mb-1 text-xl font-semibold text-slate-900">Schaden erfasst</div>
        {code && <div className="mb-1 text-sm text-slate-500">{code}</div>}
        <div className="mb-6 text-sm text-slate-600">An die Disposition übermittelt.</div>
        <div className="w-full max-w-sm space-y-2">
          <button
            onClick={() => nav('/erfasser/new/location')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Nächsten Schaden erfassen
          </button>
          <button
            onClick={() => nav('/erfasser')}
            className="w-full rounded-lg bg-slate-100 py-3 font-medium text-slate-700"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    </div>
  );
}
