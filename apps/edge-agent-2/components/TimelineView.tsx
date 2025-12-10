import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Users, CheckCircle, Circle, Clock } from 'lucide-react';

interface TimelineViewProps {
  onPersonClick: (personId: string) => void;
}

export function TimelineView({ onPersonClick }: TimelineViewProps) {
  const events = [
    {
      id: 'evt_001',
      type: 'meeting',
      title: 'Budget Review with Alice & Bob',
      time: '9:05 AM - 9:40 AM',
      date: 'Today',
      participants: [
        { id: 'ent_alice_001', name: 'Alice Jones', role: 'VP Sales' },
        { id: 'ent_bob_002', name: 'Bob Chen', role: 'Finance Director' },
      ],
      summary: 'Alice expressed budget concerns; Bob promised updated forecast by Oct 2.',
      tone: { label: 'Concerned', confidence: 0.86 },
      actionItems: [
        { id: 'task_42', text: 'Request forecast from Bob', owner: 'you', status: 'open', due: 'Oct 2' },
        { id: 'task_43', text: 'Review Q4 budget allocation', owner: 'you', status: 'open', due: 'Oct 5' },
      ],
    },
    {
      id: 'evt_002',
      type: 'meeting',
      title: 'Product Roadmap Discussion',
      time: '2:00 PM - 3:15 PM',
      date: 'Yesterday',
      participants: [
        { id: 'ent_sarah_003', name: 'Sarah Miller', role: 'Product Lead' },
      ],
      summary: 'Discussed Q1 feature priorities. Sarah committed to sharing updated timeline next week.',
      tone: { label: 'Collaborative', confidence: 0.92 },
      actionItems: [
        { id: 'task_44', text: 'Follow up on timeline', owner: 'you', status: 'completed', due: 'Sept 30' },
      ],
    },
    {
      id: 'evt_003',
      type: 'email',
      title: 'Email exchange with Marketing',
      time: '11:23 AM',
      date: 'Sept 25',
      participants: [
        { id: 'ent_mike_004', name: 'Mike Torres', role: 'Marketing Manager' },
      ],
      summary: 'Mike requested campaign metrics. Shared analytics dashboard link.',
      tone: { label: 'Professional', confidence: 0.78 },
      actionItems: [],
    },
  ];

  const [filter, setFilter] = useState<'all' | 'meetings' | 'tasks'>('all');

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
                className={`px-4 py-2 rounded-full text-sm transition-colors ${
                  filter === tab
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
        <div className="space-y-8">
          {events.map((event, index) => (
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
                          <div className="text-xs text-gray-500">{person.role}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <p className="text-gray-700 mb-4 leading-relaxed">{event.summary}</p>

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
                      {event.actionItems.map((item) => (
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
                              Due: {item.due} • Owner: {item.owner}
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
      </div>
    </div>
  );
}
