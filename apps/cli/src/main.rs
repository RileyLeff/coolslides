use clap::{Parser, Subcommand};
use coolslides_core::{DeckManifest, SlideDoc, ComponentRegistry, components, validation};
use std::path::Path;
use anyhow::Result;
use std::fs;
use std::io::Write;
use std::fmt::Write as _;
use serde::{Deserialize, Serialize};

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
        /// Skip creating a git repository
        #[arg(long, default_value_t = false)]
        no_git: bool,
        /// Force registry for import map (auto|cdn|local)
        #[arg(long, value_parser = ["auto", "cdn", "local"], default_value = "auto")]
        registry: String,
        /// Version to pin for CDN imports (e.g., 0.1.0)
        #[arg(long)]
        registry_version: Option<String>,
        /// After init, start the dev server and open browser
        #[arg(long, default_value_t = false)]
        open: bool,
    },
    /// Create a new slide component
    New {
        /// Component name (e.g., TitleSlide)
        #[arg(long = "component")]
        component_name: String,
        /// Slide ID
        #[arg(long)]
        id: String,
        /// Schema file or registry ID
        #[arg(long)]
        from_schema: Option<String>,
        /// Target deck directory (defaults to current dir)
        #[arg(long, default_value = ".")]
        dir: String,
        /// Non-interactive: accept defaults for required props
        #[arg(long, default_value_t = false)]
        yes: bool,
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
        /// Deck directory
        #[arg(long, default_value = ".")]
        dir: String,
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
        Commands::Init { template, dir, no_git, registry, registry_version, open } => {
            let target_dir = dir.unwrap_or_else(|| ".".to_string());
            println!(
                "Initializing new Coolslides project with template '{}' in {}",
                template, target_dir
            );
            init_project(&target_dir, &template, &registry, registry_version.as_deref(), !no_git)?;

            if open {
                let host = "127.0.0.1".to_string();
                let port: u16 = 5173;
                let url = format!("http://{}:{}", host, port);
                println!("Starting dev server at {}", url);
                // Open browser best-effort
                tokio::spawn(async move {
                    use std::process::Command;
                    #[cfg(target_os = "macos")]
                    let _ = Command::new("open").arg(&url).spawn();
                    #[cfg(all(unix, not(target_os = "macos")))]
                    let _ = Command::new("xdg-open").arg(&url).spawn();
                    #[cfg(target_os = "windows")]
                    let _ = Command::new("cmd").args(["/C", "start", &url]).spawn();
                });
                // Start the server blocking in foreground
                match coolslides_server::start_server_with_dir(&host, port, Some(&target_dir), false).await {
                    Ok(()) => {}
                    Err(e) => {
                        eprintln!("Error starting server: {}", e);
                        std::process::exit(1);
                    }
                }
            }
        }
        Commands::New { component_name, id, from_schema, dir, yes } => {
            println!("Creating new slide: {} with ID: {}", component_name, id);
            new_slide(&dir, &component_name, &id, from_schema.as_deref(), yes).await?;
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
                    // Generate HTML using server helpers
                    let out_dir = Path::new(&dir);
                    let cwd = Path::new(".");
                    match coolslides_server::export_deck_html_from_dir(cwd, strict) {
                        Ok(mut html) => {
                            // Inject import map for offline usage and rewrite /packages to ./packages
                            let import_map = serde_json::json!({
                                "imports": {
                                    "@coolslides/runtime": "./packages/runtime/dist/index.js",
                                    "@coolslides/components": "./packages/components/dist/index.js",
                                    "@coolslides/component-sdk": "./packages/component-sdk/dist/index.js",
                                    "@coolslides/plugins-stdlib": "./packages/plugins-stdlib/dist/index.js"
                                }
                            });
                            let import_map_tag = format!(
                                "<script type=\"importmap\">{}</script>",
                                serde_json::to_string(&import_map).unwrap()
                            );
                            html = html.replace(
                                "<title>",
                                &format!("{}<title>", import_map_tag)
                            );
                            html = html.replace("/packages/", "./packages/");
                            html = html.replace("data-module=\"/packages/", "data-module=\"./packages/");

                            // Write index.html
                            std::fs::create_dir_all(out_dir).ok();
                            let index_path = out_dir.join("index.html");
                            if let Err(e) = std::fs::write(&index_path, html) {
                                eprintln!("Failed to write {}: {}", index_path.display(), e);
                                std::process::exit(1);
                            }

                            // Copy package dists for offline use
                            let to_copy = [
                                (Path::new("packages/runtime/dist"), out_dir.join("packages/runtime/dist")),
                                (Path::new("packages/components/dist"), out_dir.join("packages/components/dist")),
                                (Path::new("packages/component-sdk/dist"), out_dir.join("packages/component-sdk/dist")),
                                (Path::new("packages/plugins-stdlib/dist"), out_dir.join("packages/plugins-stdlib/dist")),
                            ];
                            for (src, dst) in to_copy {
                                if let Err(e) = copy_dir_all(src, &dst) {
                                    eprintln!("Warning: failed to copy {} -> {}: {}", src.display(), dst.display(), e);
                                }
                            }

                            println!("✓ HTML export written to {}", index_path.display());
                        }
                        Err(e) => {
                            eprintln!("Error generating HTML: {}", e);
                            std::process::exit(1);
                        }
                    }
                }
                ExportFormat::Pdf { file, profile, scale, timeout } => {
                    println!("Exporting to PDF: {} (profile: {}, scale: {})", file, profile, scale);
                    // Load deck and slides, generate slides HTML, then render PDF
                    let cwd = Path::new(".");
                    let (deck, slides, registry) = match coolslides_server::load_deck_bundle(cwd) {
                        Ok(v) => v,
                        Err(e) => {
                            eprintln!("Failed to load deck: {}", e);
                            std::process::exit(1);
                        }
                    };
                    let slides_html = match coolslides_server::render_slides_html(&deck, &slides, registry.as_ref(), &coolslides_server::SanitizationConfig::new(false)) {
                        Ok(v) => v,
                        Err(e) => {
                            eprintln!("Failed to generate slides HTML: {}", e);
                            std::process::exit(1);
                        }
                    };
                    let export_config = coolslides_server::export::ExportConfig {
                        profile: match profile.as_str() {
                            "archival" => coolslides_server::export::ExportProfile::Archival,
                            _ => coolslides_server::export::ExportProfile::Handout,
                        },
                        scale,
                        timeout,
                        output_path: file.clone(),
                    };
                    match coolslides_server::export::export_deck_to_pdf(&deck, &slides_html, export_config, Some(cwd)) .await {
                        Ok(bytes) => {
                            if let Err(e) = std::fs::write(&file, bytes) {
                                eprintln!("Failed to write PDF {}: {}", file, e);
                                std::process::exit(1);
                            }
                            println!("✓ PDF export written to {}", file);
                        }
                        Err(e) => {
                            eprintln!("Error exporting PDF: {}", e);
                            std::process::exit(1);
                        }
                    }
                }
            }
            // TODO: Implement export
        }
        Commands::Add { item, dir } => {
            match item {
                AddItem::Component { package } => {
                    println!("Adding component: {}", package);
                    add_package(&dir, &package, PackageKind::Component)?;
                }
                AddItem::Plugin { package } => {
                    println!("Adding plugin: {}", package);
                    add_package(&dir, &package, PackageKind::Plugin)?;
                }
            }
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
    let manifests_candidates = [
        Path::new("packages/components/manifests"),        // From project root
        Path::new("../../packages/components/manifests"),  // From examples/basic-deck
        Path::new("../packages/components/manifests"),     // From apps/cli
    ];
    let src_candidates = [
        Path::new("packages/components/src"),        // From project root
        Path::new("../../packages/components/src"),  // From examples/basic-deck
        Path::new("../packages/components/src"),     // From apps/cli
    ];
    
    let registry = manifests_candidates
        .iter()
        .find(|path| path.exists())
        .and_then(|dir| components::extract_manifests_from_manifests_dir(dir).ok())
        .or_else(|| {
            src_candidates
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
                })
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

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::fs;
    if !src.exists() { return Ok(()); }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else if ty.is_file() {
            let to = dst.join(entry.file_name());
            // Ensure parent exists
            if let Some(parent) = to.parent() { fs::create_dir_all(parent)?; }
            fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

// ---------------------
// CLI helpers (A2)
// ---------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ImportRegistryMode { Auto, Local, Cdn }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PackageKind { Component, Plugin }

#[derive(Serialize, Deserialize, Clone)]
struct ImportMap { imports: std::collections::BTreeMap<String, String> }

#[derive(Serialize, Deserialize)]
struct Lockfile {
    modelVersion: String,
    irVersion: String,
    timestamp: String,
    importMap: ImportMap,
    resolved: serde_json::Value,
}

fn init_project(target_dir: &str, template: &str, registry_flag: &str, registry_version: Option<&str>, do_git: bool) -> Result<()> {
    use std::path::PathBuf;

    let target = PathBuf::from(target_dir);
    if !target.exists() {
        fs::create_dir_all(&target)?;
    }

    // If a template folder exists, copy it; else create minimal structure
    let tmpl_dir = Path::new("templates").join(template);
    if tmpl_dir.exists() {
        copy_dir_all(&tmpl_dir, &target)?;
    }
    // Ensure basic structure exists
    let content = target.join("content");
    fs::create_dir_all(&content).ok();
    let themes_dir = target.join("themes/default");
    fs::create_dir_all(&themes_dir).ok();

    // Copy default theme/tokens if not present
    let repo_theme_dir = Path::new("themes/default");
    for name in ["theme.css", "tokens.css", "print.css"] {
        let src = repo_theme_dir.join(name);
        let dst = themes_dir.join(name);
        if src.exists() && !dst.exists() { let _ = fs::copy(&src, &dst); }
    }

    // slides.toml (only if missing)
    let slides_path = target.join("slides.toml");
    if !slides_path.exists() {
        let slides_toml = r#"# Coolslides Deck

modelVersion = "1.0"
title = "New Presentation"
theme = "themes/default/theme.css"
tokens = "themes/default/tokens.css"

plugins = []

[transitions]
default = "slide"

[[sequence]]
type = "ref"
ref = "intro"
"#;
        fs::write(&slides_path, slides_toml)?;
    }

    // Create an intro slide based on TitleSlide (only if missing)
    let intro_path = content.join("intro.slide.toml");
    if !intro_path.exists() {
        let intro_slide = r#"# Intro Slide

modelVersion = "1.0"
id = "intro"

[component]
name = "TitleSlide"
versionReq = "^1"

[props]
title = "Welcome to Coolslides"
# subtitle = "Optional subtitle here"
# alignment = "center"  # left|center|right
"#;
        fs::write(&intro_path, intro_slide)?;
    }

    // Compute import map
    let registry_mode = match registry_flag {
        "local" => ImportRegistryMode::Local,
        "cdn" => ImportRegistryMode::Cdn,
        _ => ImportRegistryMode::Auto,
    };
    let import_map = build_import_map(registry_mode, registry_version)?;
    let importmap_path = target.join("importmap.json");
    fs::write(&importmap_path, serde_json::to_vec_pretty(&import_map)?)?;

    // Create lockfile skeleton
    let lock = Lockfile {
        modelVersion: "1.0".to_string(),
        irVersion: "1.0".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        importMap: import_map.clone(),
        resolved: serde_json::json!({ "components": {}, "plugins": {} }),
    };
    fs::write(target.join(".coolslides.lock"), serde_json::to_vec_pretty(&lock)?)?;

    // Optional git init
    if do_git {
        if let Err(e) = try_git_init(&target) { eprintln!("Warning: git init failed: {}", e); }
    }

    // Minimal template selector placeholder (future svelte-ce/vanilla-ce assets)
    let _ = template; // currently identical skeleton

    println!("✓ Project initialized in {}", target.canonicalize().unwrap_or(target).display());
    Ok(())
}

fn try_git_init(dir: &Path) -> Result<()> {
    let status = std::process::Command::new("git")
        .arg("init").current_dir(dir).status();
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err(anyhow::anyhow!("git init returned non-zero")),
        Err(e) => Err(anyhow::anyhow!("{}", e)),
    }
}

fn build_import_map(mode: ImportRegistryMode, registry_version: Option<&str>) -> Result<ImportMap> {
    let has_local = Path::new("packages/runtime/dist/index.js").exists()
        && Path::new("packages/components/dist/index.js").exists()
        && Path::new("packages/component-sdk/dist/index.js").exists()
        && Path::new("packages/plugins-stdlib/dist/index.js").exists();

    let chosen = match mode {
        ImportRegistryMode::Local => true,
        ImportRegistryMode::Cdn => false,
        ImportRegistryMode::Auto => has_local,
    };

    let mut imports = std::collections::BTreeMap::new();
    if chosen {
        imports.insert("@coolslides/runtime".to_string(), "/packages/runtime/dist/index.js".to_string());
        imports.insert("@coolslides/components".to_string(), "/packages/components/dist/index.js".to_string());
        imports.insert("@coolslides/component-sdk".to_string(), "/packages/component-sdk/dist/index.js".to_string());
        imports.insert("@coolslides/plugins-stdlib".to_string(), "/packages/plugins-stdlib/dist/index.js".to_string());
    } else {
        // Attempt to read versions; fall back to 'latest'
        let default_v = registry_version.map(|s| s.to_string()).unwrap_or_else(|| "latest".into());
        let runtime_v = read_pkg_version("packages/runtime/package.json").unwrap_or(default_v.clone());
        let components_v = read_pkg_version("packages/components/package.json").unwrap_or(default_v.clone());
        let sdk_v = read_pkg_version("packages/component-sdk/package.json").unwrap_or(default_v.clone());
        let stdlib_v = read_pkg_version("packages/plugins-stdlib/package.json").unwrap_or(default_v.clone());
        imports.insert("@coolslides/runtime".to_string(), format!("https://cdn.jsdelivr.net/npm/@coolslides/runtime@{}/dist/index.js", runtime_v));
        imports.insert("@coolslides/components".to_string(), format!("https://cdn.jsdelivr.net/npm/@coolslides/components@{}/dist/index.js", components_v));
        imports.insert("@coolslides/component-sdk".to_string(), format!("https://cdn.jsdelivr.net/npm/@coolslides/component-sdk@{}/dist/index.js", sdk_v));
        imports.insert("@coolslides/plugins-stdlib".to_string(), format!("https://cdn.jsdelivr.net/npm/@coolslides/plugins-stdlib@{}/dist/index.js", stdlib_v));
    }
    Ok(ImportMap { imports })
}

fn read_pkg_version(path: &str) -> Option<String> {
    let s = fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&s).ok()?;
    v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string())
}

