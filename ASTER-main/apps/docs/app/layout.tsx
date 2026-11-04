import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const inter = Inter({ subsets: ['latin'] });

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://aster.ai');

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'ASTER Docs',
    template: '%s · ASTER Docs',
  },
  description: 'Install, configure, and extend your local-first team of AI agents.',
  openGraph: {
    title: 'ASTER Docs',
    description: 'Your own team of AI agents, in a chat app.',
    type: 'website',
  },
  icons: {
    icon: '/app-icon.svg',
    apple: '/app-icon.svg',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
