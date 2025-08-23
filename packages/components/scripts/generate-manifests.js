#!/usr/bin/env node

/**
 * Generate component manifests from compiled TypeScript
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(__dirname);
const distDir = join(packageRoot, 'dist');
const manifestsDir = join(packageRoot, 'manifests');

async function generateManifests() {
  try {
    // Ensure manifests directory exists
    await mkdir(manifestsDir, { recursive: true });
    
    // For now, create static manifests
    // In a real implementation, we'd extract this from compiled components
    
    const titleSlideManifest = {
      name: 'TitleSlide',
      version: '1.0.0',
      tag: 'cs-title-slide',
      module: '/components/dist/slides/TitleSlide.js',
      schema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: {
            type: 'string',
            description: 'Main title text'
          },
          subtitle: {
            type: 'string',
            description: 'Optional subtitle text'
          },
          alignment: {
            type: 'string',
            description: 'Text alignment',
            enum: ['left', 'center', 'right'],
            default: 'center'
          }
        }
      },
      tokensUsed: [
        '--title-color',
        '--title-size',
        '--subtitle-color',
        '--subtitle-size',
        '--background-color',
        '--accent-color'
      ]
    };
    
    await writeFile(
      join(manifestsDir, 'TitleSlide.component.json'),
      JSON.stringify(titleSlideManifest, null, 2)
    );
    
    console.log('Generated component manifests');
  } catch (error) {
    console.error('Error generating manifests:', error);
    process.exit(1);
  }
}

generateManifests();