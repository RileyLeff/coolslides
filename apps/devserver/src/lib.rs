use axum::{
    extract::{Path as AxumPath, State, WebSocketUpgrade},
    http::{StatusCode, header},
    response::{Html, Json, Response},
    routing::{get, post},
    Router,
    body::Body,
};
use coolslides_core::{DeckManifest, SlideDoc, components, ComponentRegistry};
use serde::Deserialize;
use std::{collections::HashMap, path::{Path, PathBuf}, sync::Arc};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tokio::fs;
use pulldown_cmark::{Parser, html};
use maplit::{hashset, hashmap};

pub mod export;
pub mod rooms;

/// Configuration for HTML sanitization
#[derive(Clone)]
pub struct SanitizationConfig {
    pub strict_mode: bool,
}

impl SanitizationConfig {
    pub fn new(strict_mode: bool) -> Self {
        Self { strict_mode }
    }
}

/// Development server state
#[derive(Clone)]
pub struct AppState {
    pub room_manager: Arc<rooms::RoomManager>,
    pub deck: Arc<RwLock<Option<DeckManifest>>>,
    pub slides: Arc<RwLock<HashMap<String, SlideDoc>>>,
    pub sanitization_config: SanitizationConfig,
    pub components: Arc<RwLock<Option<ComponentRegistry>>>,
    pub deck_root: Arc<RwLock<Option<PathBuf>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            room_manager: Arc::new(rooms::RoomManager::new()),
            deck: Arc::new(RwLock::new(None)),
            slides: Arc::new(RwLock::new(HashMap::new())),
            sanitization_config: SanitizationConfig::new(false), // Default to non-strict
            components: Arc::new(RwLock::new(None)),
            deck_root: Arc::new(RwLock::new(None)),
        }
    }
    
    pub fn new_with_strict_mode(strict_mode: bool) -> Self {
        Self {
            room_manager: Arc::new(rooms::RoomManager::new()),
            deck: Arc::new(RwLock::new(None)),
            slides: Arc::new(RwLock::new(HashMap::new())),
            sanitization_config: SanitizationConfig::new(strict_mode),
            components: Arc::new(RwLock::new(None)),
            deck_root: Arc::new(RwLock::new(None)),
        }
    }

    /// Load deck manifest and slides from filesystem
    pub async fn load_from_directory(&self, deck_dir: impl AsRef<Path>) -> anyhow::Result<()> {
        let deck_dir = deck_dir.as_ref();
        
        // Load deck manifest from slides.toml
        let manifest_path = deck_dir.join("slides.toml");
        if !manifest_path.exists() {
            return Err(anyhow::anyhow!("No slides.toml found in {:?}", deck_dir));
        }
        
        let manifest_content = fs::read_to_string(&manifest_path).await?;
        let deck_manifest: DeckManifest = toml::from_str(&manifest_content)?;
        
        // Load all slide files from content/ directory
        let content_dir = deck_dir.join("content");
        let mut slides_map = HashMap::new();
        
        if content_dir.exists() {
            let mut entries = fs::read_dir(&content_dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("toml") 
                    && path.file_stem().and_then(|s| s.to_str()).map(|s| s.ends_with(".slide")).unwrap_or(false) {
                    
                    let slide_content = fs::read_to_string(&path).await?;
                    let slide_doc: SlideDoc = toml::from_str(&slide_content)?;
                    
                    slides_map.insert(slide_doc.id.clone(), slide_doc);
                }
            }
        }
        
        // Update AppState
        {
            let mut deck = self.deck.write().await;
            *deck = Some(deck_manifest);
        }
        {
            let mut root = self.deck_root.write().await;
            *root = Some(deck_dir.to_path_buf());
        }
        
        let slide_count = slides_map.len();
        
        {
            let mut slides = self.slides.write().await;
            *slides = slides_map;
        }
        
        // Try to load component manifests for tag resolution and validation support
        let possible_components_paths = [
            Path::new("packages/components/src"),        // From project root
            Path::new("../../packages/components/src"),  // From examples/basic-deck
            Path::new("../packages/components/src"),     // From apps/devserver
        ];

        let registry_opt = possible_components_paths
            .iter()
            .find(|path| path.exists())
            .and_then(|components_dir| {
                match components::extract_manifests_from_directory(components_dir) {
                    Ok(registry) => Some(registry),
                    Err(e) => {
                        eprintln!(
                            "Warning: Failed to load component manifests from {}: {}",
                            components_dir.display(),
                            e
                        );
                        None
                    }
                }
            });

        {
            let mut comps = self.components.write().await;
            *comps = registry_opt;
        }

        println!("Loaded deck manifest and {} slides", slide_count);
        Ok(())
    }
    
    /// Watch for file changes and reload
    pub async fn start_file_watcher(&self, deck_dir: impl AsRef<Path>) -> anyhow::Result<()> {
        use tokio::time::{sleep, Duration};
        
        let deck_dir = deck_dir.as_ref().to_path_buf();
        let state = self.clone();
        
        tokio::spawn(async move {
            loop {
                sleep(Duration::from_secs(2)).await;
                
                // Simple polling-based file watcher for now
                // In production, use a proper file watcher like notify
                if let Err(e) = state.load_from_directory(&deck_dir).await {
                    eprintln!("Failed to reload files: {}", e);
                }
            }
        });
        
        Ok(())
    }
}

