# ADMIN_TESTER Permission Matrix (PROPOSAL, awaiting owner approval)

**Nothing in this document has been granted.** No role, account or permission was created for the remote administrator
tester. Approval is needed before any elevated privilege is given (remediation brief, SEC-004).

## 1. Facts from the database (read-only, 2026-11-18)

- 53 permission codes exist. `MANAGER` holds all 53.
- Existing roles: MANAGER, CUSTOMER_APPROVER, CATALOG_OPERATOR, INVENTORY_OPERATOR, ORDER_OPERATOR, PICKER, CHECKER, PACKER,
  ACCOUNTANT, CONTENT_EDITOR, REPORT_VIEWER. None of them is suitable for a broad tester.
- Editing an existing role would change the permissions of the seeded staff who hold it. That is not acceptable.
- **There is no endpoint to create a new role.** The admin UI can only edit the permissions of existing roles and create a
  staff user with existing roles (`src/app/admin/_components/StaffForm.tsx`, `RoleEditor.tsx`).

## 2. Proposed role: `ADMIN_TESTER` (36 of 53 codes)

Granted: business modules needed for Admin Dashboard testing, with no system ownership.

| Module | Codes granted | Why |
|---|---|---|
| Access | `admin.access` | Enter the admin area (required) |
| Catalog | `catalog.view`, `catalog.manage`, `category.manage`, `image.manage` | Product, category, brand, image tests (UAT-PRD) |
| Pricing | `price.view`, `price.edit` | Tier-price and concurrent price tests |
| Inventory | `inventory.view`, `inventory.adjust`, `inventory.reservation.manage`, `reservation.view` | Stock adjustment and reservation tests |
| Imports | `import.preview`, `import.commit` | Import preview and commit; stale override excluded |
| Customers | `customer.view`, `customer.approve`, `customer.suspend` | Approval, suspension tests (admin side) |
| Orders | `order.view`, `order.edit`, `order.lock_prep`, `order.cancel.approve`, `order.merge.manage` | Order status and cancellation tests |
| Fulfillment | `fulfillment.view`, `fulfillment.assign`, `fulfillment.pick`, `fulfillment.pack`, `fulfillment.check`, `fulfillment.handover`, `fulfillment.discrepancy.resolve`, `fulfillment.print` | Warehouse workflow tests |
| Reports | `report.view`, `report.export` | Report and export tests |
| Audit | `audit.view` | Read-only audit log to verify actor attribution (needed for concurrency tests) |
| Content | `content.edit`, `content.publish` | CMS tests |
| Delivery setup | `shipping.manage`, `courier.manage` | Shipping rules and couriers. **Decision D-3** |

## 3. Withheld (17 codes)

| Code | Reason withheld | Can be granted later? |
|---|---|---|
| `role.manage` | Creates privilege escalation risk; system ownership | No |
| `settings.manage` | System settings; infrastructure-affecting | Owner only |
| `backup.manage`, `backup.restore` | Infrastructure and data-restoration actions | No |
| `integration.view` | WMS contract documentation, not needed for Admin Dashboard tests | Decision D-4 |
| `import.override_stale` | Overrides a safety check on imports (can overwrite newer data) | No |
| `finance.view`, `finance.adjustment.create`, `finance.adjustment.approve`, `finance.allocate`, `finance.fee_payment.record`, `finance.reconcile`, `finance.remittance.record`, `invoice.issue` | Money movement and accounting records | Decision D-2 |
| `customer.edit_commercial` | Changes legal or commercial identity of customers | Decision D-1 |
| `price.level.manage` | Creates or changes price-level definitions | Decision D-1 |
| `notification.send` | Sends internal notifications to staff or customers | Decision D-5 |

## 4. Owner decisions required

| ID | Question | Recommended default |
|---|---|---|
| D-1 | Allow commercial-identity edits and price-level definitions? | No (withheld) |
| D-2 | Allow read-only finance (`finance.view`) for the tester? | No, unless accounting tests are wanted |
| D-3 | Allow shipping and courier configuration? | Yes, for Phase 1 admin tests |
| D-4 | Allow WMS contract documentation view? | No |
| D-5 | Allow internal notification sending? | No, until a notification test is in scope |

## 5. Safeguards for the tester account

- Separate phone number that belongs to the tester (not the owner's, not a seeded one). Not `+9647700…` seeded numbers.
- Independent password, chosen by the tester. Never shared in chat, email or this repository.
- Cannot touch the owner: the owner is protected by the MANAGER-only rule and by `isOwnerAccount` (SEC-004), and customer
  actions refuse staff accounts (`loadCustomer` requires `CUSTOMER`). There is no endpoint that changes staff status.
- Cannot grant itself permissions: `setRolePermissions` and `createStaffUser` refuse anything the actor does not hold
  (SEC-004, tests in `tests/integration/sec-remediation.test.ts`).
- Every denied escalation attempt is written to the audit log as `security.escalation_denied`.

## 6. How the account would be created (after approval)

Requires a new role record, which no existing UI or API creates. Two options, both need your approval:

- **Option A (recommended):** a one-time, insert-only operator script `scripts/create-admin-tester-role.ts` that creates
  the `ADMIN_TESTER` role with exactly the approved codes, writes an audit row, refuses to run if the role exists, and does not
  touch any other role or record. You run it once with `npm run tester-role:create`.
- **Option B:** add a `POST /api/v1/admin/roles` endpoint (a feature change) and create the role in the UI. Larger change.

Then, through the existing UI (`/admin/roles`, "Create staff user"):

1. The owner signs in at `/admin/login`, opens `/admin/roles`, and creates the tester account with the tester's phone and
   a temporary password sent through a secure channel (not in chat).
2. The tester signs in at `/admin/login`, and changes the temporary password at `/account/password`.
3. The owner confirms the account shows status ACTIVE and only the `ADMIN_TESTER` role.

## 7. Approval

- [ ] Matrix approved as written
- [ ] Matrix approved with changes (list): ______
- [ ] Decisions D-1 to D-5 recorded: ______
- [ ] Creation option chosen: A / B
- Owner: ______ Date: ______

## 8. Status update (2026-11-18)

D-1 to D-5 are APPROVED as applied, and D-6 is approved in principle. See DECISIONS_LOG.md for the approval text and the pending AnyDesk proposal. The approved configuration is the one the ADMIN_TESTER role currently holds.
