# AGENTS.md

> Rules and context for AI coding agents working in this repo.

## Stack

- React 19 (SPA, no SSR)
- TanStack Router (file-based routing in `apps/web/src/routes/`)
- TanStack React Query + oRPC (data fetching)
- TanStack React Form + Zod (form validation)
- Hono (API server in `apps/server/`)
- Prisma (ORM in `packages/db/`)
- Better-Auth (authentication)
- Tailwind CSS v4 + shadcn/ui (Base UI variant, `packages/ui/`)
- Vite + vite-plugin-pwa (build + PWA)
- Turborepo monorepo with pnpm

## Project Structure

```
apps/web/          → React SPA (TanStack Router)
apps/server/       → Hono API server
apps/docs/         → Astro Starlight documentation
packages/ui/       → Shared shadcn/ui components + globals.css
packages/api/      → oRPC routers + procedures
packages/db/       → Prisma schema + client
packages/auth/     → Better-Auth configuration
packages/env/      → Environment variable validation
```

## Rules

### PWA — Native Mobile Feel

This app is a PWA targeting mobile-first. Treat it like a native app, not a website.

- **Touch targets**: All interactive elements must be at least 44px on mobile. Use `min-h-[44px] min-w-[44px]` or equivalent padding.
- **Touch behavior**: `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` are applied globally in `globals.css`. Do not override.
- **Overscroll**: `overscroll-behavior: none` is set globally. Do not add pull-to-navigate or rubber-band bounce.
- **Safe areas**: Use `var(--safe-area-top)`, `var(--safe-area-bottom)`, etc. for edge-to-edge layouts on notched devices. These are defined in `globals.css`.
- **Bottom nav**: Mobile navigation uses a fixed bottom tab bar (`BottomNav` component). The root layout adds `pb-14 md:pb-0` to account for it. Do not add a second nav bar.
- **Page transitions**: TanStack Router's `defaultViewTransition: true` is enabled. The `<main>` element has `viewTransitionName: "page"`. Transition CSS is in `globals.css`. Respect `prefers-reduced-motion`.
- **Pull-to-refresh**: Use the `PullToRefresh` component (wraps content, calls `onRefresh` returning a Promise) for data-heavy pages.
- **Haptic feedback**: Use `useHaptics()` hook (wraps `web-haptics/react`) for key interactions:
  - `trigger("light")` — button taps
  - `trigger("success")` — successful save/submit
  - `trigger("error")` — validation failure, network error
  - `trigger("selection")` — tab switches, toggles
  - `trigger("warning")` — before destructive actions
  - Do NOT haptic on scroll, drag, or continuous gestures.
- **Offline**: Service worker serves `/offline.html` for failed navigation requests. Workbox precaches static assets.
- **Skeleton loading**: Use `<Skeleton>` components that mirror final layout instead of spinners. The `Loader` component with spinner is only for the router's `defaultPendingComponent`.

### UI Patterns — Overlay Conventions

- **Create** → Dialog (centered modal)
- **Edit** → Sheet (slides from right)
- **Delete** → AlertDialog with type-to-confirm for destructive actions. Show a copy button next to the entity name so the user can paste it into the confirmation field.
- **View Details** → Dialog on desktop, Drawer on mobile (responsive pattern)
- Set `overscroll-behavior: contain` on modals, sheets, and drawers so scroll does not bleed to the page behind.

These components are available in `packages/ui/src/components/`.

For detailed overlay examples, loading states, resize animation, toast notifications (sileo), animated text (torph), autofill styling, nested radii, URL-as-state (nuqs), and optimistic updates, see solved problem `ui/shadcn/dashboard-conventions`.

### React — useEffect Policy

**Direct `useEffect` calls are banned in component files.** Most `useEffect` usage compensates for something React already gives better primitives for.

#### Approved escape hatches

