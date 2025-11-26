import { realtimeService, RealtimeService, MessageType } from '../../services/RealtimeService';
import { v4 as uuidv4 } from 'uuid';
import type { ElectronAPI } from '../../types/electron';
import logo from '../../assets/logo.png';

interface AssistantMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  contextId?: string;
  source?: string;
  metadata?: Record<string, any>;
}

// Window interface is extended in src/types/electron.d.ts

class FloatingAssistantUI {
  private container!: HTMLElement;
  private button!: HTMLElement;
  private notificationPanel!: HTMLElement;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private windowStartX = 0;
  private windowStartY = 0;
  private isPanelOpen = false;
  private messages: AssistantMessage[] = [];
  private activeContextId: string | null = null;
  private isTyping = false;
  private typingTimeout: NodeJS.Timeout | null = null;
  private clickCount = 0;
  private clickTimeout: NodeJS.Timeout | null = null;

  constructor() {
    console.log('[FloatingAssistantUI] Initializing...');
    try {
      this.initializeElements();
      this.setupEventListeners();
      this.setupRealtimeListeners();
      console.log('[FloatingAssistantUI] Initialized successfully');
    } catch (error) {
      console.error('[FloatingAssistantUI] Initialization error:', error);
    }
  }

  private initializeElements(): void {
    // Create main container
    this.container = document.createElement('div');
    this.container.id = 'floating-assistant';
    this.container.id = 'floating-assistant';
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.zIndex = '9999';
    this.container.style.userSelect = 'none';
    this.container.style.pointerEvents = 'none'; // Allow clicking through to underlying elements (if any)

    // Create floating button
    this.button = document.createElement('div');
    this.button.id = 'assistant-button';
    this.button.innerHTML = `
      <div class="assistant-icon">
        <img src="${logo}" alt="Ellipsa" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
      </div>
      <div class="notification-badge"></div>
    `;
    this.button.style.cssText = `
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background-color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: move;
      position: absolute;
      bottom: 0;
      right: 0;
      pointer-events: auto; // Re-enable pointer events for the button
      transition: all 0.2s ease;
    `;

    // Notification badge
    const style = document.createElement('style');
    style.textContent = `
      .assistant-icon {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
        border-radius: 50%;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      
      /* Observe mode indicator */
      #assistant-button.observing {
        box-shadow: 0 0 15px 5px rgba(74, 144, 226, 0.5);
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(74, 144, 226, 0); }
        100% { box-shadow: 0 0 0 0 rgba(74, 144, 226, 0); }
      }
      .notification-badge {
        position: absolute;
        top: 0;
        right: 0;
        width: 16px;
        height: 16px;
        background-color: #ff3b30;
        border: 2px solid #fff;
        border-radius: 50%;
        display: none;
      }
      .notification-panel {
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 320px;
        height: 400px;
        pointer-events: auto; // Re-enable pointer events for the panel
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        display: none;
        flex-direction: column;
      }
      .panel-header {
        padding: 12px 16px;
        background: #4a90e2;
        color: white;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .panel-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
      }
      .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }
      .message {
        margin-bottom: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        background: #f5f5f5;
        font-size: 14px;
      }
      .message.user {
        background: #e3f2fd;
        margin-left: 20px;
      }
      .message.assistant {
        background: #f5f5f5;
        margin-right: 20px;
      }
      .message-timestamp {
        font-size: 10px;
        color: #666;
        margin-top: 4px;
        text-align: right;
      }
    `;
    document.head.appendChild(style);

    // Create notification panel
    this.notificationPanel = document.createElement('div');
    this.notificationPanel.className = 'notification-panel';
    this.notificationPanel.innerHTML = `
      <div class="panel-header">
        <span>Ellipsa Assistant</span>
        <button class="panel-close">&times;</button>
      </div>
      <div class="messages-container">
        <div class="message assistant">
          Hello! I'm Ellipsa, your AI assistant. How can I help you today?
          <div class="message-timestamp">Just now</div>
        </div>
      </div>
    `;

    // Assemble the UI
    this.container.appendChild(this.button);
    this.container.appendChild(this.notificationPanel);
    document.body.appendChild(this.container);
  }

  private setupEventListeners(): void {
    // Button click with triple-click detection
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();

      // Triple-click detection
      this.clickCount++;

      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
      }

