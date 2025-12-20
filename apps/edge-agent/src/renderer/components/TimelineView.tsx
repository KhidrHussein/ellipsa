import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Users, CheckCircle, Circle, Clock, Loader2, Terminal, Hash, ChevronRight, X, Monitor, Globe, Layout, Bell } from 'lucide-react';
import { useEvents, TimelineEvent } from '../hooks/useEvents';
import { GlassCard } from './ui/GlassCard';

interface TimelineViewProps {
  onPersonClick: (personId: string) => void;
  onClose?: () => void;
}

// Helper to format date relative to now
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) return `${diffDays} DAYS AGO`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

// Helper to format time range
function formatTimeRange(startTime: string, endTime?: string): string {
  const start = new Date(startTime);
  const startStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

  if (!endTime) return startStr;

  const end = new Date(endTime);
  const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  return `${startStr}-${endStr}`;
}

export function TimelineView({ onPersonClick, onClose }: TimelineViewProps) {
  const [filter, setFilter] = useState<'all' | 'meetings' | 'tasks'>('all');
  const { events, loading, error } = useEvents({
    type: filter === 'all' ? undefined : filter === 'meetings' ? 'meeting' : 'task',
    limit: 50
  });

  // Event types to exclude from timeline (system/internal events)
  const excludedEventTypes = ['assistant_message', 'process_event', 'user_message', 'system', 'error'];

  // Event types that are meaningful to show
  const meaningfulEventTypes = ['meeting', 'calendar', 'calendar_event', 'email', 'task', 'call', 'note', 'window', 'app_usage', 'goal_feedback', 'action_execution'];

  // Transform events for display, filtering out system events
  const displayEvents = useMemo(() => {
    console.log('[TimelineView] Filtering events. Total:', events.length, 'Filter:', filter);

    const filtered = events.filter(event => {
      const eventType = event.type?.toLowerCase() || '';
      // Exclude system events
      if (excludedEventTypes.includes(eventType)) return false;

      // HIDE LEGACY LOGS: Filter out "No goal specified" logs from UI as requested
      if (event.title?.includes("Action: No goal specified")) return false;

      // If we have a defined list of meaningful types and this isn't one, check if it looks like a meeting
      if (!meaningfulEventTypes.includes(eventType)) {
        // Only include if it has participants (likely a meeting)
        return event.participants && event.participants.length > 0;
      }
      return true;
    });

    console.log('[TimelineView] Filtered count:', filtered.length);

    // CONSOLIDATE CONSECUTIVE EVENTS
    // Group consecutive polling/usage logs (same title & type within 5 mins)
    const consolidated: typeof events = [];

    // Sort by time descending to ensure correct order for consolidation
    const sorted = [...filtered].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    for (const event of sorted) {
      const last = consolidated[consolidated.length - 1];

      if (last) {
        // Check matching criteria
        const isSameType = last.type === event.type;
        const isSameTitle = last.title === event.title;

        if (isSameType && isSameTitle) {
          const lastStart = new Date(last.start_time).getTime();
          const currentEnd = new Date(event.end_time || event.start_time).getTime();

          // Calculate gap between current event end and last event start
          // Since we are iterating backwards in time (descending), "last" is the NEWER event.
          // Gap = Start of Newer - End of This(Older)
          const gap = lastStart - currentEnd;

          // Threshold: 60 minutes (3600000ms)
          // Also handle overlap (gap < 0)
          if (gap <= 3600000) {
            // MERGE: Extend the start time of the consolidated (newer) event 
            // to the start time of this (older) event.
            last.start_time = event.start_time;
            continue; // Skip adding this event as a separate entry
          }
        }
      }
      // If not merged, add as new entry (clone to avoid mutation issues)
      consolidated.push({ ...event });
    }

    console.log('[TimelineView] Consolidated count:', consolidated.length);

    const transformed = consolidated.map(event => ({
      id: event.id,
      type: event.type || 'meeting',
      title: event.title,
      time: formatTimeRange(event.start_time, event.end_time),
      date: formatRelativeDate(event.start_time),
      participants: event.participants?.map(p => ({
        id: p.entity_id,
        name: p.name,
        role: p.role,
        actionItems: event.metadata?.action_items || [],
      })) || [],
      summary: event.summary || '',
      tone: event.metadata?.tone || { label: 'Neutral', confidence: 0.5 },
      actionItems: event.metadata?.action_items || [],
    }));

    return transformed;
  }, [events]);

  // Show loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center font-mono bg-white border border-gray-200 shadow-xl rounded-xl">
        <div className="flex flex-col items-center gap-2 text-xs text-black/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          <p>LOADING_SYSTEM_LOGS...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center font-mono bg-white border border-gray-200 shadow-xl rounded-xl">
        <div className="text-center max-w-md p-6">
          <p className="text-red-500 mb-2 text-xs">ERROR_LOADING_LOGS</p>
          <p className="text-black/50 text-[10px]">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white font-sans text-sm border border-gray-200 shadow-2xl rounded-xl">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-black/70">
          <Terminal className="w-4 h-4" />
          <span className="font-bold tracking-wider">SYSTEM_LOGS</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Tabs */}
          <div className="flex gap-1">
            {['all', 'meetings', 'tasks'].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab as typeof filter)}
                className={`px-3 py-1 rounded text-xs transition-colors uppercase tracking-wide ${filter === tab
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline Content */}
      <div className="px-4 py-4 space-y-6">
        {displayEvents.length === 0 ? (
          <div className="text-center py-12 text-black/40">
            <p>NO_EVENTS_DETECTED</p>
            <p className="text-[10px] mt-1">WAITING_FOR_INPUT...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayEvents.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="h-full"
              >
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors group h-full flex flex-col">
                  {/* Date/Time Header */}
                  <div className="mb-2 flex items-center gap-2 text-xs text-black/50 tracking-wide font-medium">
                    <span>{event.date}</span>
                    <span>•</span>
                    <span>{event.time}</span>
                    <span>•</span>
                    <span className="uppercase flex items-center gap-1">
                      {event.type === 'window' ? (
                        <Monitor className="w-3 h-3" />
                      ) : event.type === 'goal_feedback' ? (
                        <Bell className="w-3 h-3" />
                      ) : (
                        <span className="uppercase">{event.type}</span>
                      )}
                      {event.type === 'window' ? 'APP' : event.type === 'goal_feedback' ? 'FEEDBACK' : ''}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-lg text-black/90 group-hover:text-black transition-colors">
                      {event.title || 'UNTITLED_EVENT'}
                    </h3>
                  </div>

                  {/* Participants */}
                  {event.participants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {event.participants.map((person) => (
                        <button
                          key={person.id}
                          onClick={() => onPersonClick(person.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-700 transition-colors hover:border-gray-300"
                        >
                          <Hash className="w-3 h-3 opacity-50" />
                          <span>{person.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {event.summary && (
                    <p className="text-gray-700 leading-relaxed mb-3 text-sm flex-grow">
                      {event.summary}
                    </p>
                  )}

                  {/* Action Items */}
                  {event.actionItems.length > 0 && (
                    <div className="border-t border-gray-200 pt-2 mt-auto">
                      <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Required Actions</div>
                      <div className="space-y-1">
                        {event.actionItems.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            {item.status === 'completed' ? (
                              <div className="text-green-600 font-bold">[X]</div>
                            ) : (
                              <div className="text-gray-300 font-bold">[ ]</div>
                            )}
                            <div className={`flex-1 ${item.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {item.text}
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

