import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo, useMotionValue } from 'motion/react';
import { Clock, Calendar, Settings, Zap, Home } from 'lucide-react';

interface FloatingButtonProps {
  isObserving: boolean;
  actionPending: boolean;
  actionCount?: number;
  onClick: () => void;
  onLongPress: () => void;
  onSwipeUp: () => void;
  onMenuSelect: (item: 'timeline' | 'briefing' | 'settings' | 'actions' | 'home') => void;
  collapsed?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}

const STORAGE_KEY = 'ellipsa-floating-button-position';
const BUTTON_SIZE = 64; // 16 * 4 = 64px (w-16 h-16)
const PADDING = 16;
const MENU_WIDTH = 192; // w-48 = 12rem = 192px
const MENU_HEIGHT = 280; // Approximate height of the menu

// Get initial position from localStorage or default to bottom-right
function getStoredPosition(): { x: number; y: number } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate coordinates are numbers
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && !isNaN(parsed.x) && !isNaN(parsed.y)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read stored position:', e);
  }
  return null;
}

function savePosition(x: number, y: number) {
  try {
    if (isNaN(x) || isNaN(y)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch (e) {
    console.error('Failed to save position:', e);
  }
}

// Clamp position within screen bounds
function clampPosition(x: number, y: number, screenWidth: number, screenHeight: number): { x: number; y: number } {
  // Ensure we have valid screen dimensions
  const safeWidth = screenWidth || window.innerWidth || 1920;
  const safeHeight = screenHeight || window.innerHeight || 1080;

  const maxX = Math.max(0, safeWidth - BUTTON_SIZE - PADDING);
  const maxY = Math.max(0, safeHeight - BUTTON_SIZE - PADDING);

  // Handle NaN inputs
  const safeX = isNaN(x) ? safeWidth - BUTTON_SIZE - PADDING : x;
  const safeY = isNaN(y) ? safeHeight - BUTTON_SIZE - PADDING : y;

  return {
    x: Math.min(Math.max(PADDING, safeX), maxX),
    y: Math.min(Math.max(PADDING, safeY), maxY),
  };
}

export function FloatingButton({
  isObserving,
  actionPending,
  actionCount = 0,
  onClick,
  onLongPress,
  onSwipeUp,
  collapsed = false,
  onMenuSelect,
  onMenuOpenChange,
}: FloatingButtonProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // State for menu and interaction
  const [showMenu, setShowMenu] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [clickOutsideEnabled, setClickOutsideEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [screenSize, setScreenSize] = useState<{ width: number; height: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Refs for drag and click handling
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const startY = useRef(0);
  const mouseButton = useRef(0);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const constraintsRef = useRef<HTMLDivElement>(null);
  // Track hover and mouse state to prevent premature click-through
  const isHovering = useRef(false);
  const isMouseDown = useRef(false);

  // Consolidate mouse event logic
  const updateMouseFilter = React.useCallback(() => {
    try {
      // If not collapsed (menu open or view active), we need interaction
      if (!collapsed) {
        console.log('[FloatingButton] Menu open or expanded, enforcing interaction');
        (window as any).ellipsa?.setIgnoreMouseEvents(false);
        return;
      }

      // If collapsed (button only), we only need interaction if interacting with the button
      const shouldInteract = isHovering.current || isDragging || isMouseDown.current;
      // console.log('[FloatingButton] Updating interaction:', { shouldInteract, collapsed });
      (window as any).ellipsa?.setIgnoreMouseEvents(!shouldInteract);
    } catch (e) {
      console.error('[FloatingButton] Error setting mouse events:', e);
    }
  }, [collapsed, isDragging]);

  // Update mouse filter when collapsed state changes
  useEffect(() => {
    updateMouseFilter();
  }, [updateMouseFilter]);

  // Global mouse up listener to ensure we reset state even if mouse leaves window
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isMouseDown.current = false;
      updateMouseFilter();
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [updateMouseFilter]);

  // Get actual screen size from Electron on mount
  useEffect(() => {
    const initializeScreenSize = async () => {
      try {
        const ellipsa = (window as any).ellipsa;
        let width = window.innerWidth;
        let height = window.innerHeight;

        if (ellipsa?.getScreenSize) {
          const screen = await ellipsa.getScreenSize();
          console.log('Screen size from Electron: ' + JSON.stringify(screen));
          width = screen.width;
          height = screen.height;
        }

        setScreenSize({ width, height });

        // Initialize position
        const stored = getStoredPosition();
        let initialX, initialY;

        if (stored) {
          const clamped = clampPosition(stored.x, stored.y, width, height);
          initialX = clamped.x;
          initialY = clamped.y;
          console.log('Restored position: ' + JSON.stringify({ initialX, initialY, stored }));
        } else {
          // Default to bottom-right
          initialX = width - BUTTON_SIZE - 48; // 48px margin
          initialY = height - BUTTON_SIZE - 48;
          console.log('Default position: ' + JSON.stringify({ initialX, initialY }));
        }

        x.set(initialX);
        y.set(initialY);
        setIsInitialized(true);
      } catch (e) {
        console.error('Failed to get screen size:', e);
        // Fallback initialization
        const width = window.innerWidth;
        const height = window.innerHeight;
        const initialX = width - BUTTON_SIZE - 48;
        const initialY = height - BUTTON_SIZE - 48;
        x.set(initialX);
        y.set(initialY);
        setIsInitialized(true);
      }
    };
    initializeScreenSize();
  }, []);

  // Handle updated screen size
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Notify parent when menu changes
  useEffect(() => {
    onMenuOpenChange?.(showMenu);
  }, [showMenu, onMenuOpenChange]);

  // Handle menu state changes
  useEffect(() => {
    if (showMenu) {
      setMenuReady(true);
      const timer = setTimeout(() => setClickOutsideEnabled(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMenuReady(false);
      setClickOutsideEnabled(false);
    }
  }, [showMenu]);

  // Initial mouse state
  useEffect(() => {
    // Initial sync
    const timer = setTimeout(() => {
      updateMouseFilter();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isMouseDown.current = true;
    updateMouseFilter();

    mouseButton.current = e.button;
    startY.current = e.clientY;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    // Only set up long press for left-click
    if (e.button === 0) {
      longPressTimer.current = setTimeout(() => {
        onLongPress();
      }, 500);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }

    // Only handle left-click (button 0)
    if (mouseButton.current !== 0) {
      return;
    }

    // Don't trigger click if we were dragging
    if (isDragging) {
      return;
    }

    const deltaY = startY.current - e.clientY;
    const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
    const deltaYAbs = Math.abs(e.clientY - dragStartPos.current.y);

    // Only count as a click if we haven't moved much
    if (deltaX < 10 && deltaYAbs < 10) {
      if (deltaY > 50) {
        onSwipeUp();
      } else {
        onClick();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const deltaY = startY.current - e.clientY;
    if (Math.abs(deltaY) > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
    setShowMenu(false); // Close menu on drag
    // updateMouseFilter will be called by useEffect on isDragging change
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleMouseEnter = () => {
    isHovering.current = true;
    updateMouseFilter();
  };

  const handleMouseLeave = () => {
    isHovering.current = false;
    updateMouseFilter();
  };

  const calculateMenuPosition = () => {
    const btnX = x.get();
    const btnY = y.get();
    const screenW = screenSize?.width || window.innerWidth;
    const screenH = screenSize?.height || window.innerHeight;

    let targetX = btnX;
    let targetY = btnY;

    // Horizontal Boundary Check
    // If the menu would go off the right edge, align it to the left of the safety margin or shift it
    if (btnX + MENU_WIDTH > screenW - PADDING) {
      // Shift left to fit
      // Align right edge of menu with right edge of button (approx) or just shift
      targetX = Math.max(PADDING, screenW - MENU_WIDTH - PADDING);
    }

    // Vertical Boundary Check
    // If there's enough space above, put it above (default preference)
    // Default "above" position means top of menu is at btnY - MENU_HEIGHT
    // If btnY - MENU_HEIGHT < PADDING, we don't have space above.
    const spaceAbove = btnY - PADDING;
    const spaceBelow = screenH - (btnY + BUTTON_SIZE) - PADDING;

    if (spaceAbove >= MENU_HEIGHT) {
      // Position above
      // We want the bottom of the menu to be slightly above the button
      targetY = btnY - MENU_HEIGHT; // + marginTop adjustment if we still used it, but we won't
    } else if (spaceBelow >= MENU_HEIGHT) {
      // Position below
      targetY = btnY + BUTTON_SIZE + 10;
    } else {
      // Not enough space either way? Center it or pick the larger side
      if (spaceAbove > spaceBelow) {
        targetY = PADDING; // Stick to top
      } else {
        targetY = screenH - MENU_HEIGHT - PADDING; // Stick to bottom
      }
    }

    return { x: targetX, y: targetY };
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (showMenu) {
      setShowMenu(false);
    } else {
      setMenuPos(calculateMenuPosition());
      setShowMenu(true);
    }
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const currentX = x.get();
    const currentY = y.get();

    // Verify values are numbers
    if (isNaN(currentX) || isNaN(currentY)) {
      console.error('[FloatingButton] Drag Ended with NaN coordinates!', { currentX, currentY });
      const safeWidth = screenSize?.width || window.innerWidth;
      const safeHeight = screenSize?.height || window.innerHeight;
      const safeX = safeWidth - 64 - 48; // BUTTON_SIZE is 64
      const safeY = safeHeight - 64 - 48;
      x.set(safeX);
      y.set(safeY);
      savePosition(safeX, safeY);
      setIsDragging(false);
      return;
    }

    const width = screenSize?.width || window.innerWidth;
    const height = screenSize?.height || window.innerHeight;

    const clamped = clampPosition(currentX, currentY, width, height);

    if (clamped.x !== currentX || clamped.y !== currentY) {
      console.log('[FloatingButton] Clamping position:', { from: { x: currentX, y: currentY }, to: clamped });
    }

    x.set(clamped.x);
    y.set(clamped.y);
    savePosition(clamped.x, clamped.y);

    setTimeout(() => {
      setIsDragging(false);
      // isDragging change will trigger useEffect -> updateMouseFilter
    }, 100);
  };

  if (!isInitialized) return null;


  return (
    <>
      <div
        ref={constraintsRef}
        className="fixed inset-0 pointer-events-none z-40"
        style={{ width: '100vw', height: '100vh' }}
      />

      <motion.button
        className={`fixed z-[9999] w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-colors cursor-grab active:cursor-grabbing ${isObserving
          ? 'bg-black text-white'
          : actionPending
            ? 'bg-gray-800 text-white'
            : 'bg-gray-200 text-black'
          }`}
        style={{
          top: 0,
          left: 0,
          x,
          y,
        }}
        drag
        dragConstraints={constraintsRef}
        dragMomentum={false}
        dragElastic={0.1} // Slight elasticity to feel responsive but prevent flying
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onContextMenu={handleContextMenu}
        initial={{ scale: 1 }} /* DEBUG: Start visible */
        animate={isObserving ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={isObserving ? { repeat: Infinity, duration: 2 } : { type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        whileDrag={{ scale: 1.1 }}
      >
        {/* Ellipsis Icon */}
        <div className="flex items-center gap-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>

        {/* Action Badge */}
        {actionPending && actionCount > 0 && (
          <motion.div
            className="absolute -top-1 -right-1 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
          >
            {actionCount}
          </motion.div>
        )}

        {/* Recording Indicator */}
        {isObserving && (
          <motion.div
            className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
      </motion.button>

      {/* Context Menu - positioned relative to button */}
      {/* Only render after delay to allow window resize to complete */}
      <AnimatePresence>
        {menuReady && (
          <motion.div
            className="fixed z-50 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
            style={{
              left: menuPos.x,
              top: menuPos.y,
            }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="py-2 w-48">
              <button
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  onMenuSelect('briefing');
                  setShowMenu(false);
                }}
              >
                <Clock className="w-4 h-4" />
                <span className="text-sm">Briefing</span>
              </button>
              <button
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  onMenuSelect('timeline');
                  setShowMenu(false);
                }}
              >
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Timeline</span>
              </button>
              <button
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  onMenuSelect('actions');
                  setShowMenu(false);
                }}
              >
                <Zap className="w-4 h-4" />
                <span className="text-sm">Pending Actions</span>
              </button>

              <div className="h-px bg-gray-200 my-2" />
              <button
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  onMenuSelect('settings');
                  setShowMenu(false);
                }}
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Settings</span>
              </button>
              <button
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  onMenuSelect('home');
                  setShowMenu(false);
                }}
              >
                <Home className="w-4 h-4" />
                <span className="text-sm">Home</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close menu - only enabled after delay to prevent immediate close */}
      {showMenu && clickOutsideEnabled && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(false)}
        />
      )}
    </>
  );
}