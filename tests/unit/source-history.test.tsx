import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceHistory } from "@/components/v6/source-phase-inspector";
import { initialTraceFocus } from "@/lib/presentation/trace-focus";
import { projectSourcePublication } from "@/lib/experiment/source-publication";
import { syntheticSourceHistory } from "../support/source-history";

describe("source history — synthetic inert disclosure projection only", () => {
  const f = syntheticSourceHistory();
  function render(
    arm: "A" | "B",
    phase: "before" | "prepared" | "after",
    evidence = f.evidence,
  ) {
    return renderToStaticMarkup(
      <SourceHistory
        study={f.study}
        evidence={evidence}
        focus={{ ...initialTraceFocus("synthetic"), arm, phase }}
      />,
    );
  }
  it.each([
    ["A", "before", "shared-original"],
    ["B", "before", "shared-original"],
    ["A", "prepared", "shared-original"],
    ["B", "prepared", "preparation-B"],
    ["A", "after", "downstream-A"],
    ["B", "after", "downstream-B"],
  ] as const)("maps %s / %s to exact %s", (arm, phase, role) => {
    const html = render(arm, phase);
    expect(html).toContain(role);
    if (phase === "before") {
      expect(html).toContain("No shared downstream run");
      expect(html).not.toContain("synthetic-run-B");
      expect(html).not.toContain("synthetic-run-A");
    }
    if (arm === "A" && phase === "prepared")
      expect(html).toContain(
        "does not represent an additional preparation run",
      );
    if (phase === "after") expect(html).toContain(`synthetic-run-${arm}`);
  });
  it("keeps approved source inert and persistent subset scope explicit", () => {
    const evidence = structuredClone(f.evidence);
    evidence.snapshots[0]!.files = evidence.snapshots[0]!.files.filter((file) =>
      file.path.includes("service"),
    );
    const html = render("B", "before", evidence);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<script|<img|<iframe|<a /);
    expect(html).toContain("https://source-text.invalid/");
    expect(html).toContain("Disclosed subset only");
    expect(html).toContain(f.evidence.scopeLimitations[0]);
    expect(html).not.toContain("hidden-inventory");
  });
  it("uses actual adapter zero-row added/removed empty-file output", () => {
    for (const [path, change] of [
      ["src/empty-added.ts", "added"],
      ["src/empty-removed.ts", "removed"],
    ]) {
      const evidence = structuredClone(f.evidence);
      const comp = evidence.comparisons[0]!;
      const file = comp.files.find((item) => item.path === path)!;
      expect(file.change).toBe(change);
      expect(file.rows).toEqual([]);
      comp.files = [file];
      const html = render("B", "prepared", evidence);
      expect(html).toContain(change === "added" ? "Added" : "Removed");
      expect(html).toContain("File absent on this side");
      expect(html).toContain("Empty file · present on this side");
      expect(html).toContain("No text rows");
    }
  });
  it.each([
    ["src/undisclosed.ts", "text not disclosed", "Exact text diff unavailable"],
    ["src/too-large.ts", "Complete disclosed", "Exact diff exceeds"],
    ["src/unchanged.ts", "Complete disclosed", "Unchanged file hash"],
  ])("renders honest %s state", (path, side, message) => {
    const evidence = structuredClone(f.evidence);
    evidence.comparisons[0]!.files = evidence.comparisons[0]!.files.filter(
      (file) => file.path === path,
    );
    const html = render("B", "prepared", evidence);
    expect(html).toContain(side);
    expect(html).toContain(message);
  });
  it("preserves line-ending distinctions in server rows", () => {
    const evidence = structuredClone(f.evidence);
    evidence.comparisons[0]!.files = evidence.comparisons[0]!.files.filter(
      (file) => file.path.includes("service"),
    );
    const html = render("B", "prepared", evidence);
    expect(html).toContain("[CRLF]");
    expect(html).toContain("[LF]");
    expect(html).toContain("none · no final newline");
  });
  it("does not substitute missing roles, or claim empty subsets are complete trees", () => {
    const publication = structuredClone(f.publication);
    publication.snapshots = publication.snapshots.filter(
      (item) => item.role !== "B-final",
    );
    const partial = projectSourcePublication(
      publication,
      f.study,
      publication.reportSha256,
    );
    expect(render("B", "after", partial)).toContain(
      "required snapshot is missing",
    );
    expect(render("A", "before", partial)).toContain("shared-original");
    publication.snapshots.forEach((item) => {
      item.bodies = [];
    });
    const empty = projectSourcePublication(
      publication,
      f.study,
      publication.reportSha256,
    );
    expect(render("A", "before", empty)).toContain(
      "does not establish an empty tree",
    );
    expect(render("B", "prepared", empty)).toContain(
      "does not establish no changes",
    );
  });
  it("preserves known-tree and arm-unassigned fallback without provisioned source", () => {
    const html = renderToStaticMarkup(
      <SourceHistory
        study={f.study}
        focus={{
          ...initialTraceFocus("synthetic"),
          arm: "B",
          phase: "prepared",
        }}
        disclosuresUnavailable
      />,
    );
    expect(html).toContain(f.study.arms[1]!.initialTreeSha256);
    expect(html).toContain("arm-unassigned");
    expect(html).toContain("One or more source disclosures are unavailable");
    expect(html).not.toContain("ONE_B-PREPARED_SENTINEL");
  });
  it("keeps a disclosed current snapshot inspectable when its comparison partner is missing", () => {
    const publication = structuredClone(f.publication);
    publication.snapshots = publication.snapshots.filter(
      (item) => item.role !== "shared-original",
    );
    publication.snapshots.forEach((item) => {
      item.bodies = item.bodies.filter((file) => file.path.includes("service"));
    });
    const evidence = projectSourcePublication(
      publication,
      f.study,
      publication.reportSha256,
    );
    const html = render("B", "prepared", evidence);
    expect(html).toContain("source comparison is unavailable");
    expect(html).toContain("ONE_B-PREPARED_SENTINEL");
    expect(html).not.toContain("ONE_SHARED-ORIGINAL_SENTINEL");
    expect(html).toContain("No final newline");
  });
});
