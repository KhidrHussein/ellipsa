import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle, Eye, X } from 'lucide-react';

interface PostMeetingToastProps {
  itemCount: number;
  onReview: () => void;
  onAccept: () => void;
  onDiscard: () => void;
}

export function PostMeetingToast({
  itemCount,
  onReview,
  onAccept,
  onDiscard,
}: PostMeetingToastProps) {
  return (
    <motion.div
      className="fixed top-8 right-8 z-40 w-96"
      initial={{ opacity: 0, y: -20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: 20 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-gray-50 to-white">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="mb-1">Meeting Captured</div>
                <p className="text-sm text-gray-600">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'} extracted
                </p>
              </div>
            </div>
            <button
              onClick={onDiscard}
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">
            I've summarized your meeting and identified action items. Would you like to review the details?
          </p>
        </div>

        {/* Preview */}
        <div className="p-6 bg-gray-50 border-t border-gray-100">
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-black mt-2 flex-shrink-0" />
              <span className="text-gray-700">Budget concerns discussed with Alice</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-black mt-2 flex-shrink-0" />
              <span className="text-gray-700">Bob to provide forecast by Oct 2</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-black mt-2 flex-shrink-0" />
              <span className="text-gray-700">Follow-up action items created</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm"
          >
            Accept
          </button>
          <button
            onClick={onReview}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-black rounded-xl hover:bg-gray-200 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4" />
            Review
          </button>
        </div>
      </div>
    </motion.div>
  );
}
