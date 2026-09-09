import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({ variable: '--font-montserrat', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Capexity — Task & Capacity Planner',
  description: 'Shared project planning, daily execution, Gantt scheduling, and workload management.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${montserrat.variable} antialiased`}>{children}</body></html>;
}
