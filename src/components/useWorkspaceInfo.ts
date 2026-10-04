"use client";

import { useEffect, useState } from "react";

export interface WorkspaceInfo {
  workspace: "main" | "visitor" | null;
  visitor?: boolean;
  expiresAt?: number;
  usage?: { llm: number; ttsChars: number };
  limits?: { llm: number; ttsChars: number };
}

let cached: Promise<WorkspaceInfo> | null = null;

/** Which workspace this browser works in (presenter "main" or a private audience workspace). */
export function useWorkspaceInfo(): WorkspaceInfo | null {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/workspace").then((r) => r.json()).catch(() => ({ workspace: null }));
    cached.then(setInfo);
  }, []);
  return info;
}
