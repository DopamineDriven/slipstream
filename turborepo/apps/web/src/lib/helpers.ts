export const getInitials = (name?: string | null) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map(n => n.substring(0, 1))
    .join("");
};

export const getFirstName = (name?: string | null) => {
  if (!name) return "User";
  return name.split(" ")?.[0] ?? "User";
};

export const smoothScrollToBottom = (distance: number) => {
  return Math.min(Math.max(300, Math.sqrt(distance) * 20), 1500);
};
