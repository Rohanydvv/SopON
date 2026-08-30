import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SopON — AI-Powered Incident Operations',
  description: 'Multi-tenant AI-powered incident and support operations platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}