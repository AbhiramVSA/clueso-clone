'use client';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
}

const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
};

export default function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <div className={`${sizeClasses[size]} animate-spin`}>
                <svg className="w-full h-full text-[var(--color-accent-primary)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            </div>
            {text && <p className="text-sm text-[var(--color-text-tertiary)]">{text}</p>}
        </div>
    );
}

// Skeleton loader for video
export function VideoSkeleton() {
    return (
        <div className="w-full h-full bg-[var(--color-bg-tertiary)] animate-pulse flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
                    <svg className="w-8 h-8 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <p className="text-[var(--color-text-tertiary)]">Loading video...</p>
            </div>
        </div>
    );
}

// Skeleton loader for transcript
export function TranscriptSkeleton() {
    return (
        <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2 animate-pulse">
                    <div className="h-3 bg-[var(--color-bg-tertiary)] rounded w-1/4" />
                    <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-full" />
                    <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-3/4" />
                </div>
            ))}
        </div>
    );
}
