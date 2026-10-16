import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * The standard shadcn/ui helper: merge class names, letting a later Tailwind class
 * win over an earlier conflicting one. This is shadcn's own util file, verbatim.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
