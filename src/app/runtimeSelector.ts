import type { RuntimeKind } from '../replay/Replay';

export interface RuntimeSelection {
  readonly requested: RuntimeKind | null;
  readonly selected: RuntimeKind;
  readonly developmentOnly: true;
}

export function resolveDevelopmentRuntime(search: string, isDevelopment: boolean): RuntimeSelection {
  const value = new URLSearchParams(search).get('runtime');
  const requested: RuntimeKind | null = value === 'legacy' || value === 'foundation' ? value : null;
  return {
    requested,
    selected: isDevelopment && requested ? requested : 'foundation',
    developmentOnly: true,
  };
}
