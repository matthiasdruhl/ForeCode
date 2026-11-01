"use client";
import { createContext, useContext } from "react";
import type { TraceFocus } from "@/lib/presentation/trace-focus";
export const TraceContext = createContext<{
  focus: TraceFocus;
  select: (selection: Partial<Omit<TraceFocus, "contextIdentity">>) => void;
} | null>(null);
export const useTraceContext = () => useContext(TraceContext);
