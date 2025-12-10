import { useEffect, useState } from 'react';
import { useServices } from '../contexts/ServiceContext';

export function useRealtime() {
    const { realtimeService, isConnected } = useServices();
    const [lastMessage, setLastMessage] = useState<any>(null);

    useEffect(() => {
        const handleMessage = (msg: any) => {
            setLastMessage(msg);
        };
        realtimeService.on('message', handleMessage);
        return () => {
            realtimeService.off('message', handleMessage);
        };
    }, [realtimeService]);

    const sendMessage = (type: string, content: any, options: any = {}) => {
        // @ts-ignore
        realtimeService.sendMessage(type, content, options);
    };

    return { sendMessage, lastMessage, isConnected };
}
