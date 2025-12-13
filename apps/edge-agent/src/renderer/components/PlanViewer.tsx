import React from 'react';
import { motion } from 'motion/react';
import { Globe, Monitor, MousePointer, Keyboard, Clock, Camera, FileText } from 'lucide-react';

interface Step {
    op: string;
    args: Record<string, any>;
}

interface PlanViewerProps {
    plan: Step[];
}

export function PlanViewer({ plan }: PlanViewerProps) {
    const getIcon = (op: string) => {
        switch (op) {
            case 'open_url': return <Globe className="w-4 h-4 text-blue-500" />;
            case 'open_app': return <Monitor className="w-4 h-4 text-purple-500" />;
            case 'click': return <MousePointer className="w-4 h-4 text-green-500" />;
            case 'type_text':
            case 'press_keys': return <Keyboard className="w-4 h-4 text-yellow-500" />;
            case 'wait':
            case 'wait_for_selector': return <Clock className="w-4 h-4 text-gray-400" />;
            case 'screenshot': return <Camera className="w-4 h-4 text-pink-500" />;
            default: return <FileText className="w-4 h-4 text-gray-500" />;
        }
    };

    const getDescription = (step: Step) => {
        switch (step.op) {
            case 'open_url': return `Open ${step.args.url}`;
            case 'open_app': return `Open app "${step.args.app}"`;
            case 'click': return `Click element "${step.args.selector}"`;
            case 'type_text': return `Type "${step.args.text}" into "${step.args.selector}"`;
            case 'press_keys': return `Press keys: ${step.args.keys}`;
            case 'wait': return `Wait for ${step.args.ms}ms`;
            case 'wait_for_selector': return `Wait for element "${step.args.selector}"`;
            case 'screenshot': return `Take screenshot${step.args.fullPage ? ' (full page)' : ''}`;
            default: return `${step.op} (${JSON.stringify(step.args)})`;
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Plan ({plan.length} steps)</h3>
            </div>
            <div className="divide-y divide-gray-100">
                {plan.map((step, index) => (
                    <div key={index} className="p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                        <div className="flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs text-gray-500 font-medium">
                            {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                {getIcon(step.op)}
                                <span className="font-medium text-sm text-gray-900">{step.op}</span>
                            </div>
                            <p className="text-sm text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded border border-gray-100 inline-block max-w-full truncate">
                                {getDescription(step)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
