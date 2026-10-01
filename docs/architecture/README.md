# Architecture documents

Phase 0 of the multi-vertical rearchitecture (audit only, no code changes). Audited at HEAD `869ece3` on 2026-10-01.

| Document | What it is | Read it when |
|---|---|---|
| [current-state.md](current-state.md) | What the system actually does today, from the code. Architecture, domain model, cascade trace, hard-coded quartet assumptions, tenant isolation, consolidated risk register, open ambiguities, glossary. | Before touching anything. |
| [state-machines.md](state-machines.md) | Part 1: offer, position, substitution, project, payment and reminder state machines as implemented, with guards, side effects and unsafe transitions marked. Part 2: proposed target machines and DB guarantees. | Before changing any status column or cascade route. |
| [target-architecture.md](target-architecture.md) | Proposed minimal target design, schema changes one table per change, the `src/lib/staffing/` module, vertical configuration, test strategy, PR-sized implementation sequence, feature flags, rollback. | When planning the next PR. |
| [audit/](audit/) | The four detailed audit reports (A infrastructure, B domain model and tenancy, C offer cascade, D hard-coded assumptions and reuse) that the three documents above summarize. | When a summary needs its evidence. |

Nothing in `target-architecture.md` or Part 2 of `state-machines.md` is implemented. The first implementation PR is the integrity-probe script and characterization tests described in `target-architecture.md` section 8.
