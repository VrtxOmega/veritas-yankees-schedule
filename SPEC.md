# VERITAS Yankees 2026 — Interactive Schedule
**SPEC v1.0 | Build: IMMEDIATE | Gate: VERITAS CLAIM:VERITAS-STELLAR**

---

## 1. Concept & Vision

A premium, dark-mode Electron dashboard that replaces the generic MLB schedule with something a Yankees fan near St. Louis would actually open every day. It's not just a schedule — it's mission control for the 2026 Yankees season. Black and gold palette, VERITAS typography, live score updates, Cardinals rivalry alerts, and a "near me" filter that surfaces games in St. Louis, Chicago, and Kansas City.

The personality: confident, data-rich, slightly arrogant about being the best-looking schedule app in any room.

---

## 2. Design Language

### Aesthetic Direction
**Dark command center** — think Bloomberg terminal meets Yankees luxury. Deep blacks, gold accents, clean data density. No pastel pop — this is premium sports intelligence.

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0A0A0A` | Main background |
| `--bg-surface` | `#111111` | Cards, panels |
| `--bg-elevated` | `#1A1A1A` | Hover states, modals |
| `--border` | `#2A2A2A` | Dividers, card borders |
| `--gold-primary` | `#D4AF37` | Primary accent, highlights |
| `--gold-light` | `#F0D060` | Hover gold |
| `--gold-dim` | `#8A7020` | Muted gold |
| `--navy-yankees` | `#003087` | Yankees navy |
| `--red-accent` | `#E0403A` | LIVE, Cardinals alert |
| `--green-live` | `#00C853` | In-progress score |
| `--text-primary` | `#F5F5F5` | Main text |
| `--text-secondary` | `#999999` | Secondary labels |
| `--text-muted` | `#555555` | Disabled, timestamps |

### Typography
- **Headings**: `Oswald` (bold, athletic, condensed) — Google Fonts
- **Data/Numbers**: `JetBrains Mono` — scores, stats, times
- **Body**: `Inter` — descriptions, labels
- All text uses `font-feature-settings: "tnum"` for tabular number alignment

### Spatial System
- Base unit: 8px
- Card padding: 16px
- Section gap: 24px
- Border radius: 4px (sharp, not soft)

### Motion Philosophy
- **Score updates**: Number flip animation (CSS 3D transform), 300ms
- **Panel transitions**: Slide-up + fade, 200ms ease-out
- **Live pulse**: Pulsing gold dot on live games, 1.5s infinite
- **Card hover**: Subtle gold border glow, 150ms
- **Page transitions**: Crossfade 200ms

### Visual Assets
- **Icons**: Lucide icons (yarn add lucide)
- **Yankees logo**: SVG inline (NY crest)
- **Cardinals logo**: SVG inline (STL bird)
- **Stadium pins**: Custom SVG markers on map
- **No external images** — all visuals are SVG/CSS generated

---

