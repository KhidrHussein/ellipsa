import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Users, CheckCircle, Circle, Clock, Loader2 } from 'lucide-react';
import { useEvents, TimelineEvent } from '../hooks/useEvents';

interface TimelineViewProps {
  onPersonClick: (personId: string) => void;
}

// Helper to format date relative to now
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Helper to format time range
function formatTimeRange(startTime: string, endTime?: string): string {
  const start = new Date(startTime);
  const startStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (!endTime) return startStr;

  const end = new Date(endTime);
  const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${startStr} - ${endStr}`;
}

export function TimelineView({ onPersonClick }: TimelineViewProps) {
  const [filter, setFilter] = useState<'all' | 'meetings' | 'tasks'>('all');
  const { events, loading, error } = useEvents({
    type: filter === 'all' ? undefined : filter === 'meetings' ? 'meeting' : undefined,
    limit: 50
  });

  // Event types to exclude from timeline (system/internal events)
  const excludedEventTypes = ['assistant_message', 'process_event', 'user_message', 'system', 'error'];

  // Event types that are meaningful to show
  const meaningfulEventTypes = ['meeting', 'calendar', 'calendar_event', 'email', 'task', 'call', 'note'];

  // Transform events for display, filtering out system events
  const displayEvents = useMemo(() => {
    const filtered = events.filter(event => {
      const eventType = event.type?.toLowerCase() || '';
      // Exclude system events
      if (excludedEventTypes.includes(eventType)) return false;
      // If we have a defined list of meaningful types and this isn't one, check if it looks like a meeting
      if (!meaningfulEventTypes.includes(eventType)) {
        // Only include if it has participants (likely a meeting)
        return event.participants && event.participants.length > 0;
      }
      return true;
    });

    const transformed = filtered.map(event => ({
      id: event.id,
      type: event.type || 'meeting',
      title: event.title,
      time: formatTimeRange(event.start_time, event.end_time),
      date: formatRelativeDate(event.start_time),
      participants: event.participants?.map(p => ({
        id: p.entity_id,
        name: p.name,
        role: p.role,
      })) || [],
      summary: event.summary || '',
      tone: event.metadata?.tone || { label: 'Neutral', confidence: 0.5 },
      actionItems: event.metadata?.action_items || [],
    }));

    console.log('[TimelineView] Filtered events:', transformed.length, 'from', events.length);
    return transformed;
  }, [events]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading timeline...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <p className="text-red-500 mb-2">Failed to load timeline</p>
          <p className="text-gray-500 text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="font-serif italic text-2xl mb-4">Timeline</h1>

          {/* Filter Tabs */}
          <div className="flex gap-2">
            {['all', 'meetings', 'tasks'].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab as typeof filter)}
                className={`px-4 py-2 rounded-full text-sm transition-colors ${filter === tab
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {displayEvents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No events yet</p>
            <p className="text-gray-400 text-sm mt-2">Events will appear here as you use observe mode</p>
          </div>
        ) : (
          <div className="space-y-8">
            {displayEvents.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {/* Date Label */}
                <div className="text-xs text-gray-400 mb-3">{event.date}</div>

                {/* Event Card */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="mb-1">{event.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{event.time}</span>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-gray-50 rounded-full text-xs text-gray-600">
                      {event.type}
                    </div>
                  </div>

                  {/* Participants */}
                  {event.participants.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-500">Participants</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {event.participants.map((person) => (
                          <button
                            key={person.id}
                            onClick={() => onPersonClick(person.id)}
                            className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm transition-colors"
                          >
                            <div>{person.name}</div>
                            {person.role && <div className="text-xs text-gray-500">{person.role}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {event.summary && (
                    <p className="text-gray-700 mb-4 leading-relaxed">{event.summary}</p>
                  )}

                  {/* Tone Indicator */}
                  <div className="flex items-center gap-2 mb-4 text-sm">
                    <span className="text-gray-500">Tone:</span>
                    <span className="italic">{event.tone.label}</span>
                    <span className="text-gray-400">({Math.round(event.tone.confidence * 100)}% confidence)</span>
                  </div>

                  {/* Action Items */}
                  {event.actionItems.length > 0 && (
                    <div className="border-t border-gray-100 pt-4">
                      <div className="text-xs text-gray-500 mb-3">Action Items</div>
                      <div className="space-y-2">
                        {event.actionItems.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                          >
                            {item.status === 'completed' ? (
                              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className={item.status === 'completed' ? 'line-through text-gray-500' : ''}>
                                {item.text}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Due: {item.due || 'N/A'} • Owner: {item.owner || 'you'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
