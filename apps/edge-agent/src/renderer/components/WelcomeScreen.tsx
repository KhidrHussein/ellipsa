import React from 'react';
import { motion } from 'motion/react';
import { 
  MessageSquare, 
  Calendar, 
  Clock, 
  Users, 
  Zap, 
  Eye,
  Settings,
  ArrowRight 
} from 'lucide-react';

interface WelcomeScreenProps {
  onSelectDemo: (demo: string) => void;
}

export function WelcomeScreen({ onSelectDemo }: WelcomeScreenProps) {
  const demos = [
    {
      id: 'chat',
      title: 'Chat with AI Self',
      description: 'Ask questions about your meetings, people, and tasks',
      icon: MessageSquare,
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: 'observe',
      title: 'Observe Mode',
      description: 'See real-time audio/visual capture and processing',
      icon: Eye,
      color: 'from-red-500 to-red-600',
    },
    {
      id: 'timeline',
      title: 'Timeline & Events',
      description: 'View captured meetings and interactions chronologically',
      icon: Calendar,
      color: 'from-purple-500 to-purple-600',
    },
    {
      id: 'briefing',
      title: 'Morning Briefing',
      description: 'Daily priorities, drafted emails, and upcoming meetings',
      icon: Clock,
      color: 'from-orange-500 to-orange-600',
    },
    {
      id: 'person-card',
      title: 'Person Cards',
      description: 'Detailed relationship cards with interaction history',
      icon: Users,
      color: 'from-green-500 to-green-600',
    },
    {
      id: 'actions',
      title: 'Action Approval',
      description: 'Review and approve automated workflows',
      icon: Zap,
      color: 'from-yellow-500 to-yellow-600',
    },
    {
      id: 'toast',
      title: 'Post-Meeting Toast',
      description: 'Non-intrusive meeting capture notifications',
      icon: MessageSquare,
      color: 'from-teal-500 to-teal-600',
    },
    {
      id: 'settings',
      title: 'Privacy & Settings',
      description: 'Control observation, storage, and data retention',
      icon: Settings,
      color: 'from-gray-500 to-gray-600',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-8">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-white" />
                <div className="w-2 h-2 rounded-full bg-white" />
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>
          </div>
          <h1 className="font-serif italic text-5xl mb-4">ellipsa</h1>
          <p className="text-xl text-gray-600 mb-2">Your AI Self</p>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Explore the visual design system. Click any card below to see different parts of the interface.
          </p>
        </motion.div>

        {/* Demo Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {demos.map((demo, index) => (
            <motion.button
              key={demo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelectDemo(demo.id)}
              className="group relative overflow-hidden bg-white rounded-2xl p-6 text-left border-2 border-gray-200 hover:border-black transition-all hover:shadow-xl"
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${demo.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              
              {/* Content */}
              <div className="relative">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                  <demo.icon className="w-6 h-6" />
                </div>
                
                <h3 className="mb-2">{demo.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{demo.description}</p>
                
                <div className="flex items-center gap-2 text-sm text-gray-400 group-hover:text-black transition-colors">
                  <span>Explore</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Instructions */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="inline-block p-6 bg-white rounded-2xl border border-gray-200">
            <h3 className="mb-3">Floating Button Interactions</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div><span className="font-medium text-black">Single tap</span> → Open chat</div>
              <div><span className="font-medium text-black">Long press (500ms)</span> → Toggle observe mode</div>
              <div><span className="font-medium text-black">Swipe up</span> → Open briefing</div>
              <div><span className="font-medium text-black">Right-click</span> → Context menu</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
