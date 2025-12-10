import React from 'react';
import { motion } from 'motion/react';
import { X, Mail, Calendar, TrendingUp, Clock } from 'lucide-react';

interface PersonCardModalProps {
  personId: string;
  onClose: () => void;
}

export function PersonCardModal({ personId, onClose }: PersonCardModalProps) {
  // Mock data based on personId
  const personData = {
    ent_alice_001: {
      name: 'Alice Jones',
      role: 'VP Sales',
      org: 'ACME Corp',
      relationshipStrength: 0.72,
      defaultPersona: 'formal',
      lastSeen: '2 hours ago',
      interactions: [
        {
          id: 1,
          type: 'meeting',
          date: 'Today, 9:05 AM',
          summary: 'Budget review discussion. Alice expressed concerns about Q4 allocation.',
          tone: 'Concerned',
        },
        {
          id: 2,
          type: 'email',
          date: 'Yesterday, 3:22 PM',
          summary: 'Requested updated sales forecast. Alice promised to deliver by end of week.',
          tone: 'Professional',
        },
        {
          id: 3,
          type: 'meeting',
          date: 'Sept 25, 2:00 PM',
          summary: 'Quarterly review. Alice presented strong Q3 results and outlined growth strategy.',
          tone: 'Optimistic',
        },
      ],
      toneHistory: [
        { date: 'Sept 20', score: 0.8 },
        { date: 'Sept 22', score: 0.75 },
        { date: 'Sept 25', score: 0.85 },
        { date: 'Sept 26', score: 0.65 },
        { date: 'Today', score: 0.55 },
      ],
      openPromises: [
        'Provide updated sales forecast by Sept 30',
        'Review budget allocation proposal',
      ],
      suggestedOpeners: [
        "Hi Alice, following up on our budget discussion...",
        "Alice, wanted to check in on the Q4 forecast...",
        "Hi Alice, I've been thinking about your concerns from this morning...",
      ],
    },
    ent_bob_002: {
      name: 'Bob Chen',
      role: 'Finance Director',
      org: 'ACME Corp',
      relationshipStrength: 0.65,
      defaultPersona: 'concise',
      lastSeen: '2 hours ago',
      interactions: [
        {
          id: 1,
          type: 'meeting',
          date: 'Today, 9:05 AM',
          summary: 'Committed to providing updated forecast by October 2nd.',
          tone: 'Professional',
        },
        {
          id: 2,
          type: 'email',
          date: 'Sept 24, 11:15 AM',
          summary: 'Shared preliminary budget numbers. Bob suggested we discuss adjustments.',
          tone: 'Analytical',
        },
      ],
      toneHistory: [
        { date: 'Sept 20', score: 0.7 },
        { date: 'Sept 24', score: 0.68 },
        { date: 'Today', score: 0.72 },
      ],
      openPromises: ['Deliver updated forecast by Oct 2'],
      suggestedOpeners: [
        "Hi Bob, just checking in on the forecast...",
        "Bob, wanted to confirm we're still on track for Oct 2...",
      ],
    },
  };

  const person = personData[personId as keyof typeof personData] || personData.ent_alice_001;

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
              <h2 className="text-2xl mb-1">{person.name}</h2>
              <p className="text-gray-600">{person.role}</p>
              <p className="text-sm text-gray-500">{person.org}</p>
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
              <span>{person.lastSeen}</span>
            </div>
            <div>
              <span className="text-gray-500">Relationship: </span>
              <span>{Math.round(person.relationshipStrength * 100)}%</span>
            </div>
            <div>
              <span className="text-gray-500">Tone: </span>
              <span className="italic">{person.defaultPersona}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tone Trend */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm">Interaction Tone Trend</h3>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-end justify-between h-24 gap-2">
                {person.toneHistory.map((point, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full bg-black rounded-t" style={{ height: `${point.score * 100}%` }} />
                    <span className="text-xs text-gray-500">{point.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Recent Interactions */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm">Recent Interactions</h3>
            </div>
            <div className="space-y-3">
              {person.interactions.map((interaction) => (
                <div
                  key={interaction.id}
                  className="p-4 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs bg-white px-2 py-1 rounded-full text-gray-600">
                      {interaction.type}
                    </span>
                    <span className="text-xs text-gray-500">{interaction.date}</span>
                  </div>
                  <p className="text-sm mb-2">{interaction.summary}</p>
                  <p className="text-xs text-gray-500 italic">Tone: {interaction.tone}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Open Promises */}
          {person.openPromises.length > 0 && (
            <section>
              <h3 className="text-sm mb-3">Open Commitments</h3>
              <div className="space-y-2">
                {person.openPromises.map((promise, index) => (
                  <div
                    key={index}
                    className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm"
                  >
                    {promise}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Suggested Openers */}
          <section>
            <h3 className="text-sm mb-3">Suggested Email Openers</h3>
            <div className="space-y-2">
              {person.suggestedOpeners.map((opener, index) => (
                <button
                  key={index}
                  className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm transition-colors"
                >
                  "{opener}"
                </button>
              ))}
            </div>
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
