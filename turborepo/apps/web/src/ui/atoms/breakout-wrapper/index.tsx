import type { ReactNode } from "react";

export const BreakoutWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <div className="w-full">
      <div className="relative right-1/2 left-1/2 -mx-[50dvw] w-screen sm:static sm:mx-0 sm:w-full sm:max-w-full">
        {children}
      </div>
    </div>
  );
};
