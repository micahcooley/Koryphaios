import type { ProviderName } from '@koryphaios/shared';

/**
 * Split a `provider:model` selection string into its components.
 *
 * Custom provider keys are `custom:<slug>` and therefore contain a colon, so
 * their selections carry two (`custom:<slug>:<model>`). The slug is
 * slugified (`[a-z0-9-]`) and never contains a colon. Every other provider id
 * is colon-free, so the model starts after the first colon — model ids
 * themselves may contain colons (e.g. account-scoped ids).
 *
 * When the known provider list is supplied, an exact longest-prefix match
 * wins over the syntactic rules.
 */
export function splitProviderKey(
  value: string,
  providerNames?: Iterable<string>,
): { provider: ProviderName; model: string } {
  if (providerNames) {
    let best: string | undefined;
    for (const name of providerNames) {
      if (!name) continue;
      if (value === name || value.startsWith(`${name}:`)) {
        if (!best || name.length > best.length) best = name;
      }
    }
    if (best) {
      const rest = value.slice(best.length + 1);
      return { provider: best as ProviderName, model: rest || value };
    }
  }
  if (value.startsWith('custom:')) {
    const idx = value.indexOf(':', 'custom:'.length);
    if (idx >= 0 && idx + 1 < value.length) {
      return { provider: value.slice(0, idx) as ProviderName, model: value.slice(idx + 1) };
    }
  }
  const idx = value.indexOf(':');
  if (idx < 0) return { provider: value as ProviderName, model: value };
  return {
    provider: value.slice(0, idx) as ProviderName,
    model: value.slice(idx + 1),
  };
}
