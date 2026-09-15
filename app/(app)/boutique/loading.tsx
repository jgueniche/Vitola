import { LoadingSkeleton } from '@/components/layout/loading-skeleton'

/**
 * The shop's own boundary, under its layout: moving between the shelf, a
 * product and the cart keeps the demo banner and the section nav in place,
 * and only the page below them is drawn as a skeleton (ADR 0021).
 */
export default function Loading() {
  return <LoadingSkeleton width="max-w-5xl" rows={6} />
}
