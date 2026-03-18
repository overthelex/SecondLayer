#!/usr/bin/env node
/**
 * Postinstall patch: force fast-xml-parser >=5.5.6 in @aws-sdk/xml-builder.
 *
 * AWS SDK pins fast-xml-parser@5.4.1 (exact) in @aws-sdk/xml-builder,
 * which has known vulnerabilities (GHSA-8gc5-j5rx-235r).
 * npm overrides cannot override exact pins in nested deps reliably,
 * so we patch the nested copy to use the hoisted safe version.
 *
 * Remove this script once AWS SDK ships an xml-builder that depends on >=5.5.6.
 */
const fs = require('fs');
const path = require('path');

const nestedDir = path.join(
  __dirname, '..', 'node_modules', '@aws-sdk', 'xml-builder',
  'node_modules', 'fast-xml-parser'
);

if (fs.existsSync(nestedDir)) {
  fs.rmSync(nestedDir, { recursive: true });
  console.log('[patch] Removed nested fast-xml-parser@5.4.1 from @aws-sdk/xml-builder (using hoisted >=5.5.6)');
}
