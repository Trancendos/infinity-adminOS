/**
 * LoadingScreen — Infinity OS Boot Screen
 * ============================================================
 * Premium branded loading experience with:
 * - Animated infinity logo with gradient pulse
 * - Multi-stage boot messages (kernel, services, UI)
 * - Smooth progress bar with glow effect
 * - Particle-like background animation
 * - Graceful fade-out when loading completes
 * - WCAG 2.2 AA: aria-live, role="status"
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';

interface LoadingScreenProps {
  message?: string;
  onComplete?: () => void;
}

const BOOT_STAGES = [
  { message: 'Initialising kernel…', duration: 600 },
  { message: 'Loading security modules…', duration: 500 },
  { message: 'Connecting to backend services…', duration: 700 },
  { message: 'Restoring session state…', duration: 400 },
  { message: 'Preparing workspace…', duration: 500 },
  { message: 'Ready.', duration: 300 },
];

export function LoadingScreen({ message, onComplete }: LoadingScreenProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // If a custom message is provided, show it statically
  const isCustom = !!message;

  useEffect(() => {
    if (isCustom) return;

    let elapsed = 0;
    const totalDuration = BOOT_STAGES.reduce((sum, s) => sum + s.duration, 0);

    const advanceStage = (index: number) => {
      if (index >= BOOT_STAGES.length) {
        setProgress(100);
        setFadeOut(true);
        if (onComplete) {
          timerRef.current = setTimeout(onComplete, 400);
        }
        return;
      }

      setStageIndex(index);
      elapsed += index > 0 ? BOOT_STAGES[index - 1].duration : 0;
      setProgress(Math.round((elapsed / totalDuration) * 100));

      timerRef.current = setTimeout(() => advanceStage(index + 1), BOOT_STAGES[index].duration);
    };

    advanceStage(0);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isCustom, onComplete]);

  const currentMessage = isCustom ? message : BOOT_STAGES[stageIndex]?.message ?? 'Loading…';

  return (
    <div
      className={`loading-screen ${fadeOut ? 'loading-screen--fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={currentMessage}
    >
      {/* Background ambient orbs */}
      <div className="loading-screen__bg" aria-hidden="true">
        <div className="loading-screen__orb loading-screen__orb--1" />
        <div className="loading-screen__orb loading-screen__orb--2" />
      </div>

      {/* Content */}
      <div className="loading-screen__content">
        {/* Animated logo */}
        <div className="loading-screen__logo" aria-hidden="true">
          <span className="loading-screen__symbol">∞</span>
          <div className="loading-screen__ring" />
          <div className="loading-screen__ring loading-screen__ring--outer" />
        </div>

        {/* Brand name */}
        <h1 className="loading-screen__title">Infinity OS</h1>

        {/* Status message */}
        <p className="loading-screen__message" key={currentMessage}>
          {currentMessage}
        </p>

        {/* Progress bar */}
        {!isCustom && (
          <div className="loading-screen__progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="loading-screen__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Spinner for custom messages */}
        {isCustom && (
          <div className="loading-screen__spinner" aria-hidden="true" />
        )}
      </div>

      {/* Version */}
      <div className="loading-screen__version" aria-hidden="true">
        Trancendos · v2.0
      </div>
    </div>
  );
}