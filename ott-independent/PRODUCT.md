# Oẳn Tù Tì 2.0
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Docker: Next.js production, Node session/control gateway, SQLite WAL and a separate Wasmtime/CPython WASI judging worker. Legacy practice deployments use Next.js/Neon on Vercel or Vinext/D1 on Sites. The original board-game engine is reused.

## Official tournament workspace

`/competition` on Docker supports roster invitations, immutable Python submissions, approved public GitHub commit imports, config JSON, balanced groups, side-swapped series, knockout brackets, authoritative replays, publication, exports, queue leases, heartbeat and bounded retries. Organizer rights require an explicit host-owner CLI grant. Source is executed only inside a read-only capability-limited WebAssembly guest. Practice results do not enter official standings. The initial capacity evidence is a 16-team/62-game end-to-end run; 4,000 concurrent entrants have not been certified. Preserve the incumbent visual system; operate-mode tables, clear states and direct actions take precedence over decoration.

## Users
Vietnamese students writing Python strategy bots, and tournament organizers reviewing submissions and running competitions.

## Product Purpose
Turn the existing 9×9 Oẳn Tù Tì board game into a programming competition: learn the API, submit a versioned bot, practice, inspect replays, and join tournaments.

## Positioning
Python strategies compete on the same 9×9 board and shared rules as the existing network-programming game.

## Operating Context
Students work with Python files, SDK examples, legal moves, match histories and competition rankings. Repository: https://github.com/nguyenlean17/network-programming.

## Capabilities and Constraints
The Play section supports human hotseat/free play, human vs built-in strategies, human vs an owned/draft Python bot, and server-authoritative friend rooms with invite links. Friend games use the existing Site audience; invitations do not grant access. Python human opponents run in a persistent isolated worker with a 2-second move limit. These casual games never affect official rankings.
Reuse FRONTLINE placement, P1 goal I1, P2 goal A9, king moves and ROCK/PAPER/SCISSORS capture rules. Proposed tournament defaults: maximum 200 plies, side-swapped fixtures, 3/1/0 scoring. Cloud records persist in D1. Browser-run Python practice results are untrusted and cannot become official scores. Official submitted-bot tournament execution requires the supplied external sandbox runner. The hosted app must clearly distinguish practice, reference-bot exhibition, and official results.

## Brand Commitments
Vietnamese-first. User delegates visual decisions. Respect the original project's crisp, solid-color, no-gradient design. Preserve its multiplayer game.

## Evidence on Hand
The 9-page proposal PDF and existing repository engine, tests, and README. No real entrants, prizes, or official event dates have been supplied. Seeded examples must be labeled.

## Product Principles
Make writing and testing a first bot immediate. Keep results reproducible and inspectable. Never execute student Python inside the web server. Do not invent participation or official results.

## Self-hosted Docker copy
The Docker copy runs the same app behind an email/password gateway with persistent SQLite accounts and server-side sessions. Accounts and data are independent from Sites. Organizer bootstrap needs an explicit host-owner CLI grant. Three labeled Python samples (Sprinter, Guardian, Tactician) can be loaded, downloaded, or selected for human play.
