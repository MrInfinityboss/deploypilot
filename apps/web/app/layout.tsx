import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DeployPilot",
  description: "Private deployment control plane for GitHub and Docker workers",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
