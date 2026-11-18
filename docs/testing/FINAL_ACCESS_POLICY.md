# Final Access Policy (PROPOSAL: NOT APPLIED, awaiting owner approval)

Nothing here has been applied. The tailnet ACL is changed only in the Tailscale admin console (owner). The firewall rules need an elevated PowerShell (owner).

## 1. Tailscale ACL (grants)

Replace only the `grants` (and add `tests`). Keep every other section (`ssh`, `nodeAttrs`, `tagOwners`, `autoApprovers`, `groups`, `hosts`) unchanged.

Current state: the tailnet shows one device, `<owner-host>` (this PC). No other device needs preserving. If the policy editor shows other devices, add a grant for each before saving.

```json
{
  "grants": [
    { "src": ["<owner-tailnet-login>"], "dst": ["*"], "ip": ["*"] },
    { "src": ["<friend-tailnet-login>"], "dst": ["<tailnet-ip>"], "ip": ["tcp:443"] }
  ],
  "tests": [
    {
      "src": "<friend-tailnet-login>",
      "accept": ["<tailnet-ip>:443"],
      "deny": [
        "<tailnet-ip>:22", "<tailnet-ip>:80", "<tailnet-ip>:135", "<tailnet-ip>:139", "<tailnet-ip>:445",
        "<tailnet-ip>:3200", "<tailnet-ip>:3389", "<tailnet-ip>:5440", "<tailnet-ip>:7070"
      ]
    }
  ]
}
```

- **Owner (`<owner-tailnet-login>`):** all devices, all ports. Your access is unchanged.
- **Friend (`<friend-tailnet-login>`):** TCP 443 on `<tailnet-ip>` only (Tailscale Serve HTTPS). Nothing else.
- **Before saving:** remove any `"src": ["*"]` grant. Tailscale's default allow-all would give the friend everything.
- **Check:** use *Preview rules* and the `tests` block in the editor. Save only if the tests pass.

## 2. Windows Firewall: proposed rules (NOT applied)

Scope and effect:
- Inbound only, on interface alias `Tailscale` only, with remote address limited to the tailnet ranges `100.64.0.0/10` and `fd7a:115c:a1e0::/48`.
- The `Any` profile is used so the rules apply whichever network profile the Tailscale adapter uses.
- LAN and Wi-Fi traffic is not matched. Existing allow rules are not edited or removed.
- TCP 443 (Serve) is not blocked. ICMP is not blocked.

Rule set (run in an **elevated** PowerShell):

