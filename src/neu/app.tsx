"use client";
// Einstieg des echten neuen Dashboards (/admin/…): dieselben Seiten wie der
// Prototyp, aber mit Daten vom Server.
import { BasisProvider } from "@/preview/nav";
import { Router } from "@/preview/app";
import { Banner, Toast } from "@/preview/ui/shells";
import { NeuProvider } from "./provider";

export function NeuApp() {
  return (
    <BasisProvider basis="">
      <NeuProvider>
        <div className="pv">
          <Banner />
          <Router nur="/admin" />
          <Toast />
        </div>
      </NeuProvider>
    </BasisProvider>
  );
}
