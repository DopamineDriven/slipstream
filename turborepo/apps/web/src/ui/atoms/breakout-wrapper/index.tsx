import type { ReactNode } from "react";

export const BreakoutWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <div className="w-fit">
      <div className="relative w-screen sm:static sm:mx-0 sm:w-full sm:max-w-full">
        {children}
      </div>
    </div>
  );
};
