import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';

interface Props {
  step: 1 | 2 | 3 | 4;
  title: string;
  /** Wenn null: Schließen-Icon · sonst: Pfad zur vorherigen Seite. */
  back: string | null;
  /** Default: blau. Beim Foto-Schritt blau, beim Fertig-Schritt grün. */
  accent?: 'blue' | 'orange';
}

export function WizardHeader({ step, title, back, accent = 'blue' }: Props) {
  const nav = useNavigate();
  const bg = accent === 'orange' ? 'bg-orange-500' : 'bg-blue-600';
  return (
    <header className={`${bg} text-white`}>
      <div className="flex items-center gap-3 px-4 pb-3 pt-6">
        <button
          onClick={() => (back ? nav(back) : nav('/erfasser'))}
          className="rounded-full bg-white/15 p-1.5"
          aria-label={back ? 'Zurück' : 'Schließen'}
        >
          {back ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
        <div className="flex-1">
          <div className="text-xs text-white/70">Schritt {step}/4</div>
          <div className="text-base font-medium">{title}</div>
        </div>
      </div>
      <div className="flex gap-1 px-4 pb-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded ${s <= step ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>
    </header>
  );
}
