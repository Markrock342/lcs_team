import { IBM_Plex_Sans_Thai } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PWARegister } from "@/components/PWARegister";
import "./globals.css";

const ibmPlex = IBM_Plex_Sans_Thai({
  variable: "--font-ibm-plex",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Limit Code Studio — Team Workspace",
  description: "ระบบจัดการทีม Limit Code Studio",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "LCS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050a14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${ibmPlex.variable} h-full`}>
      <body className="min-h-full antialiased bg-background text-foreground">
        <ThemeProvider>
          {children}
          <PWARegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
