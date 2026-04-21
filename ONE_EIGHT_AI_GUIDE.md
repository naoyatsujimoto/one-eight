# ONE EIGHT — AI Reference Guide

## Overview

ONE EIGHT is a two-player abstract strategy board game.  
Category: complete information, deterministic, zero-sum (same class as Go/Chess).  
Players: Black and White. Black moves first.  
Goal: own more Positions than the opponent when all Gates are full.

---

## Board Structure

### Positions (13 total): A–M

Positions are arranged in a 3-3-3-3-1 grid:

```
[ A ][ B ][ C ]
[ D ][ E ][ F ]
[ G ][ H ][ I ]
[ J ][ K ][ L ]
      [ M ]
```

Each Position has one owner (Black / White / unowned).  
The player with more owned Positions at game end wins.

### Gates (12 total): 1–12

Gates surround the Position grid like the edges of an octagon.

```
      [1][2][3][4]
  [12]            [5]
  [11]            [6]
      [10][9][8][7]
```

Each Gate has **slot groups**:
- **Large slots** × 2 — filled by Massive build (value: 64 each)
- **Middle slots** × 2 — filled by Selective build (value: 8 each)
- **Small slots** × 4 — filled by Quad build (value: 1 each)

A Gate is **full** when all 8 slots (2+2+4) are occupied.  
The game ends when **all 12 Gates are full**.

### Position ↔ Gate mapping

Each Position is connected to exactly 4 Gates:

| Position | Connected Gates |
|----------|----------------|
| A | 1, 2, 7, 12 |
| B | 2, 3, 6, 11 |
| C | 3, 4, 5, 10 |
| D | 1, 3, 7, 11 |
| E | 2, 4, 6, 10 |
| F | 3, 8, 11, 12 |
| G | 1, 4, 7, 10 |
| H | 2, 5, 6, 9 |
| I | 4, 8, 10, 12 |
| J | 1, 5, 7, 9 |
| K | 4, 9, 10, 11 |
| L | 5, 8, 9, 12 |
| M | 1, 6, 7, 8 |

---

## Turn Structure

Each turn consists of exactly two steps:

### Step 1: Positioning

Select one Position. Rules:
- Unowned → claim it (becomes yours)
- Already yours → re-select (no change to ownership; still required to select)
- Opponent's → can capture it **only if** capture condition is met (see below)

### Step 2: Build

After selecting a Position, choose one build type using the 4 connected Gates:

#### Massive Build
- Click a **Large slot** on one of the 4 connected Gates
- Places 1 Large asset (value 64) into that Gate
- Available when: the Gate has an empty Large slot

#### Selective Build
- Click **Middle slots** on 1 or 2 of the 4 connected Gates
- Places 1 Middle asset (value 8) per Gate selected
- If selecting 2 Gates: click the first Middle slot, then the second
- If only 1 Gate has an open Middle slot: click it and confirm
- Available when: at least 1 connected Gate has an empty Middle slot

#### Quad Build
- Click **Small slots** on 1–4 of the connected Gates, then confirm
- Places 1 Small asset (value 1) per Gate selected (up to the number of Gates with open Small slots)
- Available when: at least 1 connected Gate has an empty Small slot

#### Skip
- If no build is possible on the selected Position (all connected Gates are full), the turn is skipped automatically

---

## Capture Rule

A player can capture an opponent's Position if:

1. Identify the **most built Gate(s)** among the 4 connected Gates  
   (most built = highest total asset value in that Gate)
2. Among those most-built Gates, count how many are **dominated** by the attacker vs. the defender  
   (dominated = attacker's total value in that Gate > defender's total value)
3. If the attacker dominates **more** of those top Gates than the defender → capture succeeds

Capture replaces the opponent's ownership with the attacker's.

---

## Victory Condition

When all 12 Gates are completely full (all 96 slots occupied):
- Count each player's owned Positions
- More Positions = winner
- Equal = draw

---

## Asset Values (for dominance comparison)

| Size | Value |
|------|-------|
| Large | 64 |
| Middle | 8 |
| Small | 1 |

---

## UI Operations (Web MVP)

### Screen flow
```
Title Screen → (tap/swipe up) → Tutorial → (tap Complete/Skip) → Game
```

### Game screen layout
- **Topbar**: ONE EIGHT logo | mode label | Undo / History / Stats / New Game buttons
- **Board**: 13 Position cells + 12 Gate cells arranged octagonally
- **Side panel**: Turn info, build controls, How to Play, Import Record, Analytics

### How to play a turn

1. **Tap a Position cell** (A–M) to select it  
   - Selected Position is highlighted  
   - The 4 connected Gates become interactive  

2. **Tap a Gate slot** to build:
   - Large slot (top/bottom of Gate) → Massive build
   - Middle slot (left/right of Gate) → Selective build (tap 1–2 Gates, confirm if needed)
   - Small slot (corners of Gate) → Quad build (tap 1–4 Gates, then tap **Confirm** button)

3. Turn ends automatically after build is applied

### Undo
- Tap **Undo** in the topbar
- Human vs Human: undoes 1 turn
- Human vs CPU: undoes back to the previous human turn

### New Game
- Tap **New Game** → select **Human × Human** or **Human × CPU**

### My Stats
- Tap **Stats** in the topbar (visible when logged in)
- Shows: Total / Wins / Losses / Draws + recent 10 match history

### CPU mode
- CPU plays as White automatically after each human turn
- A banner "CPU is thinking…" appears during CPU computation
- Human interaction is blocked during CPU turn

### Auth
- Login screen appears before the game
- **Magic Link tab**: enter email → receive link → click to login
- **Password Login tab**: enter email + password → login immediately
- Logged-in email shown in top-right bar; **Sign out** button available

---

## Key Constraints for AI Play

- A Position **must** be selected before any build
- You can only build on Gates **connected to the selected Position**
- If you re-select the same Position you already own, ownership does not change (still valid)
- Builds are committed immediately (no preview for Large/Middle; Small requires Confirm)
- The game cannot end mid-turn; it ends only when the last Gate slot is filled at turn end
- Positions with no connected open Gate still count as valid selections (turn results in skip)
