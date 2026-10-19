# Creator partnerships

Physical figure purchases support referral links and a creator code selected in the purchase dialog before an order is created. Pro subscriptions are outside this feature.

## Global figure promotion

In `/figure/manage`, choose **Global figure discount / 全局手办优惠** to set the percentage off all new physical figure orders. The migration initializes it to **50% off**. Enter **0** to disable it; supported values are 0–99% with up to two decimal places. The MCModal print entry and print-page purchase button read the saved public catalog; the purchase button shows the original and reduced prices.

The server first rounds the global discount on the product subtotal to cents, then applies the creator percentage to the remaining subtotal. For example, $100 with 50% global savings and a 10% creator code costs $45 plus shipping. Commission uses the final $45 product amount. Checkout and order history show both savings separately.

Orders snapshot the global percentage and configuration version as well as the creator offer. Changing a promotion never reprices an existing order. New cart additions only merge with the same saved promotion and creator offer; deleting items recalculates using those saved percentages. A PayPal voucher locks global-discounted items even when no creator code is present. If the global configuration changes after a quote, checkout requests a fresh quote before creating an order.

Deploy backend migration `b8e17d930a42` (following `a6d3e9f127c8`) and the matching backend before the frontend. Run `alembic upgrade head` in the normal deployment environment. The migration activates 50% savings for new orders and leaves historical totals and rates unchanged. Admin configuration uses `GET/PATCH /api/figure/models/discount`; the patch requires `discount_bps` and `expected_version`. Regression coverage is in backend `tests/test_figure_discounts.py` and the frontend figure suites.

## Configure a partnership

Sign in as an administrator, open `/figure/manage`, and choose **Creator partners / 主播合作**. Create a unique code with the creator's **registered email**, customer discount percentage, commission percentage, optional expiry, and active status. Percentages are explicit inputs; there are no seeded partnerships or rates. Codes contain 2–32 letters, digits, underscores, or hyphens and are normalized to uppercase. Codes cannot be renamed or deleted; deactivate an old partnership.

The email must belong to an existing account. Saving the code marks that account as a creator and adds **Creator commissions / 主播佣金** to its user menu after refreshing account information. One creator can own several codes. A bound code's owner cannot be changed, so historical earnings cannot move between accounts. Creators cannot use their own codes for purchases or acquire themselves.

Legacy codes remain stored but cannot issue new discounts until an administrator edits each code and binds its registered email. This also associates its historical orders with that account, excluding self-purchase commission. Old display names are retained only for database compatibility; they are neither accepted nor exposed.

Copy the generated `/figure/3dprint?ref=CODE` link. A public skin can be included as `/figure/3dprint?id=PUBLIC_SKIN_ID&ref=CODE`. Shared skin IDs are resolved anonymously and must remain public. Private skins are never loaded from a shared URL.

## Attribution and checkout

- A valid referral visit issues a server-signed receipt with a 30-day lifetime. The browser stores it until login or checkout binds it to the account. Replaying a receipt does not extend its expiry. Invalid links do not replace a valid source. This expiry only limits the initial binding request; it does not expire a source already bound to an account.
- The first bound source remains available for acquisition reporting. A later valid referral visit updates the account's default. The bound default persists indefinitely, including for accounts whose old 30-day attribution window has elapsed. Expired or deactivated creator codes are not applied by default.
- The purchase dialog defaults to the account's source code. Customers can apply another code or remove it. This changes only the current order, not account attribution. An invalid replacement preserves the current discount. Only one creator code can apply to an order.
- Adding to the cart or using Buy Now fixes the order's creator code and discount rates immediately, including the choice to use no code. Existing orders cannot add, replace or remove a code. Cart additions with the same offer snapshot can merge; different codes create separate orders. Removing items before payment recalculates the discount using the saved rates without changing attribution. Creating a PayPal checkout voucher also locks discounted order items for that payment, including retries.
- The server calculates all prices, discounts, and commissions. Discounts apply to the product subtotal. Commission uses the discounted product subtotal and excludes shipping. Values are rounded to cents. Each order stores a snapshot of its creator account, code and rates; later configuration changes do not rewrite old orders.
- Changing a partnership after a quote requires a fresh quote before ordering. Deactivation or expiry prevents starting a new PayPal voucher; an existing voucher keeps its original amount and attribution.

## Creator reporting

The admin page shows original-source users, attributed orders, paid product sales, pending commission, and eligible commission. Eligible commission requires a completed order whose payment is at least 3 days old. Refunded, refund-pending, canceled, and rejected orders are excluded from earnings.

