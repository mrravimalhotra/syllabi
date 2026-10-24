"use client";

import { useLinkStatus } from "next/link";
import type { ComponentType } from "react";
import { Spinner } from "@/components/ui";

/** A spinning wheel beside a link's label while the screen it opens is loading. Must be inside the `<Link>`. */
export function LinkSpinner() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" aria-label="Loading" className="ml-1.5 inline-flex align-middle">
      <Spinner className="h-3.5 w-3.5" />
    </span>
  ) : null;
}

/** A link's icon that turns into a spinning wheel while its screen is loading. Must be inside the `<Link>`. */
export function PendingIcon({ icon: Icon, className }: { icon: ComponentType<{ className?: string }>; className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" aria-label="Loading" className="inline-flex">
      <Spinner className={className} />
    </span>
  ) : (
    <Icon className={className} />
  );
}
