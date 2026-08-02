import "@/styles/globals.css";

import { type Metadata } from "next";
import { Poppins } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";
import { AuthProvider } from "@/components/AuthProvider";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { ThemeProvider } from "@/components/ThemeProvider";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { db } from "@/server/db";

export async function generateMetadata(): Promise<Metadata> {
  const logoConfig = await db.appConfig.findUnique({ where: { key: "appLogo" } });
  const iconUrl = logoConfig?.value ?? "/favicon.ico";

  return {
    title: "Audit Management Tool",
    description: "Manage and track audits efficiently with the Audit Management Tool.",
    icons: [{ rel: "icon", url: iconUrl }],
  };
}

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" className={`${poppins.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={poppins.className}>
        <ThemeProvider>
          <AuthProvider>
            <TRPCReactProvider>{children}</TRPCReactProvider>
            {session?.user && <FeedbackWidget />}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
