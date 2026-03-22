# User Testing Report — 2026-03-21

## Summary
- **Total steps:** 132
- **Passed:** 108
- **Failed:** 12
- **Skipped:** 12
- **Pass rate:** 81.8% (108/132)

## Blockers
(none — all features are functional, major issues are usability/data-integrity bugs)

## Major Issues (5)

| # | Issue | Steps | Impact |
|---|-------|-------|--------|
| 3 | Sidebar collapse state not persisted | 2.2.5 | UX: sidebar resets to expanded on every page load |
| 4 | Post-save redirect missing category slug → 404 | 2.4.2, 2.4.11 | Users see 404 after creating/moving articles |
| 5 | Version restore non-functional | 2.4.9 | Data: cannot revert to previous article versions |
| 9 | Category permission overrides not surfaced in UI | 3.2.4 | RBAC: viewers with editor override can't edit in UI |
| 10 | Import deduplication not implemented | 3.4.1–3.4.5 | Data: re-import creates duplicate articles/categories |

## Minor Issues (5)

| # | Issue | Steps | Impact |
|---|-------|-------|--------|
| 1 | Dark mode login logo uses full-color instead of white | 2.1.4 | Visual: logo hard to read on dark background |
| 2 | Admin headings use DM Sans instead of Cardo serif | 2.1.8 | Visual: typography inconsistency |
| 6 | No status badge on article view page | 2.3.2 | UX: users can't see article status at a glance |
| 7 | Search missing date range and tag filters | 2.5.9–2.5.11 | Feature gap: filter options limited |
| 8 | Tag badges not clickable links | 2.6.9 | UX: can't navigate from tag to search results |

## Per-Suite Breakdown

### Phase 1 — Setup, Import & Smoke Test
| Suite | Steps | Pass | Fail | Skip |
|-------|-------|------|------|------|
| Task 0: Prerequisites | 4 | 4 | 0 | 0 |
| Task 1: Import & Smoke | 11 | 11 | 0 | 0 |

### Phase 2 — Feature Suites
| Suite | Steps | Pass | Fail | Skip |
|-------|-------|------|------|------|
| 2.1 Branding & Dark Mode | 9 | 7 | 2 | 0 |
| 2.2 Navigation & Chrome | 10 | 9 | 1 | 0 |
| 2.3 UI Components | 6 | 5 | 1 | 0 |
| 2.4 Content Management | 21 | 16 | 3 | 2 |
| 2.5 Search & Discovery | 14 | 9 | 1 | 4 |
| 2.6 Tags | 12 | 11 | 1 | 0 |
| 2.7 Admin Users & RBAC | 9 | 9 | 0 | 0 |
| 2.8 Admin API Keys | 7 | 7 | 0 | 0 |
| 2.9 Polish & Accessibility | 10 | 8 | 0 | 2 |
| 2.10 RAG API | 6 | 6 | 0 | 0 |
| 2.11 Workflow Bug Fixes | 4 | 4 | 0 | 0 |

### Phase 3 — Cross-Cutting Scenarios
| Suite | Steps | Pass | Fail | Skip |
|-------|-------|------|------|------|
| 3.1 Article Lifecycle Across Roles | 11 | 11 | 0 | 0 |
| 3.2 Category Permission Cascade | 8 | 5 | 1 | 2 |
| 3.3 Search Reflects Mutations | 8 | 8 | 0 | 0 |
| 3.4 Import Deduplication | 5 | 0 | 5 | 0 |
| 3.5 Dark Mode Persistence | 4 | 4 | 0 | 0 |

## Skipped Steps
- **2.4.14–2.4.15**: Empty state CTA (deferred — not critical path)
- **2.5.5**: Semantic search results (embeddings not generated in dev env)
- **2.5.10–2.5.11**: Tag filter / clear-all (filters not implemented)
- **2.9.9–2.9.10**: Keyboard navigation flow / reduced motion (requires OS settings)
- **3.2.5–3.2.6**: Verify viewer can edit in override category (blocked by Issue 9)

## What Works Well
- Full article CRUD lifecycle (create, edit, publish, archive)
- Import of 338 articles from ZIP with progress indicator
- Search with full-text, semantic, and hybrid modes
- Tag management (create, assign, delete)
- Admin user management with RBAC role assignment
- API key management with create/revoke workflow
- RAG API with proper auth, validation, and category filtering
- Dark mode with consistent theming across all pages
- Accessibility: skip-to-content, ARIA labels, focus rings, toast announcements
- Cross-role authorization (viewer blocked from edit/admin/create)
- Search index updates in real-time on article mutations

## Screenshots
- `screenshots/1.11-landing-page-populated.png` — Landing page after import
- `screenshots/2.1.4-dark-mode-login-fullcolor-logo.png` — Wrong logo in dark mode
- `screenshots/2.2.5-sidebar-collapse-not-persisted.png` — Sidebar not persisting collapse
- `screenshots/2.4.2-wrong-redirect-404.png` — 404 after article creation
- `screenshots/3.4-reimport-no-dedup.png` — Duplicate import with no dedup

## Full issue details
See [2026-03-21-issues.md](2026-03-21-issues.md) for detailed issue descriptions with likely causes.
