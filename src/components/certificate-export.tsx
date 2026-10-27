"use client";
import { useState } from "react";
import { selectCertificateExport } from "../lib/report/certificate-export";

export function CertificateExport({
  id,
  digest,
}: {
  id: string;
  digest: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/demo", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Unavailable");
      const output = selectCertificateExport(await response.json(), id, digest);
      const url = URL.createObjectURL(
        new Blob([output.json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = output.filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Certificate snapshot downloaded.");
    } catch {
      setMessage(
        "Certificate unavailable or changed. Reload this page before exporting.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button-secondary"
        disabled={busy}
        onClick={download}
        aria-label={`Export certificate ${id} as JSON`}
      >
        {busy ? "Checking evidence…" : "Export certificate JSON"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
