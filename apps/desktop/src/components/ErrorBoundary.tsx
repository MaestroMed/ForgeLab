import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

// Top-level error boundary. React will unmount the whole router subtree on an
// unhandled render error; this catches that, keeps the chrome (Layout +
// Toaster) mounted, and offers the user a way to recover without reloading
// the whole Electron process.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Surface to devtools / main-process logger. We deliberately keep this
    // noisy: a crashing route is the one case where console output matters
    // in production.
    console.error('[ErrorBoundary] Render failure:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <h1 className="text-2xl font-semibold">Une erreur est survenue</h1>
        <p className="max-w-lg text-sm opacity-70">
          {error.message || 'Erreur inconnue dans le rendu de la page.'}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md border border-current px-4 py-2 text-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }
}
