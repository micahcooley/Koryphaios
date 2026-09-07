import { describe, expect, it } from 'vitest';
import type { ProviderInfo } from '@koryphaios/shared';
import {
  getModelConfigurationWarning,
  isEnabledModelSelection,
  parseProviderModelSelection,
} from './model-config';

const provider = (overrides: Partial<ProviderInfo> = {}): ProviderInfo => ({
  name: 'devin',
  enabled: true,
  authenticated: true,
  models: ['glm-5-2'],
  allAvailableModels: [],
  selectedModels: ['glm-5-2'],
  hideModelSelector: false,
  authMode: 'auth_only',
  supportsApiKey: false,
  supportsAuthToken: true,
  requiresBaseUrl: false,
  ...overrides,
});

describe('manual model selection', () => {
  it('accepts only a model currently enabled by an authenticated provider', () => {
    expect(isEnabledModelSelection([provider()], 'devin:glm-5-2')).toBe(true);
    expect(isEnabledModelSelection([provider()], 'devin:missing-model')).toBe(false);
    expect(isEnabledModelSelection([provider({ authenticated: false })], 'devin:glm-5-2')).toBe(
      false,
    );
  });

  it('explains a stale selection without suggesting Auto', () => {
    expect(getModelConfigurationWarning([provider()], 'devin:missing-model')).toBe(
      'missing-model is no longer available for Devin. Select another model in the composer.',
    );
  });

  it('parses custom provider selections whose keys contain a colon', () => {
    expect(parseProviderModelSelection('custom:my-llm:my-model-a')).toEqual({
      provider: 'custom:my-llm',
      model: 'my-model-a',
    });
    // Longest-prefix match wins when provider names are supplied.
    expect(
      parseProviderModelSelection('custom:my-llm:my-model-a', ['codex', 'custom:my-llm']),
    ).toEqual({ provider: 'custom:my-llm', model: 'my-model-a' });
    // First-party providers keep first-colon behavior.
    expect(parseProviderModelSelection('devin:glm-5-2')).toEqual({
      provider: 'devin',
      model: 'glm-5-2',
    });
  });

  it('validates custom provider selections against the provider list', () => {
    const custom = provider({
      name: 'custom:my-llm',
      models: ['my-model-a'],
      selectedModels: ['my-model-a'],
    });
    expect(isEnabledModelSelection([custom], 'custom:my-llm:my-model-a')).toBe(true);
    expect(isEnabledModelSelection([custom], 'custom:my-llm:missing-model')).toBe(false);
    expect(getModelConfigurationWarning([custom], 'custom:my-llm:my-model-a')).toBeNull();
  });
});