/// Create the Axum router for the dev server
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // API routes
        .route("/", get(root_index))
        .route("/api/deck", get(get_deck))
        .route("/api/slide/:id", get(get_slide))
        .route("/api/rooms/:room_id/record/start", post(start_recording))
        .route("/api/rooms/:room_id/record/stop", post(stop_recording))
        .route("/api/rooms/:room_id/dump", get(get_room_dump))
        .route("/api/export/pdf", post(export_pdf))
        .route("/api/export/html", post(export_html))
        .route("/api/importmap", get(get_import_map))
        .route("/healthz", get(health_check))
        .route("/test/markdown", post(test_markdown_sanitization))
        
        // WebSocket routes
        .route("/rooms/:room_id", get(websocket_handler))
        
        // UI routes
        .route("/presenter", get(presenter_ui))
        .route("/audience", get(audience_ui))
        
        // Static files
        .nest_service("/static", ServeDir::new("static"))
        .nest_service("/packages/runtime/dist", ServeDir::new("packages/runtime/dist"))
        .nest_service("/packages/components/dist", ServeDir::new("packages/components/dist"))
        .nest_service("/packages/component-sdk/dist", ServeDir::new("packages/component-sdk/dist"))
        .nest_service("/packages/plugins-stdlib/dist", ServeDir::new("packages/plugins-stdlib/dist"))
        .nest_service("/themes", ServeDir::new("themes"))
        
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Root index page serving the current deck
async fn root_index(State(state): State<AppState>) -> Result<Html<String>, StatusCode> {
    let deck = {
        let deck_guard = state.deck.read().await;
        deck_guard.as_ref().ok_or(StatusCode::NOT_FOUND)?.clone()
    };
    let slides = {
        let slides_guard = state.slides.read().await;
        slides_guard.clone()
    };
    let components_registry = {
        let comps_guard = state.components.read().await;
        comps_guard.clone()
    };
    let deck_root = {
        let root_guard = state.deck_root.read().await;
        root_guard.clone()
    };

    // For dev root, do NOT set a file:// base href; let assets load via http
    let html = generate_export_html(&deck, &slides, components_registry.as_ref(), None, &state.sanitization_config)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Html(html))
}

/// Load deck + slides + component registry from a directory (utility for CLI/exports)
pub fn load_deck_bundle(deck_dir: &std::path::Path) -> anyhow::Result<(
    DeckManifest,
    HashMap<String, SlideDoc>,
    Option<ComponentRegistry>,
)> {
    use std::fs;
    // Manifest
    let manifest_path = deck_dir.join("slides.toml");
    let manifest_content = fs::read_to_string(&manifest_path)?;
    let deck_manifest: DeckManifest = toml::from_str(&manifest_content)?;

    // Slides
    let mut slides_map = HashMap::new();
    let content_dir = deck_dir.join("content");
    if content_dir.exists() {
        for entry in std::fs::read_dir(&content_dir)? {
            let path = entry?.path();
            if path.extension().and_then(|s| s.to_str()) == Some("toml")
                && path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.ends_with(".slide"))
                    .unwrap_or(false)
            {
                let slide_content = fs::read_to_string(&path)?;
                let slide_doc: SlideDoc = toml::from_str(&slide_content)?;
                slides_map.insert(slide_doc.id.clone(), slide_doc);
            }
        }
    }

    // Components registry
    let possible_components_paths = [
        std::path::Path::new("packages/components/src"),       // From project root
        std::path::Path::new("../../packages/components/src"), // From examples/basic-deck
        std::path::Path::new("../packages/components/src"),    // From apps/devserver
    ];
    let registry = possible_components_paths
        .iter()
        .find(|path| path.exists())
        .and_then(|components_dir| components::extract_manifests_from_directory(components_dir).ok());

    Ok((deck_manifest, slides_map, registry))
}

