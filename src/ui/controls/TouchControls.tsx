import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { TouchInputAdapter } from '../../input/touch/TouchInputAdapter';
import type { UIController } from '../actions/UIController';
import type { UISettingsState } from '../types';

type StickName = 'move' | 'aim';

interface StickAnchor {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

interface TouchState {
  moveStick: { x: number; y: number };
  aimStick: { x: number; y: number };
  firing: boolean;
  abilities: Record<number, boolean>;
  ultimate: boolean;
}

const ZERO = Object.freeze({ x: 0, y: 0 });

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

/** Browser presentation for the canonical Mission 13 twin-stick adapter. */
export function TouchControls({ controller, settings }: { readonly controller: UIController; readonly settings: UISettingsState }) {
  const settingsRef = useRef(settings.input);
  settingsRef.current = settings.input;
  const adapterRef = useRef<TouchInputAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = new TouchInputAdapter(() => settingsRef.current);

  const anchors = useRef<Record<StickName, StickAnchor | null>>({ move: null, aim: null });
  const state = useRef<TouchState>({
    moveStick: { ...ZERO },
    aimStick: { ...ZERO },
    firing: false,
    abilities: {},
    ultimate: false,
  });

  const emit = () => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    adapter.ingest(state.current);
    for (const envelope of adapter.poll()) controller.issue(envelope.command);
  };

  const resetLocalTouchState = () => {
    anchors.current = { move: null, aim: null };
    state.current = {
      moveStick: { ...ZERO },
      aimStick: { ...ZERO },
      firing: false,
      abilities: {},
      ultimate: false,
    };
    emit();
  };

  useEffect(() => {
    const onBlur = () => resetLocalTouchState();
    const onVisibilityChange = () => { if (document.hidden) resetLocalTouchState(); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [controller]);

  const beginStick = (name: StickName, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    anchors.current[name] = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    state.current[`${name}Stick`] = { ...ZERO };
    emit();
  };

  const moveStick = (name: StickName, event: ReactPointerEvent<HTMLDivElement>) => {
    const anchor = anchors.current[name];
    if (!anchor || anchor.pointerId !== event.pointerId) return;
    event.preventDefault();
    const radius = 62 * settings.presentation.stickSize;
    state.current[`${name}Stick`] = {
      x: clampAxis((event.clientX - anchor.x) / radius),
      y: clampAxis((event.clientY - anchor.y) / radius),
    };
    emit();
  };

  const endStick = (name: StickName, event: ReactPointerEvent<HTMLDivElement>) => {
    const anchor = anchors.current[name];
    if (!anchor || anchor.pointerId !== event.pointerId) return;
    anchors.current[name] = null;
    state.current[`${name}Stick`] = { ...ZERO };
    emit();
  };

  const setAction = (action: 'fire' | 'ability' | 'ultimate', active: boolean) => {
    if (action === 'fire') state.current.firing = active;
    else if (action === 'ability') state.current.abilities[0] = active;
    else state.current.ultimate = active;
    emit();
  };

  const pad = (name: StickName, label: string) => <div
    data-touch-stick={name}
    aria-label={label}
    role="application"
    onPointerDown={(event) => beginStick(name, event)}
    onPointerMove={(event) => moveStick(name, event)}
    onPointerUp={(event) => endStick(name, event)}
    onPointerCancel={(event) => endStick(name, event)}
  >{label}</div>;

  const actionButton = (action: 'fire' | 'ability' | 'ultimate', label: string) => <button
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setAction(action, true); }}
    onPointerUp={() => setAction(action, false)}
    onPointerCancel={() => setAction(action, false)}
  >{label}</button>;

  return <section aria-label="Touch controls" data-touch-controls="true"
    data-stick-size={settings.presentation.stickSize} data-stick-opacity={settings.presentation.stickOpacity}>
    {pad('move', 'MOVE')}
    <div data-touch-actions="true">
      {actionButton('fire', 'FIRE')}
      {actionButton('ability', 'ABILITY')}
      {actionButton('ultimate', 'ULTIMATE')}
    </div>
    {pad('aim', 'AIM')}
  </section>;
}
