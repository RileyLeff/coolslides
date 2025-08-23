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

/// Validate a complete deck (manifest + slides)
pub fn validate_deck(manifest: &DeckManifest, slides: &[SlideDoc]) -> ValidationResult {
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
    let mut result = ValidationResult::new();
    
    if slide.model_version != "1.0" {
        result.add_error(ValidationError::InvalidModelVersion {
            version: slide.model_version.clone(),
        });
    }
    
    validate_slide_internal(slide, &mut result);
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