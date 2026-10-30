import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="text-muted-foreground">
        We sent a confirmation link to the address you entered. Open it to verify your email and set up your
        workspace. The link expires in 24 hours.
      </p>
      <p className="text-sm text-muted-foreground">
        Already confirmed?{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