/// Generate full export HTML for a deck directory
pub fn export_deck_html_from_dir(deck_dir: &std::path::Path, strict_mode: bool) -> anyhow::Result<String> {
    let (deck, slides, registry) = load_deck_bundle(deck_dir)?;
    generate_export_html(&deck, &slides, registry.as_ref(), Some(deck_dir), &SanitizationConfig::new(strict_mode))
}

/// Health check endpoint
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

#[derive(Deserialize)]
struct MarkdownTestRequest {
    markdown: String,
}

/// Test endpoint for markdown sanitization
async fn test_markdown_sanitization(
    State(state): State<AppState>,
    Json(request): Json<MarkdownTestRequest>,
) -> Json<serde_json::Value> {
    let sanitized_html = render_markdown_to_html(&request.markdown, &state.sanitization_config);
    Json(serde_json::json!({
        "original": request.markdown,
        "sanitized": sanitized_html,
        "strict_mode": state.sanitization_config.strict_mode
    }))
}

/// Get import map for package resolution
async fn get_import_map() -> Json<serde_json::Value> {
    let import_map = serde_json::json!({
        "imports": {
            "@coolslides/runtime": "/packages/runtime/dist/index.js",
            "@coolslides/component-sdk": "/packages/component-sdk/dist/index.js",
            "@coolslides/components": "/packages/components/dist/index.js",
            "@coolslides/plugins-stdlib": "/packages/plugins-stdlib/dist/index.js"
        }
    });
    
    Json(import_map)
}

