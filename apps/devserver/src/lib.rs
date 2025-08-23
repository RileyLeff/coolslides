use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    http::{StatusCode, header},
    response::{Html, Json, Response},
    routing::{get, post},
    Router,
    body::Body,
};
use coolslides_core::{DeckManifest, SlideDoc};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

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
        .route("/healthz", get(health_check))
        
        // WebSocket routes
        .route("/rooms/:room_id", get(websocket_handler))
        
        // UI routes
        .route("/presenter", get(presenter_ui))
        .route("/audience", get(audience_ui))
        
        // Static files
        .nest_service("/static", ServeDir::new("static"))
        
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Health check endpoint
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
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
    Path(id): Path<String>,
) -> Result<Json<SlideDoc>, StatusCode> {
    let slides = state.slides.read().await;
    match slides.get(&id) {
        Some(slide) => Ok(Json(slide.clone())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

/// Start recording a room
async fn start_recording(
    Path(room_id): Path<String>,
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
    Path(room_id): Path<String>,
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
    Path(room_id): Path<String>,
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

fn generate_slide_html(slide: &SlideDoc) -> anyhow::Result<String> {
    // Generate basic slide HTML structure
    // This is simplified - in a real implementation, we'd render the actual components
    let html = format!(
        r#"<div class="coolslides-slide" data-slide="{}">
            <{} {}>{}</{}>
        </div>"#,
        slide.id,
        format!("cs-{}", slide.component.name.to_lowercase().replace("slide", "-slide")),
        format_props(&slide.props)?,
        format_slots(&slide.slots)?,
        format!("cs-{}", slide.component.name.to_lowercase().replace("slide", "-slide"))
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

fn format_slots(slots: &HashMap<String, coolslides_core::Slot>) -> anyhow::Result<String> {
    let slot_content: Vec<String> = slots.iter()
        .map(|(name, slot)| {
            match slot {
                coolslides_core::Slot::Markdown { value } => {
                    format!(r#"<div slot="{}">{}</div>"#, name, html_escape(value))
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
    Path(room_id): Path<String>,
    State(state): State<AppState>,
) -> axum::response::Response {
    // Create room if it doesn't exist
    if state.room_manager.get_room(&room_id).await.is_none() {
        let _ = state.room_manager.create_room().await;
    }
    
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

/// Start the development server
pub async fn start_server(host: &str, port: u16) -> anyhow::Result<()> {
    let state = AppState::new();
    let app = create_router(state);
    
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", host, port)).await?;
    println!("Coolslides dev server running on http://{}:{}", host, port);
    
    axum::serve(listener, app).await?;
    Ok(())
}