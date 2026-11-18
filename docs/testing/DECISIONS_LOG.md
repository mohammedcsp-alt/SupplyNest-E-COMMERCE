# Decisions Log: ADMIN_TESTER and Network (approved by the System Owner, 2026-11-18)

| ID | Decision | Approved status | Applied state | Owner approval text |
|---|---|---|---|---|
| D-1 | Withhold `customer.edit_commercial` and `price.level.manage` | APPROVED | Withheld | "Withhold customer.edit_commercial and price.level.manage." |
| D-2 | Withhold `finance.view` and all financial write permissions (`finance.adjustment.create`, `finance.adjustment.approve`, `finance.allocate`, `finance.fee_payment.record`, `finance.reconcile`, `finance.remittance.record`, `invoice.issue`) | APPROVED | Withheld | "Withhold finance.view and all financial write permissions." |
| D-3 | Grant `shipping.manage` and `courier.manage`, with full audit logging, testing limited to the UAT environment | APPROVED | Granted | "Grant shipping.manage and courier.manage, with full audit logging and testing limited to the UAT environment." |
| D-4 | Withhold `integration.view` | APPROVED | Withheld | "Withhold integration.view." |
| D-5 | Withhold `notification.send` | APPROVED | Withheld | "Withhold notification.send." |
| D-6 | Restrict unnecessary inbound AnyDesk access on Public and Tailscale networks, keep AnyDesk functional. Do not uninstall or permanently disable. Review effective rules first. Changes that may affect remote support need separate approval. | APPROVED AND IMPLEMENTED (proposal item 1, 2026-11-18). Verified: both Public rules Enabled=False, Private and Domain rules unchanged (Enabled=True). Item 2 not approved. | Tailscale: blocked (TCP 7070). Public: the two rules `{021EC585-ECCD-4143-9041-D5D3B097C9ED}` and `{371553BE-F829-4093-AF5B-CAE9F47DF635}` are to be disabled by the owner in an elevated PowerShell. Not applied by the assistant (session not elevated). Proposal item 2 (LAN subnet narrowing) is not approved. | "APPROVED IN PRINCIPLE ... obtain my approval for changes that may affect existing remote-support functionality." |

## Tailscale block rules (applied by the owner)

17 rules named `SupplyNest-Tailnet-Block ...`, inbound, Block, interface `Tailscale`, remote scope `100.64.0.0/10` and `fd7a:115c:a1e0::/48`. Ports: TCP 22, 80, 135, 139, 445, 2869, 3200, 3389, 5040, 5130, 5357, 5440, 6772, 7070; UDP 137, 138, 5355.

## D-6 review (read-only, 2026-11-18)

`C:\Program Files (x86)\AnyDesk\AnyDesk.exe` has these inbound allow rules: TCP and UDP, all ports, remote address Any, on Private, Public and Domain profiles (six rules). AnyDesk listens on TCP 7070 on all interfaces and UDP 50001 on all interfaces.

The Wi-Fi network "Masar 2" is classed as Public, so these rules expose AnyDesk to other devices on that network.

Proposed (NOT applied, needs separate approval):

1. Disable the two Public-profile AnyDesk allow rules. Effect: AnyDesk is no longer reachable from Public networks (for example, public Wi-Fi). Sessions from Private and Domain networks are unaffected. Outbound AnyDesk sessions are unaffected.
2. Optional narrowing: limit the Private rules to the LAN subnet (192.168.68.0/24). Effect: AnyDesk is reachable only from the local subnet. Do this only if remote support never comes from outside that subnet.

Rollback for item 1: re-enable the two rules (`Enable-NetFirewallRule -DisplayName AnyDesk -Profile Public`).

## Phase status

- Phase 1 (Admin Dashboard): NOT STARTED. Requires friend's remote login, password change and port checks from their own device.
- Phase 2 (Concurrent administration): NOT STARTED. Requires both administrators signed in.
- Customer testing and Admin-Customer integration: NOT STARTED, out of scope.
