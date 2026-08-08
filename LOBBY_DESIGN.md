# NOVA TANKS — Lobby Design Doctrine

## Governing rule: one screen means one screen

The main NOVA TANKS lobby is a **single-viewport game surface**, not a webpage.

By default, it must not scroll vertically or horizontally. The player should see the complete first-contact experience at once: game identity, the dominant Deploy action, current field/build information, and the small set of important secondary destinations. Nothing important may live below a fold, spill outside the viewport, or depend on the player discovering that the menu can scroll.

This is a hard product constraint, not a visual preference.

## Information containment

Every lobby feature must do one of three things:

1. **Fit an existing bounded slot** without increasing the lobby's total height.
2. **Open a contained overlay or modal** that itself fits inside the viewport.
3. **Enter a deliberate deep-inspection mode** whose content genuinely requires exploration.

A feature must never solve its layout problem by appending another card, section, control row, changelog, tutorial, or announcement below the existing lobby.

If a new feature cannot fit, the design must be reorganized. The viewport does not become taller because the feature list did.

## Scrolling policy

**No scrolling is the default.**

The explicit exception is a deep inspection surface such as **Blackglass / the tank showroom**, where browsing a large intelligence library is the purpose of the screen. That mode may scroll because exploration is the task, not because the lobby ran out of room.

Other information-heavy surfaces should prefer paging, tabs, stepping, filtering, or replacement-in-place over scrolling. For example, update history is paged one contained panel at a time rather than rendered as a long vertical document.

A scroll exception must be intentional and named. It must not appear accidentally through CSS overflow.

## First-contact hierarchy

The default lobby should read in this order:

**NOVA TANKS identity → Deploy → live/current briefing → secondary destinations.**

Deploy owns the strongest visual weight. Secondary systems should be obvious but quieter. Deep systems should not compete with the decision to enter the game.

The lobby should feel alive through changing information, subtle motion, status and atmosphere—not through an ever-growing amount of visible interface.

## Stable extension zones

Runtime features must target named lobby slots instead of searching the DOM for nearby text and inserting UI beside it.

Current slots:

- `hero` — identity / greeting
- `primary` — Deploy and primary run state
- `briefing` — compact live/current information
- `actions` — primary secondary destinations
- `feature-rail` — a very small number of compact current-feature cards
- `intel` — Blackglass / deep inspection
- `utility` — controls, audio and similar utility surface
- `footer` — quiet build identity

`window.NOVALobby` is the runtime extension contract.

## Capacity is a feature

Space budgets are intentional. The action area and feature rail are bounded. If registration exceeds those budgets, the feature should use a contained overlay, combine with an existing destination, or replace less important information.

The correct response to insufficient space is **prioritization**, not scrolling.

## Responsive rule

Smaller screens reduce ornament before they remove function. Typography, gaps, subtitles and secondary decoration may compress, but the complete actionable lobby must remain visible and usable in the viewport.

Very short screens may remove nonessential flavor copy or footer decoration. They may not hide Deploy or required navigation, and they may not re-enable page scrolling as an escape hatch.

## Validation checklist

Before shipping a lobby change:

- At normal lobby state, `scrollHeight` must not create a usable page below the viewport.
- Touch/pointer panning must not move the lobby surface.
- Deploy and all required destinations must be visible without scrolling.
- Controls/settings must remain inside a viewport-bound surface.
- Update/history surfaces must remain contained; use paging when necessary.
- Blackglass may scroll only after the player deliberately opens it.
- Closing Blackglass must restore the lobby to scroll position zero and the no-scroll state.
- New runtime features must use the named extension contract rather than arbitrary DOM insertion.
- Overflowing slot registration is a design error, not permission to grow the page.

The test is simple: **if the player has to swipe the main menu to discover something, the lobby design has failed.**
