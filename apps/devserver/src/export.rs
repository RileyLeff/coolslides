/**
 * PDF Export functionality using headless Chromium
 */

use coolslides_core::DeckManifest;
use std::path::Path;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tempfile::TempDir;
use anyhow::{Result, anyhow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    pub profile: ExportProfile,
    pub scale: f32,
    pub timeout: u64,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportProfile {
    Handout,
    Archival,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub expand_fragments: bool,
    pub page_numbers: bool,
    pub footer_template: Option<String>,
    pub preserve_colors: bool,
    pub timeout_per_slide: u64,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            expand_fragments: true,
            page_numbers: true,
            footer_template: None,
            preserve_colors: false,
            timeout_per_slide: 5000,
        }
    }
}

pub struct PDFExporter {
    temp_dir: TempDir,
}

impl PDFExporter {
    pub fn new() -> Result<Self> {
        Ok(Self {
            temp_dir: TempDir::new()?,
        })
    }

    pub async fn export_pdf(
        &self,
        deck: &DeckManifest,
        slides_content: &str,
        config: &ExportConfig,
        base_dir: Option<&Path>,
    ) -> Result<Vec<u8>> {
        // Generate HTML for export
        let html_content = self.generate_export_html(deck, slides_content, &config.profile, base_dir)?;
        
        // Write HTML to temp file
        let html_path = self.temp_dir.path().join("presentation.html");
        std::fs::write(&html_path, html_content)?;

        // Determine browser path
        let browser_path = self.find_browser_path()?;
        
        // Generate PDF using headless Chromium
        let pdf_data = self.generate_pdf_with_browser(
            &browser_path,
            &html_path,
            config,
            &self.get_export_options(&config.profile)
        ).await?;

        Ok(pdf_data)
    }

    fn generate_export_html(
        &self,
        deck: &DeckManifest,
        slides_content: &str,
        profile: &ExportProfile,
        base_dir: Option<&Path>,
    ) -> Result<String> {
        let base_styles = include_str!("../../../themes/default/print.css");
        let archival_addon = "\n.print-archival { -webkit-print-color-adjust: exact !important; }";
        
        let print_styles = match profile {
            ExportProfile::Handout => base_styles.to_string(),
            ExportProfile::Archival => {
                format!("{}{}", base_styles, archival_addon)
            }
        };

        let theme_css = read_css(base_dir, &deck.theme).unwrap_or_default();
        let tokens_css = deck.tokens.as_ref().and_then(|p| read_css(base_dir, p)).unwrap_or_default();

        let base_href = base_dir.map(|p| format!("file://{}/", p.canonicalize().unwrap_or_else(|_| p.to_path_buf()).to_string_lossy()));

        let html = format!(r#"<!DOCTYPE html>
<html lang="en" data-deck-title="{}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{}</title>
    {}
    <!-- Inlined Theme CSS -->
    <style>
        {}
    </style>
    <!-- Inlined Tokens CSS -->
    <style>
        {}
    </style>
    
    <!-- Print CSS -->
    <style>
        {}
        
        /* Additional print optimizations */
        body {{
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }}
        
        .coolslides-slide {{
            page-break-after: always;
            page-break-inside: avoid;
            min-height: 8in;
            display: flex !important;
            flex-direction: column;
            justify-content: center;
        }}
        
        .coolslides-slide:last-child {{
            page-break-after: avoid;
        }}
    </style>
</head>
<body class="{}">
    <div class="coolslides-presentation">
        {}
    </div>

    <script>
        (function() {{
            function allImagesComplete() {{
                const imgs = Array.from(document.images);
                return imgs.every(img => img.complete && img.naturalWidth > 0);
            }}
            function whenFontsReady() {{
                if (document.fonts && document.fonts.ready) {{
                    return document.fonts.ready.catch(() => undefined);
                }}
                return Promise.resolve();
            }}
            function raf() {{
                return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            }}
            async function ready() {{
                // Expand fragments immediately
                const fragments = document.querySelectorAll('.fragment-hidden');
                fragments.forEach(fragment => {{
                    fragment.classList.remove('fragment-hidden');
                    fragment.classList.add('fragment-visible');
                }});
                await whenFontsReady();
                const start = Date.now();
                const maxWait = 30000; // safety in case images stall
                while ((!allImagesComplete()) && (Date.now() - start) < maxWait) {{
                    await raf();
                }}
                // Mark ready
                window.coolslidesExportReady = true;
                // Stop keepalive
                if (window.__coolslidesKeepAlive) clearInterval(window.__coolslidesKeepAlive);
            }}
            // Keep the event loop busy until ready, so headless Chrome with virtual time budget waits
            window.__coolslidesKeepAlive = setInterval(() => {{}}, 50);
            document.addEventListener('DOMContentLoaded', () => {{ ready(); }}, {{ once: true }});
        }})();
    </script>
</body>
</html>"#,
            deck.title,
            deck.title,
            base_href.as_ref().map(|u| format!("<base href=\"{}\">", u)).unwrap_or_default(),
            theme_css,
            tokens_css,
            print_styles,
            match profile {
                ExportProfile::Archival => "print-archival",
                _ => ""
            },
            slides_content
        );

        Ok(html)
    }

