# UAT Acceptance Criteria

The collaborative environment is accepted for private UAT when every criterion in section 1 is met and the open items in
section 3 are accepted by the owner. Nothing here is claimed as passed until the test is actually run.

## 1. Go / no-go criteria for each stage

### 1.1 Remote access (Phase 1)

| ID | Criterion | Evidence |
|---|---|---|
| AC-R1 | `https://<owner-host>.<tailnet>.ts.net` loads from a tailnet device other than the owner PC | Screenshot or `curl` result from the tester device |
| AC-R2 | `tailscale funnel status` reports no public serve | Command output |
| AC-R3 | The tester can reach only port 443 on the owner PC (ACL) | Owner ACL screenshot; UAT-SEC-006 result |
| AC-R4 | `http://127.0.0.1:3200` still works on the owner PC | `status-local.ps1` |
| AC-R5 | The application is not reachable directly on the tailnet or LAN IP | UAT-SEC-007 result |

### 1.2 Security (Phase 5, and a light check at Phase 2)

| ID | Criterion | Evidence |
|---|---|---|
| AC-S1 | Customer gets 401 or 403 on every admin API and admin page | UAT-SEC-001, UAT-SEC-002 |
| AC-S2 | Cross-origin write requests are rejected through the tailnet URL | UAT-SEC-003 |
| AC-S3 | No customer can read or change another customer's data | UAT-SEC-005, UAT-ORD-011 |
| AC-S4 | No secrets appear in responses, docs or pages | Review of responses for keys, passwords, DB URLs |
| AC-S5 | Mock OTP cannot run in production | Code review (S-48); production start refuses mock OTP |
| AC-S6 | Security headers are present through the tailnet URL | UAT-SEC-011 |

### 1.3 Functional (Phase 3)

| ID | Criterion |
|---|---|
| AC-F1 | Every P1 test in `UAT_TEST_CASES.csv` in the Authentication, Customer management, Product management and Orders modules is PASS, or has a logged bug accepted by the owner |
| AC-F2 | A new customer can register, verify with DEV CODE, be approved and log in, without developer help |
| AC-F3 | An order placed by the tester is visible to the owner in /admin/orders and the status updates reach the tester |
| AC-F4 | Price visibility matches the assigned price level for two different customers |

### 1.4 Concurrency (Phase 4)

| ID | Criterion |
|---|---|
| AC-C1 | Two customers racing for the last unit: exactly one order succeeds; stock never goes negative (UAT-CON-001) |
| AC-C2 | Duplicate submit creates one order (UAT-ORD-006, UAT-CON-004) |
| AC-C3 | Simultaneous sessions do not share data (UAT-CON-003) |

### 1.5 Reliability (Phase 6)

| ID | Criterion |
|---|---|
| AC-L1 | After the Node process is killed, the app is back within 5 minutes without anyone starting it manually (UAT-REL-001) |
| AC-L2 | After the database container is stopped and started, no data is lost (UAT-REL-002, UAT-REL-007) |
| AC-L3 | After Tailscale reconnects, the tester can resume (UAT-REL-004) |
| AC-L4 | After a Windows restart and sign-in, the stack and remote URL return without manual steps (UAT-REL-006), only with owner approval |
| AC-L5 | Claude Code and VS Code can be closed and the app keeps running (verify by closing both, then checking `status-local.ps1` and the tailnet URL) |

## 2. Non-negotiable constraints (must remain true at sign-off)

- No database reset, no destructive migration, no deletion of records, no deletion of Docker volumes.
- No public exposure. Funnel is off.
- No broad firewall exceptions.
- No secrets, credentials or phone numbers committed to git.
- No weakening of access control or session security.
- Owner credentials never shared.

## 3. Known open items the owner must accept or fix before sign-off

| Item | Ref | Owner decision needed |
|---|---|---|
| Tailscale Serve not yet enabled | BUG-REM-001 | Owner action |
| Client-supplied X-Forwarded-For can bypass IP rate limits | BUG-SEC-001 | Accept for private UAT, or approve a fix |
| Secure cookie flag off in dev mode | BUG-SEC-002 | Accept for private UAT (transport is HTTPS via Serve) |
| Other services listening on the tailnet and LAN IPs (SMB, NetBIOS, AnyDesk) | BUG-SEC-003 | Review firewall and AnyDesk; ACL mitigates for the tester |
| Dev-mode server with hot reload | BUG-ENV-001 | Accept, or approve a separate process strategy |
| Sign-in needed after reboot | BUG-ENV-002 | Accept, or configure auto-logon (not recommended) |

## 4. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| System Owner | | | |
| Remote Tester | | | |
