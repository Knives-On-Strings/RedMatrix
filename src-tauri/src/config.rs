//! User configuration persistence.
//!
//! Reads and writes JSON config files to the user's local filesystem at
//! `~/knivesonstrings/redmatrix/`. Each device gets its own config file
//! keyed by serial number, plus a global config for app-wide settings.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// User configuration that persists across sessions.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct UserConfig {
    pub theme: String,
    pub labels: Labels,
    pub stereo_pairs: Vec<StereoPairConfig>,
    #[serde(default)]
    pub input_stereo_pairs: Vec<InputStereoPairConfig>,
    pub bus_names: HashMap<String, String>,
}

/// Custom channel labels, keyed by "{type}_{index}" e.g. "analogue_0".
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Labels {
    pub inputs: HashMap<String, String>,
    pub outputs: HashMap<String, String>,
    pub pcm: HashMap<String, String>,
    pub buses: HashMap<String, String>,
}

/// A stereo pair configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StereoPairConfig {
    pub left: u32,
    pub right: u32,
    pub name: String,
    pub linked: bool,
}

/// An input stereo pair configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InputStereoPairConfig {
    pub left: u32,
    pub right: u32,
    pub name: String,
    pub linked: bool,
    pub input_type: String, // "analogue", "spdif", "adat"
}

/// Get the config directory path: `~/knivesonstrings/redmatrix/`.
pub fn config_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("knivesonstrings").join("redmatrix")
}

/// Get the config file path for a specific device (by serial number).
pub fn device_config_path(serial: &str) -> PathBuf {
    config_dir().join(format!("device_{}.json", serial))
}

/// Get the global config file path (not device-specific).
pub fn global_config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Load config from a JSON file. Returns default if file doesn't exist or is invalid.
pub fn load_config(path: &Path) -> UserConfig {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => UserConfig::default(),
    }
}

/// Save config to a JSON file. Creates parent directories if needed.
pub fn save_config(path: &Path, config: &UserConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn load_config_nonexistent_returns_default() {
        let path = Path::new("/nonexistent/path/that/does/not/exist.json");
        let config = load_config(path);
        assert_eq!(config, UserConfig::default());
        assert_eq!(config.theme, "");
        assert!(config.labels.inputs.is_empty());
        assert!(config.stereo_pairs.is_empty());
        assert!(config.bus_names.is_empty());
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = env::temp_dir().join("redmatrix_test_config");
        let path = dir.join("test_device.json");

        // Clean up from any previous run
        let _ = fs::remove_file(&path);

        let mut config = UserConfig {
            theme: "dark".to_string(),
            labels: Labels {
                inputs: HashMap::from([("analogue_0".to_string(), "Kick".to_string())]),
                outputs: HashMap::from([("analogue_0".to_string(), "Main L".to_string())]),
                pcm: HashMap::new(),
                buses: HashMap::from([("0".to_string(), "Drums".to_string())]),
            },
            stereo_pairs: vec![StereoPairConfig {
                left: 0,
                right: 1,
                name: "Main Monitors".to_string(),
                linked: true,
            }],
            input_stereo_pairs: vec![],
            bus_names: HashMap::from([("0".to_string(), "Drums Bus".to_string())]),
        };

        save_config(&path, &config).expect("save should succeed");
        let loaded = load_config(&path);
        assert_eq!(loaded, config);

        // Modify and re-save
        config.theme = "highvis".to_string();
        config.labels.inputs.insert("analogue_1".to_string(), "Snare".to_string());
        save_config(&path, &config).expect("re-save should succeed");
        let reloaded = load_config(&path);
        assert_eq!(reloaded, config);

        // Clean up
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }

    #[test]
    fn config_dir_is_under_home() {
        let dir = config_dir();
        let dir_str = dir.to_string_lossy();
        assert!(
            dir_str.ends_with("knivesonstrings/redmatrix")
                || dir_str.ends_with("knivesonstrings\\redmatrix"),
            "config_dir should end with knivesonstrings/redmatrix, got: {}",
            dir_str
        );
    }

    #[test]
    fn device_config_path_includes_serial() {
        let path = device_config_path("ABC123");
        let filename = path.file_name().unwrap().to_string_lossy();
        assert_eq!(filename, "device_ABC123.json");
    }

    #[test]
    fn load_config_invalid_json_returns_default() {
        let dir = env::temp_dir().join("redmatrix_test_invalid");
        let path = dir.join("bad.json");
        let _ = fs::create_dir_all(&dir);
        fs::write(&path, "not valid json {{{").expect("write test file");

        let config = load_config(&path);
        assert_eq!(config, UserConfig::default());

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }
}
