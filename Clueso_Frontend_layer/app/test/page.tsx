'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TestPage() {
    const router = useRouter();
    const testSessionId = 'session_1765089986708_lyv7icnrb';

    useEffect(() => {
        console.log('🧪 TEST PAGE: Redirecting to session:', testSessionId);
        router.push(`/recording/${testSessionId}`);
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
            <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">🧪</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Test Mode</h2>
                <p className="text-gray-600">Redirecting to test session...</p>
                <p className="text-sm text-gray-500 mt-2 font-mono">{testSessionId}</p>
            </div>
        </div>
    );
}