1. **`useMountEffect()`** — for one-time external sync on mount (defined in `apps/web/src/hooks/use-mount-effect.ts`). This is `useEffect(fn, [])` wrapped in a named hook.
2. **Custom hooks** — `useEffect` inside a purpose-built hook (`useMediaQuery`, `useDocumentTitle`, `useScrollRestore`, etc.) is acceptable when it truly syncs with an external system.
3. **Existing code** — legacy `useEffect` calls are tracked for removal. New code must not add more.

#### Five patterns that replace useEffect

| Instead of… | Do this |
|---|---|
| `useEffect(() => setX(derive(y)), [y])` | Compute inline: `const x = derive(y)` or `useMemo` |
| `useEffect(() => { fetch(url)... }, [url])` | `useQuery` (TanStack Query) |
| `useEffect(() => { if (flag) { doAction(); setFlag(false) } }, [flag])` | Call `doAction()` in the event handler |
| `useEffect(() => { setLocalState(init) }, [propId])` | Use `key={propId}` to force remount |
| `useEffect(() => { setup(); return cleanup }, [])` | `useMountEffect(() => { setup(); return () => cleanup() })` |

#### Smell tests — stop and refactor if you see

- `useEffect(() => setX(...), [y])` — derived state, compute inline
- State that only mirrors other state or props — redundant, remove it
- `fetch()` + `setState()` inside an effect — use `useQuery`
- "set flag → effect runs → reset flag" choreography — call from event handler
- Effect whose only job is resetting state when an ID/prop changes — use `key`
- Dependency arrays longer than 3 items — effect is doing too much, decompose

#### Guardrail

Every `useEffect` call in `apps/web/src/components/**` and `apps/web/src/routes/**` must be either:

1. **Refactored away** (preferred) — use the five patterns above.
2. **Tagged as audited** — add a comment on the line immediately before:

```ts
// effect:audited — <reason>
useEffect(() => { ... }, [...]);
```

Custom hooks in `apps/web/src/hooks/` are exempt (they are the approved encapsulation boundary).

### Data Fetching

- Client-side with oRPC + TanStack Query (no SSR for this SPA)
- Use `orpc.<router>.<procedure>.queryOptions()` for queries
- Use `useMutation` with `queryClient.invalidateQueries` for mutations
- Use `orpc.<router>.key()` for broad invalidation (all queries in a namespace) vs `queryKey()` for a specific query
- Use `skipToken` from `@tanstack/react-query` for conditional queries
- Use `infiniteOptions` for paginated lists with "load more" or infinite scroll
- Multiple `useQuery` hooks in the same component fire in parallel automatically — no need to coordinate
- For autosuggestions/autocomplete, call oRPC directly (`.call()`) with debounce and `AbortController` — do not use `useQuery`
- Show skeletons during loading, not spinners. Add a show-delay (~150-300ms) and minimum visible time (~300-500ms) to avoid flicker.

For full conventions including client plugins (CSRF, retry, batch), server-side calls, and framework patterns, see solved problem `web/data-fetching/orpc`.

### Forms

- Use `@tanstack/react-form` with Zod validators
- Always set `inputMode` for appropriate mobile keyboards
- Use `autocomplete` attributes for password manager support

### Styling

- Tailwind v4 with CSS variables defined in `packages/ui/src/styles/globals.css`
- OKLch color space for all theme colors
- Dark mode via `.dark` class (next-themes)
- `font-variant-numeric: tabular-nums` for numerical data
- `text-wrap: balance` for headings
- `text-decoration-skip-ink: auto` for underlines
- Never use `transition: all` — explicitly list only properties you intend to animate
- Respect `prefers-reduced-motion` for all animations; fall back to instant transitions
- Use `autofill:shadow-[inset_0_0_0px_1000px_var(--color-background)]` on inputs to fix autofill background in dark mode
- Nested radii: inner radius = outer radius - gap (e.g. `rounded-lg` on Card, `rounded-md` on inner elements)

For spacing systems, typography scales, visual hierarchy, and shadow/border conventions, see solved problem `design/refactoring-ui-practices`.

### Prisma

For schema naming conventions, relationship patterns, and optimization strategies, see solved problem `prisma/schema-guidelines`.
