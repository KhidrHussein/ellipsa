import React, { useState, useEffect } from 'react';
import { ServiceProvider } from './contexts/ServiceContext';
import { TooltipProvider } from './components/ui/tooltip';

import { FloatingButton } from './components/FloatingButton';
import { TimelineView } from './components/TimelineView';
import { BriefingView } from './components/BriefingView';
import { SettingsPanel } from './components/SettingsPanel';
import { ActionApprovalModal } from './components/ActionApprovalModal';
import { PersonCardModal } from './components/PersonCardModal';
import { PostMeetingToast } from './components/PostMeetingToast';
import { ObserveModeOverlay } from './components/ObserveModeOverlay';
import { WelcomeScreen } from './components/WelcomeScreen';
import { CalibrationFlow } from './components/CalibrationFlow';
import { LoginScreen } from './components/LoginScreen';
import { Toaster, toast } from 'sonner';

import { useObserveMode } from './hooks/useObserveMode';
import { usePendingActions } from './hooks/usePendingActions';

export default function App() {
  const [view, setView] = useState<'login' | 'welcome' | 'calibration' | 'none' | 'timeline' | 'briefing' | 'settings'>('none');
  const { isObserving, toggleObserveMode } = useObserveMode();
  const [showToast, setShowToast] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  // Hook up pending actions
  const { actions: pendingActions } = usePendingActions();
  const actionCount = pendingActions.length;
  // actionPending is true if there are actions waiting
  const actionPending = actionCount > 0;

  // Check for existing calibration
  // Check for existing calibration
  // Check for auth and existing calibration
  useEffect(() => {
    // Check for user_id first
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      setView('login');
      return;
    }

    // Sync user ID with Main process
    // @ts-ignore
    window.ellipsa?.setUserId?.(userId);

    // Check local storage first for speed
    const prefs = localStorage.getItem('ellipsa_preferences');
    if (!prefs) {
      setView('calibration');
    } else {
      // Logic remains: default to 'none'.
    }
  }, []);

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
          // Start fresh or go to calibration if needed.
          // For now, mapping Home to Calibration so user can reset personality.
          setView('calibration');
          break;
      }
    };

    window.addEventListener('ellipsa-menu-action', handleMenuAction as EventListener);
    return () => {
      window.removeEventListener('ellipsa-menu-action', handleMenuAction as EventListener);
    };
  }, []);

  // Handle window resizing based on view
  // NOTE: For the floating button to be draggable anywhere, the window must stay fullscreen
  // when in 'none' state. Only resize for specific content views.
  React.useEffect(() => {
    const resizeForView = async () => {
      // Get screen size if possible
      const ellipsa = (window as any).ellipsa;
      if (!ellipsa?.resizeWindow) return;

      // For 'none' view (just floating button), keep window fullscreen for free dragging
      // For 'none', 'welcome', and 'calibration' views, keep window fullscreen for free dragging and overlay
      // Always keep window fullscreen for these views as they are overlays on the glass
      // This ensures the 800x500 cards are centered properly and the floating button can move
      // Settings, Timeline, and Briefing acts as overlays so we need the full canvas
      const fullScreenViews = ['none', 'login', 'welcome', 'calibration', 'timeline', 'briefing', 'settings'];

      if (fullScreenViews.includes(view)) {
        if (ellipsa.getScreenSize) {
          try {
            // Enforce mouse interaction for full-screen views
            if (ellipsa.setIgnoreMouseEvents) {
              ellipsa.setIgnoreMouseEvents(false);
            }

            const screen = await ellipsa.getScreenSize();
            console.log(`[App] Resizing window for view '${view}' to fullscreen: ${screen.width}x${screen.height}`);
            ellipsa.resizeWindow(screen.width, screen.height);
          } catch (e) {
            console.error('Failed to get screen size:', e);
          }
        }
        return;
      }
    };

    resizeForView();
  }, [view]);

  // Monitor for Nudge / Goal Feedback events
  useEffect(() => {
    const handleNewEvent = (data: any) => {
      // Check if it's a goal feedback nudge
      if (data.metadata?.eventType === 'goal_feedback' || data.metadata?.shouldNotify) {
        toast(data.content || 'Goal Alignment Nudge', {
          description: 'Click to view details',
          action: {
            label: 'View',
            onClick: () => setView('timeline')
          },
          duration: 5000,
        });
      }
    };

    // Listen for event_created from backend
    // Note: The service emits whatever type/event name the backend sends. 
    // We configured backend to send type: 'event_created'.
    // RealtimeService emits based on 'type' field.
    import('../services/RealtimeService').then(({ realtimeService }) => {
      realtimeService.on('event_created', handleNewEvent);
    });

    return () => {
      import('../services/RealtimeService').then(({ realtimeService }) => {
        realtimeService.off('event_created', handleNewEvent);
      });
    };
  }, []);

  // Global Reset Shortcut for Development/Testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Shift + Delete to hard reset
      if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
        console.log('Force Reset Triggered');
        localStorage.clear();
        window.location.reload();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ServiceProvider>
      <TooltipProvider>
        <div className="fixed inset-0 bg-transparent text-black font-sans overflow-hidden">
          {/* Sonner Toaster for Nudges */}
          <React.Suspense fallback={null}>
            {/* Dynamic import wrapper if needed, or just standard usage if imports were top-level. 
                 Since I can't easily change top-level imports in this chunk, I'll assume sonner is available. */}
          </React.Suspense>

          {/* Main Content Area */}
          <div className="min-h-screen pointer-events-none">
            {/* Pointer events none ensures clicks go through transparent areas,
                but we need to re-enable them for actual content */}

            <div className="pointer-events-auto">
              {/* Click-away overlay */}
              {(view === 'timeline' || view === 'briefing' || view === 'settings' || view === 'welcome') && (
                <div
                  className="fixed inset-0 z-20 bg-black/5"
                  onClick={() => setView('none')}
                />
              )}

              {/* View Cards */}
              {(view === 'timeline' || view === 'briefing' || view === 'settings' || view === 'welcome') && (
                <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
                  <div className={`pointer-events-auto relative ${view === 'welcome' ? 'flex items-center justify-center w-full h-full p-12' : 'w-[800px] h-[500px]'}`}>
                    {view === 'timeline' && (
                      <TimelineView
                        onPersonClick={setSelectedPerson}
                        onClose={() => setView('none')}
                      />
                    )}
                    {view === 'briefing' && (
                      <BriefingView onClose={() => setView('none')} />
                    )}
                    {view === 'settings' && (
                      <SettingsPanel onClose={() => setView('none')} />
                    )}
                    {view === 'welcome' && (
                      // Welcome Screen (Home) - made fit within constraints or full but clickable behind?
                      // Actually, if we want it retractable, putting it here is right.
                      // We use a larger container for welcome screen as it was originally full screen
                      <div className="w-full h-full bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-y-auto border border-gray-200" style={{ pointerEvents: 'auto' }}>
                        <div className="relative">
                          <button
                            onClick={() => setView('none')}
                            className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 z-50 text-gray-500 hover:text-black transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                          <WelcomeScreen onSelectDemo={handleDemoSelect} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat is now rendered in a separate window via main process */}

          {/* Observe Mode Overlay */}
          <ObserveModeOverlay isActive={isObserving} />


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
                  // actionPending is automatically updated via hook
                }}
              />
            </div>
          )}

          {/* Welcome Screen */}


          {/* Calibration Flow */}
          {view === 'calibration' && (
            <div className="fixed inset-0 z-50 pointer-events-auto">
              <CalibrationFlow onComplete={() => setView('welcome')} />
            </div>
          )}

          {/* Login Screen */}
          {view === 'login' && (
            <div className="fixed inset-0 z-50 pointer-events-auto">
              <LoginScreen onLoginSuccess={() => setView('calibration')} />
            </div>
          )}

          {/* Floating Button - Hidden only during initial auth/calibration */}
          {!['login', 'calibration'].includes(view) && (
            <FloatingButton
              isObserving={isObserving}
              actionPending={actionPending}
              actionCount={actionCount}
              onClick={handleFloatingButtonClick}
              onLongPress={handleLongPress}
              onSwipeUp={handleSwipeUp}
              collapsed={view === 'none' && !menuOpen && !showActionModal && !showToast && !selectedPerson}
              onMenuOpenChange={setMenuOpen}
              onMenuSelect={(item) => {
                if (item === 'settings') {
                  setView('settings');
                } else if (item === 'timeline') {
                  setView('timeline');
                } else if (item === 'briefing') {
                  setView('briefing');
                } else if (item === 'actions') {
                  setShowActionModal(true);
                } else if (item === 'home') {
                  setView('welcome');
                }
                setMenuOpen(false);
              }}
            />
          )}

        </div>
        {/* Sonner Toaster for Nudges */}
        <Toaster position="top-right" expand richColors />
      </TooltipProvider>
    </ServiceProvider>
  );
}