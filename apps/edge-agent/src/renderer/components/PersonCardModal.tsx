import React from 'react';
import { motion } from 'motion/react';
import { X, Mail, Calendar, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { useEntity } from '../hooks/useEntities';

interface PersonCardModalProps {
  personId: string;
  onClose: () => void;
}

export function PersonCardModal({ personId, onClose }: PersonCardModalProps) {
  const { entity, loading, error } = useEntity(personId);

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
          <p className="text-gray-500">Loading contact...</p>
        </motion.div>
      </motion.div>
    );
  }

  // Handle error or not found
  if (error || !entity) {
    return (
      <motion.div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-gray-500 mb-4">Could not load contact information</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // Extract data from entity
  const name = entity.name || 'Unknown';
  const role = entity.metadata?.role || 'Contact';
  const company = entity.metadata?.company || '';
  const lastInteraction = entity.metadata?.last_interaction || 'No recent interaction';
  const relationshipSummary = entity.metadata?.relationship_summary || '';

  // Get recent events from entity if available
  const recentEvents = entity.recent_events || [];

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
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl mb-1">{name}</h2>
              <p className="text-gray-600">{role}</p>
              {company && <p className="text-sm text-gray-500">{company}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Last seen: </span>
              <span>{lastInteraction}</span>
            </div>
            <div>
              <span className="text-gray-500">Type: </span>
              <span className="capitalize">{entity.type}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Relationship Summary */}
          {relationshipSummary && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm">Relationship Summary</h3>
              </div>
              <p className="text-gray-600 bg-gray-50 rounded-xl p-4">{relationshipSummary}</p>
            </section>
          )}

          {/* Recent Interactions */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm">Recent Interactions</h3>
            </div>
            {recentEvents.length === 0 ? (
              <p className="text-gray-500 text-sm bg-gray-50 rounded-xl p-4">
                No recent interactions recorded
              </p>
            ) : (
              <div className="space-y-3">
                {recentEvents.slice(0, 5).map((event: any) => (
                  <div
                    key={event.id}
                    className="p-4 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs bg-white px-2 py-1 rounded-full text-gray-600">
                        {event.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(event.start_time).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm mb-2">{event.title}</p>
                    {event.summary && (
                      <p className="text-xs text-gray-500">{event.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Quick Actions */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3">
            <button className="flex-1 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" />
              <span>Draft Email</span>
            </button>
            <button className="flex-1 px-4 py-3 bg-gray-100 text-black rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Schedule Call</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
