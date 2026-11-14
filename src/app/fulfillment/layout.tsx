import type { ReactNode } from 'react';
import '../fulfillment-accounting.css';

/** Loads the staff-screen stylesheet for internal fulfillment pages. No markup of its own. */
export default function FulfillmentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
