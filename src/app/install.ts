// Installazione come app (SPEC §8): Android propone l'installazione da solo (evento del browser);
// su iPhone non c'è una proposta automatica e si suggerisce "Condividi, poi Aggiungi a Home".
export interface InstallEnv {
  userAgent: string;
  /** L'app è già aperta a schermo intero dalla home. */
  standalone: boolean;
  /** L'utente ha chiuso il suggerimento. */
  dismissed: boolean;
  maxTouchPoints: number;
}

export function iosInstallHintVisible(env: InstallEnv): boolean {
  if (env.standalone || env.dismissed) return false;
  const ua = env.userAgent;
  const iphoneOrIpad = /iPhone|iPad|iPod/.test(ua);
  // iPad in modalità desktop si presenta come un Mac con schermo touch.
  const ipadAsMac = /Macintosh/.test(ua) && env.maxTouchPoints > 1;
  if (!iphoneOrIpad && !ipadAsMac) return false;
  // Solo Safari: gli altri browser su iOS non offrono lo stesso percorso.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

/** Quello che l'app sa dell'installazione: il suggerimento per iPhone e la proposta di Android. */
export interface InstallHelper {
  iosHint: boolean;
  /** Il browser ha offerto l'installazione (Android) e si può proporre. */
  canPrompt(): boolean;
  prompt(): Promise<void>;
}

/** Evento `beforeinstallprompt` (non è nei tipi standard del DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** Collega l'evento di Android; `onChange` si chiama quando la proposta diventa disponibile. */
export function createInstallHelper(
  env: InstallEnv,
  target: Pick<Window, 'addEventListener'>,
  onChange: () => void,
): InstallHelper {
  let deferred: BeforeInstallPromptEvent | null = null;
  target.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    onChange();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    onChange();
  });
  return {
    iosHint: iosInstallHintVisible(env),
    canPrompt: () => deferred !== null,
    async prompt() {
      const d = deferred;
      deferred = null;
      await d?.prompt();
    },
  };
}
