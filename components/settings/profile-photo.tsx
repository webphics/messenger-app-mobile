import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/display";
import { profilePhotoUri } from "@/lib/profile-rules";

/**
 * The signed-in person's own avatar: their photo, or their initials when there
 * is none or it will not load.
 *
 * The primitive already falls back on a failed load, so a photo that was
 * removed on the web, or one this phone cannot reach offline and has not
 * cached, still draws as somebody rather than as an empty circle.
 *
 * The source is memoised because the primitive resets its loading state
 * whenever the `source` object changes, not when its URI does; and the image is
 * keyed by URI so a new photo is a new load rather than the old one's state.
 */
export function ProfilePhoto({
  name,
  image,
  className,
  textVariant = "headline",
}: {
  name: string;
  image: string | null | undefined;
  className?: string;
  textVariant?: "headline" | "display";
}) {
  const uri = profilePhotoUri(image);
  const source = useMemo(() => (uri ? { uri } : undefined), [uri]);

  return (
    <Avatar alt={name} className={cn("bg-primary-soft", className)}>
      {source ? <AvatarImage key={source.uri} source={source} /> : null}
      <AvatarFallback className="bg-primary-soft">
        <Text variant={textVariant} className="text-primary">
          {initials(name)}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}
