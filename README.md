# Viking 4X

A classic kingdom-building MMORTS, Viking-themed, with three nuances: a real sea with longships, a kingdom assembly (the Thing), and heroes as bloodlines.

This repository holds the code. The plan, design, and decisions live in the roadmap folder on Hawk's desktop:
`C:\Users\Notandi\OneDrive\Desktop\Viking-4X-Roadmap` — start with `00-START-HERE.md`.

## Layout

```
apps/server     TypeScript (Fastify) API + worker. Postgres + Redis (BullMQ).
apps/mobile     Godot 4 client. Exports to iOS, Android, Windows.
packages/shared OpenAPI contract and generated clients.
infra           Deployment (Railway) and environment.
docs            Repo-local docs (dev setup lives in the roadmap folder).
```

Stack: see the roadmap's `02-Decisions/stack.md` (DEC-006).
