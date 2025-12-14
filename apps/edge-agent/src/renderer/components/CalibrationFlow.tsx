import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    CheckCircle,
    ArrowRight,
    Target,
    List,
    FileText,
    Headphones,
    Sparkles
} from 'lucide-react';

interface CalibrationFlowProps {
    onComplete: (preferences: any) => void;
}

export function CalibrationFlow({ onComplete }: CalibrationFlowProps) {
    const [step, setStep] = useState<number>(0);
    const [preferences, setPreferences] = useState({
        briefingFormat: '',
        primaryFocus: '',
    });

    const handleNext = async () => {
        if (step < 2) {
            setStep(step + 1);
        } else {
            // Save to backend
            try {
                const response = await fetch('http://localhost:4001/api/v1/user/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(preferences)
                });

                if (!response.ok) {
                    console.error('Failed to save preferences to backend');
                }
            } catch (err) {
                console.error('Error saving preferences:', err);
            }

            // Save locally and complete
            localStorage.setItem('ellipsa_preferences', JSON.stringify(preferences));
            onComplete(preferences);
        }
    };

    const updatePreference = (key: string, value: string) => {
        setPreferences(prev => ({ ...prev, [key]: value }));
    };

    const variants = {
        enter: { opacity: 0, x: 20 },
        center: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
    };

    console.log('[CalibrationFlow] Rendering step:', step);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 backdrop-blur-3xl">
            <div className="w-full max-w-2xl bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 p-8 min-h-[500px] flex flex-col justify-between relative">

                {/* Progress Indicator */}
                <div className="absolute top-8 right-8 flex gap-2">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className={`h-2 rounded-full transition-all duration-300 ${i <= step ? 'w-8 bg-black' : 'w-2 bg-gray-300'
                                }`}
                        />
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div
                            key="step0"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col justify-center"
                        >
                            <h1 className="font-serif italic text-4xl mb-6">Briefing Calibration</h1>
                            <p className="text-xl text-gray-600 mb-8">How do you prefer to receive your morning intelligence?</p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { id: 'bullet', label: 'Bullet Points', icon: List, desc: 'High density, scannable.' },
                                    { id: 'narrative', label: 'Narrative', icon: FileText, desc: 'Cohesive story format.' },
                                    { id: 'audio', label: 'Audio Brief', icon: Headphones, desc: 'Listen while commuting.' },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => updatePreference('briefingFormat', option.id)}
                                        className={`p-6 rounded-2xl border-2 text-left transition-all hover:scale-105 ${preferences.briefingFormat === option.id
                                            ? 'border-black bg-black text-white'
                                            : 'border-gray-100 bg-white hover:border-gray-300'
                                            }`}
                                    >
                                        <option.icon className={`w-8 h-8 mb-4 ${preferences.briefingFormat === option.id ? 'text-white' : 'text-gray-900'
                                            }`} />
                                        <div className="font-medium mb-1">{option.label}</div>
                                        <div className={`text-xs ${preferences.briefingFormat === option.id ? 'text-gray-400' : 'text-gray-500'
                                            }`}>{option.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div
                            key="step1"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col justify-center"
                        >
                            <h1 className="font-serif italic text-4xl mb-6">Strategic Focus</h1>
                            <p className="text-xl text-gray-600 mb-8">What is your primary objective this quarter?</p>

                            <div className="relative">
                                <Target className="absolute top-4 left-4 w-6 h-6 text-gray-400" />
                                <textarea
                                    value={preferences.primaryFocus}
                                    onChange={(e) => updatePreference('primaryFocus', e.target.value)}
                                    placeholder="e.g., Launch the new marketing campaign, close Series B round..."
                                    className="w-full h-40 pl-14 pr-6 py-4 bg-white border-2 border-gray-100 rounded-2xl focus:border-black focus:ring-0 text-lg transition-colors resize-none"
                                />
                            </div>
                            <p className="text-sm text-gray-500 mt-4">
                                Ellipsa will filter noise based on this objective.
                            </p>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col items-center justify-center text-center"
                        >
                            <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center mb-8">
                                <Sparkles className="w-12 h-12 text-white" />
                            </div>
                            <h1 className="font-serif italic text-4xl mb-4">Calibration Complete</h1>
                            <p className="text-xl text-gray-600 max-w-md mx-auto mb-8">
                                I have configured my personality matrix to align with your focus on "{preferences.primaryFocus}".
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Navigation */}
                <div className="flex justify-between items-center mt-8 pt-8 border-t border-gray-100">
                    <button
                        onClick={() => setStep(Math.max(0, step - 1))}
                        className={`text-gray-500 hover:text-black transition-colors ${step === 0 ? 'invisible' : ''}`}
                    >
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={
                            (step === 0 && !preferences.briefingFormat) ||
                            (step === 1 && !preferences.primaryFocus)
                        }
                        className="flex items-center gap-2 px-8 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:px-10"
                    >
                        {step === 2 ? 'Initialise System' : 'Continue'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

            </div>
        </div>
    );
}
