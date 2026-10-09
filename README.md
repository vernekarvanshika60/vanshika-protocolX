# CatchUp AI – What Did I Miss?

Paste or upload a group chat and get priorities, decisions, deadlines, mentions and a task list.
**Fully local:** analysis is rule-based code in `src/analyzer.ts` (no AI API, no key, no network calls).
Data is kept in your browser's `localStorage`. No analytics, no cloud, no fonts/CDNs.

## Run
Requires Node 18+. One-time setup needs internet to download packages; afterwards it works offline.

    npm install
    npm run dev        # open http://localhost:5173

Offline build: `npm run build && npm run preview`

## Structure
    index.html            entry
    src/main.tsx          React bootstrap
    src/App.tsx           dashboard UI, tasks, saved summaries, export
    src/analyzer.ts       chat parser + scoring + markdown export
    src/samples.ts        demo conversations
    src/types.ts          shared types
    tailwind.config.js, postcss.config.js, vite.config.ts, tsconfig.json

## Chat formats understood
`[12/03/2025, 10:02] Name: text` · `12/03/2025, 10:02 - Name: text` · `10:02 Name: text` · `Name: text`
(WhatsApp/Telegram/Slack text exports). Wrapped lines are joined to the previous message.

## Tuning
Keyword rules and score weights are at the top of `src/analyzer.ts` (`RX`, `DATE`, `WEIGHT`).
Priority: score ≥ 6 high, ≥ 3 medium, else low.
