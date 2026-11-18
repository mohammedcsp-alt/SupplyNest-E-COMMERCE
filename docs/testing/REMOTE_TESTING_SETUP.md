# Remote UAT Setup (Tailscale)

Private collaborative testing of SupplyNest B2B-STORE from two locations, on the owner's Windows computer.

**Status (2026-11-18): NOT YET LIVE.** The local application and database are running and healthy. Remote access requires
two tailnet-admin steps that only the owner can perform (see section 4). Until those are done, the remote URL below does
not work and must not be given to the tester.

## 1. Network architecture

```
Tester browser (other location, Tailscale installed, logged in as invited user)
        |  HTTPS 443, WireGuard-encrypted tailnet path
        v
Tailscale Serve on owner PC   https://<owner-host>.<tailnet>.ts.net  (tailnet-only, NOT Funnel)
        |  HTTP, loopback only
        v
Next.js app (server.mjs)      http://127.0.0.1:3200
        |  loopback only
        v
PostgreSQL 16 (Docker)        127.0.0.1:5440 -> container 5432   (never exposed)
```

- The application listens on `127.0.0.1` only (`server.mjs`). Nothing listens on a LAN or public interface.
- Port 5440 (PostgreSQL) is bound to `127.0.0.1` by Docker. It is not reachable by the tester.
- No port forwarding, no router changes, no public tunnel, no reverse proxy on the internet.
- Tailscale Funnel is NOT used and must stay off. `tailscale funnel status` must report no active funnel.

## 2. Exact URLs

| Purpose | URL | Reachable by |
|---|---|---|
| Local (owner, this PC) | http://127.0.0.1:3200 | This computer only |
| Local admin dashboard | http://127.0.0.1:3200/admin | This computer only |
| Remote tester (private) | https://<owner-host>.<tailnet>.ts.net | Invited tailnet user, after activation |
| Remote admin dashboard | https://<owner-host>.<tailnet>.ts.net/admin | Owner account only (role check is server-side) |
| Customer login | `/login` on either base URL | Anyone with access |
| Staff/admin login | `/admin/login` on either base URL | Staff accounts |

The tailnet hostname is `<owner-host>.<tailnet>.ts.net`, taken from `tailscale status --json` (Self.DNSName).

## 3. Current status (verified 2026-11-18)

| Item | Status | Evidence |
|---|---|---|
| Tailscale installed and logged in | Yes, version 1.104.7, Online | `tailscale status` |
| Tailnet IP of this PC | <tailnet-ip> | `tailscale status --json` |
| Other tailnet devices | None yet (only this PC) | `tailscale status` |
| Tailscale Serve | **Not enabled** (tailnet admin must enable it) | `tailscale serve --bg 3200` returned "Serve is not enabled on your tailnet" |
| Tailscale Funnel | Off | `tailscale funnel status` reports no serve config |
| App on 127.0.0.1:3200 | UP (HTTP 200 on /api/health) | `scripts\status-local.ps1` |
| PostgreSQL on 127.0.0.1:5440 | Accepting connections | `pg_isready` in container |
| Scheduled task B2B-STORE-Supervisor | Installed and running | `Get-ScheduledTask` |
| Windows Firewall inbound rules for 3200/5440 | None created by this project. Pre-existing "World Wide Web Services" allow rules exist for 443 only; nothing listens on 443 locally | `Get-NetFirewallRule` (partial; some queries need admin) |

## 4. Steps the owner must do (cannot be done by the assistant)

1. **Enable Tailscale Serve for the tailnet.** Open the link printed by the CLI, sign in as the tailnet admin, and enable
   HTTPS certificates / Serve (link: `https://login.tailscale.com/f/serve?node=<node-id>`). Then run:
   ```
   tailscale serve --bg 3200
   tailscale serve status
   ```
   Expected output includes `https://<owner-host>.<tailnet>.ts.net` proxying to `http://127.0.0.1:3200`.
2. **Invite the tester** in the Tailscale admin console (Users > Invite external users). Use the tester's own email. Do not
   share a login or an auth key.
