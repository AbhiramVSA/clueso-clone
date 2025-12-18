'use client';

import { Suspense } from 'react';

// Loading fallback for Suspense
function HomeLoading() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans p-4">
            <div className="text-center">
                <div className="text-6xl mb-4 animate-pulse">🎬</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading...</h2>
            </div>
        </div>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<HomeLoading />}>
            homecontent
        </Suspense>
    );
}
