import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** "City, State, Country" from whatever is known. */
export function collegeLocation(c) {
  return [c.city, c.state, c.country].filter(Boolean).join(", ");
}

/** Always says what kind of listing this is. A community listing is never described as verified. */
export function ListingBadge({ status, className }) {
  if (status === "verified") {
    return (
      <Badge variant="success" className={className} title="Reviewed by UniSphere staff against the college's own records">
        <Check aria-hidden="true" /> Verified listing
      </Badge>
    );
  }
  return (
    <Badge variant="mono" className={className} title="Added by a member. Nobody has checked it yet.">
      Community-added
    </Badge>
  );
}
