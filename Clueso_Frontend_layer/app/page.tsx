'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans p-4">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-pulse">🎬</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading...</h2>
      </div>
    </div>
  );
}

// Main home content component
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Handle automatic redirect from browser extension
  useEffect(() => {
    const sessionIdFromUrl = searchParams.get('sessionId') || searchParams.get('session');

    if (sessionIdFromUrl) {
      console.log('Session ID received from extension:', sessionIdFromUrl);
      setIsRedirecting(true);
      // Redirect to the recording page
      router.push(`/recording/${sessionIdFromUrl}`);
    }
  }, [searchParams, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionId.trim()) {
      router.push(`/recording/${sessionId.trim()}`);
    }
  };

  // Show loading screen when redirecting from extension
  if (isRedirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans p-4">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🎬</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Redirecting to Dashboard...</h2>
          <p className="text-gray-600">Loading your recording session</p>
          <div className="mt-6 flex justify-center gap-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
            <div className="w-3 h-3 bg-purple-600 rounded-full animate-pulse delay-75"></div>
            <div className="w-3 h-3 bg-pink-600 rounded-full animate-pulse delay-150"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-200">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎬</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Clueso Dashboard
            </h1>
            <p className="text-gray-600">
              Screen Recording & Instruction Viewer
            </p>
          </div>

          {/* Session ID Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="sessionId"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                Enter Session ID
              </label>
              <input
                type="text"
                id="sessionId"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="e.g., session_1234567890_abc123"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transform hover:scale-[1.02] transition-all shadow-lg hover:shadow-xl"
            >
              View Recording
            </button>
          </form>

          {/* Info Section */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span>📌</span> Features
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Real-time WebSocket connection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Audio playback with transcripts</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Screen recording viewer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Instruction execution tracking</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main export with Suspense wrapper
export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  );
}
