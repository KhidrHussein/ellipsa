import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoreHorizontal, Clock, Calendar, Settings, Zap, Home } from 'lucide-react';

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
  const [showMenu, setShowMenu] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [clickOutsideEnabled, setClickOutsideEnabled] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const startY = useRef(0);
  const mouseButton = useRef(0);

  // Notify parent when menu changes
  useEffect(() => {
    onMenuOpenChange?.(showMenu);
  }, [showMenu, onMenuOpenChange]);

  // Delay showing menu content until window has resized
  // Also delay enabling click-outside to prevent immediate close
  useEffect(() => {
    if (showMenu) {
      const menuTimer = setTimeout(() => setMenuReady(true), 150);
      // Enable click-outside after menu is visible
      const clickTimer = setTimeout(() => setClickOutsideEnabled(true), 200);
      return () => {
        clearTimeout(menuTimer);
        clearTimeout(clickTimer);
      };
    } else {
      setMenuReady(false);
      setClickOutsideEnabled(false);
    }
  }, [showMenu]);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseButton.current = e.button;
    startY.current = e.clientY;
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

    const deltaY = startY.current - e.clientY;
    if (deltaY > 50) {
      onSwipeUp();
    } else if (Math.abs(deltaY) < 10) {
      onClick();
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

  return (
    <>
      {/* Floating Button - positioned at bottom right */}
      <motion.button
        className={`fixed bottom-4 right-4 z-50 w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-colors ${isObserving
          ? 'bg-black text-white'
          : actionPending
            ? 'bg-gray-800 text-white'
            : 'bg-gray-200 text-black'
          }`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        initial={{ scale: 0 }}
        animate={isObserving ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={isObserving ? { repeat: Infinity, duration: 2 } : { type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
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

      {/* Context Menu - completely separate from button, fixed position */}
      {/* Only render after delay to allow window resize to complete */}
      <AnimatePresence>
        {menuReady && (
          <motion.div
            className="fixed bottom-24 right-4 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
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