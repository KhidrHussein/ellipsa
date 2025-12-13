import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { actionClient } from '../../services/api';
import { CheckCircle, XCircle, ExternalLink, Loader2, Zap, Mail, MessageSquare, Github, FileText } from 'lucide-react';

interface Integration {
    id: string;
    name: string;
    description: string;
    icon: string;
    provider: string;
}

const INTEGRATIONS: any[] = [
    {
        id: 'google',
        name: 'Google Workspace',
        description: 'Connect Gmail and Calendar',
        Icon: Mail,
        provider: 'google', // This currently maps to the legacy oauth flow 
    },
    {
        id: 'slack',
        name: 'Slack',
        description: 'Send messages and notifications',
        Icon: MessageSquare,
        provider: 'slack',
    },
    {
        id: 'github',
        name: 'GitHub',
        description: 'Manage issues and PRs',
        Icon: Github,
        provider: 'github',
    },
    {
        id: 'notion',
        name: 'Notion',
        description: 'Read and write pages',
        Icon: FileText,
        provider: 'notion',
    }
];

export function IntegrationsSection() {
    const [connected, setConnected] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);

    // TODO: Get actual user ID from context
    const userId = 'user';

    useEffect(() => {
        checkStatus();

        const handleFocus = () => {
            console.log('Window focused, checking auth status...');
            checkStatus();
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    const checkStatus = async () => {
        try {
            const response = await actionClient.getAuthStatus(userId);
            if (response.connected) {
                const statusMap: Record<string, boolean> = {};
                response.connected.forEach((p: string) => {
                    statusMap[p] = true;
                });
                setConnected(statusMap);
            }
        } catch (error) {
            console.error('Failed to get auth status:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async (provider: string) => {
        try {
            if (provider === 'google') {
                // Legacy flow for now
                // @ts-ignore
                const response = await actionClient.request({ method: 'GET', url: '/auth/url' });
                if (response.authUrl) {
                    // @ts-ignore
                    window.ellipsa.openExternal(response.authUrl);
                }
                return;
            }

            const response = await actionClient.getAuthUrl(provider, userId);
            if (response.url) {
                // @ts-ignore
                window.ellipsa.openExternal(response.url);
            }
        } catch (error) {
            console.error(`Failed to get auth URL for ${provider}:`, error);
        }
    };

    return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {loading ? (
                <div className="p-8 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {INTEGRATIONS.map((integration) => {
                        const isConnected = connected[integration.provider];
                        return (
                            <div key={integration.id} className="p-6 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center p-2 shadow-sm text-gray-600">
                                        <integration.Icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-900 flex items-center gap-2">
                                            {integration.name}
                                            {isConnected && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                    Connected
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500">{integration.description}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleConnect(integration.provider)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${isConnected
                                        ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                                        : 'bg-black text-white hover:bg-gray-800'
                                        }`}
                                >
                                    {isConnected ? (
                                        <>
                                            <CheckCircle className="w-4 h-4 text-green-500" />
                                            Connected
                                        </>
                                    ) : (
                                        <>
                                            Connect
                                            <ExternalLink className="w-3 h-3 opacity-50" />
                                        </>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
