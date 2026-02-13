import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Sayfa seviyesinde Error Boundary
 * 
 * Bir sayfa çökerse sadece o sayfa hata gösterir,
 * sidebar ve diğer sayfalar çalışmaya devam eder.
 * 
 * Kullanım:
 *   <PageErrorBoundary fallbackTitle="Takvim">
 *     <Takvim />
 *   </PageErrorBoundary>
 */
export default class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: { boundary: "page", page: this.props.fallbackTitle || "unknown" },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-sm mx-auto px-6">
            <p className="text-4xl mb-3">😵</p>
            <h2 className="text-lg font-bold text-[#2F2F2F] mb-1">
              {this.props.fallbackTitle || "Sayfa"} yüklenemedi
            </h2>
            <p className="text-sm text-[#8A8A8A] mb-4">
              Bir hata oluştu. Lütfen tekrar deneyin.
            </p>
            {this.state.error && (
              <p className="text-xs text-[#8A8A8A] bg-[#F7F7F7] rounded-lg p-2 mb-4 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-[#8FAF9A] text-white rounded-lg text-sm font-medium hover:bg-[#7A9E86] transition"
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
