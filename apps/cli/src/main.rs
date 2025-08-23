use clap::{Parser, Subcommand};
use coolslides_core::{DeckManifest, SlideDoc, ComponentRegistry, components, validation};
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
        /// Directory to serve deck from
        #[arg(long, default_value = ".")]
        dir: String,
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
        Commands::Dev { open, port, host, dir, strict, seed: _ } => {
            println!("Starting dev server on {}:{} (dir: {})", host, port, dir);
            if strict {
                println!("Running in strict mode (enhanced HTML sanitization)");
            }
            if open {
                let url = format!("http://{}:{}", host, port);
                println!("Will open browser: {}", url);
                // Best-effort open in the background
                tokio::spawn(async move {
                    use std::process::Command;
                    #[cfg(target_os = "macos")]
                    let _ = Command::new("open").arg(&url).spawn();
                    #[cfg(all(unix, not(target_os = "macos")))]
                    let _ = Command::new("xdg-open").arg(&url).spawn();
                    #[cfg(target_os = "windows")]
                    let _ = Command::new("cmd").args(["/C", "start", &url]).spawn();
                });
            }

            // Start the development server
            match coolslides_server::start_server_with_dir(&host, port, Some(&dir), strict).await {
                Ok(()) => {
                    println!("Server stopped successfully");
                }
                Err(e) => {
                    eprintln!("Error starting server: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Commands::Validate { format: _, strict: _ } => {
            match validate_deck_in_directory(".").await {
                Ok(()) => {
                    println!("✓ Deck validation passed");
                }
                Err(e) => {
                    eprintln!("✗ Deck validation failed: {}", e);
                    std::process::exit(1);
                }
            }
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

/// Validate a deck in the specified directory
async fn validate_deck_in_directory(deck_dir: &str) -> Result<()> {
    use std::collections::HashMap;
    use std::path::Path;
    use tokio::fs;
    
    let deck_path = Path::new(deck_dir);
    
    // Load deck manifest
    let manifest_path = deck_path.join("slides.toml");
    if !manifest_path.exists() {
        return Err(anyhow::anyhow!("No slides.toml found in {}", deck_dir));
    }
    
    let manifest_content = fs::read_to_string(&manifest_path).await?;
    let deck_manifest: DeckManifest = toml::from_str(&manifest_content)?;
    
    // Load all slide files
    let content_dir = deck_path.join("content");
    let mut slides = Vec::new();
    let mut slide_file_paths = HashMap::new();
    
    if content_dir.exists() {
        let mut entries = fs::read_dir(&content_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("toml") 
                && path.file_stem().and_then(|s| s.to_str()).map(|s| s.ends_with(".slide")).unwrap_or(false) {
                
                let slide_content = fs::read_to_string(&path).await?;
                let slide_doc: SlideDoc = match toml::from_str(&slide_content) {
                    Ok(slide) => slide,
                    Err(e) => {
                        eprintln!("✗ Failed to parse {}: {}", path.display(), e);
                        return Err(anyhow::anyhow!("Slide parsing failed"));
                    }
                };
                
                slide_file_paths.insert(slide_doc.id.clone(), path);
                slides.push(slide_doc);
            }
        }
    }
    
    // Load component registry - try to find components directory
    let possible_components_paths = [
        Path::new("packages/components/src"),        // From project root
        Path::new("../../packages/components/src"),  // From examples/basic-deck
        Path::new("../packages/components/src"),     // From apps/cli
    ];
    
    let registry = possible_components_paths
        .iter()
        .find(|path| path.exists())
        .and_then(|components_dir| {
            match components::extract_manifests_from_directory(components_dir) {
                Ok(registry) => Some(registry),
                Err(e) => {
                    eprintln!("Warning: Failed to load component manifests from {}: {}", components_dir.display(), e);
                    eprintln!("Schema validation will be skipped");
                    None
                }
            }
        });
    
    // Perform validation
    let validation_result = validation::validate_deck_with_registry(
        &deck_manifest,
        &slides,
        registry.as_ref()
    );
    
    // Report results
    if !validation_result.errors.is_empty() {
        eprintln!("Validation errors:");
        for error in &validation_result.errors {
            // Try to find which file the error came from
            let file_context = if let Some(slide_id) = extract_slide_id_from_error(error) {
                if let Some(file_path) = slide_file_paths.get(&slide_id) {
                    format!(" in {}", file_path.display())
                } else {
                    format!(" in slide '{}'", slide_id)
                }
            } else {
                " in slides.toml".to_string()
            };
            
            eprintln!("  {}{}", error, file_context);
        }
        return Err(anyhow::anyhow!("Validation failed with {} errors", validation_result.errors.len()));
    }
    
    if !validation_result.warnings.is_empty() {
        println!("Validation warnings:");
        for warning in &validation_result.warnings {
            println!("  {}", warning);
        }
    }
    
    println!("✓ Validated {} slides successfully", slides.len());
    if let Some(registry) = registry {
        println!("✓ Schema validation completed with {} components", registry.components.len());
    }
    
    Ok(())
}

/// Extract slide ID from validation error for file context
fn extract_slide_id_from_error(error: &validation::ValidationError) -> Option<String> {
    use validation::ValidationError;
    match error {
        ValidationError::UnknownComponent { slide_id, .. } => Some(slide_id.clone()),
        ValidationError::InvalidComponentProps { slide_id, .. } => Some(slide_id.clone()),
        ValidationError::MissingRequiredProp { slide_id, .. } => Some(slide_id.clone()),
        _ => None,
    }
}