async fn new_slide(deck_dir: &str, component_name: &str, id: &str, from_schema: Option<&str>, yes: bool) -> Result<()> {
    let deck_path = Path::new(deck_dir);
    if !deck_path.exists() { return Err(anyhow::anyhow!("Directory not found: {}", deck_dir)); }
    let content_dir = deck_path.join("content");
    fs::create_dir_all(&content_dir)?;

    // Resolve component schema
    let schema = if let Some(schema_path) = from_schema {
        load_schema_from_path(Path::new(schema_path))?
    } else {
        load_schema_from_manifests(component_name)?
    };

    // Build TOML based on schema
    let mut toml_str = String::new();
    writeln!(toml_str, "# Slide: {} (component: {})\n", id, component_name)?;
    writeln!(toml_str, "modelVersion = \"1.0\"")?;
    writeln!(toml_str, "id = \"{}\"\n", id)?;
    writeln!(toml_str, "[component]")?;
    writeln!(toml_str, "name = \"{}\"", component_name)?;
    writeln!(toml_str, "versionReq = \"^1\"\n")?;
    writeln!(toml_str, "[props]")?;

    // Required first (prompt unless --yes)
    if let Some(required) = schema.required.as_ref() {
        for key in required {
            if let Some(prop) = schema.properties.get(key) {
                let val = if yes { None } else { prompt_for_prop_value(key, prop)? };
                let line = toml_prop_line_with_value(key, prop, val.as_deref());
                writeln!(toml_str, "{}", line)?;
            } else {
                writeln!(toml_str, "# {} = \"\"  # (required)", key)?;
            }
        }
    }

    // Optional as commented lines
    for (key, prop) in &schema.properties {
        if schema.required.as_ref().map(|r| r.contains(key)).unwrap_or(false) { continue; }
        let line = toml_prop_line(key, prop, true);
        writeln!(toml_str, "{}", line)?;
    }

    let file_path = content_dir.join(format!("{}.slide.toml", id));
    fs::write(&file_path, toml_str)?;
    println!("✓ Created {}", file_path.display());
    Ok(())
}

