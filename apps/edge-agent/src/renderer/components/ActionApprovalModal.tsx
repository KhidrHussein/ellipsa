import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, ChevronRight, Loader2, Mail, Calendar } from 'lucide-react';
import { usePendingActions, PendingAction } from '../hooks/usePendingActions';
import { PlanViewer } from './PlanViewer';

interface ActionApprovalModalProps {
  onClose: () => void;
  onApprove: () => void;
}

export function ActionApprovalModal({ onClose, onApprove }: ActionApprovalModalProps) {
  const { actions, loading, error, refetch, approveAction, discardAction } = usePendingActions();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

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

  const handleDiscard = async () => {
    if (!selectedAction) return;

    setDiscarding(true);
    const success = await discardAction(selectedAction);
    setDiscarding(false);
    setShowDiscardConfirm(false);

    if (success) {
      setSelectedAction(null);
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {selectedActionData && (
              <button
                onClick={() => setSelectedAction(null)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600 rotate-180" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-medium text-gray-900 mb-1">
                {selectedActionData ? 'Review Draft' : 'Pending Actions'}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedActionData ? 'Review and approve this action' : `${actions.length} actions awaiting approval`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 relative">
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
                  className="space-y-3"
                >
                  {actions.map((action) => (
                    <motion.button
                      key={action.id}
                      onClick={() => setSelectedAction(action.id)}
                      className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all border border-transparent hover:border-gray-200 group"
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-gray-100">
                          {action.type === 'email' ? (
                            <Mail className="w-5 h-5 text-gray-600" />
                          ) : (
                            <Calendar className="w-5 h-5 text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-medium text-gray-900 mb-1 group-hover:text-black transition-colors">
                            {action.title.includes('[object Object]') && action.type === 'email' && action.metadata?.to
                              ? `Email to ${action.metadata.to.map((t: any) => t.email || t.name || t.address || (typeof t === 'string' ? t : 'Recipient')).join(', ')}`
                              : action.title}
                          </h3>
                          <p className="text-sm text-gray-500 mb-2 truncate">{action.description}</p>
                          {action.preview && (
                            <div className="text-xs text-gray-400 bg-white p-2 rounded border border-gray-100 line-clamp-2 font-mono">
                              {action.preview}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
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
                  {/* Draft Preview Card */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900">Draft Preview</h3>
                      {selectedActionData.metadata?.inReplyTo && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          Replying to conversation
                        </span>
                      )}
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Email Header */}
                      <div className="p-6 border-b border-gray-100 bg-gray-50/50 space-y-3">
                        <div className="flex items-baseline gap-3">
                          <span className="text-sm font-medium text-gray-500 w-12 flex-shrink-0">To:</span>
                          <span className="text-sm text-gray-900">
                            {selectedActionData.metadata?.to?.map((t: any) => t.email || t.name || t.address || (typeof t === 'string' ? t : 'Unknown')).join(', ')}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="text-sm font-medium text-gray-500 w-12 flex-shrink-0">Subject:</span>
                          <span className="text-sm text-gray-900">{selectedActionData.metadata?.subject || selectedActionData.description}</span>
                        </div>
                      </div>

                      {/* Email Body */}
                      <div className="p-6">
                        <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                          {/* Use body if available (new backend), fallback to preview */}
                          {selectedActionData.metadata?.body || selectedActionData.preview || "No content"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning Box */}
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <p className="text-sm text-amber-900 font-medium">This action will interact with your applications</p>
                  </div>

                  {/* Custom Confirmation Overlay */}
                  <AnimatePresence>
                    {showDiscardConfirm && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute inset-x-4 bottom-4 bg-white shadow-xl border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 z-10"
                      >
                        <p className="text-center text-gray-900 font-medium">Discard this draft permanently?</p>
                        <p className="text-center text-xs text-gray-500 -mt-2">This cannot be undone.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowDiscardConfirm(false)}
                            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleDiscard}
                            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            {discarding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Discard'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Footer Actions */}
        {selectedActionData && !showDiscardConfirm && (
          <div className="p-6 bg-white border-t border-gray-100">
            <div className="flex gap-4">
              <button
                onClick={() => setShowDiscardConfirm(true)}
                disabled={discarding || approving}
                className="flex-1 px-4 py-3 bg-white border border-gray-200 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-100 transition-colors font-medium text-sm disabled:opacity-50"
              >
                Discard Draft
              </button>
              <button
                onClick={handleApprove}
                disabled={approving || discarding}
                className="flex-1 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm shadow-lg shadow-gray-200"
              >
                {approving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
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
