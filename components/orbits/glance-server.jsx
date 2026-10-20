import { OrbitPill } from "@/components/orbits/header-pill";
import { OrbitsStrip, OrbitsWidget, OrbitsWidgetUnavailable } from "@/components/orbits/feed-widgets";
import { getGlance, getMyRank, getOverview } from "@/lib/services/orbits";

/**
 * Server wrappers that read the member's Orbits through their own session and hand the numbers to client components. They
 * are meant to sit inside <Suspense> so a slow read never delays the page around them. When a read fails the client
 * component is given `null` (or an unavailable panel is shown): nothing here ever invents a balance.
 */
export async function OrbitHeaderPill() {
  const res = await getGlance();
  return <OrbitPill initial={res.error ? null : res.data} />;
}

/** Desktop sidebar panel: the glance, the nearest badge, and this week's global standing (all of them are the member's own). */
export async function OrbitsFeedWidget() {
  const [glance, overview, rank] = await Promise.all([getGlance(), getOverview(), getMyRank("global", "weekly")]);
  if (glance.error) return <OrbitsWidgetUnavailable />;
  return <OrbitsWidget initial={glance.data} next={overview.error ? null : overview.data.next_achievement} rank={rank.error ? null : rank.data} />;
}

/** The compact strip for screens without the sidebar. Renders nothing if the numbers cannot be read (the header pill still links). */
export async function OrbitsFeedStrip() {
  const glance = await getGlance();
  if (glance.error) return null;
  return <OrbitsStrip initial={glance.data} />;
}
