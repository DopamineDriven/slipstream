import type { BaseSVGProps } from "@/icons/index";

export function Terminal({ ...svg }: BaseSVGProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...svg}>
      <path d="M12 19h8" />
      <path d="m4 17 6-6-6-6" />
    </svg>
  );
}
