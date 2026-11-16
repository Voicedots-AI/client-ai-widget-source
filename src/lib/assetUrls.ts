// Old customer embeds retain these URLs after the asset repository moved.
// Rewrite only our legacy host; leave customer-owned assets untouched.
export function resolveAssetUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(
    /^https:\/\/cdn\.jsdelivr\.net\/gh\/Voicedots-AI-Deployment\/animations@main\//,
    'https://cdn.jsdelivr.net/gh/Voicedots-AI/animations@main/'
  );
}

export function resolveWidgetAssets(config: Record<string, any>): Record<string, any> {
  return {
    ...config,
    logo: resolveAssetUrl(config.logo),
    avatars: Array.isArray(config.avatars)
      ? config.avatars.map((avatar: Record<string, unknown>) => ({
          ...avatar,
          avatar: resolveAssetUrl(avatar.avatar),
        }))
      : config.avatars,
  };
}
