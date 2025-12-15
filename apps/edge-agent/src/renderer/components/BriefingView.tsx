import React from 'react';
import { motion } from 'motion/react';
import { X, Star, Mail, Calendar, CheckCircle, Loader2, Users } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useTasks, Task } from '../hooks/useTasks';
import { usePendingActions } from '../hooks/usePendingActions';
import { useUserPreferences } from '../hooks/useUserPreferences';

interface BriefingViewProps {
  onClose: () => void;
}


// Helper to get greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Helper to format date
function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Helper to format time
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function BriefingView({ onClose }: BriefingViewProps) {
  // Request only meeting-type events
  const { events, loading: eventsLoading } = useEvents({ type: 'meeting', limit: 20 });
  const { tasks, loading: tasksLoading } = useTasks({ status: 'pending', limit: 10 });
  const { actions: pendingEmails, loading: emailsLoading } = usePendingActions();
  const { preferences, loading: prefsLoading } = useUserPreferences();

  const loading = eventsLoading || tasksLoading || emailsLoading || prefsLoading;

  // Filter for today's calendar meetings only
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Only include actual calendar/meeting events, not system events
  const calendarEventTypes = ['meeting', 'calendar', 'calendar_event'];

  const upcomingMeetings = events
    .filter(event => {
      // Filter for meeting types only
      const isMeetingType = calendarEventTypes.includes(event.type?.toLowerCase() || '');
      if (!isMeetingType) return false;

      // Filter for today
      const eventDate = new Date(event.start_time);
      const isToday = eventDate >= todayStart && eventDate <= todayEnd;
      return isToday;
    })
    .slice(0, 3)
    .map(event => ({
      id: event.id,
      title: event.title,
      time: formatTime(event.start_time),
      participants: event.participants?.map(p => p.name) || [],
      context: event.summary?.slice(0, 100) || '',
    }));

  // Filter out system-generated tasks (source='system')
  // Existing tasks without source field are treated as user tasks (backwards compatible)
  const isUserTask = (task: Task) => {
    return task.source !== 'system';
  };

  // Priority tasks (high priority or due soon) - only user tasks
  const priorities = tasks
    .filter(task => task.status === 'pending' && isUserTask(task))
    .slice(0, 5)
    .map(task => ({
      id: task.id,
      title: task.title,
      context: task.description || '',
      due: task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due date',
      importance: task.priority === 'high' ? 'high' : 'medium',
    }));

  // Email drafts from Action Service
  const draftedEmails = pendingEmails
    .filter(action => action.type === 'email')
    .slice(0, 3)
    .map(action => ({
      id: action.id,
      to: action.metadata?.to?.map((t: any) => t.email || t.name || t.address || (typeof t === 'string' ? t : 'Unknown Recipient')).join(', ') || 'Unknown',
      subject: action.metadata?.subject || action.description,
      preview: action.preview || '',
    }));

  if (loading) {
    return (
      <motion.div
        className="fixed inset-0 bg-white z-40 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading your briefing...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="h-full bg-white rounded-3xl overflow-hidden border border-gray-200 shadow-2xl flex flex-col"
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
    >
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="font-sans font-bold text-3xl mb-1 text-black">{getGreeting()}</h1>
                <p className="text-lg text-gray-600 font-medium">{formatDate()}</p>
                {preferences?.primaryFocus && (
                  <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium border border-indigo-100">
                    <Star className="w-3.5 h-3.5 mr-1.5 fill-indigo-700" />
                    Focus: {preferences.primaryFocus}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Top Priorities */}
            <section className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5" />
                <h2 className="text-lg font-medium">Top Priorities</h2>
              </div>
              {priorities.length === 0 ? (
                <p className="text-gray-500 text-sm">No pending high-priority items</p>
              ) : (
                <div className="space-y-3">
                  {priorities.map((priority, index) => (
                    <motion.div
                      key={priority.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-3 rounded-lg border ${priority.importance === 'high'
                        ? 'bg-red-50 border-red-100'
                        : 'bg-white border-gray-200'
                        }`}
                    >
                      <div className="text-base font-medium text-gray-900">{priority.title}</div>
                      {priority.context && (
                        <div className="text-sm text-gray-600 mt-1">{priority.context}</div>
                      )}
                      <div className="mt-2 text-xs text-gray-500 font-medium bg-white/50 inline-block px-2 py-1 rounded border border-gray-200">
                        {priority.due}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* Outstanding Tasks */}
            <section className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5" />
                <h2 className="text-lg font-medium">Quick Tasks</h2>
              </div>
              {tasks.filter(t => isUserTask(t)).length === 0 ? (
                <p className="text-gray-500 text-sm">All caught up!</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {tasks.filter(t => isUserTask(t)).slice(0, 5).map((task, index) => (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 + index * 0.05 }}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{task.title}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {task.due_date
                            ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : ''}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Upcoming Meetings */}
            <section className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5" />
                <h2 className="text-lg font-medium">Schedule</h2>
              </div>
              {upcomingMeetings.length === 0 ? (
                <p className="text-gray-500 text-sm">No meetings today</p>
              ) : (
                <div className="space-y-3">
                  {upcomingMeetings.map((meeting, index) => (
                    <motion.div
                      key={meeting.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                      className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-medium text-base">{meeting.title}</h3>
                        <span className="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{meeting.time}</span>
                      </div>
                      {meeting.participants.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <Users className="w-3 h-3" />
                          <span className="truncate">{meeting.participants.join(', ')}</span>
                        </div>
                      )}
                      {meeting.context && (
                        <p className="text-sm text-gray-500 italic border-l-2 border-gray-100 pl-2 mt-2">{meeting.context}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* Drafted Emails (placeholder) */}
            <section className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5" />
                <h2 className="text-lg font-medium">Drafts</h2>
              </div>
              <div className="space-y-3">
                {draftedEmails.map((email, index) => (
                  <motion.div
                    key={email.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors cursor-pointer group"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('ellipsa-menu-action', { detail: { action: 'actions' } }));
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Email</span>
                      <span className="text-xs text-gray-400">Draft</span>
                    </div>
                    <div className="font-medium text-base mb-0.5 group-hover:text-blue-600 transition-colors">{email.subject}</div>
                    <div className="text-sm text-gray-500 mb-1">To: {email.to}</div>
                    <p className="text-xs text-gray-400 line-clamp-1">{email.preview}</p>
                  </motion.div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </motion.div>
  );
}