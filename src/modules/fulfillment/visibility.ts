/**
 * Who may see a line's shortage/discrepancy reason. Independent checking (spec ACC-02): while the checker is still
 * counting, the picker's reason must not be visible, because it hints at the expected number.
 */
export const COUNTING_STATUSES = ['ASSIGNED', 'PICKING', 'PICKED', 'CHECKING'] as const;

export function discrepancyReasonVisible(input: {
  viewerId: string;
  assignedCheckerId: string | null;
  status: string;
  viewerCanResolve: boolean;
}): boolean {
  const isChecker = input.assignedCheckerId === input.viewerId;
  if (input.viewerCanResolve) return true;
  return !(isChecker && (COUNTING_STATUSES as readonly string[]).includes(input.status));
}
