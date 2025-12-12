import React from 'react';
import { cn } from './utils';

// GlassCard component providing the core aesthetic for Phase 3
interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'light' | 'dark' | 'misted';
    blur?: 'sm' | 'md' | 'lg' | 'xl';
}

export function GlassCard({
    className,
    variant = 'light',
    blur = 'md',
    children,
    ...props
}: GlassCardProps) {
    const variants = {
        light: 'bg-white/40 border-white/20 text-black shadow-glass-light',
        dark: 'bg-black/40 border-white/10 text-white shadow-glass-dark',
        misted: 'bg-white/10 border-white/10 text-black hover:bg-white/20',
    };

    const blurs = {
        sm: 'backdrop-blur-sm',
        md: 'backdrop-blur-md',
        lg: 'backdrop-blur-lg',
        xl: 'backdrop-blur-xl',
    };

    return (
        <div
            className={cn(
                'rounded-2xl border transition-all duration-300',
                variants[variant],
                blurs[blur],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
