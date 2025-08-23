use crate::ir::*;
use schemars::{schema_for, JsonSchema};
use serde_json::Value;
use std::collections::HashMap;

/// Generate JSON schemas for all IR types
pub fn generate_schemas() -> HashMap<String, Value> {
    let mut schemas = HashMap::new();
    
    schemas.insert("SlideDoc".to_string(), serde_json::to_value(schema_for!(SlideDoc)).unwrap());
    schemas.insert("DeckManifest".to_string(), serde_json::to_value(schema_for!(DeckManifest)).unwrap());
    schemas.insert("Lockfile".to_string(), serde_json::to_value(schema_for!(Lockfile)).unwrap());
    schemas.insert("DeckItem".to_string(), serde_json::to_value(schema_for!(DeckItem)).unwrap());
    schemas.insert("Slot".to_string(), serde_json::to_value(schema_for!(Slot)).unwrap());
    
    schemas
}

/// Generate a single schema for a given type
pub fn generate_schema<T: JsonSchema>() -> Value {
    serde_json::to_value(schema_for!(T)).unwrap()
}

/// Get the JSON schema for SlideDoc
pub fn slide_doc_schema() -> Value {
    generate_schema::<SlideDoc>()
}

/// Get the JSON schema for DeckManifest
pub fn deck_manifest_schema() -> Value {
    generate_schema::<DeckManifest>()
}

/// Get the JSON schema for Lockfile
pub fn lockfile_schema() -> Value {
    generate_schema::<Lockfile>()
}