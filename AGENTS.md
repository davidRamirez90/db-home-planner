# AGENTS.md

## Repository overview
DB Home Planner is a planning dashboard that recommends when to leave home for Deutsche Bahn departures, factoring in delays and cancellations. The UI is an Angular 21 app deployed to Cloudflare Pages, backed by a Cloudflare Workers API with shared TypeScript utilities.

### Planned layout (current/future)
- `apps/web`: Angular frontend (Cloudflare Pages)
- `workers/api`: Cloudflare Workers API (TypeScript)
- `packages/shared`: Shared types/utilities/models
- `docs`: Project documentation

## Engineering principles
- Prefer clarity and maintainability over cleverness.
- Keep features modular and scoped to a single responsibility.
- Optimize for accessibility and performance from the start.
- Follow Cloudflare Worker constraints and best practices.

## TypeScript best practices
- Use strict type checking.
- Prefer type inference when the type is obvious.
- Avoid the `any` type; use `unknown` when type is uncertain.

## Angular best practices
- Always use standalone components over NgModules.
- Must NOT set `standalone: true` inside Angular decorators. It is the default in Angular v20+ and applies to Angular 21.
- Use signals for state management.
- Implement lazy loading for feature routes.
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

### Components
- Keep components small and focused on a single responsibility.
- Use `input()` and `output()` functions instead of decorators.
- Use `computed()` for derived state.
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator.
- Prefer inline templates for small components.
- Prefer Reactive forms instead of Template-driven ones.
- Do NOT use `ngClass`; use `class` bindings instead.
- Do NOT use `ngStyle`; use `style` bindings instead.
- When using external templates/styles, use paths relative to the component TS file.

## State management
- Use signals for local component state.
- Use `computed()` for derived state.
- Keep state transformations pure and predictable.
- Do NOT use `mutate` on signals; use `update` or `set` instead.

## Templates
- Keep templates simple and avoid complex logic.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`.
- Use the async pipe to handle observables.
- Do not assume globals like (`new Date()`) are available.
- Do not write arrow functions in templates (they are not supported).

## Services
- Design services around a single responsibility.
- Use the `providedIn: 'root'` option for singleton services.
- Use the `inject()` function instead of constructor injection.

## Accessibility requirements
- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

## Notes for agents
- Look for additional `AGENTS.md` files in subdirectories; deeper instructions override this one.
- Keep documentation updates minimal unless requested.
- After making changes or implementing TODO items, update `TODOS.md` to reflect the latest status.