## 3. Layout & Structure

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: VERITAS ⦿ YANKEES 2026    [LIVE 🔴] [⟳ Sync]  │
├─────────────────────────────────────────────────────────┤
│  ◀ MARCH  ● APRIL ● MAY ● JUNE ● ... ● OCTOBER ▶       │  ← Month nav
├──────────────────────────┬──────────────────────────────┤
│                          │                              │
│   TEAM STANDINGS         │   TODAY'S GAME (hero card)  │
│   (American League)       │   [Live score if active]    │
│                          │                              │
├──────────────────────────┴──────────────────────────────┤
│                                                          │
│   SCHEDULE GRID (scrollable)                            │
│   [Date] [Opponent] [Location] [Time/Result] [Watch]   │
│   ★ = Near St. Louis                                    │
│   🔴 = Live                                             │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  RIVALRY TRACKER  |  ST. LOUIS NEAR-ME MAP  |  STATS   │
└─────────────────────────────────────────────────────────┘
```

### Responsive Strategy
- Min width: 900px (desktop app — not mobile-first)
- Fixed sidebar + fluid main content
- Month nav scrolls horizontally

---

## 4. Features & Interactions

### 4.1 Live Score Updates
- Poll MLB Stats API every 30 seconds during live games
- Number flip animation on score change
- "LAST UPDATE: Xm ago" timestamp
- Inning + outs displayed during play
- Pitch-by-pitch not shown (too noisy)

### 4.2 Near-Me Game Filter
- Default: show ALL games
- Toggle: "★ Near Me" — filters to: STL, CHC, CWS, KC, MIN, DET
- Distance shown per game: "▲ 289mi from StL"
- Badge: "CLOSEST" on the nearest upcoming game

### 4.3 Rivalry Tracker
- Yankees vs. Red Sox: Season record, next game countdown
- Yankees vs. Mets: Subway Series dates highlighted
- Yankees vs. Cardinals: Inter-league rage — proximity + rivalry

### 4.4 Season Stats Widget
- Team standings (AL East)
- Top 5 Yankees HR leaders
- Team record (W-L)
- Win %

### 4.5 St. Louis Proximity Map
- Simple SVG map showing STL, CHI, KC triangle
- Pin markers for near-me venues
- Hover reveals venue details

### 4.6 Game Detail Modal
- Click any game → modal with full details
- Probable pitchers
- Weather forecast for game day
- Ticket availability (stubhub placeholder)
- "Add to Calendar" .ics download

### 4.7 Month Navigation
- Scroll through full season March–October
- Current month auto-highlighted on load
- "Today" button to jump to current date

### 4.8 Sync/Refresh
- Manual sync button with spinning animation
- Auto-poll every 60 seconds when app is focused
- "Last synced: X:XX PM" in header

### 4.9 Notification Badges
- Game day: gold badge on month nav dot
- Live game: pulsing red dot
- Near-me game: star indicator

---

## 5. Component Inventory

### Header
- VERITAS logo (SVG) + "YANKEES 2026" in Oswald
- LIVE indicator: pulsing red dot + "LIVE" text (hidden when no live game)
- Sync button: spinning icon on sync, timestamp on idle
- States: normal, syncing, offline

### Month Navigator
- Horizontal pill nav, Oswald font
- Active month: gold background, dark text
- Inactive: transparent, gold text, hover shows bg
- Has-games indicator dot below each month
- States: default, hover, active, today

### Game Card
- Row layout: Date | Opponent logo + name | Venue | Time/Result | Watch
- **Near-me**: star icon, distance badge
- **Live**: red pulsing border, score display
- **Completed**: final score, W/L indicator
- **Upcoming**: time in ET, "preview" label
- Hover: gold border glow
- States: upcoming, live, completed, near-me, selected

### Today Game Hero Card
- Large format card when games are today
- Team logos, full scoreboard, inning info
- Broadcast logos (ESPN, YES, MLB Network)
- States: no-game-today, upcoming, live, final

### Standings Table
- AL East standings: rank, team, W, L, GB, STRK
- Yankees row highlighted in gold
- Click row → scroll to that team's next game
- States: loading, loaded, error

### Rivalry Panel
- Card per rivalry (Sox, Mets, Cardinals)
- Head-to-head record
- Next matchup date + venue
- States: off-season, in-season-active

### Stadium Map
- SVG schematic: STL, CHI (Cubs/White Sox), KC, DET, MIN
- Pin icons, hover tooltip with venue name + capacity
- Highlighted: games within 350mi of StL

### Game Detail Modal
- Overlay modal, dark glass effect (backdrop-filter)
- Full game info, probable pitchers, weather
- States: upcoming, live, final

### Stats Widget
- Yankees record (large W-L display)
- Top batters list with HR counts
- Team AVG, ERA placeholder
- States: loading skeleton, loaded

---

## 6. Technical Approach

### Stack
- **Runtime**: Electron 33.x (Node 20)
- **Frontend**: Vanilla JS + CSS (no framework overhead)
- **Build**: electron-builder via Windows Node (see skill: electron-windows-build-from-wsl)
- **Data**: MLB Stats API v1 (public, no auth required)
- **Geo**: Haversine distance calc (pure JS, no API needed)

### API Endpoints Used
- Schedule: `https://statsapi.mlb.com/api/v1/schedule?sportId=117&season=2026&teamId=147`
- Team info: `https://statsapi.mlb.com/api/v1/teams/147`
- Live game: `https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live`
- Standings: `https://statsapi.mlb.com/api/v1/standings?season=2026&leagueId=103`

### Data Model
```javascript
Game {
  gamePk: number,
  date: ISO8601,
  status: 'UPCOMING' | 'LIVE' | 'FINAL',
  homeTeam: TeamRef,
  awayTeam: TeamRef,
  venue: { name, city, lat, lng },
  seriesInfo: { name, gameNumber },
  teams: { home: { score }, away: { score } },
  probablePitchers: [{ id, fullName, stats }]
}

TeamRef { id, name, abbreviation, logoUrl }

UserPrefs {
  nearMeCities: ['St. Louis', 'Chicago', 'Kansas City'],
  nearMeRadius: 350, // miles
  favoriteTeam: 'NYY'
}
```

### File Structure
```
veritas-yankees-schedule/
├── package.json
├── main.js              # Electron main process
├── preload.js           # Context bridge
├── renderer/
│   ├── index.html
│   ├── styles.css
│   ├── app.js           # Main app logic
│   ├── api.js           # MLB API client
│   ├── geo.js           # Haversine distance calc
│   ├── schedule.js      # Schedule data + filtering
│   ├── scores.js         # Live score polling
│   ├── modal.js          # Game detail modal
│   └── utils.js          # Date formatting, etc.
├── assets/
│   ├── icon.ico         # Will be auto-generated
│   └── logos/            # SVG team logos (inline)
└── build/
    └── icon.ico
```

### CORS Strategy
Renderer makes direct API calls to MLB Stats API (supports CORS). Fallback: if CORS fails, proxy through Electron main process IPC.

### Offline Handling
- Cache last successful fetch in localStorage (game data only)
- Show "OFFLINE — showing cached data" banner
- Queue refresh for when connection restores

---

## VERITAS Pipeline Gates
- [x] INTAKE: Spec written ✓
- [ ] BUILD: All components implemented
- [ ] VERIFY: Live data loads, near-me filter works
- [ ] DEPLOY: .exe delivered to Rage

---

*Built with VERITAS precision. Go Yankees.*
