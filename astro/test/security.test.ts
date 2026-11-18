import { describe, expect, it } from 'vitest';
import {
  canonicalPath,
  crossSiteFormPost,
  needsTrailingSlashRedirect,
} from '../src/lib/security';

function post(headers: Record<string, string>): Request {
  return new Request('https://walls.rip/actions/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: 'a=1',
  });
}

describe('crossSiteFormPost', () => {
  it('allows a same-origin form POST', () => {
    expect(crossSiteFormPost(post({ origin: 'https://walls.rip' }))).toBe(false);
  });

  it('rejects a foreign Origin', () => {
    expect(crossSiteFormPost(post({ origin: 'https://evil.example' }))).toBe(true);
  });

  it('rejects a malformed Origin', () => {
    expect(crossSiteFormPost(post({ origin: 'not a url' }))).toBe(true);
  });

  it('uses Sec-Fetch-Site when Origin is null or absent', () => {
    expect(crossSiteFormPost(post({ origin: 'null', 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(crossSiteFormPost(post({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(crossSiteFormPost(post({}))).toBe(false);
  });

  it('ignores non-form content types and non-mutating methods', () => {
    const json = new Request('https://walls.rip/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    expect(crossSiteFormPost(json)).toBe(false);
    expect(crossSiteFormPost(new Request('https://walls.rip/x?y=1'))).toBe(false);
  });
});

describe('canonicalPath', () => {
  it('strips trailing slashes but never returns empty', () => {
    expect(canonicalPath('/destination/thailand/')).toBe('/destination/thailand');
    expect(canonicalPath('/a//')).toBe('/a');
    expect(canonicalPath('//')).toBe('/');
    expect(canonicalPath('/')).toBe('/');
  });
});

describe('needsTrailingSlashRedirect', () => {
  it('only redirects GET/HEAD with a trailing slash', () => {
    const get = new Request('https://walls.rip/a/');
    expect(needsTrailingSlashRedirect(get, '/a/')).toBe(true);
    expect(needsTrailingSlashRedirect(get, '/a')).toBe(false);
    expect(needsTrailingSlashRedirect(get, '/')).toBe(false);
    const post = new Request('https://walls.rip/a/', { method: 'POST', body: 'x' });
    expect(needsTrailingSlashRedirect(post, '/a/')).toBe(false);
  });
});
