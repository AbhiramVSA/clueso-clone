'use client';

import { useEffect, useState } from 'react';
import { Instruction } from '@/hooks/useWebSocketConnection';

interface Props {
    currentTime: number; // Current video time in seconds
    events: Instruction[];
    videoWidth: number;
    videoHeight: number;
    originalViewport: { width: number; height: number };
    effectDuration?: number; // How long to show effect (default 0.8s)
}

export default function EventOverlay({
    currentTime,
    events,
    videoWidth,
    videoHeight,
    originalViewport,
    effectDuration = 0.8
}: Props) {
    const [activeEvent, setActiveEvent] = useState<Instruction | null>(null);

    // Find active event based on current time
    useEffect(() => {
        const currentTimeMs = currentTime * 1000; // Convert to milliseconds

        const active = events.find(event => {
            const eventTime = event.timestamp;
            const effectEnd = eventTime + (effectDuration * 1000);
            return currentTimeMs >= eventTime && currentTimeMs <= effectEnd;
        });

        setActiveEvent(active || null);
    }, [currentTime, events, effectDuration]);

    if (!activeEvent || !activeEvent.target?.bbox) return null;

    // Scale coordinates from original recording viewport to current video size
    const scaleX = videoWidth / originalViewport.width;
    const scaleY = videoHeight / originalViewport.height;

    const scaledBbox = {
        x: activeEvent.target.bbox.x * scaleX,
        y: activeEvent.target.bbox.y * scaleY,
        width: activeEvent.target.bbox.width * scaleX,
        height: activeEvent.target.bbox.height * scaleY,
    };

    // Effect styling based on event type
    const getEffectStyle = (type: string) => {
        switch (type) {
            case 'click':
                return {
                    borderColor: 'border-blue-500',
                    bgColor: 'bg-blue-600',
                    glowColor: 'rgba(59, 130, 246, 0.8)',
                    showRipple: true,
                };
            case 'scroll':
                return {
                    borderColor: 'border-green-500',
                    bgColor: 'bg-green-600',
                    glowColor: 'rgba(16, 185, 129, 0.8)',
                    showRipple: false,
                };
            case 'input':
                return {
                    borderColor: 'border-yellow-500',
                    bgColor: 'bg-yellow-600',
                    glowColor: 'rgba(245, 158, 11, 0.8)',
                    showRipple: false,
                };
            case 'navigation':
                return {
                    borderColor: 'border-purple-500',
                    bgColor: 'bg-purple-600',
                    glowColor: 'rgba(139, 92, 246, 0.8)',
                    showRipple: false,
                };
            default:
                return {
                    borderColor: 'border-gray-500',
                    bgColor: 'bg-gray-600',
                    glowColor: 'rgba(107, 114, 128, 0.8)',
                    showRipple: false,
                };
        }
    };

    const style = getEffectStyle(activeEvent.type);

    return (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
            {/* Dark overlay with spotlight cutout */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10 }}>
                <defs>
                    {/* Spotlight mask - creates the "focus" effect */}
                    <mask id={`spotlight-${activeEvent.timestamp}`}>
                        {/* White = visible (darkened area) */}
                        <rect width="100%" height="100%" fill="white" />
                        {/* Black = transparent (spotlight area) */}
                        <rect
                            x={Math.max(0, scaledBbox.x - 15)}
                            y={Math.max(0, scaledBbox.y - 15)}
                            width={scaledBbox.width + 30}
                            height={scaledBbox.height + 30}
                            rx="12"
                            fill="black"
                        />
                    </mask>

                    {/* Glow filter */}
                    <filter id={`glow-${activeEvent.timestamp}`}>
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Dark overlay with spotlight cutout */}
                <rect
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.65)"
                    mask={`url(#spotlight-${activeEvent.timestamp})`}
                    className="transition-opacity duration-300"
                />
            </svg>

            {/* Highlight Border around the element */}
            <div
                className={`absolute border-4 ${style.borderColor} rounded-lg shadow-2xl transition-all duration-300`}
                style={{
                    left: `${scaledBbox.x}px`,
                    top: `${scaledBbox.y}px`,
                    width: `${scaledBbox.width}px`,
                    height: `${scaledBbox.height}px`,
                    zIndex: 20,
                    boxShadow: `0 0 30px ${style.glowColor}, 0 0 60px ${style.glowColor}`,
                    animation: 'pulse 1s ease-in-out infinite',
                }}
            >
                {/* Event Type Label */}
                <div
                    className={`absolute -top-10 left-0 ${style.bgColor} text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-lg uppercase`}
                    style={{ zIndex: 30 }}
                >
                    {activeEvent.type}
                    {activeEvent.target.text && (
                        <span className="ml-2 font-normal normal-case opacity-90">
                            "{activeEvent.target.text.substring(0, 20)}{activeEvent.target.text.length > 20 ? '...' : ''}"
                        </span>
                    )}
                </div>

                {/* Click Ripple Effect */}
                {style.showRipple && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div
                            className={`w-12 h-12 ${style.bgColor} rounded-full opacity-60`}
                            style={{ animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                        />
                        <div className={`absolute w-6 h-6 ${style.bgColor} rounded-full opacity-80`} />
                    </div>
                )}

                {/* Scroll Indicator */}
                {activeEvent.type === 'scroll' && (
                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <svg width="40" height="60" viewBox="0 0 40 60" className="animate-bounce">
                            <path
                                d="M 20 10 L 20 50 M 20 50 L 10 40 M 20 50 L 30 40"
                                stroke="#10b981"
                                strokeWidth="4"
                                fill="none"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                )}

                {/* Input Typing Indicator */}
                {activeEvent.type === 'input' && (
                    <div className="absolute -bottom-8 left-0 flex items-center gap-1">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                )}
            </div>

            {/* Arrow pointer for clicks */}
            {activeEvent.type === 'click' && (
                <svg
                    className="absolute"
                    style={{
                        left: `${scaledBbox.x + scaledBbox.width / 2 - 25}px`,
                        top: `${Math.max(10, scaledBbox.y - 70)}px`,
                        zIndex: 20,
                        animation: 'bounce 1s ease-in-out infinite',
                    }}
                    width="50"
                    height="60"
                    viewBox="0 0 50 60"
                >
                    <defs>
                        <filter id="arrow-glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <path
                        d="M 25 55 L 25 15 M 25 15 L 15 25 M 25 15 L 35 25"
                        stroke="#3b82f6"
                        strokeWidth="4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#arrow-glow)"
                    />
                </svg>
            )}

            {/* Element info tooltip */}
            {activeEvent.target.selector && (
                <div
                    className="absolute bg-black/80 text-white text-xs px-2 py-1 rounded font-mono"
                    style={{
                        left: `${scaledBbox.x}px`,
                        top: `${scaledBbox.y + scaledBbox.height + 8}px`,
                        zIndex: 20,
                        maxWidth: '300px',
                    }}
                >
                    {activeEvent.target.selector}
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.7;
                    }
                }

                @keyframes ping {
                    75%, 100% {
                        transform: scale(2);
                        opacity: 0;
                    }
                }

                @keyframes bounce {
                    0%, 100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(-10px);
                    }
                }
            `}</style>
        </div>
    );
}
