const STATIC_MODULE_DECLARATION_PATTERN = /(?:^|[\r\n])\s*((?:import\s+(?:(?:[\w$]+(?:\s*,\s*(?:\*\s+as\s+[\w$]+|\{[\s\S]*?\}))?|\*\s+as\s+[\w$]+|\{[\s\S]*?\})\s+from\s+)?|export\s+(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[\s\S]*?\})\s+from\s+)['"]([^'"]+)['"])/g;

export function moduleDeclarations(source) {
  const text = String(source || '');
  return [...text.matchAll(STATIC_MODULE_DECLARATION_PATTERN)].map((match) => ({
    statement: match[1],
    specifier: match[2].split('?')[0],
  }));
}

export function directBrowserStorageKinds(source) {
  const text = String(source || '');
  const kinds = [];
  if (/\blocalStorage\b/.test(text)) kinds.push('localStorage');
  if (/\bsessionStorage\b/.test(text)) kinds.push('sessionStorage');
  return kinds;
}

export function isApprovedFeatureFlagImport(statement) {
  const text = String(statement || '').trim();
  const namedImport = text.match(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]/);
  if (!namedImport) return false;

  const importedNames = namedImport[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/\s+as\s+/)[0].trim());

  return importedNames.length > 0 && importedNames.every((name) => name === 'featureFlags');
}

export function onlyUsesApprovedManagerReturnStorage(source) {
  const text = String(source || '');
  if (!/sessionStorage\.setItem\(\s*PARITY_RETURN_KEY\s*,/.test(text)) return false;

  const withoutApprovedCall = text.replace(
    /sessionStorage\.setItem\(\s*PARITY_RETURN_KEY\s*,/g,
    'approvedManagerReturnStorage(',
  );
  return directBrowserStorageKinds(withoutApprovedCall).length === 0;
}
