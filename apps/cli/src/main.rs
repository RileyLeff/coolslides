use clap::{Parser, Subcommand};
use coolslides_core::{DeckManifest, SlideDoc};
use anyhow::Result;

#[derive(Parser)]
#[command(name = "coolslides")]
#[command(about = "Pro-grade, hackable slide platform")]
#[command(version = env!("CARGO_PKG_VERSION"))]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new slide deck
    Init {
        /// Template to use (svelte-ce or vanilla-ce)
        #[arg(long, default_value = "svelte-ce")]
        template: String,
        /// Directory to create the project in
        #[arg(long)]
        dir: Option<String>,
    },
    /// Create a new slide component
    New {
        /// Component name
        component_name: String,
        /// Slide ID
        #[arg(long)]
        id: String,
        /// Schema file or registry ID
        #[arg(long)]
        from_schema: Option<String>,
    },
    /// Start development server
    Dev {
        /// Open browser automatically
        #[arg(long)]
        open: bool,
        /// Port to run server on
        #[arg(long, default_value = "5173")]
        port: u16,
        /// Host to bind to
        #[arg(long, default_value = "127.0.0.1")]
        host: String,
        /// Enable strict mode
        #[arg(long)]
        strict: bool,
        /// Random seed for deterministic behavior
        #[arg(long)]
        seed: Option<u64>,
    },
    /// Validate slide deck
    Validate {
        /// Output format
        #[arg(long, default_value = "text")]
        format: String,
        /// Enable strict validation
        #[arg(long)]
        strict: bool,
    },
    /// Export slide deck
    Export {
        /// Export format
        #[command(subcommand)]
        format: ExportFormat,
    },
    /// Add component or plugin
    Add {
        /// What to add
        #[command(subcommand)]
        item: AddItem,
    },
    /// Run environment diagnostics
    Doctor {
        /// Specific diagnostic to run
        target: Option<String>,
    },
}

#[derive(Subcommand)]
enum ExportFormat {
    /// Export to HTML
    Html {
        /// Output directory
        dir: String,
        /// Enable strict mode
        #[arg(long)]
        strict: bool,
    },
    /// Export to PDF
    Pdf {
        /// Output file
        file: String,
        /// Export profile
        #[arg(long, default_value = "handout")]
        profile: String,
        /// Scale factor
        #[arg(long, default_value = "1.0")]
        scale: f32,
        /// Timeout in milliseconds
        #[arg(long, default_value = "30000")]
        timeout: u64,
    },
}

#[derive(Subcommand)]
enum AddItem {
    /// Add a component
    Component {
        /// Package specification
        package: String,
    },
    /// Add a plugin
    Plugin {
        /// Package specification  
        package: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Init { template, dir } => {
            println!("Initializing new Coolslides project with template: {}", template);
            if let Some(dir) = dir {
                println!("Target directory: {}", dir);
            }
            // TODO: Implement init command
        }
        Commands::New { component_name, id, from_schema } => {
            println!("Creating new slide: {} with ID: {}", component_name, id);
            // TODO: Implement new command
        }
        Commands::Dev { open: _, port, host, strict: _, seed: _ } => {
            println!("Starting dev server on {}:{}", host, port);
            
            // Start the development server
            match coolslides_server::start_server(&host, port).await {
                Ok(()) => {
                    println!("Server stopped successfully");
                }
                Err(e) => {
                    eprintln!("Error starting server: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Commands::Validate { format, strict } => {
            println!("Validating slide deck (format: {})", format);
            // TODO: Implement validation
        }
        Commands::Export { format } => {
            match format {
                ExportFormat::Html { dir, strict } => {
                    println!("Exporting to HTML: {}", dir);
                }
                ExportFormat::Pdf { file, profile, scale, timeout } => {
                    println!("Exporting to PDF: {} (profile: {}, scale: {})", file, profile, scale);
                }
            }
            // TODO: Implement export
        }
        Commands::Add { item } => {
            match item {
                AddItem::Component { package } => {
                    println!("Adding component: {}", package);
                }
                AddItem::Plugin { package } => {
                    println!("Adding plugin: {}", package);
                }
            }
            // TODO: Implement add command
        }
        Commands::Doctor { target } => {
            println!("Running diagnostics");
            if let Some(target) = target {
                println!("Target: {}", target);
            }
            // TODO: Implement doctor command
        }
    }
    
    Ok(())
}