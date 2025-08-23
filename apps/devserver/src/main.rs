use coolslides_server::start_server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();
    
    // Start the server
    start_server("127.0.0.1", 5173).await
}