#[derive(Deserialize)]
struct JsonSchema {
    #[serde(default)]
    required: Option<Vec<String>>,
    #[serde(default)]
    properties: std::collections::BTreeMap<String, serde_json::Value>,
}

fn load_schema_from_path(path: &Path) -> Result<JsonSchema> {
    let s = fs::read_to_string(path)?;
    let v: serde_json::Value = serde_json::from_str(&s)?;
    let schema = v.get("schema").unwrap_or(&v).clone();
    Ok(serde_json::from_value(schema)?)
}

fn load_schema_from_manifests(component_name: &str) -> Result<JsonSchema> {
    // Try manifests dir first, then TS extraction via core (manifests fallback is likely enough here)
    let manifests_candidates = [
        Path::new("packages/components/manifests"),
        Path::new("../../packages/components/manifests"),
        Path::new("../packages/components/manifests"),
    ];
    for dir in manifests_candidates {
        if !dir.exists() { continue; }
        for entry in fs::read_dir(dir)? {
            let entry = entry?; let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") { continue; }
            let content = fs::read_to_string(&path)?;
            let v: serde_json::Value = serde_json::from_str(&content)?;
            let name = v.get("name").and_then(|x| x.as_str()).unwrap_or("");
            if name == component_name {
                let schema = v.get("schema").cloned().ok_or_else(|| anyhow::anyhow!("schema missing in manifest"))?;
                return Ok(serde_json::from_value(schema)?);
            }
        }
    }
    // Fallback: try to extract from TS source via core (not implemented here)
    Err(anyhow::anyhow!("Component manifest for '{}' not found", component_name))
}

