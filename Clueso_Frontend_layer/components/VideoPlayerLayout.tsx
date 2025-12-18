'use client';

import { useRef, useState, useEffect } from 'react';
import { AudioData, VideoData, Instruction } from '@/hooks/useWebSocketConnection';
import Timeline from './Timeline';
import TranscriptPanel from './TranscriptPanel';
import ExportButton from './ExportButton';
import EventOverlay from './EventOverlay';

interface VideoPlayerLayoutProps {
    audioData: AudioData | null;
    videoData: VideoData | null;
    instructions: Instruction[];
    sessionId: string;
    connectionState: string;
}

export default function VideoPlayerLayout({
    audioData,
    videoData,
    instructions,
    sessionId,
    connectionState
}: VideoPlayerLayoutProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);

    // Trim 1 second from start and end
    const TRIM_START = 1;
    const TRIM_END = 1;

    // Initialize video and audio sources
    useEffect(() => {
        if (videoRef.current && videoData) {
            videoRef.current.src = videoData.url;
        }
        if (audioRef.current && audioData) {
            audioRef.current.src = audioData.url;
        }
    }, [videoData, audioData]);

    // Set duration when video metadata loads and apply trimming
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleLoadedMetadata = () => {
            const actualDuration = video.duration;
            // Set trimmed duration (subtract 1 second from start and end)
            setDuration(Math.max(0, actualDuration - TRIM_START - TRIM_END));
            // Start video at 1 second
            video.currentTime = TRIM_START;
            if (audioRef.current) {
                audioRef.current.currentTime = TRIM_START;
            }
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }, []);

    // Sync audio to video
    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;

        const syncAudio = () => {
            const timeDiff = Math.abs(audio.currentTime - video.currentTime);
            if (timeDiff > 0.1) {
                audio.currentTime = video.currentTime;
            }
            if (isPlaying && audio.paused) {
                audio.play().catch(() => { });
            } else if (!isPlaying && !audio.paused) {
                audio.pause();
            }
        };

        const interval = setInterval(syncAudio, 100);
        return () => clearInterval(interval);
    }, [isPlaying]);

    // Update current time and enforce trimming boundaries
    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            const rawTime = video.currentTime;

            // Stop playback 1 second before the end
            if (rawTime >= video.duration - TRIM_END) {
                video.pause();
                if (audio) audio.pause();
                setIsPlaying(false);
                // Reset to start position
                video.currentTime = TRIM_START;
                if (audio) audio.currentTime = TRIM_START;
                setCurrentTime(0); // Display time relative to trimmed start
                return;
            }

            // Set current time relative to trim start (so it shows 0:00 at 1 second mark)
            setCurrentTime(Math.max(0, rawTime - TRIM_START));
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }, []);

    // Play/Pause handler
    const togglePlayPause = () => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;

        if (isPlaying) {
            video.pause();
            audio.pause();
            setIsPlaying(false);
        } else {
            video.play().catch(() => { });
            audio.play().catch(() => { });
            setIsPlaying(true);
        }
    };

    // Seek handler (adjusts for trimming)
    const handleSeek = (time: number) => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;

        // Add TRIM_START offset to the seek time
        const actualTime = time + TRIM_START;
        video.currentTime = actualTime;
        audio.currentTime = actualTime;
        setCurrentTime(time);
    };

    // Volume handler
    const handleVolumeChange = (newVolume: number) => {
        if (audioRef.current) {
            audioRef.current.volume = newVolume;
        }
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
    };

    // Toggle mute
    const toggleMute = () => {
        if (audioRef.current) {
            if (isMuted) {
                audioRef.current.volume = volume || 0.5;
                setIsMuted(false);
            } else {
                audioRef.current.volume = 0;
                setIsMuted(true);
            }
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handleSeek(Math.max(0, currentTime - 5));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleSeek(Math.min(duration, currentTime + 5));
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [currentTime, duration, isPlaying]);

    return (
        <div className="h-screen flex flex-col bg-[var(--color-bg-primary)] overflow-hidden">
            {/* Header */}
            <header className="h-16 px-6 flex items-center justify-between bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] shrink-0">
                <div className="flex items-center gap-4">
                    {/* Logo/Title */}
                    <h1 className="text-xl font-bold gradient-text">Clueso Player</h1>

                    {/* Connection Status */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${connectionState === 'connected'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-green-400' : 'bg-red-400'
                            } animate-pulse`} />
                        {connectionState === 'connected' ? 'Live' : 'Disconnected'}
                    </div>

                    {/* Session ID */}
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-tertiary)] rounded-lg">
                        <span className="text-xs text-[var(--color-text-tertiary)]">Session:</span>
                        <code className="text-xs font-mono text-[var(--color-text-secondary)]">{sessionId}</code>
                    </div>
                </div>

                {/* Export Button */}
                <ExportButton audioData={audioData} videoData={videoData} sessionId={sessionId} />
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Video Section */}
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Video Player */}
                    <div className="flex-1 relative bg-black flex items-center justify-center min-h-0">
                        {videoData ? (
                            <>
                                <video
                                    ref={videoRef}
                                    className="max-w-full max-h-full object-contain"
                                    onClick={togglePlayPause}
                                />

                                {/* Event Overlay */}
                                {containerRef.current && instructions.length > 0 && (
                                    <EventOverlay
                                        currentTime={currentTime}
                                        events={instructions}
                                        videoWidth={videoRef.current?.offsetWidth || 0}
                                        videoHeight={videoRef.current?.offsetHeight || 0}
                                        originalViewport={videoData.metadata?.viewport || { width: 1920, height: 1080 }}
                                        effectDuration={0.8}
                                    />
                                )}

                                {/* Play/Pause Overlay */}
                                {!isPlaying && (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity hover:bg-black/40"
                                        onClick={togglePlayPause}
                                    >
                                        <div className="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-all hover:scale-110">
                                            <svg className="w-10 h-10 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </div>
                                    </div>
                                )}

                                {/* Video Controls Overlay */}
                                <div className="absolute bottom-4 left-4 right-4 flex items-center gap-4 bg-black/60 backdrop-blur-md rounded-lg px-4 py-3">
                                    {/* Play/Pause */}
                                    <button
                                        onClick={togglePlayPause}
                                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                                    >
                                        {isPlaying ? (
                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        )}
                                    </button>

                                    {/* Volume */}
                                    <div className="flex items-center gap-2">
                                        <button onClick={toggleMute} className="text-white hover:text-gray-300 transition-colors">
                                            {isMuted || volume === 0 ? (
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                                </svg>
                                            )}
                                        </button>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={isMuted ? 0 : volume}
                                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                            className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
                                        />
                                    </div>

                                    <div className="flex-1" />
                                </div>
                            </>
                        ) : (
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                                    <svg className="w-8 h-8 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <p className="text-[var(--color-text-tertiary)]">Waiting for video...</p>
                            </div>
                        )}

                        {/* Hidden Audio Element */}
                        <audio ref={audioRef} />
                    </div>

                    {/* Timeline */}
                    <Timeline
                        currentTime={currentTime}
                        duration={duration}
                        events={instructions}
                        onSeek={handleSeek}
                        isPlaying={isPlaying}
                    />
                </div>

                {/* Transcript Panel */}
                <div className="w-96 shrink-0">
                    <TranscriptPanel
                        audioData={audioData}
                        currentTime={currentTime}
                        onSeek={handleSeek}
                    />
                </div>
            </div>
        </div>
    );
}
