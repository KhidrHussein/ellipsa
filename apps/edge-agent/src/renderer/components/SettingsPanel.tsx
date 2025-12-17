import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Shield,
  Eye,
  Database,
  Bell,
  Zap,
  Lock,
  Globe,
  HardDrive,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Link,
} from 'lucide-react';
import { IntegrationsSection } from './IntegrationsSection';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState({
    observeMode: true,
    cloudSync: false,
    localOnly: true,
    autoActions: false,
    notifications: true,
    analytics: false,
  });

  const [blockedDomains, setBlockedDomains] = useState([
    'banking.example.com',
    'healthcare.example.com',
  ]);

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    {
      title: 'Privacy & Observation',
      icon: Eye,
      items: [
        {
          id: 'observeMode',
          label: 'Enable Observe Mode',
          description: 'Allow ellipsa to capture meetings and screen context',
          enabled: settings.observeMode,
        },
        {
          id: 'localOnly',
          label: 'Local-Only Processing',
          description: 'Process all data on-device without cloud services',
          enabled: settings.localOnly,
        },
      ],
    },
    {
      title: 'Data Storage',
      icon: Database,
      items: [
        {
          id: 'cloudSync',
          label: 'Cloud Sync',
          description: 'Sync summaries to cloud for multi-device access',
          enabled: settings.cloudSync,
          disabled: settings.localOnly,
        },
      ],
    },
    {
      title: 'Actions & Automation',
      icon: Zap,
      items: [
        {
          id: 'autoActions',
          label: 'Auto-Execute Trusted Actions',
          description: 'Automatically execute pre-approved workflows',
          enabled: settings.autoActions,
        },
        {
          id: 'notifications',
          label: 'Action Notifications',
          description: 'Get notified when actions need approval',
          enabled: settings.notifications,
        },
      ],
    },
    {
      title: 'Analytics',
      icon: Globe,
      items: [
        {
          id: 'analytics',
          label: 'Anonymous Usage Analytics',
          description: 'Help improve ellipsa by sharing anonymous usage data',
          enabled: settings.analytics,
        },
      ],
    },
    {
      title: 'Integrations',
      icon: Link,
      items: [], // Handled by custom component
      customContent: <IntegrationsSection />,
    },
  ];

  return (
    <motion.div
      className="h-full bg-white rounded-3xl overflow-hidden border border-gray-200 shadow-2xl flex flex-col"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-sans font-bold text-2xl mb-1">Settings</h1>
                <p className="text-sm text-gray-500">Privacy, storage, and preferences</p>
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
          {/* Settings Sections */}
          {sections.map((section, sectionIndex) => (
            <motion.section
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <section.icon className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg">{section.title}</h2>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {/* Custom Content (Integrations) */}
                {/* @ts-ignore */}
                {section.customContent && section.customContent}

                {section.items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    className={`p-6 ${itemIndex !== section.items.length - 1 ? 'border-b border-gray-100' : ''
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="mb-1">{item.label}</div>
                        <p className="text-sm text-gray-600">{item.description}</p>
                      </div>
                      <button
                        onClick={() => !item.disabled && toggleSetting(item.id as keyof typeof settings)}
                        disabled={item.disabled}
                        className={`flex-shrink-0 transition-colors ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                      >
                        {item.enabled ? (
                          <ToggleRight className="w-12 h-12 text-black" />
                        ) : (
                          <ToggleLeft className="w-12 h-12 text-gray-300" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          ))}

          {/* Blocked Domains */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg">Blocked Domains</h2>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <p className="text-sm text-gray-600 mb-4">
                ellipsa will never observe or capture content from these domains
              </p>
              <div className="space-y-2 mb-4">
                {blockedDomains.map((domain, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Lock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-mono">{domain}</span>
                    </div>
                    <button
                      onClick={() =>
                        setBlockedDomains((prev) => prev.filter((d) => d !== domain))
                      }
                      className="text-xs text-gray-500 hover:text-black transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button className="text-sm text-gray-600 hover:text-black transition-colors">
                + Add domain
              </button>
            </div>
          </motion.section>

          {/* Data Retention */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <HardDrive className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg">Data Retention</h2>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="mb-1">Raw Captures (Audio/Screenshots)</div>
                    <p className="text-sm text-gray-600">Encrypted local storage</p>
                  </div>
                  <select className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                    <option>7 days</option>
                    <option>14 days</option>
                    <option>30 days</option>
                    <option>Never delete</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="mb-1">Summaries & Events</div>
                    <p className="text-sm text-gray-600">Structured memory data</p>
                  </div>
                  <select className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                    <option>90 days</option>
                    <option>180 days</option>
                    <option>1 year</option>
                    <option>Never delete</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="mb-1">Memory Summaries</div>
                    <p className="text-sm text-gray-600">Consolidated insights</p>
                  </div>
                  <select className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                    <option>Never delete</option>
                    <option>1 year</option>
                    <option>2 years</option>
                  </select>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Danger Zone */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h2 className="text-lg mb-4 text-red-600">Danger Zone</h2>

            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 space-y-3">
              <button className="w-full p-4 bg-white hover:bg-red-50 border border-red-200 rounded-xl text-left transition-colors flex items-center justify-between">
                <div>
                  <div className="text-red-600 mb-1">Delete All Memories</div>
                  <p className="text-sm text-gray-600">
                    Permanently delete all captured data and summaries
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-red-400" />
              </button>

              <button
                className="w-full p-4 bg-white hover:bg-red-50 border border-red-200 rounded-xl text-left transition-colors flex items-center justify-between"
                onClick={() => {
                  if (confirm('Are you sure you want to sign out? This will clear local preferences.')) {
                    localStorage.removeItem('user_id');
                    localStorage.removeItem('ellipsa_preferences');
                    window.location.reload();
                  }
                }}
              >
                <div>
                  <div className="text-red-600 mb-1">Sign Out</div>
                  <p className="text-sm text-gray-600">
                    Disconnect from your account and reset preferences
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-red-400" />
              </button>

              <button className="w-full p-4 bg-white hover:bg-red-50 border border-red-200 rounded-xl text-left transition-colors flex items-center justify-between">
                <div>
                  <div className="text-red-600 mb-1">Export All Data</div>
                  <p className="text-sm text-gray-600">Download a complete archive (GDPR compliant)</p>
                </div>
                <ChevronRight className="w-5 h-5 text-red-400" />
              </button>
            </div>
          </motion.section>
        </div>
      </div>
    </motion.div>
  );
}
