# RBAC matrix - latest run

project `pkebstfwndhftxajztcx` - personas: arman (admin), nahin (lead), firman (analyst), mosaddika (reviewer), mowmita (viewer)

| metric | probes | passed | failed |
|---|---|---|---|
| NFR 1.1 | 78 | 78 | 0 |
| NFR 1.2 | 13 | 13 | 0 |
| NFR 1.5 | 5 | 5 | 0 |
| **total** | 96 | 96 | 0 |

| # | NFR | role | expected | got | result | probe |
|---|---|---|---|---|---|---|
| 1 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read an open case |
| 2 | 1.1 | viewer | allow | HTTP 200 | PASS | viewer reads a closed case |
| 3 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot read an open case |
| 4 | 1.1 | reviewer | allow | HTTP 200 | PASS | reviewer reads a case under review |
| 5 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst reads the case assigned to them |
| 6 | 1.1 | analyst | deny | HTTP 200 [] | PASS | analyst cannot read a case not assigned to them |
| 7 | 1.1 | lead | allow | HTTP 200 | PASS | lead reads any case |
| 8 | 1.1 | admin | allow | HTTP 200 | PASS | admin reads any case |
| 9 | 1.1 | analyst | deny | HTTP 403 | PASS | analyst cannot create cases |
| 10 | 1.1 | viewer | deny | HTTP 403 | PASS | viewer cannot create cases |
| 11 | 1.1 | lead | allow | HTTP 201 | PASS | lead creates a case (own byline) |
| 12 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot edit a case |
| 13 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot edit a case |
| 14 | 1.1 | analyst | deny | HTTP 200 [] | PASS | analyst cannot edit even an assigned case |
| 15 | 1.1 | lead | allow | HTTP 200 | PASS | lead edits the case they created |
| 16 | 1.1 | admin | allow | HTTP 200 | PASS | admin edits any case |
| 17 | 1.1 | viewer | allow | HTTP 200 | PASS | viewer reads history of a case under review |
| 18 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read history of an open case |
| 19 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst reads case history (staff) |
| 20 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot read history of an open case |
| 21 | 1.1 | viewer | deny | HTTP 403 | PASS | viewer cannot record transitions |
| 22 | 1.1 | reviewer | deny | HTTP 403 | PASS | reviewer cannot record transitions |
| 23 | 1.1 | analyst | allow | HTTP 201 | PASS | analyst records a transition as themselves |
| 24 | 1.1 | analyst | deny | HTTP 403 | PASS | analyst cannot record a transition as someone else |
| 25 | 1.1 | lead | allow | HTTP 201 | PASS | lead records a transition as themselves |
| 26 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read evidence on an open case |
| 27 | 1.1 | viewer | allow | HTTP 200 | PASS | viewer reads evidence on a closed case |
| 28 | 1.1 | reviewer | allow | HTTP 200 | PASS | reviewer reads evidence on a case under review |
| 29 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot read evidence on an open case |
| 30 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst reads evidence (staff) |
| 31 | 1.1 | viewer | deny | HTTP 403 | PASS | viewer cannot register evidence |
| 32 | 1.1 | reviewer | deny | HTTP 403 | PASS | reviewer cannot register evidence |
| 33 | 1.1 | analyst | allow | HTTP 201 | PASS | analyst registers evidence as themselves |
| 34 | 1.1 | analyst | deny | HTTP 403 | PASS | analyst cannot register evidence under someone else's name |
| 35 | 1.2 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read custody chain of an open case |
| 36 | 1.2 | viewer | allow | HTTP 200 | PASS | viewer reads custody chain of a closed case |
| 37 | 1.2 | analyst | allow | HTTP 200 | PASS | analyst reads custody chain (staff) |
| 38 | 1.2 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot read custody chain of an open case |
| 39 | 1.2 | viewer | deny | HTTP 403 | PASS | viewer cannot record custody events |
| 40 | 1.2 | reviewer | deny | HTTP 403 | PASS | reviewer cannot record custody events |
| 41 | 1.2 | analyst | allow | HTTP 201 | PASS | analyst records a custody event as themselves |
| 42 | 1.2 | analyst | deny | HTTP 403 | PASS | analyst cannot record custody as someone else |
| 43 | 1.2 | analyst | deny | HTTP 200 [] ; after-sql: 'Sealed into evidence locker (verification fixture)' (want 'Sealed into evidence locker (verification fixture)') | PASS | custody rows cannot be edited (analyst) |
| 44 | 1.2 | admin | deny | HTTP 200 [] | PASS | custody rows cannot be edited (admin) |
| 45 | 1.2 | admin | deny | HTTP 200 [] ; after-sql: '1' (want '1') | PASS | custody rows cannot be deleted (admin) |
| 46 | 1.5 | analyst | deny | HTTP 200 [] | PASS | evidence rows cannot be edited |
| 47 | 1.5 | admin | deny | HTTP 200 [] ; after-sql: '1' (want '1') | PASS | evidence rows cannot be deleted (admin) |
| 48 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read analysis on an open case |
| 49 | 1.1 | viewer | allow | HTTP 200 | PASS | viewer reads analysis on a case under review |
| 50 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot see an analysis that is not ready |
| 51 | 1.1 | reviewer | allow | HTTP 200 | PASS | reviewer reads an analysis ready for review |
| 52 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst reads analyses (staff) |
| 53 | 1.1 | analyst | deny | HTTP 403 | PASS | analyst cannot request analyses (lead/admin own that gate) |
| 54 | 1.1 | viewer | deny | HTTP 403 | PASS | viewer cannot request analyses |
| 55 | 1.1 | lead | allow | HTTP 201 | PASS | lead requests an analysis |
| 56 | 1.1 | lead | deny | HTTP 403 | PASS | lead cannot request under someone else's name |
| 57 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst finishes their analysis |
| 58 | 1.1 | analyst | deny | HTTP 403 | PASS | analyst cannot approve an analysis |
| 59 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot approve an analysis |
| 60 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot approve what is not ready |
| 61 | 1.1 | reviewer | allow | HTTP 200 | PASS | reviewer approves a ready analysis |
| 62 | 1.1 | admin | allow | HTTP 200 | PASS | admin approves a ready analysis |
| 63 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read the job queue |
| 64 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot read the job queue |
| 65 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst reads the job queue |
| 66 | 1.1 | lead | allow | HTTP 200 | PASS | lead reads the job queue |
| 67 | 1.1 | viewer | deny | HTTP 403 | PASS | viewer cannot enqueue jobs |
| 68 | 1.1 | reviewer | deny | HTTP 403 | PASS | reviewer cannot enqueue jobs |
| 69 | 1.1 | analyst | allow | HTTP 201 | PASS | analyst enqueues a job |
| 70 | 1.1 | analyst | allow | HTTP 200 | PASS | analyst claims a job |
| 71 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | reviewer cannot claim a job |
| 72 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot touch a job |
| 73 | 1.1 | reviewer | allow | HTTP 200 | PASS | user reads their own notification |
| 74 | 1.1 | analyst | deny | HTTP 200 [] | PASS | user cannot read someone else's notification |
| 75 | 1.1 | viewer | deny | HTTP 200 [] | PASS | user cannot read someone else's notification (viewer) |
| 76 | 1.1 | analyst | deny | HTTP 200 [] | PASS | user cannot mark someone else's notification read |
| 77 | 1.1 | viewer | allow | HTTP 200 | PASS | user marks their own notification read |
| 78 | 1.1 | analyst | deny | HTTP 403 | PASS | analyst cannot forge a notification |
| 79 | 1.1 | admin | deny | HTTP 403 | PASS | admin cannot forge a notification (insert path is triggers-only) |
| 80 | 1.1 | reviewer | deny | HTTP 403 | PASS | reviewer cannot forge a notification |
| 81 | 1.1 | viewer | allow | HTTP 200 | PASS | user reads their own profile |
| 82 | 1.1 | viewer | deny | HTTP 200 [] | PASS | viewer cannot read other profiles |
| 83 | 1.1 | analyst | deny | HTTP 200 [] | PASS | analyst cannot read other profiles |
| 84 | 1.1 | lead | allow | HTTP 200 | PASS | lead reads the analyst directory |
| 85 | 1.1 | lead | deny | HTTP 200 [] | PASS | lead cannot read non-analyst profiles |
| 86 | 1.1 | admin | allow | HTTP 200 | PASS | admin reads the full directory |
| 87 | 1.1 | viewer | deny | HTTP 200 [] | PASS | user cannot edit their own profile row |
| 88 | 1.1 | reviewer | deny | HTTP 200 [] | PASS | user cannot edit their own profile row (reviewer) |
| 89 | 1.1 | admin | allow | HTTP 200 | PASS | admin edits a profile (same value - no side effects) |
| 90 | 1.5 | analyst | deny | HTTP 400 | PASS | cannot upload into someone else's evidence folder |
| 91 | 1.5 | analyst | deny | HTTP 400 | PASS | evidence bytes cannot be overwritten |
| 92 | 1.5 | admin | deny | HTTP 200 [] ; after-list: object 'verify-pattern.png' present = True | PASS | evidence bytes cannot be deleted (admin) |
| 93 | 1.1 | viewer | allow | HTTP 200 | PASS | staff reads evidence bytes (table RLS is the gate, by design) |
| 94 | 1.1 | viewer | allow | HTTP 200 | PASS | staff lists the bucket (by design) |
| 95 | 1.2 | analyst | allow | HTTP 200 | PASS | analyst reads custody of a case they are NOT assigned to (staff reach) |
| 96 | 1.2 | analyst | allow | HTTP 201 | PASS | analyst records custody on an unassigned case and gets the row back (the app's insert path) |
