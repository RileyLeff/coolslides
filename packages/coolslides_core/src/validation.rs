use crate::ir::*;
use std::collections::HashSet;
use thiserror::Error;

/// Validation errors with diagnostic codes
#[derive(Error, Debug)]
pub enum ValidationError {
    #[error("CS1001: Slide id duplicated: {id}")]
    DuplicateSlideId { id: String },
    
    #[error("CS1002: Unknown slide reference in sequence: {id}")]
    UnknownSlideReference { id: String },
    
    #[error("CS1003: Style override key must start with '--': {key}")]
    InvalidStyleOverrideKey { key: String },
    
    #[error("CS1004: Invalid model version: {version}")]
    InvalidModelVersion { version: String },
    
    #[error("CS2001: Component version ranges cannot converge for {name}")]
    VersionConflict { name: String },
    
    #[error("CS3001: Unknown component: {name} in slide {slide_id}")]
    UnknownComponent { name: String, slide_id: String },
    
    #[error("CS3002: Invalid props for component {component} in slide {slide_id}: {error}")]
    InvalidComponentProps { 
        component: String, 
        slide_id: String, 
        error: String,
        json_path: Option<String>,
    },
    
    #[error("CS3003: Missing required prop '{prop}' for component {component} in slide {slide_id}")]
    MissingRequiredProp { 
        component: String, 
        slide_id: String, 
        prop: String 
    },
}

/// Validation context and results
#[derive(Debug)]
pub struct ValidationResult {
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<String>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self {
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }
    
    pub fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }
    
    pub fn add_error(&mut self, error: ValidationError) {
        self.errors.push(error);
    }
    
    pub fn add_warning(&mut self, warning: String) {
        self.warnings.push(warning);
    }
}

/// Validate a complete deck (manifest + slides) with optional component registry for schema validation
pub fn validate_deck(manifest: &DeckManifest, slides: &[SlideDoc]) -> ValidationResult {
    validate_deck_with_registry(manifest, slides, None)
}

/// Validate a complete deck (manifest + slides) with component schema validation
pub fn validate_deck_with_registry(
    manifest: &DeckManifest, 
    slides: &[SlideDoc],
    registry: Option<&ComponentRegistry>
) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    // Validate model version
    if manifest.model_version != "1.0" {
        result.add_error(ValidationError::InvalidModelVersion {
            version: manifest.model_version.clone(),
        });
    }
    
    // Check for duplicate slide IDs
    let mut slide_ids = HashSet::new();
    for slide in slides {
        if !slide_ids.insert(&slide.id) {
            result.add_error(ValidationError::DuplicateSlideId {
                id: slide.id.clone(),
            });
        }
        
        // Validate individual slide
        validate_slide_internal(slide, &mut result);
        
        // Validate component schema if registry is provided
        if let Some(registry) = registry {
            validate_component_schema(slide, registry, &mut result);
        }
    }
    
    // Validate sequence references
    for item in &manifest.sequence {
        match item {
            DeckItem::Ref { slide_id } => {
                if !slide_ids.contains(slide_id) {
                    result.add_error(ValidationError::UnknownSlideReference {
                        id: slide_id.clone(),
                    });
                }
            }
            DeckItem::Group { slides, .. } => {
                for slide_id in slides {
                    if !slide_ids.contains(slide_id) {
                        result.add_error(ValidationError::UnknownSlideReference {
                            id: slide_id.clone(),
                        });
                    }
                }
            }
        }
    }
    
    result
}

/// Validate a single slide document
pub fn validate_slide(slide: &SlideDoc) -> ValidationResult {
    validate_slide_with_registry(slide, None)
}

/// Validate a single slide document with component schema validation
pub fn validate_slide_with_registry(
    slide: &SlideDoc, 
    registry: Option<&ComponentRegistry>
) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if slide.model_version != "1.0" {
        result.add_error(ValidationError::InvalidModelVersion {
            version: slide.model_version.clone(),
        });
    }
    
    validate_slide_internal(slide, &mut result);
    
    // Validate component schema if registry is provided
    if let Some(registry) = registry {
        validate_component_schema(slide, registry, &mut result);
    }
    
    result
}

