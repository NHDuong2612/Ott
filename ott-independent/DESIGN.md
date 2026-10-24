# Tournament control desk

The user delegated the visual direction. A warm ivory application shell, narrow midnight navigation rail, and ink-blue arena establish a calm workspace for long coding sessions. Citrus green marks actions and active play; coral identifies the opposing side. Solid fills, crisp edges, no gradients. Typography uses Be Vietnam Pro for Vietnamese content and JetBrains Mono for code and coordinates.

The first viewport gives the next action immediately: create a bot or test the reference match. The 9×9 board is the signature interaction, with stepwise replay, legal coordinates, and side-specific shapes. Rankings and submissions use real rows. Empty states offer the action that creates their data. Reference matches are labeled as examples.

Grounded directions: coding classroom, tournament scorebook, strategy-game club, open-source documentation, university lab, tournament control desk, replay studio. The sixth was assigned by the design helper and matches the user's delegated direction. Preserve the original engine and no-gradient commitment.

## Components

### Official tournament workspace — `/competition`

This inherited-world extension supports Vietnamese students and ban tổ chức (BTC) running official tournaments. It carries the existing warm ivory shell, midnight rail and lime actions into standings, submissions, match replay and administration. Be Vietnam Pro carries interface text; JetBrains Mono carries Python, JSON, hashes and runtime details. This records the implementation in `app/competition/page.tsx` and `app/competition/tournament.css`; it introduces no new global identity.

- **Layout:** a fixed navigation rail (236px) sits beside a bounded content area (1390px maximum). At 1100px the rail narrows (205px), group standings and replay become single-column, and content padding contracts. At 700px the rail becomes an in-flow header; navigation uses two columns so the BTC entry remains visible. Tables scroll horizontally within their own containers.
- **Controls and surfaces:** lime identifies primary actions and active navigation; neutral buttons and white fields use restrained corners (8px and 7px). Event summaries use rounded containers (12px); standings, queues, rosters and schedules remain flat rows with thin dividers. Depth comes from solid tonal surfaces and borders, without shadows or gradients. Keyboard focus uses an offset outline (3px).
- **Lifecycle and feedback:** Vietnamese labels identify draft, submission, locking, group, knockout, review and published states. Text accompanies status styling. Progress shows completed judging jobs; notices and errors use distinct tonal fills. Actions appear at their relevant lifecycle stage. Frozen configuration text and saving are disabled outside draft/open states.
- **Direct paths:** the BTC action “Tạo giải đấu mới” clears the selected tournament and opens the creation form. Student submission, recent-match replay and BTC controls retain separate navigation entries. Replay keeps the coordinate board and step/play controls; the workspace footer distinguishes official results from practice.

Keep these patterns local to the official tournament workspace. Extend real rows, lifecycle labels and contextual actions when adding tournament views; preserve the incumbent palette and typography.

## UET–VNU refinement (current identity)

The user requested a light UET–VNU rebrand. The existing layout, typography, spacing, tournament workflows and game semantics remain unchanged. University-blue actions (#034ea1), a navy navigation rail (#102b4d), cool light surfaces and a typographic UET Arena / VNU lockup now supersede the previous lime action palette. This is a product wordmark, not a recreated official university seal. Success, error and opposing-player colors retain their semantic meanings. Login, practice and official competition share this identity.