fn toml_prop_line(key: &str, prop: &serde_json::Value, commented: bool) -> String {
    let prefix = if commented { "# " } else { "" };
    let default_comment = if let Some(def) = prop.get("default") { format!("  # default: {}", def) } else { String::new() };
    let ty = prop.get("type").and_then(|x| x.as_str()).unwrap_or("string");
    let value = match ty {
        "boolean" => "false".to_string(),
        "number" | "integer" => "0".to_string(),
        _ => "\"\"".to_string(),
    };
    format!("{}{} = {}{}", prefix, key, value, default_comment)
}

fn toml_prop_line_with_value(key: &str, prop: &serde_json::Value, value_opt: Option<&str>) -> String {
    let default_comment = if let Some(def) = prop.get("default") { format!("  # default: {}", def) } else { String::new() };
    let ty = prop.get("type").and_then(|x| x.as_str()).unwrap_or("string");
    let v = if let Some(v) = value_opt { v.to_string() } else { default_for_type(ty, prop) };
    format!("{} = {}{}", key, v, default_comment)
}

fn default_for_type(ty: &str, prop: &serde_json::Value) -> String {
    if let Some(def) = prop.get("default") {
        return format_json_value(def);
    }
    match ty {
        "boolean" => "false".to_string(),
        "number" | "integer" => "0".to_string(),
        _ => "\"\"".to_string(),
    }
}