      if (this.clickCount === 3) {
        // Triple-click: toggle observe mode
        this.toggleObserveMode();
        this.clickCount = 0;
      } else {
        // Set timeout to reset click count
        this.clickTimeout = setTimeout(() => {
          if (this.clickCount === 1) {
            // Single click: toggle panel
            this.togglePanel();
          }
          this.clickCount = 0;
        }, 500);
      }
    });

    // Right-click for context menu
    this.button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.ellipsa?.showContextMenu) {
        window.ellipsa.showContextMenu();
      }
    });

    // Panel close button
    this.notificationPanel.querySelector('.panel-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
    });

    // Drag functionality
    this.button.addEventListener('mousedown', this.startDrag.bind(this));
    // mousemove and mouseup are now attached dynamically in startDrag

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isPanelOpen && !this.container.contains(e.target as Node)) {
        this.closePanel();
      }
    });
  }

  private setupRealtimeListeners(): void {
    // Handle assistant messages
    realtimeService.on('assistant_message', (message: any) => {
      console.log('[FloatingAssistantUI] Received assistant message:', JSON.stringify(message, null, 2));
      this.addMessage({
        id: uuidv4(),
        type: 'assistant_message',
        content: message.content || message,
        timestamp: Date.now(),
        contextId: message.contextId || this.activeContextId,
        metadata: message.metadata
      });
      this.isTyping = false;
      this.updateTypingIndicator();

      // Auto-open panel on message
      if (!this.isPanelOpen) {
        this.openPanel();
      }
    });

    // Handle observe mode status changes
    if (window.ellipsa?.onObserveStatus) {
      window.ellipsa.onObserveStatus((isObserving: boolean) => {
        this.showNotification(isObserving ? 'Observe mode activated' : 'Observe mode deactivated');
        // Update UI to reflect observe mode status
        const button = document.getElementById('assistant-button');
        if (button) {
          if (isObserving) {
            button.classList.add('observing');
            // Do NOT auto-open panel when observing starts, only on message
          } else {
            button.classList.remove('observing');
          }
        }
      });
    }

    // Handle suggestions
    realtimeService.on('suggestion', (suggestion: any) => {
      this.addMessage({
        id: uuidv4(),
        type: 'suggestion',
        content: typeof suggestion === 'string' ? suggestion : (suggestion.content || ''),
        timestamp: Date.now(),
        contextId: suggestion.contextId || this.activeContextId,
        source: suggestion.source,
        metadata: suggestion.metadata
      });
    });

    // Handle errors
    realtimeService.on('error', (error: any) => {
      this.addMessage({
        id: uuidv4(),
        type: 'error',
        content: error.message || 'An error occurred',
        timestamp: Date.now(),
        metadata: error
      });
      this.isTyping = false;
      this.updateTypingIndicator();
    });

    realtimeService.on('connected', () => {
      this.showNotification('Connected to assistant service');
    });

    realtimeService.on('disconnected', () => {
      this.showNotification('Disconnected from assistant service', 'error');
    });
  }

  private async startDrag(e: MouseEvent): Promise<void> {
    if (e.button !== 0) return; // Only left mouse button

    // Cancel click detection when dragging starts
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }
    this.clickCount = 0;

    // Store the starting mouse position in screen coordinates
    this.dragStartX = e.screenX;
    this.dragStartY = e.screenY;

    // Get the current window position
    if (window.ellipsa?.getWindowPos) {
      const pos = await window.ellipsa.getWindowPos();
      this.windowStartX = pos.x;
      this.windowStartY = pos.y;
    }

    this.isDragging = true;
    this.button.style.transform = 'scale(0.95)';
    document.body.style.cursor = 'grabbing';
    this.container.style.pointerEvents = 'none';

    // Attach drag listeners
    document.addEventListener('mousemove', this.onDragBound);
    document.addEventListener('mouseup', this.stopDragBound);
  }

  private onDragBound = this.onDrag.bind(this);
  private stopDragBound = this.stopDrag.bind(this);

  private onDrag(e: MouseEvent): void {
    if (!this.isDragging) return;

    // Calculate delta from drag start using screen coordinates
    const deltaX = e.screenX - this.dragStartX;
    const deltaY = e.screenY - this.dragStartY;

    // Calculate new window position
    const newX = this.windowStartX + deltaX;
    const newY = this.windowStartY + deltaY;

    // Move the actual window through the main process
    if (window.ellipsa?.window?.move) {
      window.ellipsa.window.move(newX, newY);
    }
  }

  private stopDrag(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.button.style.transform = '';
    document.body.style.cursor = '';
    this.container.style.pointerEvents = 'auto'; // Re-enable pointer events

    // Remove drag listeners
    document.removeEventListener('mousemove', this.onDragBound);
    document.removeEventListener('mouseup', this.stopDragBound);
  }

  // Position management removed as we now rely on window position

  private togglePanel(): void {
    if (this.isPanelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private async openPanel(): Promise<void> {
    this.isPanelOpen = true;
    this.notificationPanel.style.display = 'flex';
    this.button.style.transform = 'scale(1.1)';

    // Resize window to fit panel
    if (window.ellipsa?.window?.setSize) {
      // Get current position to adjust it so the button stays in place
      const currentPos = await window.ellipsa.getWindowPos();

      // Get screen size for clamping
      const screen = await window.ellipsa.getScreenSize();

      // Resize to 350x500 (panel + button + margins)
      window.ellipsa.window.setSize(350, 500);

      // Adjust position: move window up and left to keep bottom-right corner (button) stationary
      // Old size: 64x64, New size: 350x500
      // Delta: x -286, y -436
      let newX = currentPos.x - (350 - 64);
      let newY = currentPos.y - (500 - 64);

      // Clamp to screen bounds to prevent moving off-screen
      // Ensure we don't go off the top or left
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);

      // Also ensure we don't go off the bottom or right (though the resize logic naturally pushes up/left)
      if (screen) {
        newX = Math.min(newX, screen.width - 350);
        newY = Math.min(newY, screen.height - 500);
      }

      window.ellipsa.window.move(newX, newY);
    }

    setTimeout(() => {
      this.button.style.transform = '';
    }, 200);
  }

  private async closePanel(): Promise<void> {
    this.isPanelOpen = false;
    this.notificationPanel.style.display = 'none';

    // Resize window back to button size
    if (window.ellipsa?.window?.setSize) {
      // Get current position
      const currentPos = await window.ellipsa.getWindowPos();

      // Resize back to 64x64
      window.ellipsa.window.setSize(64, 64);

      // Adjust position: move window down and right to keep bottom-right corner stationary
      // Old size: 350x500, New size: 64x64
      // Delta: x +286, y +436
      const newX = currentPos.x + (350 - 64);
      const newY = currentPos.y + (500 - 64);
      window.ellipsa.window.move(newX, newY);
    }
  }

  private updateNotificationBadge(): void {
    const badge = this.button.querySelector('.notification-badge') as HTMLElement | null;
    if (!badge) return;

    // Show badge if there are unread messages and panel is closed
    const hasUnread = this.messages.some(msg => !msg.metadata?.read);

    if (hasUnread && !this.isPanelOpen) {
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  private addMessage(message: AssistantMessage): void {
    // Mark message as read if panel is open
    const messageWithMeta = {
      ...message,
      metadata: {
        ...message.metadata,
        read: this.isPanelOpen,
        timestamp: message.timestamp || Date.now()
      }
    };

    this.messages.push(messageWithMeta);

    // Update active context if provided
    if (message.contextId) {
      this.activeContextId = message.contextId;
    }

    this.updateNotificationBadge();
    this.renderMessages();
    this.scrollToBottom();
  }

  private updateTypingIndicator(): void {
    const typingIndicator = this.notificationPanel.querySelector('.typing-indicator');
    if (!typingIndicator) return;

    if (this.isTyping) {
      typingIndicator.classList.add('visible');
    } else {
      typingIndicator.classList.remove('visible');
    }
  }

  private renderMessages(): void {
    const messagesContainer = this.notificationPanel.querySelector('.messages-container');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '';

    this.messages.forEach(message => {
      const messageEl = document.createElement('div');
      messageEl.className = `message ${message.type}`;
      messageEl.dataset.messageId = message.id;

      // Format timestamp
      const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Create message content based on type
      let content = '';

      switch (message.type) {
        case 'assistant_message':
          content = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <div class="message-text">${this.formatMessageContent(message.content)}</div>
              <div class="message-time">${time}</div>
            </div>
          `;
          break;

        case 'user_message':
          content = `
            <div class="message-content user">
              <div class="message-text">${this.formatMessageContent(message.content)}</div>
              <div class="message-time">${time}</div>
            </div>
            <div class="message-avatar">👤</div>
          `;
          break;

        case 'suggestion':
          content = `
            <div class="suggestion">
              <div class="suggestion-content">
                <div class="suggestion-text">${this.formatMessageContent(message.content)}</div>
                ${message.source ? `<div class="suggestion-source">From: ${message.source}</div>` : ''}
              </div>
              <div class="suggestion-actions">
                <button class="suggestion-action">👍</button>
                <button class="suggestion-action">👎</button>
              </div>
            </div>
          `;
          break;

        case 'error':
          content = `
            <div class="error-message">
              <div class="error-icon">⚠️</div>
              <div class="error-content">
                <div class="error-text">${this.formatMessageContent(message.content)}</div>
                ${message.metadata?.error ? `<div class="error-details">${message.metadata.error}</div>` : ''}
              </div>
            </div>
          `;
          break;

        case 'status':
          content = `
            <div class="status-message" style="text-align: center; color: #666; font-size: 12px; margin: 8px 0; font-style: italic;">
              ${this.formatMessageContent(message.content)}
            </div>
          `;
          break;
      }

      messageEl.innerHTML = content;
      messagesContainer.appendChild(messageEl);
    });

    // Add typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    messagesContainer.appendChild(typingIndicator);

    this.updateTypingIndicator();
    this.scrollToBottom();
  }

  private formatMessageContent(content: any): string {
    if (typeof content !== 'string') {
      try {
        return JSON.stringify(content, null, 2);
      } catch (e) {
        return String(content);
      }
    }
    // Simple URL detection and conversion to links
    return content.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  private scrollToBottom(): void {
    const messagesContainer = this.notificationPanel.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  private handleUserInput(text: string): void {
    if (!text.trim()) return;

    // Add user message
    const userMessage: AssistantMessage = {
      id: uuidv4(),
      type: 'user_message',
      content: text,
      timestamp: Date.now(),
      contextId: this.activeContextId || undefined
    };

    this.addMessage(userMessage);

    // Show typing indicator
    this.isTyping = true;
    this.updateTypingIndicator();

    // Send message to realtime service
    realtimeService.sendMessage('user_message', {
      text,
      contextId: this.activeContextId
    });

    // Auto-hide typing indicator after timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.typingTimeout = setTimeout(() => {
      this.isTyping = false;
      this.updateTypingIndicator();
    }, 10000); // 10 second timeout
  }

  public showNotification(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
    // Show badge
    const badge = this.button.querySelector('.notification-badge') as HTMLElement;
    if (badge) {
      badge.style.display = 'block';

      // Auto-hide badge after 5 seconds
      setTimeout(() => {
        badge.style.display = 'none';
      }, 5000);
    }

    // Add notification as a system message
    const notificationMessage: AssistantMessage = {
      id: uuidv4(),
      type: 'status',
      content: message,
      timestamp: Date.now(),
      metadata: { type }
    };

    this.addMessage(notificationMessage);
  }

  private async toggleObserveMode(): Promise<void> {
    try {
      if (window.ellipsa?.getObserveStatus && window.ellipsa?.setObserveStatus) {
        const status = await window.ellipsa.getObserveStatus();
        await window.ellipsa.setObserveStatus(!status.observing);
      }
    } catch (error) {
      console.error('[FloatingAssistantUI] Error toggling observe mode:', error);
    }
  }

  public destroy(): void {
    document.removeEventListener('mousemove', this.onDragBound);
    document.removeEventListener('mouseup', this.stopDragBound);
    this.container.remove();
  }
}

// Export the FloatingAssistantUI class
export { FloatingAssistantUI };

// Only expose to window if we're in a browser environment
if (typeof window !== 'undefined') {
  window.FloatingAssistantUI = FloatingAssistantUI as any;

  // Auto-initialize if not in a module context
  if (!window.ellipsaAssistant) {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        window.ellipsaAssistant = new FloatingAssistantUI() as any;
        console.log('[FloatingAssistantUI] Auto-initialized successfully');
      } catch (error) {
        console.error('[FloatingAssistantUI] Failed to auto-initialize:', error);
      }
    });
  }
}
