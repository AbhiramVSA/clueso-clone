'use client';

import { useRef, useEffect, useState } from 'react';
import { AudioData, VideoData, Instruction } from '@/hooks/useWebSocketConnection';
import EventOverlay from './EventOverlay';

interface Props {
    videoData: VideoData;
    audioData: AudioData;
    events?: Instruction[]; // Optional events for overlay effects
}

export default function SyncedVideoPlayer({ videoData, audioData, events = [] }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize video and audio sources
    useEffect(() => {
        if (videoRef.current && videoData) {
            videoRef.current.src = videoData.url;
            console.log('🎥 Video source set:', videoData.url);
        }
        if (audioRef.current && audioData) {
            audioRef.current.src = audioData.url;
            console.log('🔊 Audio source set:', audioData.url);
        }
    }, [videoData, audioData]);

    // Set duration and dimensions when video metadata loads
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            setVideoDimensions({
                width: video.videoWidth,
                height: video.videoHeight,
            });
            console.log('📏 Video duration:', video.duration);
            console.log('📐 Video dimensions:', video.videoWidth, 'x', video.videoHeight);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }, []);

    // Sync audio to video every 100ms
    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;

        const syncAudio = () => {
            const timeDiff = Math.abs(audio.currentTime - video.currentTime);

            // Resync if drift > 100ms
            if (timeDiff > 0.1) {
                audio.currentTime = video.currentTime;
                console.log('🔄 Resyncing audio, drift was:', timeDiff.toFixed(3), 's');
            }

            // Sync play/pause state
            if (isPlaying && audio.paused) {
                audio.play().catch(err => console.warn('Audio play failed:', err));
            } else if (!isPlaying && !audio.paused) {
                audio.pause();
            }
        };

        if (isPlaying) {
            syncIntervalRef.current = setInterval(syncAudio, 100);
        }

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, [isPlaying]);

    // Update current time from video
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
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
            video.play().catch(err => console.error('Video play failed:', err));
            audio.play().catch(err => console.error('Audio play failed:', err));
            setIsPlaying(true);
        }
    };

    // Seek handler
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;

        const newTime = parseFloat(e.target.value);
        video.currentTime = newTime;
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    // Volume handler
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.volume = newVolume;
        }
        setVolume(newVolume);
    };

    // Format time helper
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl overflow-hidden">
            {/* Video Container */}
            <div ref={containerRef} className="relative bg-black aspect-video">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    onClick={togglePlayPause}
                />

                {/* Event Overlay - Shows effects based on coordinates and timestamps */}
                {containerRef.current && events.length > 0 && (
                    <EventOverlay
                        currentTime={currentTime}
                        events={events}
                        videoWidth={containerRef.current.offsetWidth}
                        videoHeight={containerRef.current.offsetHeight}
                        originalViewport={videoData.metadata?.viewport || { width: 1920, height: 1080 }}
                        effectDuration={0.8}
                    />
                )}

                {/* Play/Pause Overlay */}
                {!isPlaying && (
                    <div
                        className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                        onClick={togglePlayPause}
                        style={{ zIndex: 200 }}
                    >
                        <div className="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-all">
                            <svg className="w-10 h-10 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden Audio Element */}
            <audio ref={audioRef} />

            {/* Controls */}
            <div className="bg-gray-900 p-6 space-y-4">
                {/* Timeline */}
                <div className="space-y-2">
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        step="0.1"
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Play/Pause Button */}
                        <button
                            onClick={togglePlayPause}
                            className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-all"
                        >
                            {isPlaying ? (
                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>

                        {/* Volume Control */}
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                            </svg>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="text-sm text-gray-400">
                        {videoData.metadata?.resolution && (
                            <span className="mr-4">📺 {videoData.metadata.resolution}</span>
                        )}
                        <span>🎬 {formatTime(duration)}</span>
                    </div>
                </div>

                {/* Transcript */}
                {audioData.text && (
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <p className="text-xs font-semibold text-gray-400 mb-2">Transcript:</p>
                        <p className="text-sm text-gray-200 leading-relaxed">{audioData.text}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
