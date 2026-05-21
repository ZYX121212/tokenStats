import { ErrorBoundary as SolidErrorBoundary, type JSX } from "solid-js";

interface ErrorFallbackProps {
    error: Error;
    reset: () => void;
}

function ErrorFallback(props: ErrorFallbackProps) {
    return (
        <div class="error-boundary">
            <div class="error-icon">⚠️</div>
            <div class="error-title">出错了</div>
            <div class="error-message">{props.error.message}</div>
            <button class="error-reset" onClick={props.reset}>
                重试
            </button>
        </div>
    );
}

interface ErrorBoundaryProps {
    children: JSX.Element;
    fallback?: (props: ErrorFallbackProps) => JSX.Element;
}

export default function ErrorBoundary(props: ErrorBoundaryProps) {
    return (
        <SolidErrorBoundary
            fallback={(err, reset) =>
                props.fallback ? (
                    props.fallback({ error: err, reset })
                ) : (
                    <ErrorFallback error={err} reset={reset} />
                )
            }
        >
            {props.children}
        </SolidErrorBoundary>
    );
}
