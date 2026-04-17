import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Search bar */}
      <Skeleton className="h-8 w-64" />

      {/* Table */}
      <div className="rounded-lg border">
        {/* Header */}
        <div className="flex gap-4 border-b p-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`head-${i}`} className="h-4 flex-1" />
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="flex gap-4 border-b p-3 last:border-0"
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton key={`cell-${rowIdx}-${colIdx}`} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
      </div>
    </div>
  );
}

interface CardSkeletonProps {
  count?: number;
  className?: string;
}

export function CardSkeleton({ count = 4, className }: CardSkeletonProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-6 rounded-md" />
          </div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

interface ChartSkeletonProps {
  className?: string;
}

export function ChartSkeleton({ className }: ChartSkeletonProps) {
  return (
    <div className={cn("space-y-4 rounded-lg border p-4", className)}>
      {/* Chart title */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>

      {/* Chart area */}
      <div className="flex h-64 items-end gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.max(20, Math.random() * 100)}%`,
            }}
          />
        ))}
      </div>

      {/* Chart legend */}
      <div className="flex justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}
