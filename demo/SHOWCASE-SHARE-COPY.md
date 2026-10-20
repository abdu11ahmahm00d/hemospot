# Share copy for the product showcase

The video has no text in it, so the caption carries the whole message.

## X / Twitter

Hemospot: a forensic case-management platform with a live bloodstain-pattern
engine. Watch someone sign in, open a case, run the analysis, follow the chain
of custody and pull the report - 35 stains measured, an `impact` verdict at
63.9% confidence, and the five features that decided it. When the evidence is
weak it says "inconclusive" instead of guessing.

9 FRs, 7 NFRs, 121/121 verification checks green.

## LinkedIn

Our SE capstone, end to end in one take: Hemospot is a forensic case-management
platform whose analysis engine is a real CatBoost model over measured stain
geometry, not a mock. The video is the actual product - sign in, work the
case, run the analysis, read the append-only custody chain, search, pull the
PDF report.

The part I care about most is the refusal path: below the reporting threshold
the product reports "inconclusive" and no label, because a lab tool that
guesses is worse than one that declines.

9 functional requirements, 7 non-functional requirements, 121/121 verification
checks green. Repo: github.com/abdu11ahmahm00d/hemospot

## Discord / Slack

Hemospot - bloodstain analysis that shows its working, and says "inconclusive"
when it can't tell. 35 stains, one verdict, 121/121 checks green.

## First comment (Reddit)

Full write-up and the source: github.com/abdu11ahmahm00d/hemospot

The engine is CatBoost over measured stain geometry (flight-line convergence,
x-position, total stain-cloud area, gap spacing, stain shape); the explanation
is the model's own feature importances with the measured values, and the
"inconclusive" outcome is a deliberate refusal below 0.60 confidence. Access is
decided by Postgres row-level security, and the custody chain is append-only -
the database refuses updates and deletes on it.
