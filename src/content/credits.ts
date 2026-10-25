// Who made the game. Shown on the title screen, the storm intro, About, the ending and the share cards.
export const CREDITS = {
  team: 'Team Will-Ai',
  members: ['Hao Dong Yuan', 'Chieh Lin Chung'],
  event: 'Hack for Social Impact 2026',
  challenge: 'UNCCD challenge',
} as const;

export const CREDIT_LINE = `${CREDITS.team} · ${CREDITS.members.join(' & ')}`;
export const EVENT_LINE = `${CREDITS.event} · ${CREDITS.challenge}`;
