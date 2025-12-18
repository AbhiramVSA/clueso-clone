'use client';

import { useParams } from 'next/navigation';
import { useWebSocketConnection } from '@/hooks/useWebSocketConnection';
import VideoPlayerLayout from '@/components/VideoPlayerLayout';

export default function RecordingPage() {
    const params = useParams();
    const sessionId = params?.sessionId as string;

    const {
        connectionState,
        instructions,
        audioData,
        videoData,
        errors
    } = useWebSocketConnection(sessionId);

    return (
        <>
            {/* Error Display - Floating Notifications */}
            {errors.length > 0 && (
                <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
                    {errors.map((error, idx) => (
                        <div
                            key={idx}
                            className="bg-red-500/90 backdrop-blur-md border border-red-400 rounded-lg p-4 shadow-xl animate-slide-up"
                        >
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-white shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div className="flex-1">
                                    <p className="font-semibold text-white">{error.message}</p>
                                    {error.details && (
                                        <p className="text-red-100 text-sm mt-1">{error.details}</p>
                                    )}
                                    <p className="text-xs text-red-200 mt-1">
                                        {error.timestamp.toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Video Player Layout */}
            <VideoPlayerLayout
                audioData={audioData}
                videoData={videoData}
                instructions={instructions}
                sessionId={sessionId}
                connectionState={connectionState}
            />
        </>
    );
}
