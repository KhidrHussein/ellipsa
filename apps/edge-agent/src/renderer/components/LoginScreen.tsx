import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: (userId: string) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [debugEmail, setDebugEmail] = useState('');
    const [showDebug, setShowDebug] = useState(false);

    /* eslint-disable react-hooks/exhaustive-deps */
    /* eslint-disable react-hooks/exhaustive-deps */
    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            // @ts-ignore
            await window.ellipsa.startGoogleLogin();
            // Loading state persists until the deep link callback triggers 'login-success'
        } catch (error) {
            console.error('Login failed', error);
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        // @ts-ignore
        const removeListener = window.ellipsa.onLoginSuccess((userId: string) => {
            console.log('Login success:', userId);
            localStorage.setItem('user_id', userId);
            setIsLoading(false);
            onLoginSuccess(userId);
        });

        return () => {
            removeListener();
        };
    }, []);

    return (
        <div className="flex items-center justify-center min-h-screen bg-black/80 backdrop-blur-sm p-4">
            <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 text-white shadow-2xl">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4">
                        {/* Simple Logo Placeholder */}
                        <div className="w-6 h-6 bg-black rounded-full" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Welcome to Ellipsa</CardTitle>
                    <CardDescription className="text-zinc-400">
                        Sign in to access your personalized memory and assistants.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        className="w-full h-12 text-base font-medium bg-white text-black hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            // Google Icon SVG
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                        )}
                        {isLoading ? 'Signing in...' : 'Continue with Google'}
                    </Button>

                    {/* Verification / Debug Toggle */}
                    <div className="pt-4 text-center">
                        <button
                            onClick={() => setShowDebug(!showDebug)}
                            className="text-xs text-zinc-600 hover:text-zinc-400 underline"
                        >
                            {showDebug ? 'Hide Debug Options' : 'Show Debug Options (For Verification)'}
                        </button>
                    </div>

                    {showDebug && (
                        <div className="bg-zinc-950 p-3 rounded-md border border-zinc-800 space-y-2">
                            <label className="text-xs text-zinc-400 block text-left">Simulate User ID (Email):</label>
                            <Input
                                placeholder="alice@gmail.com"
                                value={debugEmail}
                                onChange={(e) => setDebugEmail(e.target.value)}
                                className="h-8 text-xs bg-zinc-900 border-zinc-700"
                            />
                            <p className="text-[10px] text-zinc-500 text-left">
                                Enter 'alice' or 'bob' here to verify isolation.
                            </p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="justify-center border-t border-zinc-800 pt-4">
                    <p className="text-xs text-zinc-500">
                        By continuing, you agree to our Terms of Service and Privacy Policy.
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
