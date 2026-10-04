"use client";

export default function Orb({ speaking, listening }: { speaking: boolean; listening: boolean }) {
  return (
    <div className="relative h-10 w-10">
      <div className={`absolute inset-0 rounded-full ${speaking ? "animate-ping bg-amber-300/60" : listening ? "animate-pulse bg-sky-300/50" : ""}`} />
      <div className={`absolute inset-1 rounded-full ${speaking ? "bg-gradient-to-br from-amber-300 to-amber-500" : listening ? "bg-gradient-to-br from-sky-300 to-sky-500" : "bg-gradient-to-br from-stone-700 to-stone-950 ring-2 ring-amber-300/40"}`} />
    </div>
  );
}
