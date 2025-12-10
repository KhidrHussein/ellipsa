import React, { createContext, useContext, useEffect, useState } from 'react';
import { realtimeService, RealtimeService } from '../../services/RealtimeService';

interface IServiceContext {
    realtimeService: RealtimeService;
    isConnected: boolean;
}

const ServiceContext = createContext<IServiceContext | null>(null);

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isConnected, setIsConnected] = useState(realtimeService.getConnectionStatus());

    useEffect(() => {
        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        realtimeService.on('connected', onConnect);
        realtimeService.on('disconnected', onDisconnect);

        return () => {
            realtimeService.off('connected', onConnect);
            realtimeService.off('disconnected', onDisconnect);
        };
    }, []);

    return (
        <ServiceContext.Provider value={{ realtimeService, isConnected }}>
            {children}
        </ServiceContext.Provider>
    );
};

export const useServices = () => {
    const context = useContext(ServiceContext);
    if (!context) {
        throw new Error('useServices must be used within a ServiceProvider');
    }
    return context;
};
