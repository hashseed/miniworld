// Simple geometric interface icons drawn in code (spec milestone 1, section 12).

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4v16l13-8z" />
  </svg>
);

export const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

/** Snail mode: a turtle. */
export const TurtleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 15a8 7 0 0116 0zM2 15h18v1.6H2zM4.5 16h2.6v3.2H4.5zM14 16h2.6v3.2H14zM3 15.4l-2.4 1.8 2.6-.2zM17.5 13h2.5v2.2h-2.5zM21 10.8a2.2 2.2 0 110 4.4 2.2 2.2 0 010-4.4z" />
  </svg>
);

/** Regular mode: a walking person. */
export const WalkerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12.5" cy="3.8" r="2.3" />
    <g
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12.3 8l-1.2 6M11.1 14l-2.4 3.4L7.3 21M11.1 14l2.6 3.4 1.8 3.6M12.1 9l-2.8 2.6-.8 2.6M12.1 9l2.4 2.4 2.2 1.2" />
    </g>
  </svg>
);

/** Fast forward: a galloping horse. */
export const HorseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="10.5" cy="11" rx="6" ry="3.2" />
    <path d="M13.5 9l3.6-5.4h1.8l3 3.2-1 1.3-2.4-.9-2 4z" />
    <g
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M15 12.5l3.4 2-0.2 1.6M14 13l1.6 3.4 2.6 1M7 12.5l-3 2.6-1.8.2M8 13.2l-1.4 3.4-2 1.8M4.8 9.6c-1.6-.2-2.6 1-3 2.6" />
    </g>
  </svg>
);

/** Fastest: a running cheetah, slim and long-tailed, legs stretched out. */
export const CheetahIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="11.5" cy="11.2" rx="6.4" ry="2.3" />
    <circle cx="19" cy="9.6" r="2" />
    <path d="M20.4 9.2l2.4.8-2 1.1z" />
    <g
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M16 12.4l3.2 2.2 2.6.4M15 12.8l1.4 3.4 2 .8M7.5 12.6l-3.4 2.4-2.4-.2M8.6 13l-2.2 3-2 .6M5.4 10.4C3.4 9.6 2 10 1.2 8" />
    </g>
  </svg>
);

export const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);

export const GearIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 5.5v-3l-2.4-.6a7 7 0 00-.8-1.9l1.3-2.1-2.1-2.1-2.1 1.3a7 7 0 00-1.9-.8L12.5 2h-3l-.6 2.4a7 7 0 00-1.9.8L4.9 3.9 2.8 6l1.3 2.1a7 7 0 00-.8 1.9L1 10.5v3l2.4.6c.2.7.4 1.3.8 1.9l-1.3 2.1L5 20.2l2.1-1.3c.6.4 1.2.6 1.9.8l.6 2.3h3l.6-2.4c.7-.2 1.3-.4 1.9-.8l2.1 1.3 2.1-2.1-1.3-2.1c.4-.6.6-1.2.8-1.9z" />
  </svg>
);

export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.6 4.2L12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z" />
  </svg>
);

export const CompassIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l4 10-4 10-4-10z" opacity="0.5" />
    <path d="M12 2l4 10H8z" />
  </svg>
);

/** A jump back under way: two triangles pointing left, like rewind. */
export const FastReverseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11.5 5v14L2 12zM22 5v14l-9.5-7z" />
  </svg>
);

/** A jump forward under way: two triangles pointing right. */
export const FastForwardIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 5v14l9.5-7zM12.5 5v14L22 12z" />
  </svg>
);

/**
 * The back (counter-clockwise) or forward (clockwise) button: a circular
 * arrow around its step, written small enough to fit (section 8.1).
 */
export const CircleArrowIcon = ({ clockwise, label }: { clockwise: boolean; label: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" class="circle-arrow">
    <g transform={clockwise ? 'translate(24 0) scale(-1 1)' : undefined}>
      <path
        d="M12 2.6A9.4 9.4 0 1 1 4.2 6.8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path d="M8.2 2.6L13 0v5.2z" />
    </g>
    <text
      x="12"
      y="12.5"
      text-anchor="middle"
      dominant-baseline="central"
      font-size={label.length > 2 ? 7.5 : 9.5}
      font-weight="700"
    >
      {label}
    </text>
  </svg>
);

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11 4h2v16h-2zM4 11h16v2H4z" />
  </svg>
);

export const MinusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 11h16v2H4z" />
  </svg>
);

export const FollowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11 2h2v20h-2zM4 8l5 4-5 4zM20 8l-5 4 5 4z" />
  </svg>
);

export const LanesIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 5h18v3H3zM3 10.5h18v3H3zM3 16h18v3H3z" />
  </svg>
);
