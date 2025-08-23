#!/usr/bin/env node

/**
 * Generate component manifests by extracting @component metadata
 * from source TypeScript (robust in Node without browser import maps).
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(__dirname);
const manifestsDir = join(packageRoot, 'manifests');
const srcSlidesDir = join(packageRoot, 'src', 'slides');
const srcWidgetsDir = join(packageRoot, 'src', 'widgets');

async function generateManifests() {
  try {
    // Ensure manifests directory exists
    await mkdir(manifestsDir, { recursive: true });
    
    // Extract manifests from source TS using a regex on @component({...})
    const files = [
      ...(await safeListDir(srcSlidesDir)),
      ...(await safeListDir(srcWidgetsDir)),
    ].filter(f => extname(f) === '.ts');

    const manifests = [];
    for (const file of files) {
      const fullPath = isSlides(file) ? join(srcSlidesDir, file) : join(srcWidgetsDir, file);
      const content = await readFile(fullPath, 'utf8');
      const manifestObj = extractManifestObject(content);
      if (!manifestObj) continue;

      // Best-effort module path to dist for browser
      const modulePath = `/packages/components/dist/${isSlides(file) ? 'slides' : 'widgets'}/${basename(file, '.ts')}.js`;

      const out = {
        name: manifestObj.name,
        version: manifestObj.version,
        tag: manifestObj.tag,
        module: modulePath,
        schema: manifestObj.schema ?? {},
        tokensUsed: manifestObj.tokensUsed ?? [],
        capabilities: manifestObj.capabilities ?? [],
        suggestedTransition: manifestObj.suggestedTransition ?? undefined,
      };

      if (!out.name || !out.tag) continue;
      manifests.push(out);
      await writeFile(
        join(manifestsDir, `${out.name}.component.json`),
        JSON.stringify(out, null, 2)
      );
    }

    console.log(`Generated ${manifests.length} component manifests`);
  } catch (error) {
    console.error('Error generating manifests:', error);
    process.exit(1);
  }
}

generateManifests();

async function safeListDir(dir) {
  try {
    const entries = await readdir(dir);
    return entries;
  } catch {
    return [];
  }
}

function isSlides(file) {
  return file.includes('.ts') && !file.toLowerCase().includes('widget');
}

function extractManifestObject(source) {
  const match = /@component\(\s*(\{[\s\S]*?\})\s*\)/m.exec(source);
  if (!match) return null;
  const objectLiteral = match[1];
  try {
    // Evaluate the object literal safely in a VM context
    const obj = vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 1000 });
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}
