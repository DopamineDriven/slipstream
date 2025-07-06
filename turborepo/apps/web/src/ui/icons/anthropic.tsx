import type { ComponentPropsWithRef } from "react";

export const AnthropicIcon = ({
  ...svg
}: Omit<
  ComponentPropsWithRef<"svg">,
  "viewBox" | "fill" | "xmlns" | "role"
>) => (
  <svg
    viewBox="0 0 28 20"
    fill="none"
    role="img"
    xmlns="http://www.w3.org/2000/svg"
    {...svg}>
    <path
      d="M20.1952 0H15.9132L23.718 20H28L20.1952 0ZM7.80477 0L0 20H4.3731L5.98265 15.8154H14.1518L15.731 20H20.1041L12.2993 0H7.80477ZM7.37961 12.0923L10.0521 5.07692L12.7245 12.0923H7.37961Z"
      fill="currentColor"
    />
  </svg>
);

AnthropicIcon.displayName = "AnthropicIcon";
