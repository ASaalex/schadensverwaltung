import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/** Fängt Render-Fehler ab → zeigt eine lesbare Meldung statt einer weißen Seite. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-lg font-semibold text-slate-900">Es ist ein Fehler aufgetreten</h1>
          <pre className="max-h-48 max-w-md overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button onClick={() => { this.setState({ error: null }); history.back(); }}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50">Zurück</button>
            <button onClick={() => window.location.reload()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Neu laden</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
