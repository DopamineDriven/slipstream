export const rxnObject = {
  liked: { liked: true, disliked: null },
  disliked: { liked: null, disliked: true },
  undisliked: { liked: null, disliked: false },
  unliked: { liked: false, disliked: null },
  "switch-to-disliked": { liked: false, disliked: true },
  "switch-to-liked": { liked: true, disliked: false }
} as const;
