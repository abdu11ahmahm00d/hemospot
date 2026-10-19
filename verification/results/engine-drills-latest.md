# Engine drills - latest run

project `pkebstfwndhftxajztcx` - pattern `9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda` - 2026-10-20 02:50 local

| check | result | detail |
|---|---|---|
| NFR1.3 463.4ms within budget | PASS | 463.4 ms recorded |
| NFR1.3 50.1ms within budget | PASS | 50.1 ms recorded |
| NFR1.3 63.9ms within budget | PASS | 63.9 ms recorded |
| NFR1.6 blank image verdict is inconclusive | PASS | status 200, verdict 'inconclusive' |
| NFR1.6 inconclusive carries an explanation | PASS | explanation present: True |
| NFR1.6/1.7 no definitive verdict without confidence+explanation | PASS | violating rows: 0 |
| NFR1.7 no ready_for_review row missing result fields | PASS | violating rows: 0 |
| NFR1.5 evidence row hash equals file hash | PASS | row 9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda vs file 9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda |
| NFR1.5 downloaded bytes hash matches row | PASS | download 9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda vs row 9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda |
| NFR1.5 drill object uploadable (first run) or immutable (later runs) | PASS | HTTP 400: {"statusCode":"409","error":"Duplicate","message":"The resource already exists", |
| NFR1.5 drill object bytes hash matches file hash | PASS | download 9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda vs file 9dbe8afe9dfba4f00be659a4002debf54abce4b4a728027e32d36243b968fcda |
| NFR1.5 drill evidence row registered via REST | PASS | HTTP 201 |
| NFR1.4 drill analysis created | PASS | HTTP 201, id 5daa0d9c-ec6c-4d7a-9830-ca37e3a42ace, body [{"id":"5daa0d9c-ec6c-4d7a-9830-ca37e3a42ace","evidence_id":"00000000-0000-4000-8000-000000000004","requested_by":"22222 |
| NFR1.4 drill job enqueued | PASS | HTTP 201, id 7fe130d5-2fa5-45a7-ac7f-ed6c705d53a7, body [{"id":"7fe130d5-2fa5-45a7-ac7f-ed6c705d53a7","analysis_id":"5daa0d9c-ec6c-4d7a-9830-ca37e3a42ace","status":"pending","a |
| NFR1.4 phase A: worker claimed the job (status processing) | PASS | observed: processing |
| NFR1.4 phase A: job survives the kill (still claimed, not lost) | PASS | status after kill: processing |
| NFR1.4 phase B: job re-queued and completed after restart | PASS | final job status: done |
| NFR1.4 phase B: worker log shows the stale re-queue | PASS | workerB.log |
| NFR1.4 phase B: analysis ready_for_review | PASS | status: ready_for_review |
| NFR1.6/1.7 completed job carries verdict+confidence+explanation+model+timing | PASS | verdict=low_velocity conf=0.9115 expl=true model=662452d0.. timing=85.8 |
| NFR1.4 attempts counted / no error recorded | PASS | attempts=0, last_error='' |

Latency samples (NFR1.3, budget 5000 ms): 463.4 ms, 50.1 ms, 63.9 ms

workerB.log excerpt:
```
[worker 20:50:17] signed in as firman@hemospot.local; polling every 2s
[worker 20:50:18] re-queued 1 stale job(s)
[worker 20:50:22] job 7fe130d5 done: low_velocity (0.91)
```
