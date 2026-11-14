import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';

/**
 * Shared layout for sign-in, registration, phone verification and recovery (CU-06 to CU-09).
 * Presentation only: forms and API endpoints are passed in unchanged by each page.
 */
export function AuthShell({
  title,
  subtitle,
  steps,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  steps?: { labels: string[]; current: number; ariaLabel: string };
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-panel">
        {steps && (
          <nav aria-label={steps.ariaLabel}>
            <ol className="auth-steps">
              {steps.labels.map((label, idx) => (
                <li
                  key={label}
                  className={idx < steps.current ? 'done' : undefined}
                  aria-current={idx === steps.current ? 'step' : undefined}
                >
                  <span className="auth-step-num" aria-hidden="true">{idx + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <PageHeader title={title} subtitle={subtitle} />
        {children}
        {footer && <div className="auth-links">{footer}</div>}
      </div>
    </div>
  );
}
