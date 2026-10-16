/**
 * evidence-page.tsx — Evidence registry module.
 * Owner: D3 (Fatin Mahtab Nahin). Serves FR1.3 (register evidence with file upload, a
 * computed cryptographic hash, and descriptive metadata) and NFR1.5 (recomputed hashes
 * match stored hashes on every verification request).
 */

import { FolderOpen } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function EvidencePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Evidence</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-5" /> Evidence registry — landing W2
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Serves FR1.3 (typed uploads with SHA-256 computed at ingest) and NFR1.5
            (recompute-and-verify on demand).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Typed upload: scene photo / document / other, with descriptive metadata</li>
            <li>SHA-256 computed in the browser with Web Crypto at upload time</li>
            <li>File stored in Supabase Storage; hash + metadata stored in Postgres</li>
            <li>Verify button: recompute the file's hash and compare (NFR1.5)</li>
            <li>EXIF capture (camera, timestamp) for photographs</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
