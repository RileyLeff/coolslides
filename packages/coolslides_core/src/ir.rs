use serde::{Deserialize, Serialize};
use schemars::JsonSchema;
use std::collections::HashMap;
use serde_json::Value;

/// SlideDoc represents a single slide in the presentation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SlideDoc {
    /// Version of the IR model
    pub model_version: String,
    /// Unique identifier for the slide within the deck
    pub id: String,
    /// Component specification
    pub component: ComponentSpec,
    /// Properties to pass to the component
    pub props: serde_json::Value,
    /// Named slots for the component
    #[serde(default)]
    pub slots: HashMap<String, Slot>,
    /// Tags for filtering and organization
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// CSS variable overrides
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub style_overrides: HashMap<String, String>,
    /// Locale for this slide (BCP 47)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    /// Text direction
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dir: Option<TextDirection>,
    /// Speaker notes for this slide
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<SpeakerNote>,
}

/// Component specification with name and version requirement
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ComponentSpec {
    /// Component name
    pub name: String,
    /// Version requirement (semver range)
    pub version_req: String,
}

/// Speaker note for slides
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerNote {
    /// Content of the note
    pub content: String,
    /// Timestamp when the note should appear during presentation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    /// Type of the note
    #[serde(default)]
    pub note_type: NoteType,
    /// Styling options for the note
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub style: HashMap<String, String>,
}

/// Type of speaker note
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum NoteType {
    /// General speaking notes
    General,
    /// Timing information
    Timing,
    /// Technical reminders
    Technical,
    /// Transition cues
    Transition,
}

impl Default for NoteType {
    fn default() -> Self {
        NoteType::General
    }
}

/// Text direction for internationalization
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TextDirection {
    Ltr,
    Rtl,
    Auto,
}

/// DeckManifest describes the overall presentation configuration
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeckManifest {
    /// Version of the IR model
    pub model_version: String,
    /// Title of the presentation
    pub title: String,
    /// Path to the theme CSS file
    pub theme: String,
    /// Path to the tokens CSS file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<String>,
    /// List of plugin paths or package IDs
    #[serde(default)]
    pub plugins: Vec<String>,
    /// Speaker notes for slides (Markdown)
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub notes: HashMap<String, String>,
    /// Transition configuration
    pub transitions: TransitionConfig,
    /// Sequence of slides and groups
    pub sequence: Vec<DeckItem>,
    /// Conditional inclusion/exclusion rules
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditions: Option<ConditionConfig>,
    /// Print/export configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub print: Option<PrintConfig>,
}

/// Transition configuration for slide animations
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TransitionConfig {
    /// Default transition for all slides
    pub default: String,
    /// Per-slide transition overrides
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub overrides: HashMap<String, String>,
}

/// Conditions for filtering slides
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConditionConfig {
    /// Include slides with these tags
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_tags: Option<Vec<String>>,
    /// Exclude slides with these IDs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude_ids: Option<Vec<String>>,
}

/// Print/export configuration
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PrintConfig {
    /// Whether to expand fragments in print
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand_fragments: Option<bool>,
    /// Whether to show page numbers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_numbers: Option<bool>,
    /// Footer template for print
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer_template: Option<String>,
}

/// DeckItem represents either a slide reference or a group
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum DeckItem {
    /// Reference to a single slide
    Ref { 
        /// Slide ID to reference
        #[serde(rename = "ref")]
        slide_id: String 
    },
    /// Group of slides with optional transition override
    Group {
        /// Name of the group
        name: String,
        /// Optional transition override for this group
        #[serde(skip_serializing_if = "Option::is_none")]
        transition: Option<String>,
        /// List of slide IDs in this group
        slides: Vec<String>,
    },
}

/// Slot content that can be embedded in components
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Slot {
    /// Markdown content
    Markdown {
        /// The markdown content
        value: String,
    },
    /// Component instance
    Component {
        /// HTML tag name
        tag: String,
        /// Module path for the component
        module: String,
        /// Properties for the component
        #[serde(default, skip_serializing_if = "serde_json::Value::is_null")]
        props: serde_json::Value,
        /// Loading strategy
        #[serde(skip_serializing_if = "Option::is_none")]
        defer: Option<DeferStrategy>,
        /// Slot ID for targeting
        #[serde(skip_serializing_if = "Option::is_none")]
        slot_id: Option<String>,
        /// Fallback for print/static export
        #[serde(skip_serializing_if = "Option::is_none")]
        print_fallback: Option<PrintFallback>,
    },
}

/// Loading strategy for components
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum DeferStrategy {
    Eager,
    Visible,
    Idle,
}

/// Print fallback for dynamic content
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PrintFallback {
    Image {
        /// Source URL for the image
        src: String,
    },
}

/// Lockfile for resolved dependencies
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Lockfile {
    /// Version of the lockfile model
    pub model_version: String,
    /// Resolved components and plugins
    pub resolved: ResolvedDependencies,
    /// Import map for module resolution
    pub import_map: ImportMap,
    /// Timestamp of lockfile generation
    pub timestamp: String,
}

/// Resolved dependencies with integrity hashes
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResolvedDependencies {
    /// Resolved component versions
    #[serde(default)]
    pub components: HashMap<String, ResolvedPackage>,
    /// Resolved plugin versions
    #[serde(default)]
    pub plugins: HashMap<String, ResolvedPackage>,
}

/// A resolved package with version and integrity information
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResolvedPackage {
    /// Resolved version
    pub version: String,
    /// URL to the package
    pub url: String,
    /// Subresource integrity hash
    #[serde(skip_serializing_if = "Option::is_none")]
    pub integrity: Option<String>,
}

/// Import map for ES module resolution
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ImportMap {
    /// Import specifier mappings
    #[serde(default)]
    pub imports: HashMap<String, String>,
}

/// Component manifest with JSON Schema for validation
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ComponentManifest {
    /// Component name
    pub name: String,
    /// Component version
    pub version: String,
    /// HTML tag name
    pub tag: String,
    /// Module path
    pub module: String,
    /// JSON Schema for component props
    pub schema: Value,
    /// CSS tokens used by this component
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tokens_used: Vec<String>,
    /// Capabilities required by this component
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub capabilities: Vec<String>,
    /// Suggested transition for this component
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_transition: Option<String>,
}

/// Registry of all available components and their manifests
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ComponentRegistry {
    /// Components indexed by name
    #[serde(default)]
    pub components: HashMap<String, ComponentManifest>,
    /// Tags indexed to component names
    #[serde(default)]
    pub tag_to_name: HashMap<String, String>,
}