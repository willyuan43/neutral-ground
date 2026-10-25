// Achievements (T11): eighteen, good and bad. One whose feature is not in this build is not shown at all.
export type Feature = 'core' | 'predict' | 'storm' | 'experiment' | 'satellite' | 'shade' | 'reroute' | 'quests' | 'responses' | 'swap' | 'otherCards';
export interface Achievement { id: string; name: string; how: string; hint: string; bad?: boolean; feature: Feature }
// features shipped in this build (an achievement for a feature that is off is hidden, not locked)
export const FEATURES: Record<Feature, boolean> = { core: true, predict: true, storm: true, experiment: true, satellite: true, shade: true, reroute: true, quests: true, responses: true, swap: true, otherCards: true };

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'forecaster', name: 'Forecaster', how: 'Three guesses in the right bin (over all your seasons)', hint: 'Guess before each run — the model judges your bin.', feature: 'predict' },
  { id: 'full-before-peak', name: 'Full Before the Peak', how: 'Watch a rain garden fill up before the storm’s biggest hour', hint: 'Where does most water run — and when?', feature: 'storm' },
  { id: 'full-before-storm', name: 'Full Before the Storm', how: 'Empty the tank before the storm and see it full again before the biggest hour', hint: 'Try the what-if on the storm card.', feature: 'experiment' },
  { id: 'drought-lesson', name: 'Drought Lesson', how: 'Unwatered seedlings mostly die in the 2021 dry season', hint: 'What does a 230 mm year do to seedlings?', feature: 'core' },
  { id: 'watered-through', name: 'Watered Through', how: '70% or more of a watered planting survives its first dry season', hint: 'Water costs sweat and water — and buys survival.', feature: 'core' },
  { id: 'satellite-eyes', name: 'Satellite Eyes', how: 'Open the satellite greenness at the 2021 drought pause', hint: 'Look at the pause card after the dry year.', feature: 'satellite' },
  { id: 'right-tree', name: 'Right Tree, Right Place', how: 'Shade trees by the lawn, and not one tree on the east-slope grassland', hint: 'Shade for campers without shrinking the grassland.', feature: 'shade' },
  { id: 'trail-diplomat', name: 'Trail Diplomat', how: 'Reroute the shortcut after Leo speaks up', hint: 'Is there a way to protect the slope and keep a path?', feature: 'reroute' },
  { id: 'common-ground', name: 'Common Ground', how: 'All four neighbours’ quests done in one season', hint: 'The calibration shows it can be done — with every token.', feature: 'quests' },
  { id: 'listener', name: 'Listener', how: 'Answer all four neighbours (adjust, explain or not now)', hint: 'Everyone gets a word in — and an answer.', feature: 'responses' },
  { id: 'storm-swapper', name: 'Storm Swapper', how: 'Try the same plan in two real storms', hint: 'The storm card has another storm.', feature: 'swap' },
  { id: 'second-thoughts', name: 'Second Thoughts', how: 'Revise an autumn after looking at the other cards', hint: 'The pause card shows what the other cards would have done.', feature: 'otherCards' },
  { id: 'storm-reader', name: 'Storm Reader', how: 'Call the storm’s biggest hour into the drain within an hour, while it plays', hint: 'Tap “This is the peak!” during the storm.', feature: 'storm' },
  { id: 'right-in-time', name: 'Right in Time', how: 'Start watering an unwatered planting at its first thirsty spell, during the year', hint: 'Watch the survival meter while the year plays.', feature: 'core' },
  { id: 'explorer', name: 'Neighbourhood Explorer', how: 'Find five real places around the park on the map', hint: 'Layers → Places nearby, then tap the names.', feature: 'core' },
  { id: 'muddy-boots', name: 'Muddy Boots', how: 'The east slope washes out more than doing nothing', hint: 'Bare soil and open trails in storms…', bad: true, feature: 'core' },
  { id: 'dry-tap', name: 'Dry Tap', how: 'Plan more watering than a year’s water allows', hint: 'How much water does one dry year allow?', bad: true, feature: 'core' },
  { id: 'spread-thin', name: 'Spread Too Thin', how: 'Spend 90% of the tokens and finish with one quest or none', hint: 'A bit of everything…', bad: true, feature: 'quests' },
];
export const shownAchievements = () => ACHIEVEMENTS.filter((a) => FEATURES[a.feature]);
export const achievementOn = (id: string) => shownAchievements().some((a) => a.id === id);
