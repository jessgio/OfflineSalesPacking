"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CenteredPage } from "../components/dashboard/primitives";
import { MarketingPortalLanding } from "../components/marketing/MarketingPortalLanding";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <CenteredPage>
          <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
        </CenteredPage>
      }
    >
      <MarketingPortalLanding />
    </Suspense>
  );
}
