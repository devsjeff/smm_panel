import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const name = process.env.NEXT_PUBLIC_SITE_NAME || 'SMM Panel';

export const metadata: Metadata = {
  title: { default: name, template: `%s · ${name}` },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
