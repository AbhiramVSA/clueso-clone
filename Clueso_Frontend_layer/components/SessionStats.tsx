'use client';

import { Instruction, AudioData } from '@/hooks/useWebSocketConnection';

interface SessionStatsProps {
    instructions: Instruction[];
    audioData: AudioData | null;
    duration: number;
}

export default function SessionStats({ instructions, audioData, duration }: SessionStatsProps) {
    const eventCount = instructions.length;
    const wordCount = audioData?.text ? audioData.text.split(/\s+/).filter(Boolean).length : 0;

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-4 px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-lg">
            <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-[var(--color-text-secondary)]">{formatDuration(duration)}</span>
            </div>

            <div className="w-px h-4 bg-[var(--color-border-primary)]" />

            <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span className="text-sm text-[var(--color-text-secondary)]">{eventCount} events</span>
            </div>

            <div className="w-px h-4 bg-[var(--color-border-primary)]" />

            <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <span className="text-sm text-[var(--color-text-secondary)]">{wordCount} words</span>
            </div>
        </div>
    );
}
