# UI-domain agent rules

`src/ui/` owns React presentation, settings surfaces and player intent forwarding.

- Read immutable projections from `UIStore`/selectors; do not hold `GameWorld`, `EntityStore`, combat, movement or targeting authority.
- Send gameplay intent through `UIController` and canonical `GameCommand`s/application APIs.
- Input and presentation settings must remain fair-play mappings; do not alter weapon stats, AI, FOV-for-advantage or simulation rules here.
- Touch controls may translate pointer gestures through canonical input adapters but may not implement movement/combat rules.
- Diagnostics shown in UI must come from structured diagnostics, not ad-hoc global scraping.
