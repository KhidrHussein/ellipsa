import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, ChevronRight, Loader2, Mail, Calendar } from 'lucide-react';
import { usePendingActions, PendingAction } from '../hooks/usePendingActions';

interface ActionApprovalModalProps {
  onClose: () => void;
  onApprove: () => void;
}

export function ActionApprovalModal({ onClose, onApprove }: ActionApprovalModalProps) {
  const { actions, loading, error, refetch, approveAction } = usePendingActions();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const selectedActionData = selectedAction !== null
    ? actions.find(a => a.id === selectedAction)
    : null;

  const handleApprove = async () => {
    if (!selectedAction) return;

    setApproving(true);
    const success = await approveAction(selectedAction);
    setApproving(false);

    if (success) {
      setSelectedAction(null);
      onApprove();
    }
  };

  // Show loading state
  if (loading) {
    return (
      <motion.div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
          <p className="text-gray-500">Loading pending actions...</p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl mb-1">Pending Actions</h2>
              <p className="text-sm text-gray-600">
                {selectedActionData ? 'Review action details' : `${actions.length} actions awaiting approval`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-500 mb-2">Failed to load actions</p>
              <p className="text-gray-500 text-sm mb-4">{error.message}</p>
              <button
                onClick={refetch}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : actions.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">All caught up!</p>
              <p className="text-gray-400 text-sm">No pending actions at the moment</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {selectedActionData === null ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {actions.map((action) => (
                    <motion.button
                      key={action.id}
                      onClick={() => setSelectedAction(action.id)}
                      className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0">
                          {action.type === 'email' ? (
                            <Mail className="w-5 h-5 text-gray-600" />
                          ) : (
                            <Calendar className="w-5 h-5 text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base mb-1">{action.title}</h3>
                          <p className="text-sm text-gray-600 truncate">{action.description}</p>
                          {action.preview && (
                            <p className="text-xs text-gray-400 mt-2 line-clamp-2">{action.preview}</p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Back button */}
                  <button
                    onClick={() => setSelectedAction(null)}
                    className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                  >
                    ← Back to list
                  </button>

                  {/* Action Details */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      {selectedActionData.type === 'email' ? (
                        <Mail className="w-5 h-5 text-gray-600" />
                      ) : (
                        <Calendar className="w-5 h-5 text-gray-600" />
                      )}
                      <h3 className="text-lg">{selectedActionData.title}</h3>
                    </div>
                    <p className="text-gray-600 mb-4">{selectedActionData.description}</p>

                    {/* Email Preview */}
                    {selectedActionData.type === 'email' && selectedActionData.metadata && (
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="text-sm text-gray-500 mb-2">
                          To: {selectedActionData.metadata.to?.map((t: any) => t.email || t).join(', ')}
                        </div>
                        <div className="text-sm text-gray-500 mb-3">
                          Subject: {selectedActionData.metadata.subject}
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-gray-700">
                          {selectedActionData.preview}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Footer Actions */}
        {selectedActionData && (
          <div className="p-6 border-t border-gray-200">
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedAction(null)}
                className="flex-1 px-4 py-3 bg-gray-100 text-black rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex-1 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {approving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve & Execute</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
