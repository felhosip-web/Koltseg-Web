import React from 'react';

/**
 * React Error Boundary for Plugin Component Rendering (PLG2)
 * Isolates plugin rendering failures from the host application.
 */
export class PluginErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error(`[PluginErrorBoundary] Rendering crash in plugin "${this.props.pluginId || 'unknown'}":`, error, errorInfo);
        if (typeof this.props.onError === 'function') {
            this.props.onError(error, errorInfo);
        }
    }

    handleRetry = () => {
        this.setState({
            hasError: false,
            error: null
        });
    };

    render() {
        if (this.state.hasError) {
            const pluginTitle = this.props.pluginTitle || this.props.pluginId || 'Bővítmény';
            const errorMessage = this.state.error?.message || 'Ismeretlen hiba történt a bővítmény futtatása során.';

            if (typeof this.props.fallback === 'function') {
                return this.props.fallback({
                    error: this.state.error,
                    retry: this.handleRetry
                });
            }

            return (
                <div className="p-4 my-2 border border-red-200 bg-red-50 rounded-2xl text-red-800 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 font-bold text-red-700">
                        <i className="fas fa-exclamation-triangle text-red-500"></i>
                        <span>Bővítmény hiba: {pluginTitle}</span>
                    </div>
                    <p className="text-xs text-red-600 mb-3 font-mono bg-white/70 p-2 rounded-xl border border-red-100 break-words">
                        {errorMessage}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm">
                        <i className="fas fa-redo mr-1"></i> Újrapróbálás
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default PluginErrorBoundary;
