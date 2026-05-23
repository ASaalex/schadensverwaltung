import { useEffect, useState } from 'react';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  decimal?: boolean;
  unit?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Robustes Zahlen-Eingabefeld:
 *  - hält lokalen String-State, sodass der Nutzer auch "12." oder "-" tippen kann
 *  - übergibt dem Parent nur valide Zahlen (sonst null)
 *  - zeigt klare Fehlermeldung bei Text statt stillschweigend zu verwerfen
 */
export function NumberInput({ value, onChange, decimal = false, unit, placeholder, className }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [touched, setTouched] = useState(false);

  // Wenn der externe Wert sich ändert (z.B. Wizard-Reset), sync zurück
  useEffect(() => {
    const numFromText = text === '' ? null : Number(text);
    const externalEqualsLocal = value === numFromText || (value == null && text === '');
    if (!externalEqualsLocal) {
      setText(value == null ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);

    if (v === '') {
      onChange(null);
      return;
    }
    // Erlaubte Zwischen-Zustände: "-", "1.", ".5", "-." — noch nicht parsen
    if (/^-?$|^-?\d*\.?\d*$/.test(v)) {
      const n = Number(v);
      if (!Number.isNaN(n) && v !== '-' && v !== '.' && v !== '-.') {
        onChange(n);
      }
    }
    // Sonst: speichern wir den Wert nicht, zeigen aber den Text + Fehlermeldung
  }

  const isInvalid = touched && text !== '' && Number.isNaN(Number(text));
  const isPartial = text === '-' || text === '.' || text === '-.';

  return (
    <div>
      <div className="flex items-center">
        <input
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={text}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
            isInvalid ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
          } ${className ?? ''}`}
        />
        {unit && <span className="ml-2 inline-flex items-center text-xs text-slate-500">{unit}</span>}
      </div>
      {isInvalid && (
        <div className="mt-1 text-xs text-red-600">Bitte eine Zahl eingeben (z. B. 3 oder 1.5)</div>
      )}
      {isPartial && !isInvalid && (
        <div className="mt-1 text-xs text-slate-500">Vervollständige die Zahl …</div>
      )}
    </div>
  );
}
