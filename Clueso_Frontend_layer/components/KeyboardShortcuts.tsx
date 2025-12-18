'use client';

import { useState, useEffect } from 'react';

interface KeyboardShortcutsProps {
    isOpen: boolean;
    onClose: () => void;
}

const shortcuts = [
    { key: 'Space', description: 'Play / Pause' },
    { key: '←', description: 'Seek backward 5s' },
    { key: '→', description: 'Seek forward 5s' },
    { key: 'M', description: 'Toggle mute' },
    { key: '?', description: 'Show shortcuts' },
    { key: 'Esc', description: 'Close modal' },
];

export default function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-[var(--color-border-primary)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Keyboard Shortcuts</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    >
                        <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-3">
                    {shortcuts.map((shortcut) => (
                        <div key={shortcut.key} className="flex items-center justify-between py-2 border-b border-[var(--color-border-primary)] last:border-0">
                            <span className="text-[var(--color-text-secondary)]">{shortcut.description}</span>
                            <kbd className="px-3 py-1.5 bg-[var(--color-bg-tertiary)] rounded-lg text-sm font-mono text-[var(--color-text-primary)] border border-[var(--color-border-primary)]">
                                {shortcut.key}
                            </kbd>
                        </div>
                    ))}
                </div>

                <p className="mt-6 text-xs text-center text-[var(--color-text-tertiary)]">
                    Press <kbd className="px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] rounded text-xs">?</kbd> to toggle this panel
                </p>
            </div>
        </div>
    );
}
