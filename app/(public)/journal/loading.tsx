import { LoadingSkeleton } from '@/components/layout/loading-skeleton'

/**
 * The journal is the one public prefix with a header of its own (14 septembre
 * 2026), so it gets the boundary the app group has (ADR 0021): the header
 * stays, the article list is drawn as lines until it arrives.
 */
export default function Loading() {
  return <LoadingSkeleton width="max-w-3xl" rows={3} />
}