```powershell
$remote = "100.64.0.0/10","fd7a:115c:a1e0::/48"
$tcp = 22, 80, 135, 139, 445, 2869, 3200, 3389, 5040, 5130, 5357, 5440, 6772, 7070
foreach ($p in $tcp) {
  New-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block TCP $p" -Direction Inbound -Protocol TCP -LocalPort $p `
    -InterfaceAlias "Tailscale" -RemoteAddress $remote -Action Block -Profile Any -Enabled True | Out-Null
}
$udp = 137, 138, 5355
foreach ($p in $udp) {
  New-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block UDP $p" -Direction Inbound -Protocol UDP -LocalPort $p `
    -InterfaceAlias "Tailscale" -RemoteAddress $remote -Action Block -Profile Any -Enabled True | Out-Null
}
Get-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block*" | Select-Object DisplayName, Enabled, Action | Format-Table -AutoSize
```

Rollback (removes only these rules, nothing else):

```powershell
Get-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block*" | Remove-NetFirewallRule
```

| Rule name | Protocol and port | Interface | Remote scope | Action | Purpose |
|---|---|---|---|---|---|
| SupplyNest-Tailnet-Block TCP 22 | TCP 22 | Tailscale | Tailnet ranges | Block | SSH (not in use; defence in depth) |
| SupplyNest-Tailnet-Block TCP 80 | TCP 80 | Tailscale | Tailnet ranges | Block | HTTP (System) |
| SupplyNest-Tailnet-Block TCP 135 | TCP 135 | Tailscale | Tailnet ranges | Block | RPC endpoint mapper |
| SupplyNest-Tailnet-Block TCP 139 | TCP 139 | Tailscale | Tailnet ranges | Block | NetBIOS session |
| SupplyNest-Tailnet-Block TCP 445 | TCP 445 | Tailscale | Tailnet ranges | Block | SMB |
| SupplyNest-Tailnet-Block TCP 2869 | TCP 2869 | Tailscale | Tailnet ranges | Block | UPnP/SSDP-type |
| SupplyNest-Tailnet-Block TCP 3200 | TCP 3200 | Tailscale | Tailnet ranges | Block | App (127.0.0.1 only; defence in depth) |
| SupplyNest-Tailnet-Block TCP 3389 | TCP 3389 | Tailscale | Tailnet ranges | Block | RDP (not in use; defence in depth) |
| SupplyNest-Tailnet-Block TCP 5040 | TCP 5040 | Tailscale | Tailnet ranges | Block | Related service |
| SupplyNest-Tailnet-Block TCP 5130 | TCP 5130 | Tailscale | Tailnet ranges | Block | Print spooler |
| SupplyNest-Tailnet-Block TCP 5357 | TCP 5357 | Tailscale | Tailnet ranges | Block | WSD |
| SupplyNest-Tailnet-Block TCP 5440 | TCP 5440 | Tailscale | Tailnet ranges | Block | PostgreSQL (127.0.0.1 only; defence in depth) |
| SupplyNest-Tailnet-Block TCP 6772 | TCP 6772 | Tailscale | Tailnet ranges | Block | NiceLabel proxy |
| SupplyNest-Tailnet-Block TCP 7070 | TCP 7070 | Tailscale | Tailnet ranges | Block | AnyDesk |
| SupplyNest-Tailnet-Block UDP 137 | UDP 137 | Tailscale | Tailnet ranges | Block | NetBIOS name |
| SupplyNest-Tailnet-Block UDP 138 | UDP 138 | Tailscale | Tailnet ranges | Block | NetBIOS datagram |
| SupplyNest-Tailnet-Block UDP 5355 | UDP 5355 | Tailscale | Tailnet ranges | Block | LLMNR |

### Impact

- **Existing LAN services:** no change. The rules match only the Tailscale interface.
- **SMB (445, 137–139):** file sharing is unchanged on the LAN and Wi-Fi. **From any tailnet device, including your own,** SMB to this PC stops working. Use the LAN address to reach shares from home.
- **AnyDesk (7070):** unchanged on the LAN and Wi-Fi. **From any tailnet device** it stops working. AnyDesk still listens on every interface, so the LAN and public Wi-Fi exposure remains until you decide on it (D-6 below).
- **Printing (5040, 5130, 5357):** unchanged on the LAN. Tailnet printing stops.
- **SupplyNest:** Serve on 443 is unaffected. The friend's HTTPS login works.

## 3. Decisions D-1 to D-5 (applied defaults are NOT approval)

| ID | Description | Current applied default | Recommended option | Security and functional impact | Alternatives |
|---|---|---|---|---|---|
| D-1 | Commercial-identity edits (`customer.edit_commercial`) and price-level definitions (`price.level.manage`) | Withheld | Withheld | Granting lets the tester change legal identity or the pricing structure for all customers. Those records are not needed for Admin Dashboard testing. | Grant one or both if you want those screens tested |
| D-2 | Read-only finance (`finance.view`); all finance write codes and `invoice.issue` stay withheld | Withheld | Withheld | Read-only access exposes financial records. Write codes allow money changes, so they stay withheld in every option. | Grant `finance.view` only |
| D-3 | Shipping rules and courier setup (`shipping.manage`, `courier.manage`) | Granted | Granted | Changes delivery fees and courier setup, which affects how orders price. Testing requires this. Changes are audited. | Withhold to block all delivery configuration |
| D-4 | WMS contract documentation (`integration.view`) | Withheld | Withheld | Read-only documentation, no live integration. Not needed for Admin Dashboard tests. | Grant for read-only documentation |
| D-5 | Internal notification sending (`notification.send`) | Withheld | Withheld | Lets the tester message staff. There is no customer SMS in this build. | Grant to test the notification screen |

Decision D-6 (not in your list, raised by this review): AnyDesk on port 7070 listens on every interface, including public Wi-Fi.
Recommended: restrict AnyDesk to the Private profile, or disable it when not in use. Impact: remote support sessions from
outside would need the Private network or a manual start. This is not changed by the proposed rules.

## 4. Status (verified at the time of this review)

| Item | Status |
|---|---|
| Owner account | ACTIVE, STAFF, role MANAGER only (53 of 53 permissions). Registered in `owner.account`. |
| <tester-name>'s Admin Tester account | **Exists.** ACTIVE, STAFF, role ADMIN_TESTER only. Created by the owner at 17:23 UTC (audit row: `staff.create`, actor = owner). **Not yet used**: no login recorded, password unchanged since creation. |
| `TAILNET_ALLOWED_USERS` | `<owner-tailnet-login>,<friend-tailnet-login>` (owner and friend). Applied; app restarted. |
| Private HTTPS access | Serve active, tailnet only: `https://<owner-host>.<tailnet>.ts.net` → `127.0.0.1:3200`. Funnel off. Verified from this PC. |
| Tailnet ACL | **Not applied.** Cannot be read or changed from this PC. |
| Firewall rules | **Not applied.** Need an elevated PowerShell and your approval. |
| Friend's device | **Not on the tailnet yet** (only this PC is listed). Network verification from their device is pending. |
| Shared UAT database | `b2b_store_dev` (used by the app). Contains seeded synthetic accounts, a few test probes, the owner, and the tester. Not the test DB. |
| Automated test database | `b2b_store_test` (used by `.env.test` and the test suites). Separate from the dev DB. |
| Application startup and recovery | Restarted with `stop-local.ps1` and `start-local.ps1`. Local health, catalog and login: 200. HTTPS health and login: 200. Database accepting connections. Supervisor running. Scheduled task installed. |

