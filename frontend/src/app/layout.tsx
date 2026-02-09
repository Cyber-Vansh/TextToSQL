import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ClientGatekeeper from "@/components/ClientGatekeeper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Data Pilot AI",
  description: "Query your database using natural language.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientGatekeeper>
          <AuthProvider>{children}</AuthProvider>
        </ClientGatekeeper>
      </body>
    </html>
  );
}
