import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachKeys } from './input.ts';

type Handler = (e: Record<string, unknown>) => void;

describe('keys', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const handlers = new Map<string, Handler>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, h: Handler) => handlers.set(type, h),
    });
    const clock = { togglePlay: vi.fn() };
    const controller = { keyDown: () => false, keyUp: vi.fn(), releaseKeys: vi.fn() };
    attachKeys({
      clock,
      controller,
      closePanel: () => false,
      timelineCanvas: () => undefined,
    } as never);
    return { handlers, clock };
  }

  it('plays and pauses on Space even when a button has the focus (issue 166)', () => {
    const { handlers, clock } = setup();
    const target = { tagName: 'BUTTON', isContentEditable: false };
    const down = { key: ' ', code: 'Space', target, preventDefault: vi.fn() };
    handlers.get('keydown')!(down);
    expect(clock.togglePlay).toHaveBeenCalledTimes(1);
    expect(down.preventDefault).toHaveBeenCalled();
    // The button must not take the key's release as a click.
    const up = { key: ' ', code: 'Space', target, preventDefault: vi.fn() };
    handlers.get('keyup')!(up);
    expect(up.preventDefault).toHaveBeenCalled();
  });

  it('leaves Space to text fields', () => {
    const { handlers, clock } = setup();
    handlers.get('keydown')!({ key: ' ', code: 'Space', target: { tagName: 'INPUT' } });
    expect(clock.togglePlay).not.toHaveBeenCalled();
  });
});
