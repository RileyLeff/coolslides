/**
 * WebSocket rooms for presenter/audience interaction with record/replay
 */

use axum::extract::ws::{Message, WebSocket};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
};
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RoomMessage {
    Join {
        role: ClientRole,
        client_id: String,
    },
    Event {
        event: EventData,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        timestamp: DateTime<Utc>,
    },
    State {
        data: serde_json::Value,
        #[serde(with = "chrono::serde::ts_milliseconds")]
        timestamp: DateTime<Utc>,
    },
    Ack {
        id: String,
    },
    Heartbeat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClientRole {
    Presenter,
    Audience,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub name: String,
    pub data: serde_json::Value,
    pub client_id: String,
}

#[derive(Debug, Clone)]
pub struct RoomClient {
    pub id: String,
    pub role: ClientRole,
    pub connected_at: DateTime<Utc>,
    pub sender: broadcast::Sender<RoomMessage>,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub clients: Arc<RwLock<HashMap<String, RoomClient>>>,
    pub message_history: Arc<RwLock<VecDeque<RoomMessage>>>,
    pub is_recording: Arc<RwLock<bool>>,
    pub recorded_messages: Arc<RwLock<Vec<RecordedMessage>>>,
    pub state: Arc<RwLock<serde_json::Value>>,
    pub broadcast_tx: broadcast::Sender<RoomMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordedMessage {
    pub message: RoomMessage,
    #[serde(with = "chrono::serde::ts_milliseconds")]
    pub recorded_at: DateTime<Utc>,
    pub session_time: u64, // Milliseconds since session start
}

impl Room {
    pub fn new(room_id: String) -> Self {
        let (broadcast_tx, _) = broadcast::channel(1000);
        
        Self {
            id: room_id,
            created_at: Utc::now(),
            clients: Arc::new(RwLock::new(HashMap::new())),
            message_history: Arc::new(RwLock::new(VecDeque::new())),
            is_recording: Arc::new(RwLock::new(false)),
            recorded_messages: Arc::new(RwLock::new(Vec::new())),
            state: Arc::new(RwLock::new(serde_json::Value::Null)),
            broadcast_tx,
        }
    }

    pub async fn add_client(&self, client_id: String, role: ClientRole) -> broadcast::Receiver<RoomMessage> {
        let client = RoomClient {
            id: client_id.clone(),
            role: role.clone(),
            connected_at: Utc::now(),
            sender: self.broadcast_tx.clone(),
        };

        let receiver = self.broadcast_tx.subscribe();
        
        {
            let mut clients = self.clients.write().await;
            clients.insert(client_id.clone(), client);
        }

        // Send join message
        let join_message = RoomMessage::Join {
            role,
            client_id: client_id.clone(),
        };
        
        self.broadcast_message(join_message).await;
        
        receiver
    }

    pub async fn remove_client(&self, client_id: &str) {
        let mut clients = self.clients.write().await;
        clients.remove(client_id);
    }

    pub async fn broadcast_message(&self, message: RoomMessage) {
        // Add to history
        {
            let mut history = self.message_history.write().await;
            history.push_back(message.clone());
            
            // Keep only last 1000 messages
            if history.len() > 1000 {
                history.pop_front();
            }
        }

        // Record if recording is active
        {
            let is_recording = *self.is_recording.read().await;
            if is_recording {
                let mut recorded = self.recorded_messages.write().await;
                let session_time = Utc::now()
                    .signed_duration_since(self.created_at)
                    .num_milliseconds() as u64;

                recorded.push(RecordedMessage {
                    message: message.clone(),
                    recorded_at: Utc::now(),
                    session_time,
                });
            }
        }

        // Broadcast to all clients
        let _ = self.broadcast_tx.send(message);
    }

    pub async fn handle_event(&self, event: EventData) {
        let message = RoomMessage::Event {
            event: event.clone(),
            timestamp: Utc::now(),
        };

        // Handle special events
        match event.name.as_str() {
            "slide:change" => {
                self.update_state("currentSlide", event.data).await;
            }
            "fragment:change" => {
                self.update_state("currentFragment", event.data).await;
            }
            "presenter:sync" => {
                // Sync presenter state
                if let Ok(state) = serde_json::from_value::<PresenterState>(event.data.clone()) {
                    self.sync_presenter_state(state).await;
                }
            }
            _ => {}
        }

        self.broadcast_message(message).await;
    }

    pub async fn update_state(&self, key: &str, value: serde_json::Value) {
        let mut state = self.state.write().await;
        
        if let Some(obj) = state.as_object_mut() {
            obj.insert(key.to_string(), value);
        } else {
            let mut map = serde_json::Map::new();
            map.insert(key.to_string(), value);
            *state = serde_json::Value::Object(map);
        }
    }

    pub async fn sync_presenter_state(&self, presenter_state: PresenterState) {
        let mut state = self.state.write().await;
        *state = serde_json::to_value(presenter_state).unwrap_or(serde_json::Value::Null);
    }

    pub async fn start_recording(&self) {
        let mut is_recording = self.is_recording.write().await;
        *is_recording = true;
        
        // Clear previous recording
        let mut recorded = self.recorded_messages.write().await;
        recorded.clear();
    }

    pub async fn stop_recording(&self) {
        let mut is_recording = self.is_recording.write().await;
        *is_recording = false;
    }

    pub async fn get_recorded_messages(&self) -> Vec<RecordedMessage> {
        let recorded = self.recorded_messages.read().await;
        recorded.clone()
    }

    pub async fn export_recording(&self) -> String {
        let messages = self.get_recorded_messages().await;
        
        messages.iter()
            .map(|recorded| {
                serde_json::to_string(&recorded).unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub async fn replay_recording(&self, messages: Vec<RecordedMessage>, time_compression: f64) {
        if messages.is_empty() {
            return;
        }

        let start_time = messages[0].session_time;
        
        for recorded in messages {
            let delay_ms = ((recorded.session_time - start_time) as f64 / time_compression) as u64;
            
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
            
            self.broadcast_message(recorded.message).await;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresenterState {
    pub current_slide: String,
    pub current_fragment: u32,
    pub deck_title: String,
    pub total_slides: u32,
}

pub struct RoomManager {
    rooms: Arc<RwLock<HashMap<String, Room>>>,
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_room(&self) -> String {
        let room_id = Uuid::new_v4().to_string();
        let room = Room::new(room_id.clone());
        
        let mut rooms = self.rooms.write().await;
        rooms.insert(room_id.clone(), room);
        
        room_id
    }

    pub async fn ensure_room(&self, room_id: String) -> String {
        // Check if room already exists
        if self.get_room(&room_id).await.is_some() {
            return room_id;
        }
        
        // Create room with the provided ID
        let room = Room::new(room_id.clone());
        
        let mut rooms = self.rooms.write().await;
        rooms.insert(room_id.clone(), room);
        
        room_id
    }

    pub async fn get_room(&self, room_id: &str) -> Option<Room> {
        let rooms = self.rooms.read().await;
        rooms.get(room_id).cloned()
    }

    pub async fn remove_room(&self, room_id: &str) {
        let mut rooms = self.rooms.write().await;
        rooms.remove(room_id);
    }

    pub async fn cleanup_empty_rooms(&self) {
        let mut rooms = self.rooms.write().await;
        let mut to_remove = Vec::new();

        for (room_id, room) in rooms.iter() {
            let clients = room.clients.read().await;
            if clients.is_empty() {
                let inactive_duration = Utc::now()
                    .signed_duration_since(room.created_at)
                    .num_minutes();
                
                // Remove rooms that have been empty for more than 30 minutes
                if inactive_duration > 30 {
                    to_remove.push(room_id.clone());
                }
            }
        }

        for room_id in to_remove {
            rooms.remove(&room_id);
        }
    }
}

pub async fn handle_websocket_connection(
    mut socket: WebSocket,
    room_id: String,
    room_manager: Arc<RoomManager>,
) {
    let room = match room_manager.get_room(&room_id).await {
        Some(room) => room,
        None => {
            let _ = socket.send(Message::Text(
                serde_json::to_string(&RoomMessage::Event {
                    event: EventData {
                        name: "error".to_string(),
                        data: serde_json::json!({"message": "Room not found"}),
                        client_id: "system".to_string(),
                    },
                    timestamp: Utc::now(),
                }).unwrap()
            )).await;
            return;
        }
    };

    let client_id = Uuid::new_v4().to_string();
    let mut receiver = room.add_client(client_id.clone(), ClientRole::Audience).await;

    // Send current state to new client
    let state = room.state.read().await.clone();
    if !state.is_null() {
        let state_message = RoomMessage::State {
            data: state,
            timestamp: Utc::now(),
        };
        
        if let Ok(msg) = serde_json::to_string(&state_message) {
            let _ = socket.send(Message::Text(msg)).await;
        }
    }

    // Handle incoming and outgoing messages
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            ws_msg = socket.recv() => {
                match ws_msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(room_message) = serde_json::from_str::<RoomMessage>(&text) {
                            match room_message {
                                RoomMessage::Event { event, .. } => {
                                    room.handle_event(event).await;
                                }
                                RoomMessage::Heartbeat => {
                                    // Respond with heartbeat
                                    let heartbeat = RoomMessage::Heartbeat;
                                    if let Ok(msg) = serde_json::to_string(&heartbeat) {
                                        let _ = socket.send(Message::Text(msg)).await;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {
                        // Ignore binary messages for now
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Pong(_))) => {
                        // Ignore pong messages
                    }
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(_)) => break,
                    None => break,
                }
            }
            
            // Handle outgoing broadcast messages
            broadcast_msg = receiver.recv() => {
                match broadcast_msg {
                    Ok(msg) => {
                        if let Ok(json) = serde_json::to_string(&msg) {
                            if socket.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        }
    }

    // Clean up client
    room.remove_client(&client_id).await;
}