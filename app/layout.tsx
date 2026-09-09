import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({ variable: '--font-montserrat', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Capacity — Task & Capacity Planner',
  description: 'Local-first project planning, daily execution, and workload management.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${montserrat.variable} antialiased`}>{children}</body></html>;
}
