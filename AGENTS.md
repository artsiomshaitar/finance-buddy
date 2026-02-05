# Home Finance — Project Rules

This document defines general rules for agents and contributors when working on this codebase.

---

## Project Conventions

### Package manager and tooling

- **Always use `bun`.** Use `bun` for installing dependencies (`bun add`, `bun install`), running scripts (`bun run`), and executing tools. Do not use npm, pnpm, or yarn.

### UI/UX

- **Match a terminal UI approach.** Prefer a terminal/CLI-inspired aesthetic: monospace or terminal-style fonts where appropriate, high-contrast text, clear hierarchy, minimal decoration, and a focus on data and structure over flashy visuals. Think dashboards and tools like htop, ledger, or terminal-based finance UIs.

### Data fetching and state

- **Use TanStack Query for data fetching.** Do not fetch in `useEffect`. Use `useQuery`, `useMutation`, and related TanStack Query APIs for server state. This gives caching, deduplication, and loading/error handling without manual effect logic.

- **Minimize `useEffect` and `useState`.** Prefer:
  - TanStack Query for server data
  - Derived values during render (compute from props/other state)
  - Event handlers for user-driven side effects
  Use `useEffect` only when you need real external sync (e.g. DOM, subscriptions, timers). Use `useState` only when the value is not derivable and is not server state.

---

## Summary

| Area           | Rule                                                                 |
|----------------|----------------------------------------------------------------------|
| Package manager | Always use `bun`                                                    |
| UI/UX          | Terminal UI style: monospace/terminal feel, high contrast, data-first |
| Data fetching  | TanStack Query; no `fetch` in `useEffect`                           |
| State/effects  | Avoid `useEffect` and `useState` unless necessary                   |
