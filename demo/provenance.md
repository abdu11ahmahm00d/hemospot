# Demo corpus provenance (T-015)

Generated: 2026-10-20 03:46 - project pkebstfwndhftxajztcx

Every image below is loaded in the live database as evidence in case `DEMO-CORPUS`
and its cached result is a genuine output of the deployed pipeline (worker + sidecar,
model `bpa-catboost-v1`). Images are curated Wikimedia Commons files for platform
testing; **no ground-truth mechanism label is claimed** for them.

| file | license | author | source | verdict | confidence | timing ms | job |
|------|---------|--------|--------|---------|------------|-----------|-----|
| asphalt-drops-1.jpg | CC BY-SA 4.0 | Modern primat | [Commons](https://commons.wikimedia.org/wiki/File:Asfalt_uzerindeki_kan_damlalari-1.jpg) | low_velocity | 0.748 | 75.1 | done |
| asphalt-drops-2.jpg | CC BY-SA 4.0 | Modern primat | [Commons](https://commons.wikimedia.org/wiki/File:Asfalt_uzerindeki_kan_damlalari-2.jpg) | low_velocity | 0.654 | 116.1 | done |
| bedsheet-stains.jpg | CC BY-SA 4.0 | Panamitsu | [Commons](https://commons.wikimedia.org/wiki/File:Blood_stains_on_bed_sheets.jpg) | inconclusive | 0.551 | 135.7 | done |
| civet-trail.jpg | CC BY-SA 3.0 | Verity67 | [Commons](https://commons.wikimedia.org/wiki/File:Blood_stain_of_the_civet.jpg) | low_velocity | 0.619 | 99.2 | done |
| drop-pattern.jpg | CC BY 1.0 | Nyki m | [Commons](https://commons.wikimedia.org/wiki/File:Blood.jpg) | impact | 0.639 | 57.8 | done |
| gauze-blood.jpg | CC BY-SA 2.0 | Lee Haywood | [Commons](https://commons.wikimedia.org/wiki/File:Blood_(4141132984).jpg) | low_velocity | 0.647 | 64.4 | done |
| sidewalk-spatter.jpg | CC BY-SA 3.0 | Bubba73 | [Commons](https://commons.wikimedia.org/wiki/File:Blood_on_the_sidewalk.jpg) | inconclusive | 0.397 | 511.2 | done |
| small-spatter.png | CC BY-SA 3.0 | Panapp | [Commons](https://commons.wikimedia.org/wiki/File:Blood_stain.png) | inconclusive | 0 | 10.3 | done |
| snow-animal-scene.jpg | CC BY 2.0 | V. H. Hammer | [Commons](https://commons.wikimedia.org/wiki/File:Nature_lends_such_evil_dreams.jpg) | inconclusive | 0.411 | 93.8 | done |
| snow-stain.jpg | CC BY-SA 2.0 | Jeremy Bolwell | [Commons](https://commons.wikimedia.org/wiki/File:Blood_stain_on_the_snow_-_geograph.org.uk_-_5697811.jpg) | low_velocity | 0.921 | 9.7 | done |
| undershirt-stains.jpg | CC BY-SA 4.0 | Ser Amantio di Nicolao | [Commons](https://commons.wikimedia.org/wiki/File:Bloodstains_on_an_undershirt.jpg) | inconclusive | 0.354 | 79.4 | done |

Re-run: `powershell -File demo\fetch-corpus.ps1` (re-fetch images) then `powershell -File demo\build-corpus.ps1` (rebuild cache + this file).
