'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Session {
    sessionId: string;
    createdAt: string;
    duration?: number;
    eventCount?: number;
}

// Mock data - in production, this would fetch from the API
const mockSessions: Session[] = [
    { sessionId: 'session_1734567890123_abc123', createdAt: '2024-12-19T00:00:00Z', duration: 125, eventCount: 45 },
    { sessionId: 'session_1734567800000_def456', createdAt: '2024-12-18T23:30:00Z', duration: 89, eventCount: 32 },
    { sessionId: 'session_1734567700000_ghi789', createdAt: '2024-12-18T22:45:00Z', duration: 210, eventCount: 78 },
];

export default function SessionsPage() {
    const router = useRouter();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate API fetch
        setTimeout(() => {
            setSessions(mockSessions);
            setLoading(false);
        }, 500);
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
                <LoadingSpinner size="lg" text="Loading sessions..." />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg-primary)] p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
                        Recording Sessions
                    </h1>
                    <p className="text-[var(--color-text-secondary)]">
                        View and manage your recorded sessions
                    </p>
                </div>

                {/* Session List */}
                <div className="space-y-4">
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border-primary)]">
                            <div className="text-6xl mb-4">📹</div>
                            <p className="text-[var(--color-text-secondary)]">No sessions found</p>
                            <p className="text-[var(--color-text-tertiary)] text-sm mt-2">
                                Start a recording with the Chrome extension
                            </p>
                        </div>
                    ) : (
                        sessions.map((session) => (
                            <div
                                key={session.sessionId}
                                onClick={() => router.push(`/recording/${session.sessionId}`)}
                                className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border-primary)] p-4 cursor-pointer hover:border-[var(--color-accent-primary)] transition-all hover:shadow-lg"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <code className="text-sm font-mono text-[var(--color-text-primary)]">
                                            {session.sessionId}
                                        </code>
                                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                                            {formatDate(session.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-6 text-sm">
                                        <div className="text-center">
                                            <p className="text-[var(--color-text-primary)] font-medium">
                                                {formatDuration(session.duration)}
                                            </p>
                                            <p className="text-xs text-[var(--color-text-tertiary)]">Duration</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[var(--color-text-primary)] font-medium">
                                                {session.eventCount || 0}
                                            </p>
                                            <p className="text-xs text-[var(--color-text-tertiary)]">Events</p>
                                        </div>
                                        <svg className="w-5 h-5 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Back Button */}
                <div className="mt-8">
                    <button
                        onClick={() => router.push('/')}
                        className="text-[var(--color-accent-primary)] hover:underline flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Home
                    </button>
                </div>
            </div>
        </div>
    );
}
