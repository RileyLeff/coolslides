use crate::ir::{ComponentManifest, ComponentRegistry};
use anyhow::Result;
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Extract component manifests from TypeScript source files
pub fn extract_manifests_from_directory(components_dir: &Path) -> Result<ComponentRegistry> {
    let mut registry = ComponentRegistry {
        components: HashMap::new(),
        tag_to_name: HashMap::new(),
    };

    // Walk through all TypeScript files in the components directory
    for entry in walkdir::WalkDir::new(components_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("ts") {
            if let Ok(content) = fs::read_to_string(path) {
                if let Ok(manifest) = extract_manifest_from_source(&content, path) {
                    registry.tag_to_name.insert(manifest.tag.clone(), manifest.name.clone());
                    registry.components.insert(manifest.name.clone(), manifest);
                }
            }
        }
    }

    Ok(registry)
}

/// Extract component manifests from pre-generated JSON files in a manifests directory
pub fn extract_manifests_from_manifests_dir(manifests_dir: &Path) -> Result<ComponentRegistry> {
    let mut registry = ComponentRegistry {
        components: HashMap::new(),
        tag_to_name: HashMap::new(),
    };

    if !manifests_dir.exists() {
        return Ok(registry);
    }

    for entry in walkdir::WalkDir::new(manifests_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(manifest) = serde_json::from_str::<ComponentManifest>(&content) {
                registry.tag_to_name.insert(manifest.tag.clone(), manifest.name.clone());
                registry.components.insert(manifest.name.clone(), manifest);
            }
        }
    }

    Ok(registry)
}

/// Extract a component manifest from TypeScript source code
fn extract_manifest_from_source(content: &str, file_path: &Path) -> Result<ComponentManifest> {
    // Regular expression to match the @component decorator
    let component_regex = Regex::new(r"@component\(\s*(\{[\s\S]*?\})\s*\)")?;
    
    if let Some(captures) = component_regex.captures(content) {
        let manifest_str = &captures[1];
        
        // Parse the JavaScript/TypeScript object literal as JSON5
        let manifest_value: serde_json::Value = json5::from_str(manifest_str)
            .map_err(|e| anyhow::anyhow!("Failed to parse component manifest in {:?}: {}", file_path, e))?;
        
        // Extract the required fields
        let name = manifest_value.get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Component manifest missing 'name' field in {:?}", file_path))?
            .to_string();
            
        let version = manifest_value.get("version")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Component manifest missing 'version' field in {:?}", file_path))?
            .to_string();
            
        let tag = manifest_value.get("tag")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Component manifest missing 'tag' field in {:?}", file_path))?
            .to_string();
            
        let schema = manifest_value.get("schema")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Component manifest missing 'schema' field in {:?}", file_path))?;
        
        // Optional fields
        let tokens_used = manifest_value.get("tokensUsed")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
            
        let capabilities = manifest_value.get("capabilities")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
            
        let suggested_transition = manifest_value.get("suggestedTransition")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        
        // Generate module path relative to components directory
        let module = format!("./{}", 
            file_path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
        );
        
        Ok(ComponentManifest {
            name,
            version,
            tag,
            module,
            schema,
            tokens_used,
            capabilities,
            suggested_transition,
        })
    } else {
        Err(anyhow::anyhow!("No @component decorator found in {:?}", file_path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_manifest_from_source() {
        let source = r#"
import { CoolslidesElement, property, component } from '@coolslides/component-sdk';

@component({
  name: 'TitleSlide',
  version: '1.0.0',
  tag: 'cs-title-slide',
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
      }
    }
  },
  tokensUsed: [
    '--title-color',
    '--subtitle-color'
  ]
})
export class TitleSlide extends CoolslidesElement {
  // ... rest of class
}
        "#;
        
        let manifest = extract_manifest_from_source(source, Path::new("TitleSlide.ts")).unwrap();
        
        assert_eq!(manifest.name, "TitleSlide");
        assert_eq!(manifest.version, "1.0.0");
        assert_eq!(manifest.tag, "cs-title-slide");
        assert_eq!(manifest.tokens_used.len(), 2);
        assert!(manifest.schema.is_object());
    }
}
