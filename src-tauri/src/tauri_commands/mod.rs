/// Tauri IPC command handlers.
///
/// These are invoked from the React frontend via `@tauri-apps/api`.

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! RedMatrix is running.", name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_returns_expected_message() {
        assert_eq!(greet("World"), "Hello, World! RedMatrix is running.");
    }
}
