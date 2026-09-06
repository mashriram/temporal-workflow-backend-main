# Certificate configuration reference workflow

The concrete acceptance test for `goal.md` §3.9 / `implementation.md` §8:
register Encrypt/Decrypt certs, push to JWKS, register Verify, then pause
and require a human to confirm with a partner outside the system and
upload proof before Sign is ever registered.

```
[trigger] -> [http: check enc/decrypt cert present?]
   -> (yes) [http: register Encrypt] -> [http: clone access] -> [http: push to JWKS]
   -> (yes, sign/verify present) [http: register Verify]
        -> [hitl_approval: "Confirm Sign cert upload with partner", requireProofUpload: true]
        -> [http: register Sign] -> [http: push Sign to JWKS]
   -> [end]
```

No real PKI/JWKS backend exists in dev, so `mock-cert-management-api.js`
stands in for it — a plain Node HTTP server that logs every call and
returns canned responses (`present: true` for both cert types, so the
full chain executes). Point the workflow's `make_http_call` URLs at a
real cert-management API's Table/REST endpoints for a production run.

## Running it

Prereqs: dockerized Postgres + Temporal running (see the top-level
`docker-compose.yml`), backend and engine both booted against it.

```bash
# 1. Start the mock cert-management API
node examples/mock-cert-management-api.js &

# 2. Create the workflow definition, capture its generated workflowId
curl -s -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{"name":"Certificate Configuration Reference","nodes":[],"edges":[]}'
# -> note the "workflowId" field in the response

# 3. Substitute that workflowId into examples/certificate-configuration-reference-workflow.json
#    (replace "REPLACE_WITH_WORKFLOW_ID_FROM_CREATE_RESPONSE"), then deploy it
curl -s -X POST http://localhost:3000/api/workflows/deploy \
  -H "Content-Type: application/json" \
  -d @examples/certificate-configuration-reference-workflow.json

# 4. Trigger a run
curl -s -X POST http://localhost:3000/api/webhooks/<workflowId> \
  -H "Content-Type: application/json" -d '{}'
# -> note the "runId" field in the response

# 5. It will pause at the HITL gate. Confirm the pending approval:
curl -s http://localhost:3000/api/workflow-runs/<runId>/approval-requests

# 6. Approving without proof is rejected (400) — upload proof first:
curl -s -X POST http://localhost:3000/api/uploads \
  -F "file=@/path/to/proof.txt" -F "runId=<runId>" -F "nodeId=hitl_gate" \
  -F "uploadedBy=<your name>"
# -> note the "id" field in the response as <proofFileId>

# 7. Approve — this signals the paused Temporal workflow, which resumes
#    and registers + pushes the Sign cert
curl -s -X POST http://localhost:3000/api/workflow-runs/<runId>/approve \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"hitl_gate","approvedBy":"<your name>","proofFileId":"<proofFileId>"}'
```

`mock-cert-management-api.js`'s own stdout log and the engine's workflow
log are the two independent traces confirming each step (including the
Sign registration) genuinely only happens after step 7.