fn validate_slide_internal(slide: &SlideDoc, result: &mut ValidationResult) {
    // Validate style overrides
    for key in slide.style_overrides.keys() {
        if !key.starts_with("--") {
            result.add_error(ValidationError::InvalidStyleOverrideKey {
                key: key.clone(),
            });
        }
    }
    
    // Validate slots
    for (slot_name, slot) in &slide.slots {
        validate_slot(slot, slot_name, result);
    }
}

fn validate_slot(slot: &Slot, slot_name: &str, result: &mut ValidationResult) {
    match slot {
        Slot::Markdown { value } => {
            if value.is_empty() {
                result.add_warning(format!("Empty markdown slot: {}", slot_name));
            }
        }
        Slot::Component { tag, module, .. } => {
            if tag.is_empty() {
                result.add_warning(format!("Empty component tag in slot: {}", slot_name));
            }
            if module.is_empty() {
                result.add_warning(format!("Empty component module in slot: {}", slot_name));
            }
        }
    }
}

/// Validate component props against JSON schema
fn validate_component_schema(slide: &SlideDoc, registry: &ComponentRegistry, result: &mut ValidationResult) {
    // Check if the component exists in the registry
    let component = match registry.components.get(&slide.component.name) {
        Some(component) => component,
        None => {
            result.add_error(ValidationError::UnknownComponent {
                name: slide.component.name.clone(),
                slide_id: slide.id.clone(),
            });
            return;
        }
    };
    
    // Compile the JSON schema
    let schema = match jsonschema::JSONSchema::compile(&component.schema) {
        Ok(schema) => schema,
        Err(e) => {
            result.add_error(ValidationError::InvalidComponentProps {
                component: slide.component.name.clone(),
                slide_id: slide.id.clone(),
                error: format!("Invalid component schema: {}", e),
                json_path: None,
            });
            return;
        }
    };
    
    // Validate props against schema  
    if !schema.is_valid(&slide.props) {
        // Schema validation failed - collect errors in a separate call
        let validation_result = schema.validate(&slide.props);
        if let Err(validation_errors) = validation_result {
            let errors: Vec<_> = validation_errors.collect();
            for error in errors {
                let json_path = format_json_path(&error.instance_path.to_string());
                
                // Check if it's a missing required property
                let error_str = error.to_string();
                if error_str.contains("required") {
                    if let Some(missing_prop) = extract_missing_property(&error) {
                        result.add_error(ValidationError::MissingRequiredProp {
                            component: slide.component.name.clone(),
                            slide_id: slide.id.clone(),
                            prop: missing_prop,
                        });
                        continue;
                    }
                }
                
                result.add_error(ValidationError::InvalidComponentProps {
                    component: slide.component.name.clone(),
                    slide_id: slide.id.clone(),
                    error: error_str,
                    json_path: Some(json_path),
                });
            }
        }
    }
}

/// Format JSON path from instance path for better error messages
fn format_json_path(instance_path: &str) -> String {
    if instance_path.is_empty() {
        "props".to_string()
    } else {
        format!("props{}", instance_path)
    }
}

/// Extract missing property name from validation error
fn extract_missing_property(error: &jsonschema::ValidationError) -> Option<String> {
    // This is a simplified extraction - in practice, you might need more sophisticated parsing
    let error_str = error.to_string();
    if let Some(start) = error_str.find("'") {
        if let Some(end) = error_str[start + 1..].find("'") {
            return Some(error_str[start + 1..start + 1 + end].to_string());
        }
    }
    None
}

/// Validate lockfile consistency
pub fn validate_lockfile(lockfile: &Lockfile) -> ValidationResult {
    let mut result = ValidationResult::new();
    
    if lockfile.model_version != "1.0" {
        result.add_error(ValidationError::InvalidModelVersion {
            version: lockfile.model_version.clone(),
        });
    }
    
    // Additional lockfile validation can be added here
    
    result
}