export function ChatAreaSkeleton() {
  return (
    <div className="flex-grow p-2 sm:p-4 md:p-6">
      <div className="space-y-4">
        {/* User message skeleton */}
        <div className="flex justify-end">
          <div className="bg-brand-primary/20 rounded-lg p-4 max-w-[70%]">
            <div className="bg-brand-primary/40 h-4 w-48 rounded animate-pulse" />
            <div className="bg-brand-primary/40 h-4 w-32 rounded animate-pulse mt-2" />
          </div>
        </div>

        {/* AI message skeleton */}
        <div className="flex justify-start">
          <div className="bg-brand-component rounded-lg p-4 max-w-[70%]">
            <div className="bg-brand-component/60 h-4 w-64 rounded animate-pulse" />
            <div className="bg-brand-component/60 h-4 w-56 rounded animate-pulse mt-2" />
            <div className="bg-brand-component/60 h-4 w-48 rounded animate-pulse mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
