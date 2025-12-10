import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Eye, User, FileText, AlertCircle } from 'lucide-react';

interface ObserveModeOverlayProps {
  isActive: boolean;
}

export function ObserveModeOverlay({ isActive }: ObserveModeOverlayProps) {
  const [transcriptSegments, setTranscriptSegments] = useState<string[]>([]);
  const [detectedEntities, setDetectedEntities] = useState<string[]>([]);
  const [currentContext, setCurrentContext] = useState('');
  const [confidence, setConfidence] = useState(0);

  // Simulate real-time observation
  useEffect(() => {
    if (!isActive) {
      setTranscriptSegments([]);
      setDetectedEntities([]);
      setCurrentContext('');
      return;
    }

    // Simulate transcript updates
    const transcriptInterval = setInterval(() => {
      const mockSegments = [
        "So regarding the Q4 budget...",
        "Alice mentioned we're over by 15%",
        "Bob said he'll have numbers by next week",
        "We need to reallocate the marketing spend",
        "The forecast looks concerning for October",
      ];
      
      setTranscriptSegments((prev) => {
        const next = [...prev, mockSegments[prev.length % mockSegments.length]];
        return next.slice(-3); // Keep last 3
      });
    }, 4000);

    // Simulate entity detection
    const entityInterval = setInterval(() => {
      const mockEntities = ['Alice Jones', 'Bob Chen', 'Q4 Budget', 'Marketing'];
      setDetectedEntities(mockEntities);
    }, 3000);

    // Simulate context updates
    const contextInterval = setInterval(() => {
      const contexts = [
        'Zoom Meeting - Budget Review',
        'Google Meet - Project X',
        'Microsoft Teams - Weekly Sync',
      ];
      setCurrentContext(contexts[Math.floor(Math.random() * contexts.length)]);
      setConfidence(0.75 + Math.random() * 0.2);
    }, 5000);

    setCurrentContext('Zoom Meeting - Budget Review');
    setConfidence(0.85);

    return () => {
      clearInterval(transcriptInterval);
      clearInterval(entityInterval);
      clearInterval(contextInterval);
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <motion.div
      className="fixed top-8 left-8 z-40 w-96"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <div className="bg-black/90 backdrop-blur-xl text-white rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <motion.div
              className="w-3 h-3 bg-red-500 rounded-full"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span className="font-serif italic text-lg">Observing</span>
          </div>
          <p className="text-sm text-white/60">Processing audio and visual context</p>
        </div>

        {/* Active Sensors */}
        <div className="p-6 space-y-4">
          {/* Audio Input */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm mb-2 text-white/80">Audio Stream</div>
              <div className="flex gap-1 items-center">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-green-500 rounded-full"
                    animate={{
                      height: [8, 16, 12, 20, 8],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.8,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Screen Context */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm mb-1 text-white/80">Screen Context</div>
              <div className="text-xs text-white/60 truncate">{currentContext}</div>
              <div className="text-xs text-white/40 mt-1">
                {Math.round(confidence * 100)}% confidence
              </div>
            </div>
          </div>

          {/* Detected Entities */}
          {detectedEntities.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm mb-2 text-white/80">Detected</div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedEntities.map((entity, i) => (
                    <motion.div
                      key={entity}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="px-2 py-1 bg-white/10 rounded-md text-xs"
                    >
                      {entity}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live Transcript */}
        <div className="p-6 bg-white/5 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-white/60" />
            <span className="text-sm text-white/80">Live Transcript</span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            <AnimatePresence>
              {transcriptSegments.map((segment, index) => (
                <motion.div
                  key={`${segment}-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-white/70 leading-relaxed"
                >
                  "{segment}"
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Processing Status */}
        <div className="p-4 bg-white/5 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            >
              <div className="w-3 h-3 border-2 border-white/20 border-t-white/80 rounded-full" />
            </motion.div>
            <span>Processing • Encrypted • Local-first</span>
          </div>
        </div>
      </div>

      {/* Quick Tip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-4 p-4 bg-yellow-500/90 backdrop-blur-sm rounded-2xl text-black"
      >
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <div className="mb-1">Observe mode active</div>
            <div className="text-xs opacity-80">
              Long-press the floating button to stop observing
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
