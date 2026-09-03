import { evaluateVersionPolicy, fetchVersionPolicy } from '../versionPolicyService';
import type { VersionPolicy, VersionPolicyManifest } from '../types';

const policy: VersionPolicy = {
  minimumBuild: 12,
  latestBuild: 13,
  storeUrl: 'https://example.com/app',
};

describe('versionPolicyService', () => {
  it('fetches one full manifest without query parameters', async () => {
    const manifest: VersionPolicyManifest = {
      ios: policy,
      android: { ...policy, storeUrl: 'https://play.google.com/store/apps/details?id=app' },
      web: { ...policy, enabled: false },
    };
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });

    await expect(
      fetchVersionPolicy(fetchImpl, 'https://cdn.example.com/version-policy.json'),
    ).resolves.toEqual(policy);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cdn.example.com/version-policy.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('allows builds at or above the minimum', () => {
    expect(evaluateVersionPolicy(policy, 12)).toEqual({
      kind: 'allowed',
      source: 'remote',
      available: policy,
    });
    expect(evaluateVersionPolicy(policy, 13)).toEqual({ kind: 'allowed', source: 'remote' });
  });

  it('does not advertise an update when latestBuild is not newer', () => {
    expect(evaluateVersionPolicy({ ...policy, latestBuild: 12 }, 12)).toEqual({
      kind: 'allowed',
      source: 'remote',
    });
  });

  it('requires builds below the minimum', () => {
    expect(evaluateVersionPolicy(policy, 11)).toEqual({
      kind: 'required',
      policy,
      source: 'remote',
    });
  });

  it('allows a disabled policy', () => {
    expect(evaluateVersionPolicy({ ...policy, enabled: false }, 1)).toEqual({
      kind: 'allowed',
      source: 'remote',
    });
  });

  it('allows when native build metadata is unavailable', () => {
    expect(evaluateVersionPolicy(policy, null)).toEqual({ kind: 'allowed', source: 'remote' });
  });
});