/// Get the resolved deck manifest
async fn get_deck(State(state): State<AppState>) -> Result<Json<DeckManifest>, StatusCode> {
    let deck = state.deck.read().await;
    match deck.as_ref() {
        Some(manifest) => Ok(Json(manifest.clone())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

/// Get a specific slide
async fn get_slide(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<SlideDoc>, StatusCode> {
    let slides = state.slides.read().await;
    match slides.get(&id) {
        Some(slide) => Ok(Json(slide.clone())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

/// Start recording a room
async fn start_recording(
    AxumPath(room_id): AxumPath<String>,
    State(state): State<AppState>,
) -> StatusCode {
    if let Some(room) = state.room_manager.get_room(&room_id).await {
        room.start_recording().await;
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}

/// Stop recording a room
async fn stop_recording(
    AxumPath(room_id): AxumPath<String>,
    State(state): State<AppState>,
) -> StatusCode {
    if let Some(room) = state.room_manager.get_room(&room_id).await {
        room.stop_recording().await;
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}

/// Get room message dump
async fn get_room_dump(
    AxumPath(room_id): AxumPath<String>,
    State(state): State<AppState>,
) -> Result<String, StatusCode> {
    if let Some(room) = state.room_manager.get_room(&room_id).await {
        Ok(room.export_recording().await)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

#[derive(Deserialize)]
struct ExportRequest {
    profile: Option<String>,
    scale: Option<f32>,
    timeout: Option<u64>,
}

/// Export deck to PDF
async fn export_pdf(
    State(state): State<AppState>,
    Json(request): Json<ExportRequest>,
) -> Result<Response<Body>, StatusCode> {
    // Get deck and slides
    let deck = {
        let deck_guard = state.deck.read().await;
        deck_guard.as_ref().ok_or(StatusCode::NOT_FOUND)?.clone()
    };

    let slides = {
        let slides_guard = state.slides.read().await;
        slides_guard.clone()
    };

    // Generate slides HTML with sanitization config
    let components_registry = {
        let comps_guard = state.components.read().await;
        comps_guard.clone()
    };
    let slides_html = generate_slides_html(&deck, &slides, components_registry.as_ref(), &state.sanitization_config)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Configure export
    let profile = match request.profile.as_deref() {
        Some("archival") => export::ExportProfile::Archival,
        _ => export::ExportProfile::Handout,
    };

    let config = export::ExportConfig {
        profile,
        scale: request.scale.unwrap_or(1.0),
        timeout: request.timeout.unwrap_or(30000),
        output_path: "export.pdf".to_string(),
    };

    // Determine base directory for CSS resolution
    let deck_root = {
        let guard = state.deck_root.read().await;
        guard.clone()
    };
    // Generate PDF
    let pdf_data = export::export_deck_to_pdf(&deck, &slides_html, config, deck_root.as_deref())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Return PDF response
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"presentation.pdf\"")
        .body(Body::from(pdf_data))
        .unwrap())
}

/// Export deck to HTML
async fn export_html(
    State(state): State<AppState>,
) -> Result<Response<Body>, StatusCode> {
    // Get deck and slides
    let deck = {
        let deck_guard = state.deck.read().await;
        deck_guard.as_ref().ok_or(StatusCode::NOT_FOUND)?.clone()
    };

    let slides = {
        let slides_guard = state.slides.read().await;
        slides_guard.clone()
    };

    // Generate complete HTML export
    let components_registry = {
        let comps_guard = state.components.read().await;
        comps_guard.clone()
    };
    let deck_root = {
        let guard = state.deck_root.read().await;
        guard.clone()
    };
    let html_content = generate_export_html(&deck, &slides, components_registry.as_ref(), deck_root.as_deref(), &state.sanitization_config)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"presentation.html\"")
        .body(Body::from(html_content))
        .unwrap())
}

fn generate_slides_html(
    deck: &DeckManifest,
    slides: &HashMap<String, SlideDoc>,
    components: Option<&ComponentRegistry>,
    config: &SanitizationConfig,
) -> anyhow::Result<String> {
    let mut html_parts = Vec::new();

    for item in &deck.sequence {
        match item {
            coolslides_core::DeckItem::Ref { slide_id } => {
                if let Some(slide) = slides.get(slide_id) {
                    html_parts.push(generate_slide_html(slide, components, config)?);
                }
            }
            coolslides_core::DeckItem::Group { slides: group_slides, .. } => {
                for slide_id in group_slides {
                    if let Some(slide) = slides.get(slide_id) {
                        html_parts.push(generate_slide_html(slide, components, config)?);
                    }
                }
            }
        }
    }

    Ok(html_parts.join("\n"))
}

/// Public wrapper to generate slides HTML for PDF export and tooling
pub fn render_slides_html(
    deck: &DeckManifest,
    slides: &HashMap<String, SlideDoc>,
    components: Option<&ComponentRegistry>,
    config: &SanitizationConfig,
) -> anyhow::Result<String> {
    generate_slides_html(deck, slides, components, config)
}

fn resolve_component_tag(components: Option<&ComponentRegistry>, component_name: &str) -> String {
    if let Some(registry) = components {
        if let Some(manifest) = registry.components.get(component_name) {
            return manifest.tag.clone();
        }
        eprintln!("Warning: component '{}' not found in manifests; falling back to 'cs-unknown-component'", component_name);
        return "cs-unknown-component".to_string();
    }
    eprintln!("Warning: component registry not loaded; falling back to 'cs-unknown-component'");
    "cs-unknown-component".to_string()
}

fn generate_slide_html(slide: &SlideDoc, components: Option<&ComponentRegistry>, config: &SanitizationConfig) -> anyhow::Result<String> {
    let tag = resolve_component_tag(components, &slide.component.name);
    let style_attr = if !slide.style_overrides.is_empty() {
        let mut pairs: Vec<String> = slide
            .style_overrides
            .iter()
            .map(|(k, v)| format!("{}: {}", k, v))
            .collect();
        pairs.sort();
        format!(" style=\"{}\"", pairs.join("; "))
    } else {
        String::new()
    };
    
    let html = format!(
        r#"<div class="coolslides-slide" data-slide="{}"{}>
            <{} {}>{}</{}>
            {}
        </div>"#,
        slide.id,
        style_attr,
        tag,
        format_props_as_data_id(&slide.id),
        format_slots(&slide.slots, config)?,
        tag,
        generate_props_script(&slide.id, &slide.props)?
    );

    Ok(html)
}

fn format_props_as_data_id(slide_id: &str) -> String {
    format!("data-props-id=\"{}\"", slide_id)
}

fn generate_props_script(slide_id: &str, props: &serde_json::Value) -> anyhow::Result<String> {
    let props_json = serde_json::to_string(props)?;
    Ok(format!(
        r#"<script type="application/json" data-props="{}">{}</script>"#,
        slide_id,
        props_json
    ))
}

fn render_markdown_to_html(markdown: &str, config: &SanitizationConfig) -> String {
    let parser = Parser::new(markdown);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    
    // Configure sanitization based on strict mode
    let sanitized = if config.strict_mode {
        // Strict mode: very limited HTML tags allowed
        ammonia::Builder::new()
            .tags(hashset![
                "p", "br", "strong", "em", "code", "pre",
                "h1", "h2", "h3", "h4", "h5", "h6",
                "ul", "ol", "li", "blockquote"
            ])
            .clean_content_tags(hashset!["script", "style"])
            .strip_comments(true)
            .link_rel(None) // Remove all link relations
            .clean(&html_output)
    } else {
        // Default mode: presentation-friendly tags
        ammonia::Builder::new()
            .tags(hashset![
                "p", "br", "strong", "em", "code", "pre", "span", "div",
                "h1", "h2", "h3", "h4", "h5", "h6",
                "ul", "ol", "li", "blockquote", "a", "img",
                "table", "thead", "tbody", "tr", "td", "th"
            ])
            .tag_attributes(hashmap![
                "a" => hashset!["href", "title"],
                "img" => hashset!["src", "alt", "title", "width", "height"],
                "code" => hashset!["class"],
                "pre" => hashset!["class"],
                "span" => hashset!["class"],
                "div" => hashset!["class"]
            ])
            .clean_content_tags(hashset!["script", "style"])
            .strip_comments(true)
            .link_rel(Some("noopener noreferrer"))
            .clean(&html_output)
    };
    
    sanitized.to_string()
}

fn format_slots(
    slots: &HashMap<String, coolslides_core::Slot>,
    config: &SanitizationConfig
) -> anyhow::Result<String> {
    let slot_content: Vec<String> = slots.iter()
        .map(|(name, slot)| {
            match slot {
                coolslides_core::Slot::Markdown { value } => {
                    let rendered_html = render_markdown_to_html(value, config);
                    format!(r#"<div slot="{}">{}</div>"#, name, rendered_html)
                }
                coolslides_core::Slot::Component { tag, module, props, defer, .. } => {
                    let slot_id = format!("{}:{}", name, tag);
                    let props_script = generate_props_script(&slot_id, props).unwrap_or_default();
                    let defer_attr = defer.as_ref().map(|d| format!(" data-defer=\"{}\"", 
                        match d {
                            coolslides_core::DeferStrategy::Eager => "eager",
                            coolslides_core::DeferStrategy::Visible => "visible", 
                            coolslides_core::DeferStrategy::Idle => "idle",
                        }
                    )).unwrap_or_default();
                    
                    format!(
                        r#"<{} slot="{}" data-props-id="{}" data-slot-component data-module="{}"{}>{}</{tag}>"#, 
                        tag, name, slot_id, module, defer_attr, props_script
                    )
                }
            }
        })
        .collect();

    Ok(slot_content.join(""))
}

fn generate_export_html(
    deck: &DeckManifest,
    slides: &HashMap<String, SlideDoc>,
    components: Option<&ComponentRegistry>,
    deck_root: Option<&Path>,
    config: &SanitizationConfig,
) -> anyhow::Result<String> {
    let slides_html = generate_slides_html(deck, slides, components, config)?;

    let theme_css = inline_css(deck_root, &deck.theme);
    let tokens_css = deck.tokens.as_ref().and_then(|p| inline_css(deck_root, p));
    let base_href = deck_root.map(|p| format!("file://{}/", p.canonicalize().unwrap_or_else(|_| p.to_path_buf()).to_string_lossy()));
    
    // Build CSS includes based on context (export vs dev)
    let (theme_style_content, tokens_block) = if deck_root.is_some() {
        (
            theme_css.unwrap_or_default(),
            tokens_css.map(|c| format!("<style>\n{}\n</style>", c)).unwrap_or_default(),
        )
    } else {
        (
            String::new(),
            format!(
                "<link rel=\"stylesheet\" href=\"{}\"/>{}",
                deck.theme,
                deck.tokens.as_ref().map(|t| format!("\n<link rel=\\\"stylesheet\\\" href=\\\"{}\\\"/>", t)).unwrap_or_default()
            ),
        )
    };

    let html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{}</title>
    {}
    <script type="importmap">{}</script>
    <!-- Theme CSS (inline for export; linked in dev) -->
    <style>
        {}
    </style>
    <!-- Tokens CSS (inline for export; linked in dev) -->
    {}
    <script type="module" src="/packages/runtime/dist/index.js"></script>
    <script type="module" src="/packages/components/dist/index.js"></script>
</head>
<body>
    <div class="coolslides-presentation">
        {}
    </div>
    
    <script type="application/json" data-deck>
        {}
    </script>
    
    <script type="application/json" data-slides>
        {}
    </script>
</body>
</html>"#,
        deck.title,
        base_href.as_ref().map(|u| format!("<base href=\"{}\">", u)).unwrap_or_default(),
        serde_json::to_string(&serde_json::json!({
            "imports": {
                "@coolslides/runtime": "/packages/runtime/dist/index.js",
                "@coolslides/components": "/packages/components/dist/index.js",
                "@coolslides/component-sdk": "/packages/component-sdk/dist/index.js",
                "@coolslides/plugins-stdlib": "/packages/plugins-stdlib/dist/index.js"
            }
        })).unwrap_or("{}".into()),
        theme_style_content,
        tokens_block,
        slides_html,
        serde_json::to_string_pretty(deck)?,
        serde_json::to_string_pretty(&slides.values().collect::<Vec<_>>())?
    );

    Ok(html)
}

fn inline_css(base: Option<&Path>, path_str: &str) -> Option<String> {
    use std::fs;
    let mut candidates: Vec<PathBuf> = Vec::new();
    let p = PathBuf::from(path_str);
    if p.is_absolute() {
        candidates.push(p);
    } else {
        if let Some(b) = base {
            candidates.push(b.join(path_str));
        }
        candidates.push(PathBuf::from(path_str));
    }

    for cand in candidates {
        if let Ok(content) = fs::read_to_string(&cand) {
            return Some(content);
        }
    }

    None
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

/// WebSocket handler for rooms
async fn websocket_handler(
    ws: WebSocketUpgrade,
    AxumPath(room_id): AxumPath<String>,
    State(state): State<AppState>,
) -> axum::response::Response {
    // Ensure room exists with the provided room_id
    let _ = state.room_manager.ensure_room(room_id.clone()).await;
    
    let room_manager = state.room_manager.clone();
    ws.on_upgrade(move |socket| {
        rooms::handle_websocket_connection(socket, room_id, room_manager)
    })
}

/// Presenter UI
async fn presenter_ui() -> Html<&'static str> {
    Html(r#"
    <!DOCTYPE html>
    <html>
    <head>
        <title>Coolslides Presenter</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
        <h1>Coolslides Presenter View</h1>
        <p>Presenter interface will be here</p>
        <!-- TODO: Implement presenter UI -->
    </body>
    </html>
    "#)
}

/// Audience UI
async fn audience_ui() -> Html<&'static str> {
    Html(r#"
    <!DOCTYPE html>
    <html>
    <head>
        <title>Coolslides Audience</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
        <h1>Coolslides Audience View</h1>
        <p>Audience interface will be here</p>
        <!-- TODO: Implement audience UI -->
    </body>
    </html>
    "#)
}

/// Start the development server with directory and strict mode
pub async fn start_server_with_dir(host: &str, port: u16, deck_dir: Option<&str>, strict_mode: bool) -> anyhow::Result<()> {
    let state = AppState::new_with_strict_mode(strict_mode);
    
    // Load deck from directory (default to current directory)
    let deck_path = deck_dir.unwrap_or(".");
    if let Err(e) = state.load_from_directory(deck_path).await {
        println!("Warning: Failed to load deck from {}: {}", deck_path, e);
        println!("Server will start but /api/deck and /api/slide endpoints will return 404");
    }
    
    // Start file watcher for hot reloading
    if let Err(e) = state.start_file_watcher(deck_path).await {
        println!("Warning: Failed to start file watcher: {}", e);
    }
    
    let app = create_router(state);
    
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", host, port)).await?;
    println!("Coolslides dev server running on http://{}:{}", host, port);
    println!("Serving deck from: {}", std::fs::canonicalize(deck_path).unwrap_or_else(|_| deck_path.into()).display());
    
    axum::serve(listener, app).await?;
    Ok(())
}

/// Start the development server
pub async fn start_server(host: &str, port: u16) -> anyhow::Result<()> {
    start_server_with_dir(host, port, None, false).await
}

/// Start the development server with strict mode
pub async fn start_server_with_strict(host: &str, port: u16, strict_mode: bool) -> anyhow::Result<()> {
    start_server_with_dir(host, port, None, strict_mode).await
}
