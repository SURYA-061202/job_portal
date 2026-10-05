import type { AppStyle } from '@/lib/appStyle';

/** Token sheet for the Posts tab. One structure, six visual languages, so the
 *  tab always matches whichever rail is showing in the sidebar.
 *
 *  Contrast: #FF6600 is 2.7:1 on white and 6.75:1 on #0a0a0a, so orange only
 *  ever appears as a fill (with near-black text) or as an aria-hidden accent -
 *  never as body text on a light surface. Every field is a complete Tailwind
 *  class string (or a colour to pair with a width utility) so the scanner sees
 *  the literal and the component never has to guess the rest. */
export interface PostsSkin {
    /** Corner radius for the masthead, cards, list and state panels. */
    radius: string;
    /** Elevation for the masthead and cards. Empty in the flat skins. */
    shadow: string;
    /** Page canvas behind the panels. */
    canvas: string;
    /** Panel/card fill. Equals `canvas` in the ink skins - hairlines carry the grid. */
    surface: string;
    /** Hairline colour, always paired with a Tailwind border-width utility. */
    edge: string;
    /** Row divider colour, paired with `divide-y`. */
    divide: string;
    /** Hairline colour as a fill - the backdrop showing through `gap-px` in a rule grid. */
    hairline: string;
    /** Masthead "Job Posts". */
    heading: string;
    /** Tracked uppercase eyebrow above the heading (RECRUITMENT). */
    eyebrow: string;
    /** Soft brand wash behind the masthead title row. Empty in the flat skins. */
    headerWash: string;
    /** Empty / no-results panel titles. */
    emptyTitle: string;
    /** Post card title, incl. the hover accent. */
    cardTitle: string;
    /** List row title. */
    rowTitle: string;
    /** Experience / Location figures and the highlighted search term. */
    cardValue: string;
    /** Timestamps and secondary meta. */
    meta: string;
    /** Tracked uppercase micro-label (EXPERIENCE, KEY SKILLS, SORT...). */
    micro: string;
    /** Empty-state description copy. */
    body: string;
    /** Faint icons: search glyph, chevrons, list arrow. No hover of its own. */
    subtle: string;
    /** Hover partner for `subtle` on interactive icons only. */
    subtleHover: string;
    /** Outlined position-level badge (Senior, Junior...). Complete. */
    chip: string;
    /** Skill tag. Complete. */
    tag: string;
    /** Inverted count badge - masthead total and per-post applicant count. */
    count: string;
    /** Live dot inside the masthead count badge. */
    countDot: string;
    /** Outlined applicant pill in the masthead (count + Users glyph). Complete. */
    statChip: string;
    /** Large figure in the at-a-glance strip cells. Complete. */
    statValue: string;
    /** Input + select border/fill/text/placeholder/focus-border. Pair with FOCUS. */
    field: string;
    /** Tinted backdrop for the masthead controls row. */
    controlsBg: string;
    /** Track for the grid/list segmented control. Complete. */
    track: string;
    /** Selected segment inside `track`. Complete. */
    trackBtnActive: string;
    /** Idle segment inside `track`. Complete. */
    trackBtnIdle: string;
    toggleActive: string;
    toggleIdle: string;
    /** Primary button (Add Post, Create your first post). Complete. */
    cta: string;
    /** Depth cue on the masthead CTA: lift + shadow on hover. */
    ctaLift: string;
    /** Secondary button (Clear search). Complete. */
    secondary: string;
    rowHover: string;
    cardHover: string;
    /** Small bordered glyph tile in the list rows. */
    iconTile: string;
    /** Icon block behind the empty / no-results glyph. */
    stateIcon: string;
    /** Soft brand-tinted fill for highlight tiles (interview rounds). */
    tileTint: string;
    /** Placeholder bar fill. Pair with `edge` for its border. */
    skeleton: string;
}

