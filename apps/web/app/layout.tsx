import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DeployPilot",
  description: "Private deployment control plane for GitHub and Docker workers",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
