import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';

interface ActionApprovalModalProps {
  onClose: () => void;
  onApprove: () => void;
}

export function ActionApprovalModal({ onClose, onApprove }: ActionApprovalModalProps) {
  const [selectedAction, setSelectedAction] = useState<number | null>(null);

  const pendingActions = [
    {
      id: 1,
      title: 'Send follow-up email to Bob Chen',
      description: 'Based on your meeting this morning about budget forecasts',
      steps: [
        { op: 'open_url', description: 'Open Gmail in browser', args: { url: 'https://mail.google.com' } },
        { op: 'click', description: 'Click compose button', args: { selector: '[role="button"][gh="cm"]' } },
        { op: 'type_text', description: 'Enter recipient: bob.chen@acme.com', args: { field: 'to' } },
        { op: 'type_text', description: 'Enter subject: Quick follow-up on budget forecast', args: { field: 'subject' } },
        { op: 'type_text', description: 'Type email body (see draft below)', args: { field: 'body' } },
        { op: 'wait_confirm', description: 'Wait for your approval to send', args: {} },
      ],
      draft: {
        to: 'bob.chen@acme.com',
        subject: 'Quick follow-up on budget forecast',
        body: `Hi Bob,

Following up on our discussion this morning about the Q4 budget. I appreciate your commitment to providing the updated forecast by October 2nd.

If you need any additional context or data from my side to help with the numbers, please let me know.

Looking forward to reviewing the forecast.

Best regards`,
      },
      confidence: 0.89,
      context: 'evt_20250927_001',
    },
    {
      id: 2,
      title: 'Create calendar reminder for Alice',
      description: 'Follow up on Q4 budget allocation review',
      steps: [
        { op: 'open_app', description: 'Open Calendar application', args: {} },
        { op: 'create_event', description: 'Create new event', args: {} },
        { op: 'type_text', description: 'Title: Review Q4 budget allocation with Alice', args: { field: 'title' } },
        { op: 'set_date', description: 'Set date: October 5, 2025', args: { date: '2025-10-05' } },
        { op: 'set_reminder', description: 'Set reminder: 1 day before', args: { reminder: '1d' } },
        { op: 'save', description: 'Save calendar event', args: {} },
      ],
      confidence: 0.94,
      context: 'evt_20250927_001',
    },
  ];

  const selectedActionData = selectedAction !== null ? pendingActions[selectedAction] : null;

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
                {selectedActionData ? 'Review action steps' : `${pendingActions.length} actions awaiting approval`}
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
          <AnimatePresence mode="wait">
            {selectedActionData === null ? (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {pendingActions.map((action, index) => (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="border-2 border-gray-200 rounded-2xl p-6 hover:border-black transition-colors cursor-pointer"
                    onClick={() => setSelectedAction(index)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="mb-2">{action.title}</h3>
                        <p className="text-sm text-gray-600">{action.description}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-gray-600">
                          {Math.round(action.confidence * 100)}% confidence
                        </span>
                      </div>
                      <div className="text-gray-400">
                        {action.steps.length} steps
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Back Button */}
                <button
                  onClick={() => setSelectedAction(null)}
                  className="text-sm text-gray-600 hover:text-black transition-colors"
                >
                  ← Back to all actions
                </button>

                {/* Action Details */}
                <div>
                  <h3 className="text-xl mb-2">{selectedActionData.title}</h3>
                  <p className="text-gray-600">{selectedActionData.description}</p>
                </div>

                {/* Execution Steps */}
                <div>
                  <h4 className="text-sm mb-4">Execution Plan</h4>
                  <div className="space-y-3">
                    {selectedActionData.steps.map((step, index) => (
                      <div
                        key={index}
                        className="flex gap-4 p-4 bg-gray-50 rounded-xl"
                      >
                        <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center text-sm flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="mb-1">{step.description}</div>
                          <div className="text-xs text-gray-500 font-mono">
                            {step.op}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Draft Preview (for email actions) */}
                {selectedActionData.draft && (
                  <div>
                    <h4 className="text-sm mb-4">Draft Preview</h4>
                    <div className="border border-gray-200 rounded-xl p-6 bg-gray-50 space-y-4">
                      <div>
                        <span className="text-sm text-gray-500">To: </span>
                        <span>{selectedActionData.draft.to}</span>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Subject: </span>
                        <span>{selectedActionData.draft.subject}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-4">
                        <pre className="text-sm whitespace-pre-wrap font-sans">
                          {selectedActionData.draft.body}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning */}
                <div className="flex gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="mb-1">This action will interact with your applications</div>
                    <div className="text-gray-600">
                      You'll have a final chance to review before any action is executed (especially sending emails).
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200">
          {selectedActionData ? (
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedAction(null)}
                className="flex-1 px-6 py-3 bg-gray-100 text-black rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onApprove();
                  onClose();
                }}
                className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
              >
                Approve & Execute
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gray-100 text-black rounded-xl hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
