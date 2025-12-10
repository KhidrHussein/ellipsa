import React, { useState } from 'react';
import { ServiceProvider } from './contexts/ServiceContext';
import { TooltipProvider } from './components/ui/tooltip';

import { FloatingButton } from './components/FloatingButton';
import { TimelineView } from './components/TimelineView';
import { BriefingView } from './components/BriefingView';
// ChatOverlay is now rendered in a separate window via IPC
import { SettingsPanel } from './components/SettingsPanel';
import { ActionApprovalModal } from './components/ActionApprovalModal';
import { PersonCardModal } from './components/PersonCardModal';
import { PostMeetingToast } from './components/PostMeetingToast';
import { ObserveModeOverlay } from './components/ObserveModeOverlay';
import { WelcomeScreen } from './components/WelcomeScreen';

import { useObserveMode } from './hooks/useObserveMode';

export default function App() {
  const [view, setView] = useState<'welcome' | 'none' | 'timeline' | 'briefing' | 'settings'>('none');
  const { isObserving, toggleObserveMode } = useObserveMode();
  const [showToast, setShowToast] = useState(false);
  const [actionPending, setActionPending] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  const handleFloatingButtonClick = () => {
    // Open chat in separate window via IPC
    // @ts-ignore
    window.ellipsa?.toggleChat?.();
  };

  const handleLongPress = () => {
    toggleObserveMode();
  };

  const handleSwipeUp = () => {
    setView(view === 'briefing' ? 'none' : 'briefing');
  };

  const handleDemoSelect = (demo: string) => {
    switch (demo) {
      case 'chat':
        // @ts-ignore
        window.ellipsa?.toggleChat?.();
        break;
      case 'observe':
        setView('none');
        if (!isObserving) toggleObserveMode();
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

  const [menuOpen, setMenuOpen] = useState(false);

  // Listen for menu actions from FloatingAssistant.ts context menu
  React.useEffect(() => {
    const handleMenuAction = (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      switch (action) {
        case 'briefing':
          setView('briefing');
          break;
        case 'timeline':
          setView('timeline');
          break;
        case 'actions':
          setShowActionModal(true);
          break;
        case 'settings':
          setView('settings');
          break;
        case 'home':
          setView('welcome');
          break;
      }
    };

    window.addEventListener('ellipsa-menu-action', handleMenuAction as EventListener);
    return () => {
      window.removeEventListener('ellipsa-menu-action', handleMenuAction as EventListener);
    };
  }, []);

  // Handle window resizing based on view
  React.useEffect(() => {
    // @ts-ignore
    if (window.ellipsa?.resizeWindow) {
      if (view === 'none') {
        if (menuOpen) {
          // Menu needs space
          // @ts-ignore
          window.ellipsa.resizeWindow(250, 400);
        } else {
          // Collapsed state (button only)
          // Button is 64x64 with 32px offset from edges (bottom-8 right-8)
          // @ts-ignore
          window.ellipsa.resizeWindow(128, 128);
        }
      } else if (view === 'welcome') {
        // Welcome screen needs space
        // @ts-ignore
        window.ellipsa.resizeWindow(1000, 800);
      } else {
        // Expanded state for other overlays (timeline, briefing, settings)
        // @ts-ignore
        window.ellipsa.resizeWindow(400, 600);
      }
    }
  }, [view, menuOpen]);

  return (
    <ServiceProvider>
      <TooltipProvider>
        <div className="fixed inset-0 bg-transparent text-black font-sans overflow-hidden">
          {/* Main Content Area */}
          <div className="min-h-screen pointer-events-none">
            {/* Pointer events none ensures clicks go through transparent areas,
                but we need to re-enable them for actual content */}

            <div className="pointer-events-auto">
              {view === 'timeline' && <TimelineView onPersonClick={setSelectedPerson} />}
              {view === 'briefing' && <BriefingView onClose={() => setView('none')} />}
              {view === 'settings' && <SettingsPanel onClose={() => setView('none')} />}
            </div>
          </div>

          {/* Chat is now rendered in a separate window via main process */}

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
            collapsed={view === 'none' && !menuOpen}
            onMenuOpenChange={setMenuOpen}
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
            <div className="pointer-events-auto">
              <PostMeetingToast
                itemCount={3}
                onReview={() => {
                  setShowToast(false);
                  setView('timeline');
                }}
                onAccept={() => setShowToast(false)}
                onDiscard={() => setShowToast(false)}
              />
            </div>
          )}

          {selectedPerson && (
            <div className="pointer-events-auto">
              <PersonCardModal
                personId={selectedPerson}
                onClose={() => setSelectedPerson(null)}
              />
            </div>
          )}

          {showActionModal && (
            <div className="pointer-events-auto">
              <ActionApprovalModal
                onClose={() => setShowActionModal(false)}
                onApprove={() => {
                  setShowActionModal(false);
                  setActionPending(false);
                }}
              />
            </div>
          )}

          {/* Welcome Screen */}
          {view === 'welcome' && (
            <div className="pointer-events-auto">
              <WelcomeScreen onSelectDemo={handleDemoSelect} />
            </div>
          )}
        </div>
      </TooltipProvider>
    </ServiceProvider>
  );
}