// The one keyboard handler (spec milestone 1, section 6.2): Escape closes a
// panel, Space plays and pauses, [ and ] change the speed, Home and End jump
// to the ends of the timeline, and the camera keys go to the camera. Keys
// typed into text fields are left alone.

import type { CameraController } from './globe/cameraController.ts';
import type { Clock } from './time/clock.ts';

export interface KeyTargets {
  clock: Clock;
  controller: CameraController;
  /** Closes the open panel; returns false when none is open. */
  closePanel(): boolean;
  /** The timeline canvas, which handles Home and End itself. */
  timelineCanvas(): HTMLCanvasElement | undefined;
  /** Whether a dialog stands over the globe, so keys other than Escape are its own. */
  modal?(): boolean;
}

export function attachKeys(t: KeyTargets): void {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && t.closePanel()) return;
    const target = e.target as HTMLElement | null;
    if (isTyping(target) || t.modal?.()) return;
    if (e.key === ' ' || e.code === 'Space') {
      if (target?.tagName === 'BUTTON') return;
      e.preventDefault();
      t.clock.togglePlay();
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      t.clock.stepSpeed(e.key === ']' ? 1 : -1);
    } else if ((e.key === 'Home' || e.key === 'End') && target !== t.timelineCanvas()) {
      e.preventDefault();
      t.clock.setDay(e.key === 'Home' ? t.clock.startDay : t.clock.endDay);
    } else if (t.controller.keyDown(e)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => t.controller.keyUp(e));
  window.addEventListener('blur', () => t.controller.releaseKeys());
}

function isTyping(t: HTMLElement | null): boolean {
  return (
    !!t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'SELECT' ||
      t.tagName === 'TEXTAREA' ||
      t.isContentEditable)
  );
}
