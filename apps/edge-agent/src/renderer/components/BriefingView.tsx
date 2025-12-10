import React from 'react';
import { motion } from 'motion/react';
import { X, Star, Mail, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useTasks, Task } from '../hooks/useTasks';
import { usePendingActions } from '../hooks/usePendingActions';

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

  const loading = eventsLoading || tasksLoading || emailsLoading;

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
      to: action.metadata?.to?.map((t: any) => t.email || t).join(', ') || 'Unknown',
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
      className="fixed inset-0 bg-white z-40 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="font-serif italic text-2xl mb-1">{getGreeting()}</h1>
                <p className="text-sm text-gray-500">{formatDate()}</p>
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
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          {/* Top Priorities */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5" />
              <h2 className="text-lg">Top Priorities</h2>
            </div>
            {priorities.length === 0 ? (
              <p className="text-gray-500 text-sm">No pending tasks</p>
            ) : (
              <div className="space-y-3">
                {priorities.map((priority, index) => (
                  <motion.div
                    key={priority.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-4 rounded-xl border-2 ${priority.importance === 'high'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-white border-gray-200'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3>{priority.title}</h3>
                      <span className="text-xs bg-white px-2 py-1 rounded-full text-gray-600">
                        {priority.due}
                      </span>
                    </div>
                    {priority.context && (
                      <p className="text-sm text-gray-600">{priority.context}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Drafted Emails (placeholder) */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-5 h-5" />
              <h2 className="text-lg">Drafted for You</h2>
            </div>
            <div className="space-y-3">
              {draftedEmails.map((email, index) => (
                <motion.div
                  key={email.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="p-4 bg-gray-50 border border-gray-200 rounded-xl"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">To: {email.to}</div>
                      <div className="mb-2">{email.subject}</div>
                      <p className="text-sm text-gray-600">{email.preview}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Upcoming Meetings */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5" />
              <h2 className="text-lg">Today's Meetings</h2>
            </div>
            {upcomingMeetings.length === 0 ? (
              <p className="text-gray-500 text-sm">No meetings scheduled for today</p>
            ) : (
              <div className="space-y-3">
                {upcomingMeetings.map((meeting, index) => (
                  <motion.div
                    key={meeting.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="p-4 bg-white border border-gray-200 rounded-xl"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3>{meeting.title}</h3>
                      <span className="text-sm text-gray-600">{meeting.time}</span>
                    </div>
                    {meeting.participants.length > 0 && (
                      <div className="text-sm text-gray-600 mb-2">
                        With: {meeting.participants.join(', ')}
                      </div>
                    )}
                    {meeting.context && (
                      <p className="text-sm text-gray-500 italic">{meeting.context}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Outstanding Tasks */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5" />
              <h2 className="text-lg">Outstanding Tasks</h2>
            </div>
            {tasks.filter(t => isUserTask(t)).length === 0 ? (
              <p className="text-gray-500 text-sm">All caught up!</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="space-y-2">
                  {tasks.filter(t => isUserTask(t)).slice(0, 5).map((task, index) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 + index * 0.05 }}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    >
                      <span className="text-sm">{task.title}</span>
                      <span className="text-xs text-gray-500">
                        {task.due_date
                          ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'No due date'}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </motion.div>
  );
}