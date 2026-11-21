import React from 'react';

interface State {
  hasError: boolean;
  message: string;
  details: string | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', details: null };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'An unexpected application error occurred.';
    let details: string | null = null;
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.operationType && parsed.error) {
        message = `Database permission or connectivity error during ${parsed.operationType} on ${parsed.path || 'collection'}.`;
        details = parsed.error;
      }
    } catch {
      // plain error message
    }
    return { hasError: true, message, details };
  }

  componentDidCatch(error: Error) {
    console.error('CivicAI ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Application Error</h2>
            <p className="text-sm text-slate-700 leading-relaxed">{this.state.message}</p>
            {this.state.details && (
              <pre className="text-xs font-mono bg-slate-100 border border-slate-200 rounded p-3 overflow-x-auto text-slate-700">
                {this.state.details}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
            >
              Reload CivicAI
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
