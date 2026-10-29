import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PWARegister } from "@/components/PWARegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Limit Code Studio — พื้นที่ทำงานทีม",
  description: "ระบบจัดการทีม Limit Code Studio",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "LCS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/logo.png", type: "image/png", sizes: "180x180" },
    ],
    shortcut: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f6f8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t="light";try{var s=localStorage.getItem("lcs-theme");if(s==="light"||s==="dark")t=s;else if(window.matchMedia("(prefers-color-scheme: dark)").matches)t="dark";}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;})();` }} />
      </head>
      <body className="min-h-full antialiased bg-background text-foreground">
        <ThemeProvider>
          {children}
          <PWARegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
