import type { BaseSVGProps } from "@/icons/index";

export function Moon({ ...svg }: BaseSVGProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      role="img"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...svg}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
