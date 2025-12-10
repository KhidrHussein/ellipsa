import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatOverlay } from './components/ChatOverlay';
import { ServiceProvider } from './contexts/ServiceContext';
import { TooltipProvider } from './components/ui/tooltip';
import './styles/globals.css';
import { realtimeService } from '../services/RealtimeService';

// Initialize services
console.log('[ChatWindow] Initializing services...');
realtimeService.connect();

const handleClose = () => {
    // Send IPC to close the chat window
    // @ts-ignore
    window.ellipsa?.closeChat?.() || window.electron?.closeChat?.();
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <ServiceProvider>
                <TooltipProvider>
                    <ChatOverlay onClose={handleClose} />
                </TooltipProvider>
            </ServiceProvider>
        </React.StrictMode>
    );
    console.log('[ChatWindow] React app mounted');
} else {
    console.error('[ChatWindow] Failed to find root element');
}

// Global cleanup
window.addEventListener('beforeunload', () => {
    realtimeService.disconnect();
});
