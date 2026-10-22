/** The landing page's photos (`public/images`): a full-size WebP and a
 * 640px one, so phones download a fraction of the bytes. */
export const landingImage = (name: string) => ({
  src: `/images/${name}.webp`,
  srcSet: `/images/${name}-640.webp 640w, /images/${name}.webp 1200w`,
});

/** The first hero slide, also preloaded by `index.html` (keep in step). */
export const FIRST_HERO = "piggy-bank";
