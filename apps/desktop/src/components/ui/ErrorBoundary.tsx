import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Une erreur est survenue
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md">
              {this.state.error?.message || 'Erreur inattendue'}
            </p>
          </div>
          <Button variant="secondary" onClick={this.handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Réessayer
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
