/**
 * Desktop — The main Infinity OS desktop environment
 * ============================================================
 * Premium Figma-grade design with:
 * - Animated mesh gradient background with subtle particle effect
 * - Advanced window management with drag, resize, snap
 * - Keyboard shortcuts (Ctrl+Space for search, Ctrl+W close)
 * - Smooth transitions on all state changes
 * - WCAG 2.2 AA compliant, full keyboard navigation
 * ============================================================
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useKernel } from '../providers/KernelProvider';
import { Taskbar } from '../components/Taskbar';
import { WindowManager } from '../components/WindowManager';
import { NotificationCentre } from '../components/NotificationCentre';
import { UniversalSearch } from '../components/UniversalSearch';
import { DesktopWidgets } from '../components/DesktopWidgets';
import { ServiceShortcuts } from '../components/ServiceShortcuts';
import { ContextMenu } from '../components/ContextMenu';
import type { Window as OSWindow } from '@infinity-os/types';

interface DesktopState {
  windows: OSWindow[];
  activeWindowId: string | null;
  searchOpen: boolean;
  notificationsOpen: boolean;
  contextMenu: { x: number; y: number } | null;
}

export default function Desktop() {
  const { user } = useAuth();
  const { kernel, uptime } = useKernel();
  const desktopRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const [state, setState] = useState<DesktopState>({
    windows: [],
    activeWindowId: null,
    searchOpen: false,
    notificationsOpen: false,
    contextMenu: null,
  });

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Space — toggle universal search
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setState(prev => ({ ...prev, searchOpen: !prev.searchOpen }));
      }
      // Ctrl+W — close active window
      if (e.ctrlKey && e.key === 'w' && state.activeWindowId) {
        e.preventDefault();
        closeWindow(state.activeWindowId);
      }
      // Escape — close overlays
      if (e.key === 'Escape') {
        setState(prev => ({
          ...prev,
          searchOpen: false,
          notificationsOpen: false,
          contextMenu: null,
        }));
      }
      // Ctrl+N — toggle notifications
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setState(prev => ({ ...prev, notificationsOpen: !prev.notificationsOpen }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activeWindowId]);

  const openModule = useCallback((moduleId: string, title: string) => {
    setState(prev => {
      const existingWindow = prev.windows.find(w => w.moduleId === moduleId);
      if (existingWindow) {
        // Focus existing window, un-minimise if needed
        const maxZ = Math.max(...prev.windows.map(w => w.zIndex), 0);
        return {
          ...prev,
          activeWindowId: existingWindow.id,
          windows: prev.windows.map(w =>
            w.id === existingWindow.id
              ? { ...w, isMinimised: false, isFocused: true, zIndex: maxZ + 1 }
              : { ...w, isFocused: false }
          ),
        };
      }

      // Cascade new windows with slight offset
      const offset = (prev.windows.length % 8) * 32;
      const newWindow: OSWindow = {
        id: crypto.randomUUID(),
        moduleId,
        title,
        x: 100 + offset,
        y: 60 + offset,
        width: 900,
        height: 620,
        isMinimised: false,
        isMaximised: false,
        isFocused: true,
        zIndex: prev.windows.length + 1,
      };

      // Spawn kernel process for module
      try { kernel.processes.spawn(moduleId); } catch { /* noop */ }

      return {
        ...prev,
        windows: [...prev.windows.map(w => ({ ...w, isFocused: false })), newWindow],
        activeWindowId: newWindow.id,
      };
    });
  }, [kernel]);

  const closeWindow = useCallback((windowId: string) => {
    setState(prev => {
      const window = prev.windows.find(w => w.id === windowId);
      if (window) {
        try {
          const process = kernel.processes.getProcessByModule(window.moduleId);
          if (process) kernel.processes.terminate(process.pid);
        } catch { /* noop */ }
      }

      const remaining = prev.windows.filter(w => w.id !== windowId);
      // Focus the topmost remaining window
      const topWindow = remaining.length > 0
        ? remaining.reduce((a, b) => a.zIndex > b.zIndex ? a : b)
        : null;

      return {
        ...prev,
        windows: remaining.map(w => ({
          ...w,
          isFocused: topWindow ? w.id === topWindow.id : false,
        })),
        activeWindowId: topWindow?.id ?? null,
      };
    });
  }, [kernel]);

  const focusWindow = useCallback((windowId: string) => {
    setState(prev => {
      const maxZ = Math.max(...prev.windows.map(w => w.zIndex), 0);
      return {
        ...prev,
        activeWindowId: windowId,
        windows: prev.windows.map(w => ({
          ...w,
          isFocused: w.id === windowId,
          zIndex: w.id === windowId ? maxZ + 1 : w.zIndex,
        })),
      };
    });
  }, []);

  const minimiseWindow = useCallback((windowId: string) => {
    setState(prev => {
      const remaining = prev.windows.map(w =>
        w.id === windowId ? { ...w, isMinimised: true, isFocused: false } : w
      );
      const visible = remaining.filter(w => !w.isMinimised);
      const topWindow = visible.length > 0
        ? visible.reduce((a, b) => a.zIndex > b.zIndex ? a : b)
        : null;

      return {
        ...prev,
        windows: remaining.map(w => ({
          ...w,
          isFocused: topWindow ? w.id === topWindow.id : false,
        })),
        activeWindowId: topWindow?.id ?? null,
      };
    });
  }, []);

  const handleDesktopRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setState(prev => ({ ...prev, contextMenu: { x: e.clientX, y: e.clientY } }));
  }, []);

  const handleDesktopClick = useCallback(() => {
    setState(prev => ({
      ...prev,
      contextMenu: null,
      // Unfocus all windows when clicking desktop background
      windows: prev.windows.map(w => ({ ...w, isFocused: false })),
      activeWindowId: null,
    }));
  }, []);

  return (
    <div
      ref={desktopRef}
      className={`desktop ${mounted ? 'desktop--ready' : ''}`}
      onContextMenu={handleDesktopRightClick}
      onClick={handleDesktopClick}
      role="main"
      aria-label="Infinity OS Desktop"
    >
      {/* Animated mesh gradient background */}
      <div className="desktop__bg" aria-hidden="true">
        <div className="desktop__bg-orb desktop__bg-orb--1" />
        <div className="desktop__bg-orb desktop__bg-orb--2" />
        <div className="desktop__bg-orb desktop__bg-orb--3" />
      </div>

      {/* Desktop Widgets Layer */}
      <div className="desktop__widgets">
        <DesktopWidgets user={user!} />
      </div>

      {/* Service Shortcuts Layer */}
      <ServiceShortcuts />

      {/* Window Manager Layer */}
      <div className="desktop__windows">
        <WindowManager
          windows={state.windows}
          onClose={closeWindow}
          onFocus={focusWindow}
          onUpdate={(windowId, updates) => {
            setState(prev => ({
              ...prev,
              windows: prev.windows.map(w =>
                w.id === windowId ? { ...w, ...updates } : w
              ),
            }));
          }}
        />
      </div>

      {/* Universal Search Overlay */}
      {state.searchOpen && (
        <div className="desktop__overlay desktop__overlay--search">
          <UniversalSearch
            onClose={() => setState(prev => ({ ...prev, searchOpen: false }))}
            onOpenModule={openModule}
          />
        </div>
      )}

      {/* Notification Centre Panel */}
      {state.notificationsOpen && (
        <div className="desktop__overlay desktop__overlay--notifications">
          <NotificationCentre
            onClose={() => setState(prev => ({ ...prev, notificationsOpen: false }))}
          />
        </div>
      )}

      {/* Context Menu */}
      {state.contextMenu && (
        <ContextMenu
          x={state.contextMenu.x}
          y={state.contextMenu.y}
          onClose={() => setState(prev => ({ ...prev, contextMenu: null }))}
          onOpenModule={openModule}
        />
      )}

      {/* Taskbar — always on top */}
      <Taskbar
        windows={state.windows}
        user={user!}
        uptime={uptime}
        onOpenModule={openModule}
        onFocusWindow={focusWindow}
        onToggleSearch={() => setState(prev => ({ ...prev, searchOpen: !prev.searchOpen }))}
        onToggleNotifications={() => setState(prev => ({ ...prev, notificationsOpen: !prev.notificationsOpen }))}
      />
    </div>
  );
}