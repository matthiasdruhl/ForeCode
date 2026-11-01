import { bookingGraph } from "@/lib/foresight/booking-context";

/** Presentation selection only. No experimental authorization or evidence. */
export const responsibilities = [
  "Routes",
  "Ownership",
  "Policy",
  "Storage",
] as const;
export type Responsibility = (typeof responsibilities)[number];
export type TraceFocus = {
  arm: "A" | "B";
  responsibility: Responsibility;
  sourceId?: string;
  phase: "before" | "prepared" | "after";
  contextIdentity: string;
};
export function initialTraceFocus(contextIdentity: string): TraceFocus {
  return {
    arm: "A",
    responsibility: "Routes",
    phase: "before",
    contextIdentity,
  };
}
export function reconcileTraceFocus(
  focus: TraceFocus,
  contextIdentity: string,
): TraceFocus {
  return focus.contextIdentity === contextIdentity
    ? focus
    : initialTraceFocus(contextIdentity);
}
export function readTraceSelection(
  url: URL,
  contextIdentity: string,
): TraceFocus {
  const responsibility = url.searchParams.get("responsibility");
  const phase = url.searchParams.get("phase");
  const source = url.searchParams.get("source");
  const sourceId = bookingGraph.modules.find(
    (module) => module.id === source,
  )?.id;
  return {
    ...(sourceId ? { sourceId } : {}),
    contextIdentity,
    arm: url.searchParams.get("arm") === "B" ? "B" : "A",
    responsibility:
      responsibilities.find((item) => item === responsibility) ?? "Routes",
    phase: phase === "prepared" || phase === "after" ? phase : "before",
  };
}
