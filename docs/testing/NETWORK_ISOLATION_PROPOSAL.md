# SEC-001 Network Isolation: Proposal (NOT APPLIED, owner approval required)

Nothing in this file has been applied. Windows Firewall changes need administrator rights and are host-wide. Tailscale
access policy changes are made in the admin console. Both need your explicit approval (remediation brief, section 2).

## 1. What was found (read-only, 2026-11-18)

| Item | Finding | Source |
|---|---|---|
| Tailscale interface | Alias `Tailscale`, status Up, network category **Private** | `Get-NetAdapter`, `Get-NetConnectionProfile` |
| Wi-Fi interface | Alias `Wi-Fi` (network "Masar 2"), category **Public** | same |
| Inbound allow rules on the Private profile for File and Printer Sharing | `SMB-In`, `NB-Session-In`, `NB-Datagram-In`, `NB-Name-In`, `LLMNR-UDP-In`, `Spooler Service - RPC`, `Spooler Service - RPC-EPMAP`, `Spooler Service Worker - RPC`, Echo Request ICMPv4/v6 (all Allow, Private) | `Get-NetFirewallRule -DisplayGroup "File and Printer Sharing"` (readable without admin) |
| AnyDesk inbound allow rules | Allow on **Private, Public and Domain** profiles; AnyDesk listens on **all interfaces** on TCP and port 7070 | `Get-NetFirewallRule -DisplayName AnyDesk`, `Get-NetTCPConnection` |
| Listeners | 80 (System, all), 135 (RPC, all), 139 (System, tailnet and LAN addresses), 445 (System, all), 2869 (System, all), 5040 and 5130 (all), 6772 (NiceLabel, all), 7070 (AnyDesk, all) | `Get-NetTCPConnection -State Listen` |
| SupplyNest | 3200 and 5440 on 127.0.0.1 only | same |
| Tailscale Serve | **Not enabled** (`No serve config`) | `tailscale serve status` |
| Tailscale ACL / grants | **Not readable from this PC.** Must be checked in the admin console | cannot verify from the assistant |

**Conclusion:** because the Tailscale adapter is on the Private profile, the File and Printer Sharing allow rules apply to tailnet
traffic. Unless the tailnet ACL restricts the tester to port 443, the tester could reach SMB (445), NetBIOS (139) and RPC.
AnyDesk is exposed on every network this PC is connected to, including public Wi-Fi. That exposure predates this work and
is a separate risk for you to decide on.

## 2. Proposal A: Tailscale access policy (admin console, you do it)

1. Open https://login.tailscale.com/admin/acls (Access controls). Read the current policy.
2. If it contains a grant with `"src": ["*"], "dst": ["*"]` or `"ip": ["*"]`, that grant gives every device every port. Remove it
   for any user other than yourself, or replace it with the owner-only rule below.
3. Target policy (grants only; keep your own admin rule):

```json
{
  "grants": [
    { "src": ["autogroup:admin"], "dst": ["*"], "ip": ["*"] },
    { "src": ["<tester-email>"], "dst": ["<owner-host>"], "ip": ["tcp:443"] }
  ]
}
```

- `autogroup:admin` keeps your own access to everything. Check that this rule covers the devices you use for administration. If you
  use other devices to reach this PC, add them explicitly.
- The tester gets **only** TCP 443 on this PC. Port 443 is the Tailscale Serve HTTPS listener (once enabled).
- Do not add `tcp:*`, `*`, or a second port.

4. Use the admin console "Preview rules" (or `Test access` if available) to confirm the tester can reach `<owner-host>:443`
   and cannot reach `<owner-host>:445`.

## 3. Proposal B: host-wide firewall block on the Tailscale interface only (needs administrator rights)

This keeps your LAN and Wi-Fi behaviour unchanged. The rules block inbound traffic only on the `Tailscale` interface. A block rule
takes precedence over an allow rule in Windows Firewall, so the existing allow rules stay in place and do not need editing.

Run in an **elevated** PowerShell (Run as administrator). Do not run until you approve:

```powershell
# Inbound BLOCK on the Tailscale interface only. Does not touch Wi-Fi/LAN, Serve (443), or any existing rule.
$tcpPorts = 80, 135, 139, 445, 2869, 5040, 5130, 6772, 7070
foreach ($p in $tcpPorts) {
  New-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block TCP $p" -Direction Inbound -Protocol TCP -LocalPort $p `
    -InterfaceAlias "Tailscale" -Action Block -Profile Any -Enabled True | Out-Null
}
$udpPorts = 137, 138, 5355
foreach ($p in $udpPorts) {
  New-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block UDP $p" -Direction Inbound -Protocol UDP -LocalPort $p `
    -InterfaceAlias "Tailscale" -Action Block -Profile Any -Enabled True | Out-Null
}
Get-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block*" | Select-Object DisplayName, Enabled, Action
```

**Rollback (exact):**

```powershell
Get-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block*" | Remove-NetFirewallRule
```

Notes:
- The rules are named `SupplyNest-Tailnet-Block…` so they are easy to find and remove. They are not broad allow rules.
- ICMP echo is left alone.
- Port 443 is not blocked, so Tailscale Serve keeps working.
- AnyDesk is not blocked by Proposal B, because the tester must not reach it on the tailnet either. Blocking
  7070 on the Tailscale interface is included above. Blocking AnyDesk on the LAN or public Wi-Fi is a separate decision (see section 4).
- `-InterfaceAlias "Tailscale"` must match the adapter name shown by `Get-NetAdapter` (confirmed as `Tailscale`).

## 4. Decisions for the owner

| ID | Decision |
|---|---|
| N-1 | Approve Proposal A (tailnet ACL) with the policy in section 2. Required before the tester is invited. |
| N-2 | Approve Proposal B (tailnet-interface firewall block), or decline and rely on Proposal A only. |
| N-3 | AnyDesk listens on every interface and is allowed on Public Wi-Fi. Keep as is, restrict to LAN/Private, or disable. Not changed by this work. |
| N-4 | Services 135, 139, 445 on the LAN address: keep (for other business use) or restrict further. Not changed by this work. |

## 5. Verification plan (after approval, run from the tester's device)

Allowed:
- `https://<owner-host>.<tailnet>.ts.net` loads, and the login page renders.

Denied (each must fail to connect or time out):
- `<tailnet-ip>:445`, `:139`, `:135`, `:80`, `:7070`
- `<tailnet-ip>:5440` (PostgreSQL), `<tailnet-ip>:3200` (application direct)
- `<tailnet-ip>:22`, `:3389` (if any service exists; expected closed)
- Any other tailnet device

The owner records each result in `SECURITY_REMEDIATION_REPORT.md` with the time and the device name. Results are not
recorded as PASS until observed.