fn format_json_value(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("\"{}\"", s.replace('"', "\\\"")),
        _ => v.to_string(),
    }
}

fn prompt_for_prop_value(key: &str, prop: &serde_json::Value) -> Result<Option<String>> {
    use std::io::{self, Read};
    let ty = prop.get("type").and_then(|x| x.as_str()).unwrap_or("string");
    let def_str = prop.get("default").map(|d| format_json_value(d));
    let enum_opts: Option<Vec<String>> = prop
        .get("enum")
        .and_then(|arr| arr.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()));
    print!("  - {} (type: {}{}{}): ",
        key,
        ty,
        if let Some(ref e) = enum_opts { format!(", one of: {}", e.join(", ")) } else { String::new() },
        if let Some(ref d) = def_str { format!(", default: {}", d) } else { String::new() }
    );
    let _ = io::stdout().flush();
    let mut line = String::new();
    io::stdin().read_line(&mut line)?;
    let input = line.trim();
    if input.is_empty() {
        // Accept default if present; else use type default
        return Ok(None);
    }
    // Validate enum
    if let Some(opts) = enum_opts {
        if !opts.iter().any(|o| o == input) {
            println!("    Invalid value. Using default.");
            return Ok(None);
        }
        return Ok(Some(format!("\"{}\"", input)));
    }
    // Parse based on type
    let formatted = match ty {
        "boolean" => {
            match input.to_lowercase().as_str() {
                "true" | "1" | "yes" | "y" => "true".to_string(),
                "false" | "0" | "no" | "n" => "false".to_string(),
                _ => { println!("    Invalid boolean. Using default."); return Ok(None); }
            }
        }
        "number" | "integer" => {
            if input.parse::<f64>().is_ok() { input.to_string() } else { println!("    Invalid number. Using default."); return Ok(None); }
        }
        _ => format!("\"{}\"", input.replace('"', "\\\"")),
    };
    Ok(Some(formatted))
}

