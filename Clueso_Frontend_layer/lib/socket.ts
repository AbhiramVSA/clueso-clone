import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            transports: ['websocket'],
            autoConnect: false,
        });

        // Debug logging
        socket.on('connect', () => {
            console.log('[Socket] Connected:', socket?.id);
        });

        socket.on('disconnect', () => {
            console.log('[Socket] Disconnected');
        });

        socket.on('connect_error', (error: any) => {
            console.error('[Socket] Connection error:', error);
        });
    }
    return socket;
};

export const connectSocket = (): Socket => {
    const socket = getSocket();

    if (!socket.connected) {
        socket.connect();
    }

    return socket;
};

export const registerSession = (sessionId: string): void => {
    const socket = getSocket();

    if (socket.connected) {
        console.log('[Socket] Emitting register immediately for:', sessionId);
        socket.emit('register', sessionId);
    } else {
        console.log('[Socket] Waiting for connection to register:', sessionId);
        socket.once('connect', () => {
            console.log('[Socket] Connected, emitting register for:', sessionId);
            socket.emit('register', sessionId);
        });
    }
};

export const disconnectSocket = (): void => {
    if (socket) {
        socket.disconnect();
    }
};
