/**
 * stain-overlay.tsx — the evidence photo with every detected stain drawn on it.
 * Owner: D5 (Farhana Yesmin). Serves FR1.5 (per-stain geometric features, made
 * visible) and NFR1.7 (a result is shown with its evidence, not as a bare label).
 *
 * The sidecar reports each stain's ellipse in source-image pixels; the SVG uses
 * the photo's own natural size as its viewBox, so the drawing stays truthful at
 * any display width. No overlay renders until the photo's real size is known.
 */

import { useState } from "react"

import type { StainGeometry } from "@/features/analyses/analyses"

export function StainOverlay({
  photoUrl,
  fileName,
  stains,
  showOverlay,
}: {
  photoUrl: string
  fileName: string
  stains: StainGeometry[]
  showOverlay: boolean
}) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)

  return (
    <div className="relative overflow-hidden rounded-md border">
      <img
        src={photoUrl}
        alt={fileName}
        className="block w-full"
        onLoad={(event) =>
          setNaturalSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
      {showOverlay && naturalSize && stains.length > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${stains.length} detected stains outlined`}
        >
          {stains.map((stain, index) => (
            <ellipse
              key={index}
              cx={stain.centroid_x}
              cy={stain.centroid_y}
              rx={stain.major_axis / 2}
              ry={stain.minor_axis / 2}
              transform={`rotate(${stain.orientation_deg} ${stain.centroid_x} ${stain.centroid_y})`}
              fill="none"
              stroke="#22c55e"
              strokeWidth={Math.max(naturalSize.width / 400, 2)}
            />
          ))}
        </svg>
      ) : null}
    </div>
  )
}