export const POSTS_SKINS: Record<AppStyle, PostsSkin> = {
    rail: {
        radius: 'rounded-xl',
        shadow: 'shadow-lg',
        canvas: 'bg-muted',
        surface: 'bg-surface',
        edge: 'border-border',
        divide: 'divide-border',
        hairline: 'bg-border',
        heading: 'text-xl sm:text-2xl font-black uppercase leading-none tracking-tight text-ink',
        emptyTitle: 'text-base font-black uppercase tracking-wide text-ink',
        cardTitle: 'text-lg font-bold leading-tight text-ink transition-colors duration-200 group-hover:text-brand',
        rowTitle: 'truncate text-sm font-bold text-ink transition-colors duration-200 group-hover:text-brand',
        cardValue: 'text-sm font-bold text-ink',
        meta: 'text-xs font-medium text-ink/60',
        micro: 'text-xs font-semibold uppercase tracking-wider text-ink/60',
        body: 'text-sm font-medium text-ink/70',
        subtle: 'text-ink/40',
        subtleHover: 'hover:text-ink',
        chip: 'border border-border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink/70',
        tag: 'max-w-full break-words border border-border px-2 py-1 text-xs font-medium text-ink/70',
        count: 'whitespace-nowrap border border-ink bg-ink px-2 py-1 text-xs font-bold text-surface',
        field: 'border border-border bg-surface text-sm font-medium text-ink placeholder:text-ink/40 transition-colors duration-200 hover:border-ink focus:border-ink',
        toggleActive: 'bg-brand text-foreground',
        toggleIdle: 'text-ink/50 hover:text-ink',
        cta: 'border border-brand bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors duration-200 hover:border-ink hover:bg-ink hover:text-surface',
        secondary: 'cursor-pointer border border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink transition-colors duration-200 hover:border-ink',
        rowHover: 'hover:bg-ink/5',
        cardHover: 'hover:border-ink/40',
        iconTile: 'border border-border text-ink/70',
        stateIcon: 'bg-ink text-surface',
        skeleton: 'bg-ink/10',
        eyebrow: 'text-[11px] font-bold uppercase tracking-[0.18em] text-ink/60',
        headerWash: 'bg-gradient-to-r from-brand/10 to-transparent',
        countDot: 'bg-brand',
        statChip: 'border border-border px-2 py-1 text-xs font-semibold text-ink/70',
        controlsBg: '',
        track: 'flex gap-0.5 rounded-lg border border-border bg-surface p-1',
        trackBtnActive: 'rounded-md bg-ink text-surface',
        trackBtnIdle: 'rounded-md text-ink/50 hover:text-ink',
        ctaLift: 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        tileTint: 'bg-brand/5',
        statValue: 'text-lg font-black leading-tight text-ink',
    },
    'rail-dark': {
        radius: 'rounded-xl',
        shadow: 'shadow-lg',
        canvas: 'bg-ink',
        surface: 'bg-ink',
        edge: 'border-white/10',
        divide: 'divide-white/10',
        hairline: 'bg-white/10',
        heading: 'text-xl sm:text-2xl font-black uppercase leading-none tracking-tight text-white',
        emptyTitle: 'text-base font-black uppercase tracking-wide text-white',
        cardTitle: 'text-lg font-bold leading-tight text-white transition-colors duration-200 group-hover:text-brand',
        rowTitle: 'truncate text-sm font-bold text-white transition-colors duration-200 group-hover:text-brand',
        cardValue: 'text-sm font-bold text-white',
        meta: 'text-xs font-medium text-white/60',
        micro: 'text-xs font-semibold uppercase tracking-wider text-white/60',
        body: 'text-sm font-medium text-white/70',
        subtle: 'text-white/40',
        subtleHover: 'hover:text-white',
        chip: 'border border-white/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-white/70',
        tag: 'max-w-full break-words border border-white/15 px-2 py-1 text-xs font-medium text-white/70',
        count: 'whitespace-nowrap border border-brand bg-brand px-2 py-1 text-xs font-bold text-ink',
        field: 'border border-white/15 bg-ink text-sm font-medium text-white placeholder:text-white/40 transition-colors duration-200 hover:border-brand focus:border-brand',
        toggleActive: 'bg-brand text-foreground',
        toggleIdle: 'text-white/50 hover:text-white',
        cta: 'border border-brand bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors duration-200 hover:border-white hover:bg-white hover:text-ink',
        secondary: 'cursor-pointer border border-white/30 bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors duration-200 hover:border-white',
        rowHover: 'hover:bg-white/5',
        cardHover: 'hover:border-white/30',
        iconTile: 'border border-white/10 text-white/70',
        stateIcon: 'bg-brand text-foreground',
        skeleton: 'bg-white/10',
        eyebrow: 'text-[11px] font-bold uppercase tracking-[0.18em] text-white/60',
        headerWash: 'bg-gradient-to-r from-brand/15 to-transparent',
        countDot: 'bg-ink',
        statChip: 'border border-white/15 px-2 py-1 text-xs font-semibold text-white/70',
        controlsBg: 'bg-white/5',
        track: 'flex gap-0.5 rounded-lg border border-white/10 bg-ink p-1',
        trackBtnActive: 'rounded-md bg-brand text-foreground',
        trackBtnIdle: 'rounded-md text-white/50 hover:text-white',
        ctaLift: 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-brand/30',
        tileTint: 'bg-brand/10',
        statValue: 'text-lg font-black leading-tight text-white',
    },
    ink: {
        radius: 'rounded-lg',
        shadow: 'shadow-lg',
        canvas: 'bg-ink',
        surface: 'bg-ink',
        edge: 'border-brand/20',
        divide: 'divide-brand/20',
        hairline: 'bg-brand/20',
        heading: 'text-xl sm:text-2xl font-black uppercase leading-none tracking-tight text-gray-100',
        emptyTitle: 'text-base font-black uppercase tracking-wide text-gray-100',
        cardTitle: 'text-lg font-bold leading-tight text-gray-100 transition-colors duration-200 group-hover:text-brand',
        rowTitle: 'truncate text-sm font-bold text-gray-100 transition-colors duration-200 group-hover:text-brand',
        cardValue: 'text-sm font-bold text-gray-100',
        meta: 'text-xs font-medium text-gray-400',
        micro: 'text-xs font-semibold uppercase tracking-wider text-brand',
        body: 'text-sm font-medium text-gray-300',
        subtle: 'text-gray-500',
        subtleHover: 'hover:text-white',
        chip: 'border border-brand/30 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-gray-300',
        tag: 'max-w-full break-words border border-brand/30 px-2 py-1 text-xs font-medium text-gray-300',
        count: 'whitespace-nowrap border border-brand bg-brand px-2 py-1 text-xs font-bold text-ink',
        field: 'border border-brand/30 bg-ink text-sm font-medium text-gray-100 placeholder:text-gray-500 transition-colors duration-200 hover:border-brand focus:border-brand',
        toggleActive: 'bg-brand text-ink',
        toggleIdle: 'text-gray-400 hover:text-white',
        cta: 'border border-brand bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink transition-colors duration-200 hover:border-white hover:bg-white hover:text-ink',
        secondary: 'cursor-pointer border border-brand/40 bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-300 transition-colors duration-200 hover:border-brand',
        rowHover: 'hover:bg-white/5',
        cardHover: 'hover:border-brand/50',
        iconTile: 'border border-brand/20 text-gray-300',
        stateIcon: 'bg-brand text-ink',
        skeleton: 'bg-white/10',
        eyebrow: 'text-[11px] font-bold uppercase tracking-[0.18em] text-brand',
        headerWash: 'bg-gradient-to-r from-brand/15 to-transparent',
        countDot: 'bg-ink',
        statChip: 'border border-brand/30 px-2 py-1 text-xs font-semibold text-gray-300',
        controlsBg: 'bg-white/5',
        track: 'flex gap-0.5 rounded-lg border border-brand/25 bg-ink p-1',
        trackBtnActive: 'rounded-md bg-brand text-ink',
        trackBtnIdle: 'rounded-md text-gray-400 hover:text-white',
        ctaLift: 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-brand/30',
        tileTint: 'bg-brand/10',
        statValue: 'text-lg font-black leading-tight text-gray-100',
    },
    swiss: {
        radius: 'rounded-none',
        shadow: '',
        canvas: 'bg-muted',
        surface: 'bg-surface',
        edge: 'border-ink/15',
        divide: 'divide-ink/10',
        hairline: 'bg-ink/15',
        heading: 'text-xl sm:text-2xl font-black uppercase leading-none tracking-tight text-ink',
        emptyTitle: 'text-base font-black uppercase tracking-wide text-ink',
        cardTitle: 'text-lg font-bold leading-tight text-ink transition-colors duration-200 group-hover:text-brand',
        rowTitle: 'truncate text-sm font-bold text-ink transition-colors duration-200 group-hover:text-brand',
        cardValue: 'text-sm font-bold text-ink',
        meta: 'text-xs font-medium text-ink/60',
        micro: 'text-xs font-bold uppercase tracking-[0.16em] text-ink/60',
        body: 'text-sm font-medium text-ink/70',
        subtle: 'text-ink/40',
        subtleHover: 'hover:text-ink',
        chip: 'border border-ink/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-[0.16em] text-ink/70',
        tag: 'max-w-full break-words border border-ink/15 px-2 py-1 text-xs font-medium text-ink/80',
        count: 'whitespace-nowrap border border-ink bg-ink px-2 py-1 text-xs font-bold text-surface',
        field: 'border border-ink/20 bg-surface text-sm font-medium text-ink placeholder:text-ink/40 transition-colors duration-200 hover:border-ink focus:border-ink',
        toggleActive: 'bg-ink text-surface',
        toggleIdle: 'text-ink/50 hover:text-ink',
        cta: 'border border-ink bg-brand px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-ink transition-colors duration-200 hover:bg-ink hover:text-surface',
        secondary: 'cursor-pointer border border-ink/30 bg-surface px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-ink transition-colors duration-200 hover:border-ink',
        rowHover: 'hover:bg-ink/5',
        cardHover: 'hover:border-ink',
        iconTile: 'border border-ink/15 text-ink',
        stateIcon: 'bg-ink text-surface',
        skeleton: 'bg-ink/10',
        eyebrow: 'text-[11px] font-bold uppercase tracking-[0.16em] text-ink/60',
        headerWash: '',
        countDot: 'bg-brand',
        statChip: 'border border-ink/20 px-2 py-1 text-xs font-bold text-ink/70',
        controlsBg: 'bg-ink/[0.03]',
        track: 'flex gap-0.5 border border-ink/20 bg-surface p-1',
        trackBtnActive: 'bg-ink text-surface',
        trackBtnIdle: 'text-ink/50 hover:text-ink',
        ctaLift: 'transition-all duration-200 hover:-translate-y-0.5',
        tileTint: 'bg-brand/5',
        statValue: 'text-lg font-black leading-tight text-ink',
    },
    editorial: {
        radius: 'rounded-none',
        shadow: '',
        canvas: 'bg-muted',
        surface: 'bg-surface',
        edge: 'border-ink',
        divide: 'divide-ink',
        hairline: 'bg-ink',
        heading: 'text-2xl font-black uppercase leading-none tracking-tight text-ink',
        emptyTitle: 'text-base font-black uppercase tracking-wide text-ink',
        cardTitle: 'text-lg font-black leading-tight text-ink transition-colors duration-200 group-hover:text-brand',
        rowTitle: 'truncate text-sm font-black text-ink transition-colors duration-200 group-hover:text-brand',
        cardValue: 'text-sm font-black text-ink',
        meta: 'text-xs font-medium text-ink/70',
        micro: 'text-xs font-black uppercase tracking-[0.16em] text-ink',
        body: 'text-sm font-medium text-ink/70',
        subtle: 'text-ink/50',
        subtleHover: 'hover:text-ink',
        chip: 'border border-ink px-1.5 py-0.5 text-xs font-black uppercase tracking-[0.16em] text-ink',
        tag: 'max-w-full break-words border border-ink px-2 py-1 text-xs font-medium text-ink',
        count: 'whitespace-nowrap border border-ink bg-ink px-2 py-1 text-xs font-black text-surface',
        field: 'border border-ink bg-surface text-sm font-medium text-ink placeholder:text-ink/50 transition-colors duration-200 hover:border-brand focus:border-brand',
        toggleActive: 'bg-ink text-surface',
        toggleIdle: 'text-ink/60 hover:text-ink',
        cta: 'border border-ink bg-ink px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-surface transition-colors duration-200 hover:border-brand hover:bg-brand hover:text-ink',
        secondary: 'cursor-pointer border border-ink bg-surface px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-ink transition-colors duration-200 hover:bg-ink hover:text-surface',
        rowHover: 'hover:bg-ink/5',
        cardHover: 'hover:border-ink',
        iconTile: 'border border-ink text-ink',
        stateIcon: 'bg-ink text-surface',
        skeleton: 'bg-ink/10',
        eyebrow: 'text-[11px] font-black uppercase tracking-[0.16em] text-ink',
        headerWash: '',
        countDot: 'bg-brand',
        statChip: 'border border-ink px-2 py-1 text-xs font-black text-ink',
        controlsBg: 'bg-ink/[0.04]',
        track: 'flex gap-0.5 border border-ink bg-surface p-1',
        trackBtnActive: 'bg-ink text-surface',
        trackBtnIdle: 'text-ink/60 hover:text-ink',
        ctaLift: 'transition-all duration-200 hover:-translate-y-0.5',
        tileTint: 'bg-brand/5',
        statValue: 'text-xl font-black leading-tight text-ink',
    },
    dock: {
        radius: 'rounded-2xl',
        shadow: 'shadow-xl',
        canvas: 'bg-muted',
        surface: 'bg-surface',
        edge: 'border-border',
        divide: 'divide-border',
        hairline: 'bg-border',
        heading: 'text-xl sm:text-2xl font-black uppercase leading-none tracking-tight text-ink',
        emptyTitle: 'text-base font-black uppercase tracking-wide text-ink',
        cardTitle: 'text-lg font-bold leading-tight text-ink transition-colors duration-200 group-hover:text-brand',
        rowTitle: 'truncate text-sm font-bold text-ink transition-colors duration-200 group-hover:text-brand',
        cardValue: 'text-sm font-bold text-ink',
        meta: 'text-xs font-medium text-ink/60',
        micro: 'text-xs font-semibold uppercase tracking-wider text-ink/60',
        body: 'text-sm font-medium text-ink/70',
        subtle: 'text-ink/40',
        subtleHover: 'hover:text-ink',
        chip: 'border border-border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink/70',
        tag: 'max-w-full break-words border border-border px-2 py-1 text-xs font-medium text-ink/70',
        count: 'whitespace-nowrap border border-ink bg-ink px-2 py-1 text-xs font-bold text-surface',
        field: 'border border-border bg-surface text-sm font-medium text-ink placeholder:text-ink/40 transition-colors duration-200 hover:border-ink focus:border-brand',
        toggleActive: 'bg-ink text-surface',
        toggleIdle: 'text-ink/50 hover:text-ink',
        cta: 'border border-ink bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wider text-surface transition-colors duration-200 hover:border-brand hover:bg-brand hover:text-ink',
        secondary: 'cursor-pointer border border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink transition-colors duration-200 hover:border-ink',
        rowHover: 'hover:bg-ink/5',
        cardHover: 'hover:border-ink/40',
        iconTile: 'border border-border text-ink/70',
        stateIcon: 'bg-ink text-surface',
        skeleton: 'bg-ink/10',
        eyebrow: 'text-[11px] font-bold uppercase tracking-[0.18em] text-ink/60',
        headerWash: 'bg-gradient-to-r from-brand/10 to-transparent',
        countDot: 'bg-brand',
        statChip: 'border border-border px-2 py-1 text-xs font-semibold text-ink/70',
        controlsBg: '',
        track: 'flex gap-0.5 rounded-lg border border-border bg-surface p-1',
        trackBtnActive: 'rounded-md bg-ink text-surface shadow-sm',
        trackBtnIdle: 'rounded-md text-ink/50 hover:text-ink',
        ctaLift: 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        tileTint: 'bg-brand/5',
        statValue: 'text-lg font-bold leading-tight text-ink',
    },
};
