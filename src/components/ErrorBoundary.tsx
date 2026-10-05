import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useSkin } from '@/styles/skin';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export function ErrorFallback({ error }: { error: Error | null }) {
    const skin = useSkin();
    return (
        <div className={`p-4 bg-destructive/10 border border-destructive/20 ${skin.radius} text-destructive`}>
            <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
            <p className="font-mono text-sm whitespace-pre-wrap">
                {error?.toString()}
            </p>
        </div>
    );
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} />;
        }

        return this.props.children;
    }
}