3. **Restrict access (ACL policy)** in the admin console (Access controls). Recommended minimal rule, granting only HTTPS
   on this PC to the tester and nothing else:
   ```json
   {
     "grants": [
       { "src": ["autogroup:admin"], "dst": ["*"], "ip": ["*"] },
       { "src": ["<tester-email>"], "dst": ["<owner-host>"], "ip": ["tcp:443"] }
     ]
   }
   ```
   Notes:
   - Replace `<tester-email>` with the invited user's email. Keep the owner's own rule so the owner keeps full access.
   - Tailscale's default policy allows every device to reach every other device. If the default `*` grant still exists,
     remove it or replace it with the rules above, otherwise the tester can reach ports other than 443 on this PC
     (including 5440 and any other local service). Tailscale ACLs cannot be verified by the assistant, so the owner should
     check this in the admin console.
   - Do not add the tester to any group that grants access to other devices.
   - **Important:** this PC currently has other services listening on its Tailscale address and LAN address, including
     SMB (445), NetBIOS (139), RPC (135), HTTP (80) and AnyDesk (7070). They are not part of SupplyNest and were not
     changed. The ACL above (port 443 only) is what keeps the tester away from them. Do not grant the tester `tcp:*`,
     `*`, or any port other than 443. See `UAT_BUG_REGISTER.csv`, BUG-SEC-003.
4. **Keep Funnel off.** Do not run `tailscale funnel`.
5. Tell the assistant when steps 1-3 are done. The assistant will then verify the URL, the Origin/CSRF behaviour and the
   access restriction from this PC.

## 5. Access instructions for the remote tester (send only after activation)

1. Install Tailscale from https://tailscale.com/download and sign in with the invitation email. Accept the invitation.
2. Open **https://<owner-host>.<tailnet>.ts.net** in a browser while Tailscale is connected.
3. Register a customer account (phone number and name). This is a **synthetic test environment**: use a fake phone number,
   for example one that is not used by a real person. Do not enter real customer or payment data.
4. The verification code is shown on the screen as **"DEV CODE (mock provider, development only)"**. No SMS is sent.
5. Wait for the owner to approve the account (status APPROVAL_PENDING until approved), then log in.
6. Do not try to access `/admin` pages with a customer account; you should see access denied. Report anything else.
7. Use the test plan in `docs/testing/UAT_TEST_PLAN.md` and record results in `docs/testing/UAT_TEST_CASES.csv` or
   report bugs in `docs/testing/UAT_BUG_REGISTER.csv`.
8. Never share your credentials, and never try to reach any other device or port on the owner's computer.

Do not send the owner account credentials to the tester.

## 6. Security posture of this setup

- The remote path is HTTPS (Tailscale Serve certificate) on the tailnet only.
- Session cookies: `HttpOnly`, `SameSite=Lax`, `Path=/`. The `Secure` flag is set only when `NODE_ENV=production`
  (`src/lib/session.ts`). Because this environment runs in development mode, cookies are not marked `Secure`. The
  transport is still encrypted by Tailscale Serve. See `SECURITY_CHECKLIST.md`, item S-06.
- State-changing API calls check `Origin` against `x-forwarded-host` / `host` (`src/lib/api.ts`). This must be verified
  through Serve (see `SECURITY_CHECKLIST.md`, item S-03).
- The mock OTP provider is only permitted when `NODE_ENV` is not `production` and `OTP_PROVIDER=mock`. Production startup
  refuses mock OTP (`src/lib/config.ts`, `assertProductionSafe`). No code was changed to relax this.
- No payment provider and no email/SMS sender is configured. Orders are cash-on-delivery records only.

## 7. Rollback

- Remove remote access at any time:
  ```
  tailscale serve reset
  ```
  This stops the HTTPS proxy. Local access at http://127.0.0.1:3200 is unaffected.
- Remove the tester from the tailnet in the admin console, or delete the ACL grant.
- Stop the whole stack: `powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1`.

## 8. Related documents

- `docs/testing/STARTUP_AND_RECOVERY.md`: startup, restart and recovery.
- `docs/testing/SECURITY_CHECKLIST.md`: security verification.
- `docs/testing/UAT_TEST_PLAN.md`, `UAT_TEST_CASES.csv`, `UAT_BUG_REGISTER.csv`, `UAT_ACCEPTANCE_CRITERIA.md`.
- `OPERATIONS.md` (section 8), `README.md`, `scripts/` (existing supervisor and start/stop scripts).
