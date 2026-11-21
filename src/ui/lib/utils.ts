import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom type-scale tokens so text-display-* is a font size, not a colour.
const twMerge = extendTailwindMerge<"text-outline">({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display-lg",
            "display-md",
            "display-sm",
            "title",
            "body",
            "caption",
          ],
        },
      ],
      "text-shadow": ["text-glow-lime", "text-glow-cyan", "text-glow-magenta"],
      // Its own group, or it would be read as a text colour and drop text-danger.
      "text-outline": ["text-outline"],
    },
  },
});

/** Merge class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
