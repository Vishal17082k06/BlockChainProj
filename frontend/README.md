# Witness: the console frontend

The browser side of the integrity demo. React 19 + TypeScript (strict) + Vite, TanStack Query for data,
plain CSS Modules with design tokens, Vitest + Testing Library for tests. No UI kit: the look is
specific to this project (design notes: `docs/specs/2026-10-21-demo-console-design.md`).

## Use it

Build once, then the Python API serves it:

```powershell
cd frontend
npm install        # first time only
npm run build      # writes frontend/dist
cd ..\python
.\.venv\Scripts\python.exe run_ui.py
```

Open http://127.0.0.1:8000.

## Develop it

Run the API (`run_ui.py`) in one terminal and the live-reloading dev server in another:

```powershell
cd frontend
npm run dev        # http://127.0.0.1:5173, /api is proxied to port 8000
```

## Check it

```powershell
npm test           # 162 tests
npx tsc --noEmit   # strict type check
```

## How it is organised

| Folder | What lives there |
|--------|------------------|
| `src/lib/` | Pure logic with no React: the API client, the NDJSON stream reader, the stage reducer, hex diffing for the Seal check, activity lines, formatting. Tested on their own. |
| `src/hooks/` | `useWrite` (runs one write and turns the real stage stream into state), `useVerifyAll`, the polling queries. |
| `src/components/` | One folder-free file pair per component (`X.tsx` + `X.module.css`), tests beside them. |
| `src/Workspace.tsx` | Everything that belongs to ONE network. `App` renders it with `key={network}`, so switching network starts it fresh and nothing from Local can be mistaken for Sepolia. |
| `src/styles/` | `tokens.css` (colours, type, space) and `base.css`. |

## Rules this code keeps

- **Nothing is simulated.** Every step in the progress card appears only when the API reports that stage.
- **Status is never colour alone**: every status has an icon and a word.
- **Keyboard first**: the ledger is an ARIA grid with arrow-key movement, the Attack lab traps focus and closes on Escape.
- **Contrast**: every text and background pair in `tokens.css` is at least 4.5:1 (WCAG AA).
- **Reduced motion** is respected.
