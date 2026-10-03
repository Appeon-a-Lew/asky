"use client";

export default function Orb({ speaking, listening }: { speaking: boolean; listening: boolean }) {
  return (
    <div className="relative h-10 w-10">
      <div className={`absolute inset-0 rounded-full ${speaking ? "animate-ping bg-amber-300/60" : listening ? "animate-pulse bg-sky-300/50" : ""}`} />
      <div className={`absolute inset-1 rounded-full ${speaking ? "bg-amber-400" : listening ? "bg-sky-400" : "bg-stone-800"}`} />
    </div>
  );
}
