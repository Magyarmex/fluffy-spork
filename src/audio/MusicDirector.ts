export type MusicState = 'menu' | 'ambient' | 'combat' | 'critical' | 'victory' | 'defeat';

export interface MusicContext {
  readonly inMatch: boolean;
  readonly inCombat: boolean;
  readonly healthRatio: number;
  readonly matchEnded?: boolean;
  readonly playerWon?: boolean;
}

export interface MusicDirective {
  readonly state: MusicState;
  readonly cueId: string;
  readonly intensity: number;
  readonly crossfadeSeconds: number;
}

export class MusicDirector {
  select(context: MusicContext): MusicDirective {
    if (!context.inMatch) return Object.freeze({ state: 'menu', cueId: 'music:menu', intensity: 0.45, crossfadeSeconds: 1.2 });
    if (context.matchEnded) return Object.freeze({ state: context.playerWon ? 'victory' : 'defeat', cueId: context.playerWon ? 'music:victory' : 'music:defeat', intensity: 0.8, crossfadeSeconds: 0.7 });
    if (context.healthRatio <= 0.22) return Object.freeze({ state: 'critical', cueId: 'music:combat-critical', intensity: 0.9, crossfadeSeconds: 0.45 });
    if (context.inCombat) return Object.freeze({ state: 'combat', cueId: 'music:combat', intensity: 0.78, crossfadeSeconds: 0.55 });
    return Object.freeze({ state: 'ambient', cueId: 'music:ambient', intensity: 0.5, crossfadeSeconds: 1.1 });
  }
}