## 5. Manual actions (execution order)

1. **Owner, Tailscale admin console:** invite `<friend-tailnet-login>` (if not already invited).
2. **Owner, Tailscale admin console:** replace the grants with section 1. Remove any `*` grant. Run the `tests` block. Save.
3. **Owner, elevated PowerShell:** approve the firewall rules (section 2), then run the rule block. Tell me when done, and I will verify.
4. **Friend:** install Tailscale, accept the invitation and sign in as `<friend-tailnet-login>`.
5. **Friend:** open `https://<owner-host>.<tailnet>.ts.net/login?portal=admin`, sign in with `<tester-phone>` and the temporary password sent by the owner.
6. **Friend:** open `https://<owner-host>.<tailnet>.ts.net/account/password` and set a new password (10+ characters, letters and digits). You are then signed out and sign in again.
7. **Friend:** run the port checks in section 6 and send the results to the owner.
8. **Both:** Phase 1 begins once steps 1 to 7 pass. Phase 2 begins only when both administrators are signed in at the same time.

## 6. Verification (friend's device; record time and result)

| Target | Expected |
|---|---|
| `https://<owner-host>.<tailnet>.ts.net/login?portal=admin` | Loads |
| `<tailnet-ip>:443` (TCP) | Connects |
| `<tailnet-ip>` ports 22, 80, 135, 139, 445, 3200, 3389, 5440, 7070 | Refused or timed out |
| Any other tailnet device | Not reachable |

PowerShell on the friend's device: `Test-NetConnection -ComputerName <tailnet-ip> -Port 445`. Expected: `TcpTestSucceeded : False`.

## 7. Not done

No ACL, firewall, or Windows change has been applied. No commit or push. No Funnel. No public exposure. No database reset.
No customer testing. Phase 1 and Phase 2 have not started, because the friend is not yet connected from their own device.
