import React from 'react';
import { motion } from 'motion/react';
import { X, Star, Mail, Calendar, CheckCircle } from 'lucide-react';

interface BriefingViewProps {
  onClose: () => void;
}

export function BriefingView({ onClose }: BriefingViewProps) {
  const briefingData = {
    date: 'Wednesday, November 27, 2025',
    greeting: 'Good morning',
    priorities: [
      {
        id: 1,
        title: 'Follow up with Bob on budget forecast',
        context: 'Promised during yesterday\'s meeting',
        due: 'Today',
        importance: 'high',
      },
      {
        id: 2,
        title: 'Review Q4 allocation before Friday',
        context: 'Alice needs your input',
        due: 'Oct 5',
        importance: 'medium',
      },
      {
        id: 3,
        title: 'Prepare for product sync with Sarah',
        context: 'Scheduled for 2:00 PM today',
        due: 'Today, 2:00 PM',
        importance: 'medium',
      },
    ],
    draftedEmails: [
      {
        id: 1,
        to: 'Bob Chen',
        subject: 'Quick follow-up on budget forecast',
        preview: 'Hi Bob, Following up on our discussion yesterday. Looking forward to reviewing...',
      },
      {
        id: 2,
        to: 'Alice Jones',
        subject: 'Re: Q4 Budget Review',
        preview: 'Hi Alice, I\'ve reviewed the concerns you raised and wanted to share some thoughts...',
      },
    ],
    upcomingMeetings: [
      {
        id: 1,
        title: 'Product Roadmap Sync',
        time: '2:00 PM',
        participants: ['Sarah Miller'],
        context: 'Last interaction: discussed Q1 priorities, she was collaborative',
      },
      {
        id: 2,
        title: 'Team Standup',
        time: '10:00 AM',
        participants: ['Engineering Team'],
        context: '',
      },
    ],
    outstandingTasks: [
      { id: 1, text: 'Request forecast from Bob', due: 'Oct 2' },
      { id: 2, text: 'Review Q4 budget allocation', due: 'Oct 5' },
      { id: 3, text: 'Update project timeline', due: 'Oct 8' },
      { id: 4, text: 'Schedule 1:1 with marketing', due: 'Oct 10' },
      { id: 5, text: 'Review campaign metrics', due: 'Oct 12' },
    ],
  };

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
                <h1 className="font-serif italic text-2xl mb-1">{briefingData.greeting}</h1>
                <p className="text-sm text-gray-500">{briefingData.date}</p>
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
            <div className="space-y-3">
              {briefingData.priorities.map((priority, index) => (
                <motion.div
                  key={priority.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-xl border-2 ${
                    priority.importance === 'high'
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
                  <p className="text-sm text-gray-600">{priority.context}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Drafted Emails */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-5 h-5" />
              <h2 className="text-lg">Drafted for You</h2>
            </div>
            <div className="space-y-3">
              {briefingData.draftedEmails.map((email, index) => (
                <motion.div
                  key={email.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">To: {email.to}</div>
                      <div className="mb-2">{email.subject}</div>
                      <p className="text-sm text-gray-600">{email.preview}</p>
                    </div>
                    <button className="px-3 py-1.5 bg-black text-white rounded-lg text-sm hover:bg-gray-800 transition-colors ml-4">
                      Review
                    </button>
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
            <div className="space-y-3">
              {briefingData.upcomingMeetings.map((meeting, index) => (
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
                  <div className="text-sm text-gray-600 mb-2">
                    With: {meeting.participants.join(', ')}
                  </div>
                  {meeting.context && (
                    <p className="text-sm text-gray-500 italic">{meeting.context}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </section>

          {/* Outstanding Tasks */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5" />
              <h2 className="text-lg">Outstanding Tasks</h2>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="space-y-2">
                {briefingData.outstandingTasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 + index * 0.05 }}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-sm">{task.text}</span>
                    <span className="text-xs text-gray-500">{task.due}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}