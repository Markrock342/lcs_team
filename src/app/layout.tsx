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
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t="light";try{var s=localStorage.getItem("lcs-theme-choice");if(s==="light"||s==="dark")t=s;}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;})();` }} />
      </head>
      <body className="min-h-full antialiased bg-background text-foreground">
        <div className="rotate-lock" role="alert">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
          <p>หมุนเครื่องเป็นแนวตั้ง</p>
        </div>
        <ThemeProvider>
          {children}
          <PWARegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
