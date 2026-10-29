import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="mx-auto grid max-w-4xl gap-10" aria-busy="true" aria-label="Loading workspace">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
