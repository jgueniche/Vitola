import { LoadingSkeleton } from '@/components/layout/loading-skeleton'

/**
 * The loading boundary of the whole app group (ADR 0021): a click on any
 * section commits at once — header kept, skeleton where the page will be —
 * instead of leaving the previous page on screen until the new one has fully
 * rendered on the server. One file, because forgetting a page must fail
 * toward feedback rather than toward silence.
 */
export default function Loading() {
  return <LoadingSkeleton />
}
