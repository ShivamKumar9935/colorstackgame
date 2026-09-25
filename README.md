# 🎨 Color Stack Online

A real-time 2-player browser game inspired by the physical Color Stack sorting game.

## Features

- Create a private 6-character room
- Friend joins with the room code
- Both players receive the exact same puzzle
- 6 tubes: 4 filled + 2 empty
- Tube capacity: 4 blocks
- Legal color-sorting moves
- Live opponent board and move count, with a solved-tubes progress bar for both players
- 2-minute race, with the timer pulsing red in the final 15 seconds
- First player to complete four monochrome stacks wins
- **Undo** — step back your last move (server-validated, so it can't be abused)
- One-click **copy invite link** (`?code=ABC123` auto-fills the join box for whoever opens it)
- Light/dark theme toggle, remembered across visits
- Sound on/off toggle with light synthesized pour / error / win sounds (no audio files needed)
- Confetti + a "solved in X moves / Y seconds" summary when you win
- Empty-slot outlines in each tube so capacity is always visible at a glance
- A tube glows green the moment it's fully sorted
- Invalid moves shake the tube and show a toast instead of a blocking `alert()`
- "How to play" modal
- No database required for the basic version

## Run locally

Install Node.js 20+.

```bash
npm install
npm start
```

Open:

http://localhost:3000

For testing multiplayer locally, open the URL in two browser tabs/windows.

## Deploy

This project is designed for a normal Node.js server because it uses Socket.IO.

Good options include a Node-compatible hosting service such as Render or Railway.

Set the start command to:

```bash
npm start
```

The server uses `process.env.PORT`, so the hosting provider can assign the port.

## Important

Rooms are kept in server memory in this starter version. If the server restarts, active rooms disappear.

For a production version, add:

- Redis for persistent/shared room state
- reconnect handling
- anti-cheat/server-authoritative move validation
- player ready state
- rematches
- spectator mode
- chat
- sound/music
- accounts/leaderboards
- mobile polish
