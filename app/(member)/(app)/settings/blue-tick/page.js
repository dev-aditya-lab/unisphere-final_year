import { BlueTickPanel } from "@/components/settings/blue-tick-panel";
import { BlueTick } from "@/components/ui/blue-tick";
import { requireProfile } from "@/lib/auth/session";
import { getBlueTickConfig, getMemberBlueTick } from "@/lib/services/blue-tick";

export const metadata = { title: "Blue tick" };

export default async function BlueTickPage() {
  const { profile } = await requireProfile();
  const [config, state] = await Promise.all([getBlueTickConfig(), getMemberBlueTick(profile.id)]);

  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <BlueTick className="size-5" decorative /> Blue tick
      </h2>
      <p className="text-muted-foreground mt-0.5 mb-5 text-sm">
        An optional badge that shows an administrator has checked your identity. You never need it to use UniSphere.
      </p>
      <BlueTickPanel
        hasTick={Boolean(profile.blue_tick)}
        application={state.application}
        order={state.order}
        config={{ open: config.open, pricePaise: config.pricePaise }}
      />
    </section>
  );
}
