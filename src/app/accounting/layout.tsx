import type { ReactNode } from 'react';
import '../fulfillment-accounting.css';

/** Loads the staff-screen stylesheet for accounting pages. No markup of its own. */
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