    fn find_browser_path(&self) -> Result<String> {
        // Try common browser paths
        let candidates = vec![
            "google-chrome",
            "chrome", 
            "chromium",
            "chromium-browser",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ];

        for candidate in candidates {
            if let Ok(output) = Command::new(candidate)
                .arg("--version")
                .output()
            {
                if output.status.success() {
                    return Ok(candidate.to_string());
                }
            }
        }

        Err(anyhow!("No compatible browser found. Please install Chrome or Chromium."))
    }

    async fn generate_pdf_with_browser(
        &self,
        browser_path: &str,
        html_path: &std::path::Path,
        config: &ExportConfig,
        options: &ExportOptions,
    ) -> Result<Vec<u8>> {
        let pdf_path = self.temp_dir.path().join("output.pdf");
        let html_url = format!("file://{}", html_path.to_string_lossy());

        let mut cmd = Command::new(browser_path);
        cmd.args([
            "--headless",
            "--no-sandbox", 
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-plugins",
            "--run-all-compositor-stages-before-draw",
            &format!("--virtual-time-budget={}", config.timeout),
            "--print-to-pdf",
        ]);

        // Add PDF path
        cmd.arg(format!("--print-to-pdf={}", pdf_path.to_string_lossy()));

        // Configure print options
        if options.page_numbers {
            cmd.arg("--print-to-pdf-no-header");
        }

        // Set scale
        if config.scale != 1.0 {
            cmd.arg(format!("--print-to-pdf-page-scale={}", config.scale));
        }

        // Add URL
        cmd.arg(&html_url);

        // Execute browser
        let output = cmd.output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("Browser PDF generation failed: {}", stderr));
        }

        // Read generated PDF
        let pdf_data = std::fs::read(&pdf_path)?;
        
        if pdf_data.is_empty() {
            return Err(anyhow!("Generated PDF is empty"));
        }

        Ok(pdf_data)
    }

    fn get_export_options(&self, profile: &ExportProfile) -> ExportOptions {
        match profile {
            ExportProfile::Handout => ExportOptions {
                expand_fragments: true,
                page_numbers: true,
                footer_template: Some("Page {pageNumber} of {totalPages}".to_string()),
                preserve_colors: false,
                timeout_per_slide: 3000,
            },
            ExportProfile::Archival => ExportOptions {
                expand_fragments: false,
                page_numbers: true,
                footer_template: None,
                preserve_colors: true,
                timeout_per_slide: 5000,
            },
        }
    }
}

pub async fn export_deck_to_pdf(
    deck: &DeckManifest,
    slides_html: &str,
    config: ExportConfig,
    base_dir: Option<&Path>,
) -> Result<Vec<u8>> {
    let exporter = PDFExporter::new()?;
    exporter.export_pdf(deck, slides_html, &config, base_dir).await
}

// Utility function to detect available browsers
pub fn check_browser_availability() -> Result<String> {
    let exporter = PDFExporter::new()?;
    exporter.find_browser_path()
}

fn read_css(base: Option<&Path>, path_str: &str) -> Option<String> {
    use std::fs;
    let p = Path::new(path_str);
    let candidates: Vec<std::path::PathBuf> = if p.is_absolute() {
        vec![p.to_path_buf()]
    } else {
        let mut v = Vec::new();
        if let Some(b) = base {
            v.push(b.join(path_str));
        }
        v.push(Path::new(path_str).to_path_buf());
        v
    };
    for cand in candidates {
        if let Ok(content) = fs::read_to_string(&cand) {
            return Some(content);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_config_creation() {
        let config = ExportConfig {
            profile: ExportProfile::Handout,
            scale: 1.0,
            timeout: 30000,
            output_path: "test.pdf".to_string(),
        };
        
        assert!(matches!(config.profile, ExportProfile::Handout));
        assert_eq!(config.scale, 1.0);
    }

    #[tokio::test]
    async fn test_pdf_exporter_creation() {
        let result = PDFExporter::new();
        assert!(result.is_ok());
    }
}
