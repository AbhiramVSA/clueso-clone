'use client';

import { useEffect, useRef, useState } from 'react';
import { Instruction } from '@/hooks/useWebSocketConnection';

interface TimelineProps {
    currentTime: number;
    duration: number;
    events: Instruction[];
    onSeek: (time: number) => void;
    isPlaying: boolean;
}

export default function Timeline({ currentTime, duration, events, onSeek, isPlaying }: TimelineProps) {
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle timeline click/drag
    const handleTimelineInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current || duration === 0) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const newTime = percentage * duration;

        onSeek(newTime);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsDragging(true);
        handleTimelineInteraction(e);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current || duration === 0) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const time = percentage * duration;
        setHoverTime(time);

        if (isDragging) {
            onSeek(time);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setHoverTime(null);
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            const handleGlobalMouseUp = () => setIsDragging(false);
            window.addEventListener('mouseup', handleGlobalMouseUp);
            return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
        }
    }, [isDragging]);

    // Calculate progress percentage
    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="w-full space-y-3 px-6 py-4 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-primary)]">
            {/* Time Display */}
            <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)] font-mono">
                    {formatTime(currentTime)}
                </span>
                <span className="text-[var(--color-text-tertiary)] font-mono">
                    {formatTime(duration)}
                </span>
            </div>

            {/* Timeline Track */}
            <div
                ref={timelineRef}
                className="relative h-12 bg-[var(--color-bg-tertiary)] rounded-lg cursor-pointer group"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                {/* Progress Bar */}
                <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-secondary)] rounded-lg transition-all duration-100"
                    style={{ width: `${progressPercentage}%` }}
                />

                {/* Event Markers */}
                {events.map((event, idx) => {
                    const eventTime = new Date(event.timestamp).getTime();
                    const startTime = events[0] ? new Date(events[0].timestamp).getTime() : 0;
                    const relativeTime = (eventTime - startTime) / 1000; // Convert to seconds
                    const position = duration > 0 ? (relativeTime / duration) * 100 : 0;

                    if (position < 0 || position > 100) return null;

                    return (
                        <div
                            key={idx}
                            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 hover:bg-yellow-300 transition-colors group/marker"
                            style={{ left: `${position}%` }}
                            title={`${event.type} at ${formatTime(relativeTime)}`}
                        >
                            {/* Marker Tooltip */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none z-10">
                                <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg">
                                    <div className="font-semibold text-yellow-400">{event.type}</div>
                                    <div className="text-[var(--color-text-tertiary)]">{formatTime(relativeTime)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Playhead */}
                <div
                    className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-lg transition-all duration-100"
                    style={{ left: `${progressPercentage}%`, transform: 'translateX(-50%)' }}
                >
                    {/* Playhead Handle */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-xl border-2 border-[var(--color-accent-primary)] group-hover:scale-125 transition-transform" />
                </div>

                {/* Hover Preview */}
                {hoverTime !== null && !isDragging && (
                    <div
                        className="absolute -top-10 bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--color-text-primary)] shadow-lg pointer-events-none"
                        style={{
                            left: `${(hoverTime / duration) * 100}%`,
                            transform: 'translateX(-50%)'
                        }}
                    >
                        {formatTime(hoverTime)}
                    </div>
                )}

                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
            </div>

            {/* Timeline Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                    <span className="px-2 py-1 bg-[var(--color-bg-tertiary)] rounded">
                        {events.length} events
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        className="px-3 py-1.5 text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] rounded transition-colors"
                        onClick={() => onSeek(Math.max(0, currentTime - 5))}
                    >
                        -5s
                    </button>
                    <button
                        className="px-3 py-1.5 text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] rounded transition-colors"
                        onClick={() => onSeek(Math.min(duration, currentTime + 5))}
                    >
                        +5s
                    </button>
                </div>
            </div>
        </div>
    );
}
