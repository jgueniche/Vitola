import { permanentRedirect } from 'next/navigation'

import { routes } from '@/lib/routes'

/**
 * « Au lieu de chez moi tu split : ma cave, mon carnet » (QA du 12 septembre
 * 2026).
 *
 * The hub is gone and its two sections are two nav entries. They keep a shared
 * tab bar — `components/layout/mine-tabs.tsx` — so the split does not cost the
 * one thing the hub gave: knowing that the other one exists.
 */
export default function MineHubPage() {
  permanentRedirect(routes.notebook())
}
