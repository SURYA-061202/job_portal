import { useAppStyle } from '@/lib/appStyle';
import { POSTS_SKINS, type PostsSkin } from './postsSkins';

/** Subscribe once at the top of each component that renders skinned markup.
 *  The Posts tab, the recruitment detail view and every other module read the
 *  active skin through this one helper, so the whole app stays on the same
 *  panel recipe (edge, surface, radius, shadow, cta, field, micro, ...). */
export const useSkin = (): PostsSkin => POSTS_SKINS[useAppStyle()];

/** Shared focus ring for buttons, cards and rows. Form fields do not use it:
 *  :focus-visible on inputs/selects/textareas is orange-only (see index.css),
 *  so a focused field only tints its existing border. */
export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';
