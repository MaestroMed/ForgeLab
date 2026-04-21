import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[var(--bg-tertiary)]',
        className
      )}
    />
  );
}

// Preset skeletons
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/5 p-3 space-y-2">
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-1 pt-1">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonProjectCard() {
  return (
    <div className="rounded-xl border border-white/5 p-4 space-y-3">
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-white/5">
      <Skeleton className="h-16 w-16 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-8 w-16 rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content-aware skeletons — shaped to match the real component that will
// replace them once data arrives. Each one occupies the same footprint as
// its final counterpart to keep layout shifts to a minimum.
// ---------------------------------------------------------------------------

export function FilmstripCardSkeleton() {
  return (
    <div className="cv-auto-card-filmstrip relative flex-shrink-0 w-[260px] h-[400px] rounded-xl bg-white/5 border border-white/5 overflow-hidden">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.02] via-white/[0.05] to-white/[0.02]" />
      <div className="absolute bottom-0 inset-x-0 p-3 space-y-2">
        <div className="h-3 bg-white/10 rounded w-2/3" />
        <div className="h-2 bg-white/5 rounded w-1/3" />
      </div>
    </div>
  );
}

export function SegmentCardSkeleton() {
  return (
    <div className="cv-auto-card relative aspect-[9/16] rounded-lg bg-white/5 border border-white/5 overflow-hidden">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.03] via-white/[0.06] to-white/[0.03]" />
      <div className="absolute top-2 right-2 w-8 h-6 rounded bg-white/10" />
      <div className="absolute bottom-0 inset-x-0 p-2.5 space-y-1.5">
        <div className="h-2.5 bg-white/10 rounded w-3/4" />
        <div className="h-2 bg-white/5 rounded w-1/2" />
      </div>
    </div>
  );
}

export function VodSpineSkeleton() {
  return (
    <div className="relative h-[120px] rounded-lg bg-gradient-to-b from-[#0A0A0F] to-[#13131A] border border-white/5 overflow-hidden">
      <div className="absolute inset-0 animate-pulse">
        <div className="absolute left-[10%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/10" />
        <div className="absolute left-[25%] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white/15" />
        <div className="absolute left-[42%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/20" />
        <div className="absolute left-[58%] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white/15" />
        <div className="absolute left-[75%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/10" />
      </div>
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/5" />
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-white/5 border border-white/5 p-3 h-20">
          <div className="h-2.5 w-1/3 bg-white/10 rounded animate-pulse" />
          <div className="mt-2 h-6 w-2/3 bg-white/15 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
