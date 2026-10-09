"use client";
// Einstieg der Mitarbeiterseiten im echten System (/crew/…)
import { BasisProvider } from "@/preview/nav";
import { Router } from "@/preview/app";
import { Toast } from "@/preview/ui/shells";
import { CrewProvider } from "./crew-provider";

export function CrewApp() {
  return (
    <BasisProvider basis="">
      <CrewProvider>
        <div className="pv nobanner">
          <Router nur="/crew" />
          <Toast />
        </div>
      </CrewProvider>
    </BasisProvider>
  );
}
