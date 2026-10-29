import { COLOR_LABELS, COLOR_SWATCH, COLORS, type Color } from "@/lib/project-constants";
import { cn } from "@/lib/utils";

/**
 * A row of colour swatches built from native radio buttons, so arrow keys
 * move between colours and the choice submits with the form.
 */
export function ColorPicker({ name, defaultValue, legend }: { name: string; defaultValue: Color; legend: string }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((color) => (
          <label key={color} className="cursor-pointer">
            <input type="radio" name={name} value={color} defaultChecked={color === defaultValue} className="peer sr-only" />
            <span className="sr-only">{COLOR_LABELS[color]}</span>
            <span
              aria-hidden="true"
              className={cn(
                "block size-7 rounded-full ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-3 peer-focus-visible:outline-ring/50",
                COLOR_SWATCH[color],
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ColorDot({ color, className }: { color: Color; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full", COLOR_SWATCH[color], className)} />;
}
