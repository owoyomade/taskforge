import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { NotificationPreferencesForm } from "@/components/notifications/preferences-form";
import { getNotificationPreferences } from "@/lib/notifications";
import { getMyProfile } from "@/lib/profiles";
import { AvatarForm, ChangePasswordForm, ProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountPage() {
  const [profile, preferences] = await Promise.all([getMyProfile(), getNotificationPreferences()]);

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-8 sm:px-8">
      <div className="grid gap-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          Back to workspace
        </Link>
        <h1 className="text-3xl font-semibold">Account settings</h1>
      </div>

      <section aria-labelledby="photo-heading" className="grid gap-4 border-t pt-6">
        <h2 id="photo-heading" className="text-lg font-semibold">
          Photo
        </h2>
        <AvatarForm profile={profile} />
      </section>

      <section aria-labelledby="profile-heading" className="grid gap-4 border-t pt-6">
        <h2 id="profile-heading" className="text-lg font-semibold">
          Profile
        </h2>
        <ProfileForm profile={profile} />
      </section>

      <section aria-labelledby="notifications-heading" className="grid gap-4 border-t pt-6">
        <h2 id="notifications-heading" className="text-lg font-semibold">
          Notifications
        </h2>
        <NotificationPreferencesForm preferences={preferences} />
      </section>

      <section aria-labelledby="password-heading" className="grid gap-4 border-t pt-6">
        <h2 id="password-heading" className="text-lg font-semibold">
          Password
        </h2>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
