import React from 'react';
import { cn } from '../lib/utils';

interface ShimmerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Shimmer: React.FC<ShimmerProps> = ({ className, ...props }) => (
  <div
    {...props}
    className={cn(
      'animate-pulse bg-gradient-to-r from-zinc-800/50 via-zinc-700/50 to-zinc-800/50 bg-[length:200%_100%] rounded',
      'shimmer-animation',
      className
    )}
  />
);

export const ShimmerCard: React.FC = () => (
  <div className="glass-card rounded-3xl p-6 space-y-4">
    <div className="flex items-center justify-between">
      <Shimmer className="h-4 w-24" />
      <Shimmer className="h-8 w-8 rounded-full" />
    </div>
    <Shimmer className="h-10 w-32" />
    <Shimmer className="h-3 w-full" />
    <Shimmer className="h-3 w-3/4" />
  </div>
);

export const ShimmerVideoCard: React.FC = () => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
    <Shimmer className="w-full aspect-video" />
    <div className="p-4 space-y-3">
      <Shimmer className="h-5 w-full" />
      <Shimmer className="h-4 w-3/4" />
      <div className="flex gap-4 pt-2">
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-4 w-20" />
        </div>
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-4 w-20" />
        </div>
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-4 w-20" />
        </div>
      </div>
    </div>
  </div>
);

export const ShimmerAnalyticsRow: React.FC = () => (
  <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl">
    <div className="flex items-center gap-4 flex-1">
      <Shimmer className="w-12 h-12 rounded-lg" />
      <div className="space-y-2 flex-1">
        <Shimmer className="h-4 w-3/4" />
        <Shimmer className="h-3 w-1/2" />
      </div>
    </div>
    <Shimmer className="h-8 w-24 rounded-lg" />
  </div>
);

export const ShimmerStat: React.FC = () => (
  <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-3">
    <div className="flex items-center justify-between">
      <Shimmer className="h-3 w-20" />
      <Shimmer className="h-4 w-4 rounded" />
    </div>
    <Shimmer className="h-8 w-28" />
    <Shimmer className="h-3 w-full" />
  </div>
);

export const ShimmerChart: React.FC = () => (
  <div className="glass-card rounded-3xl p-6 space-y-4">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-3 w-48" />
      </div>
      <Shimmer className="h-8 w-24 rounded-lg" />
    </div>
    <div className="h-64 flex items-end gap-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <Shimmer
          key={i}
          className="flex-1"
          style={{ height: `${Math.random() * 80 + 20}%` }}
        />
      ))}
    </div>
  </div>
);

export const ShimmerTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <ShimmerAnalyticsRow key={i} />
    ))}
  </div>
);