fn add_package(deck_dir: &str, spec: &str, kind: PackageKind) -> Result<()> {
    let dir = Path::new(deck_dir);
    if !dir.exists() { return Err(anyhow::anyhow!("Directory not found: {}", deck_dir)); }

    // Update importmap.json (create if missing)
    let importmap_path = dir.join("importmap.json");
    let mut import_map: ImportMap = if importmap_path.exists() {
        serde_json::from_slice(&fs::read(&importmap_path)?)?
    } else {
        build_import_map(ImportRegistryMode::Auto, None)?
    };

    let resolved_url = resolve_pkg_url(spec);
    import_map.imports.insert(spec.to_string(), resolved_url.clone());
    fs::write(&importmap_path, serde_json::to_vec_pretty(&import_map)?)?;
    println!("✓ Updated {}", importmap_path.display());

    // Update lockfile
    let lock_path = dir.join(".coolslides.lock");
    let mut lock: Lockfile = if lock_path.exists() {
        serde_json::from_slice(&fs::read(&lock_path)?)?
    } else {
        Lockfile {
            modelVersion: "1.0".into(),
            irVersion: "1.0".into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            importMap: import_map.clone(),
            resolved: serde_json::json!({ "components": {}, "plugins": {} }),
        }
    };
    lock.importMap = import_map.clone();
    lock.timestamp = chrono::Utc::now().to_rfc3339();
    fs::write(&lock_path, serde_json::to_vec_pretty(&lock)?)?;
    println!("✓ Updated {}", lock_path.display());

    // If adding a plugin, attempt to append to slides.toml plugins array
    if matches!(kind, PackageKind::Plugin) {
        let manifest_path = dir.join("slides.toml");
        if manifest_path.exists() {
            let content = fs::read_to_string(&manifest_path)?;
            let mut deck: DeckManifest = toml::from_str(&content)?;
            if !deck.plugins.contains(&spec.to_string()) {
                deck.plugins.push(spec.to_string());
                let updated = toml::to_string_pretty(&deck)?;
                fs::write(&manifest_path, updated)?;
                println!("✓ Added plugin '{}' to slides.toml", spec);
            }
        }
    }

    Ok(())
}

fn resolve_pkg_url(spec: &str) -> String {
    // Simple heuristic: known first-party packages vs generic CDN
    if spec.starts_with("@coolslides/") {
        // Try local if available
        let map = build_import_map(ImportRegistryMode::Auto, None).ok();
        if let Some(map) = map { if let Some(url) = map.imports.get(spec) { return url.clone(); } }
        // Fallback to CDN 'latest'
        format!("https://cdn.jsdelivr.net/npm/{}/dist/index.js", spec)
    } else if spec.starts_with("http://") || spec.starts_with("https://") || spec.starts_with("/") || spec.starts_with("./") {
        spec.to_string()
    } else {
        format!("https://cdn.jsdelivr.net/npm/{}/dist/index.js", spec)
    }
}
