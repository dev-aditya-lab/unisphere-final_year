import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/posts/category-icons";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { cn } from "@/lib/utils";

export function CategoryBadge({ category, className }) {
  const meta = CATEGORY_BY_VALUE[category] ?? CATEGORY_BY_VALUE.general;
  return (
    <Badge variant="tone" className={cn(meta.tone, className)}>
      <CategoryIcon value={meta.value} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
