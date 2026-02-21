/**
 * Build a URL to a user's social media profile.
 * Returns null if we can't construct a valid URL.
 */
export function getSocialProfileUrl(
  platform: string,
  platformUserId: string,
  platformUsername?: string | null
): string | null {
  if (platform === "instagram") {
    // Instagram: prefer username, fall back to user ID
    const handle = platformUsername || platformUserId;
    if (!handle) return null;
    const clean = handle.replace(/^@/, "");
    return `https://www.instagram.com/${clean}`;
  }

  if (platform === "facebook") {
    // Facebook: numeric ID → profile.php, otherwise slug
    if (/^\d+$/.test(platformUserId)) {
      return `https://www.facebook.com/profile.php?id=${platformUserId}`;
    }
    const slug = platformUsername || platformUserId;
    if (!slug) return null;
    return `https://www.facebook.com/${slug.replace(/^@/, "")}`;
  }

  return null;
}
