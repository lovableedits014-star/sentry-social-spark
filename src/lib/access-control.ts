// ─── Access Control Module ───
// Defines fixed access profiles and module mappings

export type AccessProfile = 'admin' | 'gestor_social' | 'gestor_campanha' | 'operacional';

export const ACCESS_PROFILES: Record<AccessProfile, { label: string; description: string; allowedPaths: string[] }> = {
  admin: {
    label: 'Administrador',
    description: 'Acesso total a todos os módulos',
    allowedPaths: ['*'],
  },
  gestor_social: {
    label: 'Gestor de Redes Sociais',
    description: 'Comentários, Apoiadores e Engajamento',
    allowedPaths: ['/dashboard', '/comments', '/supporters', '/engagement'],
  },
  gestor_campanha: {
    label: 'Gestor de Campanha',
    description: 'Apoiadores, Presenças, Territorial',
    allowedPaths: ['/dashboard', '/supporters', '/checkins', '/territorial'],
  },
  operacional: {
    label: 'Operacional',
    description: 'Presenças/Disparos e Territorial',
    allowedPaths: ['/dashboard', '/checkins', '/territorial'],
  },
};

export function isPathAllowed(profile: AccessProfile | null, path: string): boolean {
  if (!profile) return true; // client owner = full access
  const config = ACCESS_PROFILES[profile];
  if (!config) return false;
  if (config.allowedPaths.includes('*')) return true;
  return config.allowedPaths.includes(path);
}

export function getDefaultRedirect(profile: AccessProfile): string {
  const config = ACCESS_PROFILES[profile];
  if (!config || config.allowedPaths.includes('*')) return '/dashboard';
  return config.allowedPaths[0] || '/dashboard';
}
