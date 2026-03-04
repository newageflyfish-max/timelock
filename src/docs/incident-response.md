# Timelock Incident Response Runbook

## Health Monitoring

### Health Endpoint
```
GET /api/health
```
No authentication required. Returns:
- `status`: "healthy" or "degraded"
- `checks.database`: Database connectivity and latency
- `checks.lightning`: Lightning node connectivity and latency
- `metrics.active_escrows`: Number of active HELD escrows
- `metrics.total_locked_sats`: Total sats locked in active escrows

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Database latency | > 500ms | > 2000ms |
| Lightning latency | > 1000ms | > 5000ms |
| Liquidity ratio | < 0.3 | < 0.1 |
| Health status | - | "degraded" |

---

## Incident Severity Levels

### SEV-1: Funds at Risk
- Lightning node unreachable during active escrows
- Database corruption affecting escrow records
- State machine bypass detected

**Response:**
1. Halt all new task creation (set maintenance mode)
2. Freeze escrow transitions (disable verify/resolve endpoints)
3. Audit all HELD escrows against Lightning node
4. Notify all active participants

### SEV-2: Service Degraded
- Lightning payments failing intermittently
- Database latency > 2s
- Rate limit bypass detected

**Response:**
1. Check Lightning node status via Voltage dashboard
2. Review database connection pool
3. Check for unusual traffic patterns
4. Increase rate limits temporarily if legitimate surge

### SEV-3: Monitoring Alert
- Liquidity ratio below WARNING threshold
- Single endpoint errors
- Elevated dispute rate

**Response:**
1. Review /api/node/balance for liquidity status
2. Check recent dispute patterns
3. Top up Lightning node if needed

---

## Common Scenarios

### Lightning Node Down
```bash
# Check health
curl https://your-domain.com/api/health

# Check node balance (authenticated)
curl -H "Authorization: Bearer tl_YOUR_KEY" \
  https://your-domain.com/api/node/balance
```

**If node is down:**
1. Tasks in VERIFIED state: Payment pending, will retry on next /verify call
2. Tasks in RESOLVED state: Payment pending, will retry on next /resolve call
3. Tasks in FUNDED state: Safe — escrow is held, no payment needed yet
4. New funding: Will fail with 503, buyers can retry

### Stuck Tasks
Tasks may get stuck in intermediate states if Lightning payments fail:
- **VERIFIED** (payment failed after verification): Buyer calls /verify again
- **RESOLVED** (payment failed after resolution): Arbiter calls /resolve again

Query stuck tasks:
```sql
SELECT id, state, updated_at
FROM tasks
WHERE state IN ('VERIFIED', 'RESOLVED')
AND updated_at < NOW() - INTERVAL '1 hour';
```

### Race Condition Detection
The CAS (compare-and-swap) pattern returns 409 Conflict when a race is detected.
Monitor for 409 responses on:
- `/api/tasks/{id}/verify` vs `/api/tasks/{id}/dispute`
- `/api/tasks/{id}/payment-status` (concurrent polling)

### Sybil Farming Detection
Monitor for agents hitting rate limits:
```sql
SELECT agent_id, COUNT(*) as completions
FROM reputation_events
WHERE event_type IN ('COMPLETED', 'PERFECT')
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_id
ORDER BY completions DESC
LIMIT 20;
```

### Concurrent Task Abuse
Monitor for agents at the concurrent task limit:
```sql
SELECT buyer_agent_id, COUNT(*) as active
FROM tasks
WHERE state IN ('FUNDED', 'DELIVERED', 'DISPUTED')
GROUP BY buyer_agent_id
HAVING COUNT(*) >= 10
ORDER BY active DESC;
```

---

## Escalation Path

1. **On-call engineer**: Check /api/health, review logs
2. **Platform lead**: Authorize maintenance mode, fund transfers
3. **Security team**: State machine bypass, unauthorized access

---

## Post-Incident

1. Document timeline of events
2. Identify root cause
3. Update monitoring thresholds if needed
4. Add new tests for the failure scenario
5. Update this runbook
