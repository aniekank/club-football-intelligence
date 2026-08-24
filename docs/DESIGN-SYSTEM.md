# Design system

The interface is the one thing NOT inherited from World Cup Intelligence. The
engine was harvested; the presentation layer was rebuilt, and zero WCI
components were ported.

## The rule

`src/styles/tokens.css` is the only place a colour, size, duration or radius is
defined. `tailwind.config.ts` maps onto it and **replaces** Tailwind's default
scales rather than extending them — so `bg-gray-500` or `p-7` fail loudly
instead of smuggling an off-system value into a component.

Dark is the primary appearance. Light is a deliberate re-step for a white
surface, not an inversion: every series hue is a darker step of the same ramp so
it clears 3:1 on white.

Both theme scopes are declared — a `prefers-color-scheme` media query for the OS
setting and a `[data-theme]` scope for the explicit choice — so the toggle wins
in both directions. `?theme=light|dark` pins it for QA.

## Typography

Three faces, three jobs:

| Face | Job | Why |
|---|---|---|
| **Fraunces** | display serif — headlines, scorelines | Editorial voice. A club product should read like The Athletic, not a dashboard. |
| **Archivo** | UI grotesk | Dense and slightly technical, and holds up at 11–14px where most of a football table lives. |
| **JetBrains Mono** | every figure | Tall x-height and a slashed zero. |

The load-bearing decision is that **every number goes through `.figure`**: mono,
tabular, slashed zero. It is what makes dense numeric columns scan like a
terminal instead of a spreadsheet, and it guarantees a column never reflows as a
score ticks over.

## Colour

Brand lime (`--brand`) is the signal colour: live states, primary actions, the
"now" marker. It is deliberately **excluded from the categorical series ramp**,
so a data series can never impersonate a live indicator.

### The validated categorical ramp

Machine-validated with the dataviz skill's `validate_palette.js`, not eyeballed.

| Slot | Hue | Dark | Light |
|---|---|---|---|
| 1 | blue | `#3f91e6` | `#1f6fcc` |
| 2 | coral | `#e05f41` | `#d24e2c` |
| 3 | teal | `#14a98b` | `#0e8a70` |
| 4 | amber | `#b98514` | `#96690a` |
| 5 | pink | `#de6098` | `#c43c78` |
| 6 | green | `#0b8c46` | `#07733a` |
| 7 | violet | `#8c7de8` | `#6a57d4` |
| 8 | red | `#de5f5f` | `#c63f3f` |

Validator output — all checks PASS in both modes:

```
dark  (surface #12171f)   worst adjacent CVD ΔE 10.2 (deutan) · tritan 8.4
                          worst adjacent normal-vision ΔE 18.5
light (surface #ffffff)   worst adjacent CVD ΔE 10.0 (deutan) · tritan 7.9
                          worst adjacent normal-vision ΔE 16.1
```

**The three-series cap.** Under `--pairs all` (scatter, bubble, small multiples)
only the FIRST THREE slots clear the floors — dark ΔE 10.2 CVD / 17.4
normal-vision. A fourth fails in every ordering tried: amber↔coral measures 2.4
CVD, violet↔blue 0.7. So scatter forms cap at three series and fold the rest into
"Other" or facet. Adjacent-only forms (bars, lines, stacks) take all eight.

Reproduce:

```
node <dataviz-skill>/scripts/validate_palette.js \
  "#3f91e6,#e05f41,#14a98b,#b98514,#de6098,#0b8c46,#8c7de8,#de5f5f" \
  --mode dark --surface "#12171f"
```

### Other roles

- **Sequential** — one blue hue, `--seq-100` → `--seq-700`, for continuous
  magnitude only.
- **Diverging** — blue ↔ coral with a neutral gray midpoint, for goals − xG.
  Never a hue at the midpoint.
- **Status** — good / warning / serious / critical, reserved. Never reused as a
  series, and always shipped with an icon or a label so colour never carries
  state alone.
- **Competition accents** — brand-adjacent hues, not trademarked values. Bound
  to `--comp-active` at the layout level so a page themes itself by context
  without any component knowing which competition it renders.

## Charts

Hand-built inline SVG. A library's defaults are somebody else's design system:
palettes that were never CVD-validated, grids that compete with the data,
tooltips that ignore the token layer.

House rules: 2px data strokes, 1px recessive grid, a 2px surface-coloured ring
on any mark that can overlap, axis labels in text tokens (never a series colour),
a legend whenever there are two or more series, and a "Show data" table on every
chart.

Form choices are documented in each component's header. The short version:

- **xG race** is a STEP line, because xG arrives in discrete jumps at each shot.
- **Shot map** encodes xG as marker AREA (radius ∝ √xG), on a real 105×68 pitch.
- **Momentum** diverges around a neutral baseline, because the data has polarity.
- **Season projection** shows the p10–p90 range, because a Monte Carlo rendered
  as a single number has discarded the only thing it was run for.

## Motion

Durations and easings are tokens. `prefers-reduced-motion` collapses every
duration to 1ms **at the token level**, so no component has to remember to check.

## Accessibility commitments

- Colour is never the sole carrier of meaning.
- Every chart has an `aria-label` with real numbers and a table fallback.
- Crests are decorative (`aria-hidden`); club names are text.
- Missing data renders as `—`, never `0`.
- Modelled values carry an `est.` mark with an explanatory title.

## Motion, depth and the reduced-motion contract

The token file shipped a full motion vocabulary — five durations, four easings
including a spring — and Tailwind shipped `fade-up`, `live-pulse`, `tick-up` and
`tick-down`. Only `live-pulse` and the skeleton shimmer were ever wired to
anything. This pass connects the rest rather than inventing a second system.

**The reduced-motion contract is global.** It used to be opt-in, which meant the
skeleton shimmer was guarded and two dozen `transition-colors` were not. A reader
who asks their OS for less motion now gets it from everything. Durations collapse
to 1ms rather than to `none`, so state changes still *land* — a hover still
commits, a reveal still ends visible — while the travel disappears.

**`stagger` is a delay, not an animation.** It composes with the existing
animations (`animate-fade-up stagger`) instead of defining parallel keyframes for
"the same thing, later". The caller caps `--reveal-i`, because only the caller
knows how long its list is.

**`lit-edge`** is a hairline of light along the top of a raised surface. Dark mode
*adds* white; light mode *subtracts* with a faint dark hairline, because a white
highlight on a white card is invisible. Same token, same component, inverted
mechanism. `--lit-inset` lets a smaller radius pull the highlight in so it never
runs into a corner.

**Hover lift is conditional on being a link.** Raising a card that cannot be
opened promises an affordance that is not there, so `Card` takes an explicit
`interactive` prop and `MatchCard` lifts only when it has an `href`.

### Sticky table headers: a two-file invariant

`position: sticky` on a `<tr>` is not reliably honoured — the cells are what
stick. More importantly, it cannot work inside a horizontally scrollable wrapper:
`overflow-x: auto` forces `overflow-y` to become a scroll container, so the
offset measures from the *wrapper* rather than the viewport and drops the column
labels on top of row 2.

So the league table releases its scroll wrapper at `lg` (the table needs 42rem
and the container is 1440px, so it always fits there) and the sticky rule is
gated behind the same 1024px breakpoint. Below `lg`, horizontal scroll wins and
the header simply does not stick.

Those two numbers are one decision written in two files. `stickyHeader.test.ts`
fails if they drift.
