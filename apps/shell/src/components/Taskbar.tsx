/**
 * Taskbar — Infinity OS Dock-Style Taskbar
 * ============================================================
 * Premium Figma-grade design with:
 * - macOS-style dock with hover magnification effect
 * - Glassmorphism surface with subtle glow
 * - Animated tooltips on hover
 * - Running indicator dots with pulse animation
 * - System tray: battery, network, clock
 * - Smooth spring transitions on all interactions
 * - WCAG 2.2 AA: Full keyboard navigation, ARIA labels
 * ============================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Window as OSWindow, User } from '@infinity-os/types';
import { useBatteryStatus } from '../hooks/useBatteryStatus';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useDeviceDetection } from '../hooks/useDeviceDetection';

interface TaskbarProps {
  windows: OSWindow[];
  user: User;
  uptime: number;
  onOpenModule: (moduleId: string, title: string) => void;
  onFocusWindow: (windowId: string) => void;
  onToggleSearch: () => void;
  onToggleNotifications: () => void;
}

const PINNED_APPS = [
  { moduleId: 'com.infinity-os.observatory',   title: 'Observatory',   icon: '🔭', group: 'core' },
  { moduleId: 'com.infinity-os.hive',          title: 'HIVE',          icon: '🐝', group: 'core' },
  { moduleId: 'com.infinity-os.infinity-one',  title: 'Infinity-One',  icon: '∞',  group: 'core' },
  { moduleId: 'com.infinity-os.lighthouse',    title: 'Lighthouse',    icon: '🔦', group: 'core' },
  { moduleId: 'com.infinity-os.void',          title: 'The Void',      icon: '🌌', group: 'core' },
  { moduleId: 'separator-1',                   title: '',              icon: '',   group: 'sep' },
  { moduleId: 'com.infinity-os.townhall',      title: 'TownHall',      icon: '🏛️', group: 'ops' },
  { moduleId: 'com.infinity-os.kanban',        title: 'Task Board',    icon: '📋', group: 'ops' },
  { moduleId: 'com.infinity-os.itsm',          title: 'ITSM',          icon: '🎫', group: 'ops' },
  { moduleId: 'com.infinity-os.terminal',      title: 'Terminal',      icon: '⌨️', group: 'ops' },
  { moduleId: 'com.infinity-os.ai-studio',     title: 'AI Studio',     icon: '🤖', group: 'ops' },
  { moduleId: 'com.infinity-os.settings',      title: 'Settings',      icon: '⚙️', group: 'ops' },
];

/* ─── Dock magnification hook ─── */
function useDockMagnification(itemCount: number) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getScale = useCallback((index: number): number => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return 1.35;
    if (distance === 1) return 1.15;
    if (distance === 2) return 1.05;
    return 1;
  }, [hoveredIndex]);

  const getTranslateY = useCallback((index: number): number => {
    if (hoveredIndex === null) return 0;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return -10;
    if (distance === 1) return -5;
    if (distance === 2) return -2;
    return 0;
  }, [hoveredIndex]);

  return { hoveredIndex, setHoveredIndex, getScale, getTranslateY };
}

