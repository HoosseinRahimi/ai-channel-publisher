import { Skeleton } from "./ui/skeleton";

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-[272px] shrink-0 border-e border-slate-200 bg-white p-4 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="size-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <div className="mt-8 space-y-2 px-1">
          {[1, 2, 3, 4].map(item => (
            <Skeleton className="h-11 w-full rounded-lg" key={item} />
          ))}
        </div>
        <div className="mt-auto flex items-center gap-3 border-t border-slate-200 px-2 pt-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-7">
          <Skeleton className="h-4 w-36" />
        </div>
        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-7 lg:p-8">
          <div className="space-y-3 border-b border-slate-200 pb-8">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-[32rem] max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(item => (
              <Skeleton className="h-32 rounded-xl" key={item} />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    </div>
  );
}
