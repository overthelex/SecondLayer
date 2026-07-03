/**
 * Platform routing for blog syndication.
 *
 * Maps each article `category` to the platforms it should be cross-posted to.
 * Only platforms with a real publishing API are automated by cross-post.ts —
 * everything else is manual link distribution (see README.md).
 */

export type Category = 'tech' | 'legal' | 'academic';
export type Platform = 'devto' | 'hashnode';

/**
 * Which automated platforms each category is syndicated to.
 *
 * NOTE: Hashnode's GraphQL API went Pro-only on 2026-05-13
 * (https://hashnode.com/announcements/graphql-api), so it is NOT in any default
 * route — using it 301-redirects without a Pro plan. The `hashnode` publisher
 * still exists in cross-post.ts; opt in explicitly with `--platform hashnode`
 * once the publication is upgraded to Pro.
 */
export const CATEGORY_PLATFORMS: Record<Category, Platform[]> = {
  // Engineering write-ups — the native audience for dev.to (free API).
  tech: ['devto'],
  // Research/preprints — no free auto-channel; HF Blog + LinkedIn done manually.
  academic: [],
  // Legal-opinion pieces — no dev-platform fit. LinkedIn / Substack, done manually.
  legal: [],
};

/** Canonical base — every syndicated copy points back here to protect SEO. */
export const CANONICAL_BASE = 'https://legal.org.ua';

/** Public asset base for absolutising relative /papers, /images, /blog links. */
export const ASSET_BASE = 'https://legal.org.ua';
