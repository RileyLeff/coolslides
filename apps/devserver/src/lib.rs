use axum::{
    extract::{Path as AxumPath, State, WebSocketUpgrade},
    http::{StatusCode, header},
    response::{Html, Json, Response},
    routing::{get, post},
    Router,
    body::Body,
};
use coolslides_core::{DeckManifest, SlideDoc};
use serde::Deserialize;
use std::{collections::HashMap, path::Path, sync::Arc};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tokio::fs;
use pulldown_cmark::{Parser, html};

pub mod export;
pub mod rooms;

/// Development server state
#[derive(Clone)]
pub struct AppState {
    pub room_manager: Arc<rooms::RoomManager>,
    pub deck: Arc<RwLock<Option<DeckManifest>>>,
    pub slides: Arc<RwLock<HashMap<String, SlideDoc>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            room_manager: Arc::new(rooms::RoomManager::new()),
            deck: Arc::new(RwLock::new(None)),
            slides: Arc::new(RwLock::new(HashMap::new())),
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
        
        let slide_count = slides_map.len();
        
        {
            let mut slides = self.slides.write().await;
            *slides = slides_map;
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
        .route("/api/deck", get(get_deck))
        .route("/api/slide/:id", get(get_slide))
        .route("/api/rooms/:room_id/record/start", post(start_recording))
        .route("/api/rooms/:room_id/record/stop", post(stop_recording))
        .route("/api/rooms/:room_id/dump", get(get_room_dump))
        .route("/api/export/pdf", post(export_pdf))
        .route("/api/export/html", post(export_html))
        .route("/api/importmap", get(get_import_map))
        .route("/healthz", get(health_check))
        
        // WebSocket routes
        .route("/rooms/:room_id", get(websocket_handler))
        
        // UI routes
        .route("/presenter", get(presenter_ui))
        .route("/audience", get(audience_ui))
        
        // Static files
        .nest_service("/static", ServeDir::new("static"))
        .nest_service("/packages/runtime/dist", ServeDir::new("packages/runtime/dist"))
        .nest_service("/packages/components/dist", ServeDir::new("packages/components/dist"))
        .nest_service("/themes", ServeDir::new("themes"))
        
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Health check endpoint
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
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

    // Generate slides HTML
    let slides_html = generate_slides_html(&deck, &slides).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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

    // Generate PDF
    let pdf_data = export::export_deck_to_pdf(&deck, &slides_html, config)
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
    let html_content = generate_export_html(&deck, &slides).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"presentation.html\"")
        .body(Body::from(html_content))
        .unwrap())
}

fn generate_slides_html(deck: &DeckManifest, slides: &HashMap<String, SlideDoc>) -> anyhow::Result<String> {
    let mut html_parts = Vec::new();

    for item in &deck.sequence {
        match item {
            coolslides_core::DeckItem::Ref { slide_id } => {
                if let Some(slide) = slides.get(slide_id) {
                    html_parts.push(generate_slide_html(slide)?);
                }
            }
            coolslides_core::DeckItem::Group { slides: group_slides, .. } => {
                for slide_id in group_slides {
                    if let Some(slide) = slides.get(slide_id) {
                        html_parts.push(generate_slide_html(slide)?);
                    }
                }
            }
        }
    }

    Ok(html_parts.join("\n"))
}

fn get_component_tag(component_name: &str) -> &'static str {
    // Map component names to their actual tags
    // TODO: This should be loaded from component manifests
    match component_name {
        "TitleSlide" => "cs-title-slide",
        "TwoColSlide" => "cs-two-col-slide", 
        "QuoteSlide" => "cs-quote-slide",
        "CodeSlide" => "cs-code-slide",
        "PollWidget" => "cs-poll",
        _ => {
            // Fallback to transformation for unknown components
            // This should log a warning in a real implementation
            match component_name.to_lowercase().as_str() {
                name if name.contains("slide") => {
                    if name == "titleslide" { "cs-title-slide" }
                    else if name == "twocolslide" { "cs-two-col-slide" }
                    else if name == "quoteslide" { "cs-quote-slide" }
                    else if name == "codeslide" { "cs-code-slide" }
                    else { "cs-unknown-slide" }
                },
                _ => "cs-unknown-component"
            }
        }
    }
}

fn generate_slide_html(slide: &SlideDoc) -> anyhow::Result<String> {
    let tag = get_component_tag(&slide.component.name);
    
    let html = format!(
        r#"<div class="coolslides-slide" data-slide="{}">
            <{} {}>{}</{}>
        </div>"#,
        slide.id,
        tag,
        format_props(&slide.props)?,
        format_slots(&slide.slots)?,
        tag
    );

    Ok(html)
}

fn format_props(props: &serde_json::Value) -> anyhow::Result<String> {
    if let Some(obj) = props.as_object() {
        let attrs: Vec<String> = obj.iter()
            .map(|(key, value)| {
                let value_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    _ => value.to_string().trim_matches('"').to_string(),
                };
                format!("{}=\"{}\"", key, html_escape(&value_str))
            })
            .collect();
        Ok(attrs.join(" "))
    } else {
        Ok(String::new())
    }
}

fn render_markdown_to_html(markdown: &str) -> String {
    let parser = Parser::new(markdown);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

fn format_slots(slots: &HashMap<String, coolslides_core::Slot>) -> anyhow::Result<String> {
    let slot_content: Vec<String> = slots.iter()
        .map(|(name, slot)| {
            match slot {
                coolslides_core::Slot::Markdown { value } => {
                    let rendered_html = render_markdown_to_html(value);
                    format!(r#"<div slot="{}">{}</div>"#, name, rendered_html)
                }
                coolslides_core::Slot::Component { tag, props, .. } => {
                    format!(r#"<{} slot="{}" {}></{tag}>"#, tag, name, format_props(props).unwrap_or_default())
                }
            }
        })
        .collect();

    Ok(slot_content.join(""))
}

fn generate_export_html(deck: &DeckManifest, slides: &HashMap<String, SlideDoc>) -> anyhow::Result<String> {
    let slides_html = generate_slides_html(deck, slides)?;
    
    let html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{}</title>
    <link rel="stylesheet" href="{}">
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
        deck.theme,
        slides_html,
        serde_json::to_string_pretty(deck)?,
        serde_json::to_string_pretty(&slides.values().collect::<Vec<_>>())?
    );

    Ok(html)
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

/// Start the development server with directory
pub async fn start_server_with_dir(host: &str, port: u16, deck_dir: Option<&str>) -> anyhow::Result<()> {
    let state = AppState::new();
    
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
    start_server_with_dir(host, port, None).await
}