These per-code admin figures are cumulative. The creator's `/creator` page combines all their codes into a withdrawal balance using integer USD cents. It shows available, pending, reserved and paid amounts, plus paginated referred users, orders and withdrawals (20 per page; API maximum 100). User and order records are scoped to the signed-in creator, expose masked emails and stable creator-specific references, and omit names, addresses, phone numbers and internal customer/order IDs. User acquisition follows the original source; order commission follows that order's selected code, including a checkout override.

## Withdrawals and PayPal

A creator submits an amount and a PayPal email, then confirms both before creating a request. The amount is immediately reserved. Requests and balance checks lock the creator account to prevent simultaneous withdrawals from spending the same balance. A stable request UUID makes retries idempotent. Rejection releases the reservation; approval records the administrator and starts a PayPal Payouts transfer. Both actions and later payment status changes appear in the withdrawal history. Admin approval also requires confirmation of the amount and recipient.

Configure the backend's existing `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, and `PAYPAL_API_BASE` for a PayPal account with Payouts access and sufficient funds. Then explicitly set `PAYPAL_PAYOUTS_ENABLED=true`. It defaults to false: requests and review records work, but approval cannot initiate a transfer until enabled. PayPal requires Payouts access independently of checkout integration; validate in sandbox before enabling the live account. Fees are paid by the sending business. See [PayPal Payouts](https://developer.paypal.com/api/payouts) and [Payouts troubleshooting](https://developer.paypal.com/payouts/troubleshooting).

Run `python background_service.py` with the normal database and Redis settings. It reconciles due transfers every 30 seconds with backoff, and checks paid transfers daily for returns. Existing signature-verified PayPal webhooks can accelerate this by scheduling a lookup; polling works without payout webhook subscriptions.

The same payout always uses the same sender batch ID and request ID. Batch success alone does not count as payment: the item must confirm success with the correct recipient, amount, currency and sender identity. Processing, unclaimed, on-hold and uncertain payments stay reserved. Confirmed failure or return releases the amount. A timeout never releases funds, and a later rejection cannot disprove an earlier uncertain submission. Without a recovered batch ID, retries stop before PayPal's 30-day deduplication window expires and the request is held for manual investigation. The admin sync action can re-check a known batch; it cannot create a new transfer for an unresolved old submission. Do not manually mark uncertain transfers failed or issue replacement payouts without reconciling them in PayPal first.

Refunds after payout create a balance adjustment deducted from future earnings. This does not automatically recover money from the recipient. Historical manual payouts, if any, must be reconciled before enabling withdrawals; this feature cannot infer transfers never recorded in the application.

## Deployment and verification

The matching changes are in the sibling `entropydrop_backend` repository. Deploy the database migration and backend before this frontend. Long-term account defaults still ignore `current_expires_at` after binding. Creator accounts and withdrawals require migration `a6d3e9f127c8`, following `f4a92b6d013e`. The 3-day withdrawal eligibility period is separate from attribution.

1. With the backend's normal deployment environment and database configured, run `alembic upgrade head`. The migrations add creator tables, account flags, order ownership/commission cents and payout audit tables without changing old totals.
2. Deploy the backend including `creator_payouts.py`, `paypal_payouts.py`, the creator/auth/order/webhook routes, and the background service. Restart workers.
3. Build/deploy the frontend and bind partnership codes to registered accounts.
4. Verify the complete flow in PayPal sandbox before enabling live transfers.

Backend endpoints live under `/api/creators` (also the existing `/skin` alias): `POST /visit`, authenticated `POST /referral` and `POST /quote`, and admin-only `GET /manage` / `PUT /manage/{code}`. The legacy `PATCH /api/orders/{id}/creator-code` endpoint rejects changes with `409 creator_code_locked`; select the code when creating the order. Creator reporting uses `GET /me`, `/me/users`, `/me/orders`, and `/me/payouts`; withdrawal requests use `POST /me/payouts`. Admins use `GET /manage/payouts` and `POST /manage/payouts/{id}/review` (`approve`, `reject`, or `sync`).

Frontend checks: `npm run test:figure`, `npm run test:architecture`, and `npm run build:site`. Backend coverage is in `tests/test_creator_referrals.py` and `tests/test_creator_payouts.py`, alongside the existing auth, order, PayPal, fulfillment, and webhook suites. Use the isolated test environment; do not run test migrations against production.
