import React, { useState } from 'react';
import { FloatingButton } from './components/FloatingButton';
import { TimelineView } from './components/TimelineView';
import { BriefingView } from './components/BriefingView';
import { ChatOverlay } from './components/ChatOverlay';
import { SettingsPanel } from './components/SettingsPanel';
import { ActionApprovalModal } from './components/ActionApprovalModal';
import { PersonCardModal } from './components/PersonCardModal';
import { PostMeetingToast } from './components/PostMeetingToast';
import { ObserveModeOverlay } from './components/ObserveModeOverlay';
import { WelcomeScreen } from './components/WelcomeScreen';

export default function App() {
  const [view, setView] = useState<'welcome' | 'none' | 'timeline' | 'briefing' | 'chat' | 'settings'>('welcome');
  const [isObserving, setIsObserving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [actionPending, setActionPending] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  const handleFloatingButtonClick = () => {
    setView(view === 'chat' ? 'none' : 'chat');
  };

  const handleLongPress = () => {
    setIsObserving(!isObserving);
  };

  const handleSwipeUp = () => {
    setView(view === 'briefing' ? 'none' : 'briefing');
  };

  const handleDemoSelect = (demo: string) => {
    switch (demo) {
      case 'chat':
        setView('chat');
        break;
      case 'observe':
        setView('none');
        setIsObserving(true);
        break;
      case 'timeline':
        setView('timeline');
        break;
      case 'briefing':
        setView('briefing');
        break;
      case 'person-card':
        setView('none');
        setSelectedPerson('ent_alice_001');
        break;
      case 'actions':
        setView('none');
        setShowActionModal(true);
        break;
      case 'toast':
        setView('none');
        setShowToast(true);
        break;
      case 'settings':
        setView('settings');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Main Content Area */}
      <div className="min-h-screen">
        {view === 'timeline' && <TimelineView onPersonClick={setSelectedPerson} />}
        {view === 'briefing' && <BriefingView onClose={() => setView('none')} />}
        {view === 'settings' && <SettingsPanel onClose={() => setView('none')} />}
      </div>

      {/* Overlays */}
      {view === 'chat' && <ChatOverlay onClose={() => setView('none')} />}
      
      {/* Observe Mode Overlay */}
      <ObserveModeOverlay isActive={isObserving} />

      {/* Floating Button */}
      <FloatingButton
        isObserving={isObserving}
        actionPending={actionPending}
        actionCount={2}
        onClick={handleFloatingButtonClick}
        onLongPress={handleLongPress}
        onSwipeUp={handleSwipeUp}
        onMenuSelect={(item) => {
          if (item === 'timeline') setView('timeline');
          if (item === 'briefing') setView('briefing');
          if (item === 'settings') setView('settings');
          if (item === 'actions') setShowActionModal(true);
          if (item === 'home') setView('welcome');
        }}
      />

      {/* Modals & Toasts */}
      {showToast && (
        <PostMeetingToast
          itemCount={3}
          onReview={() => {
            setShowToast(false);
            setView('timeline');
          }}
          onAccept={() => setShowToast(false)}
          onDiscard={() => setShowToast(false)}
        />
      )}

      {selectedPerson && (
        <PersonCardModal
          personId={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}

      {showActionModal && (
        <ActionApprovalModal
          onClose={() => setShowActionModal(false)}
          onApprove={() => {
            setShowActionModal(false);
            setActionPending(false);
          }}
        />
      )}

      {/* Welcome Screen */}
      {view === 'welcome' && (
        <WelcomeScreen onDemoSelect={handleDemoSelect} />
      )}
    </div>
  );
}