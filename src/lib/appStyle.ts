/** The app now ships a single style: every surface in the project is Dock.
 *  The store-shaped API is kept so consumers (Sidebar, Posts tab) read the
 *  active style the same way if more styles ever return. The other skin
 *  records are preserved in Sidebar.tsx / postsSkins.ts but are dormant. */
export type AppStyle = 'rail' | 'rail-dark' | 'ink' | 'swiss' | 'editorial' | 'dock';

export const STYLE_ORDER: AppStyle[] = ['dock'];

/** Subscribe-compatible read: the active style never changes at runtime. */
export function useAppStyle(): AppStyle {
    return 'dock';
}
