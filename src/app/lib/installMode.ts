/** Choix du mode d'installation (logique pure, sans DOM : testée par Vitest). GDD §7.6, V4.2. */

/** `installed` : déjà ouverte comme une appli ; `prompt` : invite native disponible ;
 *  `ios` : ajout manuel par le bouton Partager ; `manual` : menu du navigateur, si proposé. */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';

export interface InstallEnv {
  standalone: boolean;
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

/** iPhone, iPod, iPad (y compris l'iPad qui se présente comme un Mac). */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return 'installed';
  if (env.hasPrompt) return 'prompt';
  if (isIosDevice(env.userAgent, env.maxTouchPoints)) return 'ios';
  return 'manual';
}
