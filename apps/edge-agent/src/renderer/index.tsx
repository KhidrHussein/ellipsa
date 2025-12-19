import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { realtimeService } from '../services/RealtimeService';
import { PendingActionsProvider } from './contexts/PendingActionsContext';

// Initialize services
console.log('[Renderer] Initializing services...');
realtimeService.connect();

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <PendingActionsProvider>
                <App />
            </PendingActionsProvider>
        </React.StrictMode>
    );
    console.log('[Renderer] React app mounted');
} else {
    console.error('[Renderer] Failed to find root element');
}

// Global cleanup
window.addEventListener('beforeunload', () => {
    realtimeService.disconnect();
});
