# Production operations

## Delivery reconciliation

If Telegram accepts a message but the database update fails, the post is marked
`delivery_unknown`. This state is intentionally not retried automatically,
because retrying before checking Telegram can create a duplicate post.

1. Check the channel for the post and note its Telegram message ID.
2. If the message exists, mark the row `delivered` and record `telegramMessageId`.
3. If it does not exist, move the row back to `draft` only after confirming that
   no Telegram delivery occurred, then publish it once from the dashboard.

Example MySQL reconciliation queries:

```sql
SELECT id, title, errorMessage, telegramMessageId, updatedAt
FROM publisher_posts
WHERE deliveryStatus = 'delivery_unknown'
ORDER BY updatedAt ASC;

SELECT publisherPostId, attemptId, status, telegramMessageId, errorMessage,
       startedAt, completedAt
FROM publisher_delivery_attempts
WHERE status = 'delivery_unknown'
ORDER BY startedAt ASC;

UPDATE publisher_posts
SET deliveryStatus = 'delivered', telegramMessageId = '<telegram-message-id>',
    publishedAt = COALESCE(publishedAt, CURRENT_TIMESTAMP), errorMessage = NULL
WHERE id = <post-id> AND deliveryStatus = 'delivery_unknown';
```

The dashboard also exposes these rows under “Deliveries requiring
reconciliation” and the admin API provides `publisher.deliveryUnknown` and
`publisher.reconcileDelivery`. Both paths require an explicit operator choice:
confirm a Telegram message ID or return the post to `draft` after checking that
Telegram did not receive it.

## Multi-replica deployments

The application is designed for one application instance. It can run behind a
load balancer with several replicas, but some state is intentionally
per-process:

- **Scheduler**: `ENABLE_INPROCESS_SCHEDULER=true` starts cron jobs inside the
  process. When running replicas, enable it on **exactly one** replica and set
  it to `false` elsewhere. Publishing state itself lives in MySQL, and the run
  key on `publisher_runs` plus the `draft|held → pending` claim in
  `publishDraft` prevent duplicate posts, but two schedulers would still spend
  duplicate LLM calls on draft generation.
- **Metrics**: `/api/health` reports counters for the process that answered the
  request (`metricsScope: "process"`). They reset on restart and are not summed
  across replicas; scrape each replica or aggregate in your monitoring system.
- **Login rate limiting**: failures are tracked in memory per IP and username.
  With N replicas an attacker gets roughly N attempts per window, so keep the
  dashboard off the public internet or add rate limiting at the reverse proxy.
- **Instance identity**: health and `/api/scheduled/status` return an
  `instanceId` (`hostname:pid` by default). Set `INSTANCE_ID` to a stable value
  per replica so logs and probes are easy to correlate.

## Required deployment settings

- Set `PUBLIC_BASE_URL` to the deployed HTTPS origin before enabling Telegram
  engagement webhooks.
- Keep `ALLOW_PRIVATE_NETWORK_URLS` unset unless a deliberate local/private
  provider or source is required and the deployment is isolated accordingly.
- Run `pnpm check`, `pnpm test`, `pnpm build`, and the Cloudflare typecheck before
  release. `pnpm audit --prod --audit-level high` must pass; the full audit is
  also recorded in CI for development-toolchain advisories.