/* ─── System Status ─── */
function SystemStatus() {
  const battery = useBatteryStatus();
  const network = useNetworkStatus();
  const device = useDeviceDetection();

  return (
    <div className="taskbar__system" aria-label="System status">
      {/* Network */}
      <div
        className={`taskbar__system-item ${!network.online ? 'taskbar__system-item--danger' : ''}`}
        title={`Network: ${network.label} (${network.quality})`}
      >
        <span className="taskbar__system-icon">
          {network.online ? '📶' : '🔴'}
        </span>
        {!device.isMobile && (
          <span className="taskbar__system-label">
            {network.online ? network.effectiveType.toUpperCase() : 'Offline'}
          </span>
        )}
      </div>

      {/* Battery */}
      {battery.supported && battery.levelPct !== null && (
        <div
          className={`taskbar__system-item ${
            battery.levelPct < 20 ? 'taskbar__system-item--danger' :
            battery.levelPct < 40 ? 'taskbar__system-item--warning' : ''
          }`}
          title={`Battery: ${battery.levelPct}% ${battery.charging ? '(charging)' : ''}`}
        >
          <span className="taskbar__system-icon">{battery.icon}</span>
          {!device.isMobile && (
            <span className="taskbar__system-label">{battery.levelPct}%</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Clock ─── */
function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div
      className="taskbar__clock"
      aria-label={`Current time: ${timeStr}, ${dateStr}`}
      role="timer"
      aria-live="off"
    >
      <span className="taskbar__clock-time">{timeStr}</span>
      <span className="taskbar__clock-date">{dateStr}</span>
    </div>
  );
}

/* ─── Main Taskbar ─── */
export function Taskbar({
  windows,
  user,
  onOpenModule,
  onFocusWindow,
  onToggleSearch,
  onToggleNotifications,
}: TaskbarProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const appItems = PINNED_APPS.filter(a => a.group !== 'sep');
  const { hoveredIndex, setHoveredIndex, getScale, getTranslateY } = useDockMagnification(appItems.length);

  let appIndex = 0;

  return (
    <nav
      className="taskbar"
      role="navigation"
      aria-label="Infinity OS Taskbar"
    >
      {/* Start / Search Button */}
      <button
        className="taskbar__start"
        onClick={onToggleSearch}
        aria-label="Open universal search (Ctrl+Space)"
        title="Search (Ctrl+Space)"
      >
        <span className="taskbar__start-icon">∞</span>
      </button>

      <div className="taskbar__divider" aria-hidden="true" />

      {/* Dock — Pinned Apps with magnification */}
      <div
        ref={dockRef}
        className="taskbar__dock"
        role="list"
        aria-label="Pinned applications"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {PINNED_APPS.map((app, rawIndex) => {
          if (app.group === 'sep') {
            return (
              <div key={app.moduleId} className="taskbar__divider" aria-hidden="true" />
            );
          }

          const currentAppIndex = appIndex++;
          const isRunning = windows.some(w => w.moduleId === app.moduleId);
          const isFocused = windows.some(w => w.moduleId === app.moduleId && w.isFocused);
          const scale = getScale(currentAppIndex);
          const translateY = getTranslateY(currentAppIndex);

          return (
            <button
              key={app.moduleId}
              role="listitem"
              className={`taskbar__item ${isRunning ? 'taskbar__item--running' : ''} ${isFocused ? 'taskbar__item--focused' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenModule(app.moduleId, app.title);
              }}
              onMouseEnter={() => setHoveredIndex(currentAppIndex)}
              aria-label={`${app.title}${isRunning ? ' (running)' : ''}`}
              style={{
                transform: `translateY(${translateY}px) scale(${scale})`,
                zIndex: hoveredIndex === currentAppIndex ? 10 : 1,
              }}
            >
              <span className="taskbar__item-icon">{app.icon}</span>

              {/* Tooltip */}
              <span className="taskbar__tooltip" aria-hidden="true">
                {app.title}
              </span>

              {/* Running indicator */}
              {isRunning && (
                <span className="taskbar__item-dot" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <div className="taskbar__divider" aria-hidden="true" />

      {/* Running Windows (minimised) */}
      <div
        className="taskbar__running"
        role="list"
        aria-label="Open windows"
      >
        {windows.filter(w => w.isMinimised).map(window => (
          <button
            key={window.id}
            role="listitem"
            className={`taskbar__window-btn ${window.isFocused ? 'taskbar__window-btn--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onFocusWindow(window.id);
            }}
            aria-label={`${window.title} window`}
          >
            {window.title}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="taskbar__spacer" />

      {/* System Tray */}
      <div className="taskbar__tray" role="group" aria-label="System tray">
        {/* Notifications */}
        <button
          className="taskbar__tray-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleNotifications();
          }}
          aria-label="Notifications (Ctrl+N)"
          title="Notifications"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zM8.05 14.943a33.54 33.54 0 003.9 0 2 2 0 01-3.9 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* User Avatar */}
        <button
          className="taskbar__avatar"
          aria-label={`User menu — ${user?.displayName ?? 'User'}`}
          title={user?.displayName ?? 'User'}
          onClick={(e) => e.stopPropagation()}
        >
          {user?.displayName?.[0]?.toUpperCase() ?? '?'}
        </button>

        <SystemStatus />
        <Clock />
      </div>
    </nav>
  );
}