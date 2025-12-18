// components/ScreenRecordingPlayer.tsx
'use client';

import { AudioData, VideoData, Instruction, EventTarget } from '@/hooks/useWebSocketConnection';
import SyncedVideoPlayer from './SyncedVideoPlayer';

interface Props {
    audioData: AudioData | null;
    videoData: VideoData | null;
    instructions: Instruction[];
    onInstructionExecuted?: (action: string, target: string) => void;
}

// Helper functions to safely extract displayable strings from EventTarget
const formatTarget = (target: EventTarget | null | undefined): string => {
    if (!target) return 'unknown';
    return target.selector || `${target.tag}${target.id ? '#' + target.id : ''}`;
};

const formatTargetText = (target: EventTarget | null | undefined): string => {
    if (!target || !target.text) return '';
    // Truncate long text
    return target.text.length > 100 ? target.text.substring(0, 100) + '...' : target.text;
};

export default function ScreenRecordingPlayer({
    audioData,
    videoData,
    instructions,
    onInstructionExecuted
}: Props) {
    return (
        <div className="space-y-6">
            {/* Synchronized Video & Audio Player with Event Overlays */}
            {videoData && audioData && (
                <SyncedVideoPlayer
                    videoData={videoData}
                    audioData={audioData}
                    events={instructions}
                />
            )}

            {/* Fallback: Show video only if no audio */}
            {videoData && !audioData && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold mb-3 text-green-900 flex items-center gap-2">
                        <span className="text-2xl">🎥</span> Screen Recording
                    </h3>
                    <video
                        src={videoData.url}
                        controls
                        className="w-full rounded-lg shadow-md border border-green-200"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        {new Date(videoData.receivedAt).toLocaleString()}
                    </p>
                </div>
            )}

            {/* Fallback: Show audio only if no video */}
            {audioData && !videoData && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold mb-3 text-blue-900 flex items-center gap-2">
                        <span className="text-2xl">🔊</span> Audio Recording
                    </h3>
                    {audioData.text && (
                        <div className="bg-white/80 backdrop-blur rounded-lg p-4 mb-4 border border-blue-100">
                            <p className="text-sm font-semibold text-gray-600 mb-1">Transcript:</p>
                            <p className="text-gray-800 leading-relaxed">{audioData.text}</p>
                        </div>
                    )}
                    <audio
                        src={audioData.url}
                        controls
                        className="w-full rounded-lg shadow-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        {new Date(audioData.receivedAt).toLocaleString()}
                    </p>
                </div>
            )}

            {/* Instructions List */}
            {instructions && instructions.length > 0 && (
                <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-6 shadow-lg">
                    <h3 className="text-xl font-bold mb-3 text-yellow-900 flex items-center gap-2">
                        <span className="text-2xl">📨</span> Instructions History ({instructions.length})
                    </h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {instructions.map((inst, idx) => (
                            <div key={idx} className="bg-white/80 backdrop-blur rounded-lg p-4 border border-yellow-100 flex flex-col gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-amber-700 uppercase text-sm">
                                        {inst.type}
                                    </span>
                                    <span className="text-gray-600 text-sm">on</span>
                                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono border border-gray-200">
                                        {formatTarget(inst.target)}
                                    </code>
                                    <span className="text-xs text-gray-400 ml-auto">
                                        {new Date(inst.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                {inst.target && formatTargetText(inst.target) && (
                                    <p className="text-xs text-gray-500 truncate" title={inst.target.text}>
                                        Text: {formatTargetText(inst.target)}
                                    </p>
                                )}
                                {inst.target && inst.target.bbox && (
                                    <p className="text-xs text-gray-400">
                                        Position: ({inst.target.bbox.x}, {inst.target.bbox.y}) |
                                        Size: {inst.target.bbox.width}×{inst.target.bbox.height}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
