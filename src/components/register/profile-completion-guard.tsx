"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useCommunityStore, useCurrentUser } from "@/lib/community-store";

export function ProfileCompletionGuard() {
  const { hydrated } = useCommunityStore();
  const currentUser = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

  const mustFinish = hydrated && currentUser !== null && !currentUser.profileCompleted;

  useEffect(() => {
    if (mustFinish && pathname !== "/register") {
      router.replace("/register");
    }
  }, [mustFinish, pathname, router]);

  return null;
}
