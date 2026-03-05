# Phase 4: Role-Based Access Control (RBAC) — What We Built and Why

This document explains what was accomplished in Phase 4 of the Dovetail project, written for a non-technical audience.

## What is Phase 4?

Phase 4 adds **permission enforcement**. Phase 3 established *who* the user is; Phase 4 determines *what they are allowed to do*. Dovetail has three roles — viewer, editor, and admin — and this phase ensures those roles are actually checked before any action is allowed.

## What We Built

### 1. Permission Resolution Service (`apps/api/src/services/permissions.ts`)

This is the core logic that answers: "What role does this user have in the context of this category?"

The answer isn't always simple. A user has a **global role** (set on their account), but they might also have **category-level overrides**. For example, a user might be a viewer globally but an editor for the "Housing Law" category. Categories can also be nested — "Tenant Rights" might be inside "Housing Law" — and permissions **cascade** from parent to child.

The resolution algorithm:
1. Start at the specific category the user is accessing
2. Walk up the ancestor chain (child → parent → grandparent)
3. If the user has a role override at any level, use the most specific one (closest to the target category)
4. If no override exists anywhere in the chain, fall back to the user's global role

This is implemented as a **recursive CTE** (Common Table Expression) — a single SQL query that walks the tree in the database, which is more efficient than making multiple queries.

**Why this matters:** Category-level permissions mean organisations can give different teams different access levels without affecting the rest of the knowledge base. An intern might be a viewer everywhere but an editor in their team's category.

### 2. Role Hierarchy (`hasMinimumRole`)

Roles are ordered: viewer < editor < admin. The `hasMinimumRole` function checks whether a user's role meets or exceeds a required level. An admin can do anything an editor can do; an editor can do anything a viewer can do.

**Why this matters:** Route handlers don't need to check for specific roles — they just say "this requires at least editor level" and the function handles the comparison.

### 3. `requireRole` Middleware (`apps/api/src/middleware/requireRole.ts`)

This is a simple gate that can be added to any route. It checks the user's **global** role before the request reaches the route handler. Routes that need at least "editor" level add `requireRole('editor')` to their middleware chain.

For category-specific checks, the route handler calls `resolveRole()` directly after fetching the resource (since it needs to know which category the resource belongs to).

**Why this matters:** Permission checks are declarative and consistent. A developer adding a new route just says `requireRole('editor')` and the middleware handles the rest. There's no risk of forgetting to check permissions.

### 4. Automated Tests

We wrote comprehensive tests for both the permission resolution service and the requireRole middleware:

- **Permission resolution:** Tests verify that global roles are used when no override exists, exact category matches take precedence, and the deepest (most specific) match wins in nested categories.
- **requireRole middleware:** Tests verify that viewers are blocked from editor routes, editors are allowed, admins are allowed everywhere, and missing users are rejected.

**Why this matters:** The permission system is a security boundary. Automated tests ensure it cannot be accidentally broken by future changes.

## How the Middleware Chain Works

Protected routes use this pattern:

```
Request → authMiddleware → requireRole('editor') → route handler
```

1. `authMiddleware` verifies the JWT and attaches the user's identity
2. `requireRole` checks the user's global role meets the minimum
3. The route handler runs (and may additionally call `resolveRole()` for category-specific checks)

If any step fails, the request is rejected with an appropriate error code (401 for no auth, 403 for insufficient permissions).

## What's Next

Phase 5 uses this RBAC system to protect the article and category CRUD endpoints, ensuring that only users with the right role can create, edit, or delete content.
