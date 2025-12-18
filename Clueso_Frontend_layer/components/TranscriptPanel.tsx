'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioData } from '@/hooks/useWebSocketConnection';

interface TranscriptPanelProps {
    audioData: AudioData | null;
    currentTime: number;
    onSeek?: (time: number) => void;
}

interface TranscriptSegment {
    text: string;
    startTime: number;
    endTime: number;
}

export default function TranscriptPanel({ audioData, currentTime, onSeek }: TranscriptPanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);

    // Parse transcript into segments (simplified - in production, use actual word-level timestamps)
    useEffect(() => {
        if (!audioData?.text) {
            setSegments([]);
            return;
        }

        // Split transcript into sentences for demonstration
        const sentences = audioData.text.match(/[^.!?]+[.!?]+/g) || [audioData.text];
        const duration = 60; // Placeholder duration
        const segmentDuration = duration / sentences.length;

        const parsedSegments: TranscriptSegment[] = sentences.map((sentence, idx) => ({
            text: sentence.trim(),
            startTime: idx * segmentDuration,
            endTime: (idx + 1) * segmentDuration,
        }));

        setSegments(parsedSegments);
    }, [audioData]);

    // Auto-scroll to current segment
    useEffect(() => {
        const currentSegmentIndex = segments.findIndex(
            seg => currentTime >= seg.startTime && currentTime < seg.endTime
        );

        if (currentSegmentIndex !== -1 && containerRef.current) {
            const segmentElement = containerRef.current.querySelector(
                `[data-segment-index="${currentSegmentIndex}"]`
            );
            segmentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentTime, segments]);

    // Filter segments by search query
    const filteredSegments = segments.filter(seg =>
        seg.text.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSegmentClick = (startTime: number) => {
        if (onSeek) {
            onSeek(startTime);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[var(--color-bg-secondary)] border-l border-[var(--color-border-primary)]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border-primary)]">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Transcript
                </h3>

                {/* Search Bar */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search transcript..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 pl-10 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)] transition-colors"
                    />
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Transcript Content */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
            >
                {!audioData?.text ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <svg className="w-16 h-16 text-[var(--color-text-tertiary)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <p className="text-[var(--color-text-tertiary)] text-sm">
                            No transcript available
                        </p>
                        <p className="text-[var(--color-text-muted)] text-xs mt-2">
                            Transcript will appear here when audio is processed
                        </p>
                    </div>
                ) : filteredSegments.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-[var(--color-text-tertiary)] text-sm">
                            No results found for "{searchQuery}"
                        </p>
                    </div>
                ) : (
                    filteredSegments.map((segment, idx) => {
                        const isActive = currentTime >= segment.startTime && currentTime < segment.endTime;
                        const isHighlighted = searchQuery && segment.text.toLowerCase().includes(searchQuery.toLowerCase());

                        return (
                            <div
                                key={idx}
                                data-segment-index={idx}
                                onClick={() => handleSegmentClick(segment.startTime)}
                                className={`
                                    group cursor-pointer p-4 rounded-lg transition-all duration-200
                                    ${isActive
                                        ? 'bg-[var(--color-accent-primary)] bg-opacity-20 border-l-4 border-[var(--color-accent-primary)]'
                                        : 'hover:bg-[var(--color-bg-tertiary)] border-l-4 border-transparent'
                                    }
                                `}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Timestamp */}
                                    <span className={`
                                        text-xs font-mono font-semibold shrink-0 mt-0.5
                                        ${isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-tertiary)]'}
                                    `}>
                                        {Math.floor(segment.startTime / 60)}:{String(Math.floor(segment.startTime % 60)).padStart(2, '0')}
                                    </span>

                                    {/* Text */}
                                    <p className={`
                                        text-sm leading-relaxed
                                        ${isActive ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}
                                    `}>
                                        {isHighlighted ? (
                                            <span dangerouslySetInnerHTML={{
                                                __html: segment.text.replace(
                                                    new RegExp(searchQuery, 'gi'),
                                                    match => `<mark class="bg-yellow-400 bg-opacity-30 text-[var(--color-text-primary)]">${match}</mark>`
                                                )
                                            }} />
                                        ) : (
                                            segment.text
                                        )}
                                    </p>
                                </div>

                                {/* Play Icon on Hover */}
                                {!isActive && (
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                                        <svg className="w-4 h-4 text-[var(--color-accent-primary)]" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer Stats */}
            {audioData?.text && (
                <div className="px-6 py-3 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                        <span>{segments.length} segments</span>
                        <span>{audioData.text.split(' ').length} words</span>
                    </div>
                </div>
            )}
        </div>
    );
}
