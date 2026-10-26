import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/posts/category-icons";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { cn } from "@/lib/utils";

/** The post type as a small tinted pill. `compact` keeps only the icon on a phone (the name stays for screen readers). */
export function CategoryBadge({ category, compact = false, className }) {
  const meta = CATEGORY_BY_VALUE[category] ?? CATEGORY_BY_VALUE.general;
  return (
    <Badge variant="tone" className={cn(meta.tone, "rounded-full py-1", compact && "max-sm:size-7 max-sm:p-0", className)}>
      <CategoryIcon value={meta.value} aria-hidden="true" />
      <span className={cn(compact && "max-sm:sr-only")}>{meta.label}</span>
    </Badge>
  );
}
