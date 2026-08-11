# Canonical UI boundary

Mission 21 UI is presentation-only. `UIStore` consumes immutable authoritative projections; React consumes `UIStore`; all player intent returns through `UIController` and `UIApplicationPort`.

Do not import simulation authority (`GameWorld`, `EntityStore`, combat/movement/targeting mutation) into this directory. Add new HUD/menu/debug/settings surfaces by extending read models/selectors and explicit application ports rather than keeping gameplay truth in component state.
