"use client";

import AppShell from "@/components/AppShell";
import SmartScanWorkspace from "@/features/smart-scan/SmartScanWorkspace";

export default function SmartScanPage() {
  return (
    <AppShell
      title="Smart Scan"
      subtitle="Scan, review, and study from your own pages."
    >
      <SmartScanWorkspace />
    </AppShell>
  );
}
