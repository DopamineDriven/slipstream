import type { ModelSelection } from "@/lib/models";
import type { User } from "@/utils/auth-client";
import { motion } from "motion/react";
import { AICoalesce } from "@slipstream/ui";

function getTimeOfDay(tz = "america/chicago", username?: string | null) {
  const time = new Date(Date.now()).toLocaleTimeString("en-US", {
    timeZone: decodeURIComponent(tz),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const u = username ? username.split(" ")?.[0] : "User";
  const [hour, _min, _sec] = time.split(/:/).map(t => Number.parseInt(t));
  if (!hour) return `:3, ${u}.`;
  else if (hour >= 5 && hour < 12) return `Ask away, ${u}.`;
  else if (hour >= 12 && hour < 17) return `Turtles all the way down, ${u}?`;
  else if (hour >= 17 && hour <= 23) return `Penny for your thoughts, ${u}?`;
  else return `Late-Night ${u}!`;
}

export function ChatHero({
  user,
  selectedModel,
  tz
}: {
  user: User;
  selectedModel: ModelSelection;
  tz?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-8 text-center">
      <AICoalesce className="mx-auto mb-4 size-16 stroke-current text-current sm:size-20 lg:size-24 [&_path]:stroke-current" />
      <h1 className="text-foreground/95 mb-2 text-sm font-medium sm:text-base">
        {getTimeOfDay(tz, user.name)}
      </h1>
      <p className="text-foreground/85 text-md sm:text-lg">
        {`Start a convo with ${selectedModel.displayName}`}
      </p>
    </motion.div>
  );
}
