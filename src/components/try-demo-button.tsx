import { startDemo } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { demoEnabled } from "@/lib/demo";

/** "Try the demo", shown only when the demo is switched on (DEMO_PASSWORD is set). */
export function TryDemoButton({ size = "default", className }: { size?: "default" | "lg"; className?: string }) {
  if (!demoEnabled()) return null;
  return (
    <form action={startDemo}>
      <Button type="submit" variant="outline" size={size} className={className}>
        Try the demo
      </Button>
    </form>
  );
}
