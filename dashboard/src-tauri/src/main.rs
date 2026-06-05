#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(test, allow(dead_code))]

use std::{env, fs, path::Path};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::Value as JsonValue;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectedPetAsset {
    slug: String,
    display_name: String,
    sprite_data_url: String,
}

#[cfg(not(test))]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_selected_pet_asset])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
fn main() {}

#[tauri::command]
fn get_selected_pet_asset() -> Result<Option<SelectedPetAsset>, String> {
    let home = env::var("HOME")
        .map_err(|error| format!("HOME is unavailable: {error}"))?;
    let codex_dir = Path::new(&home).join(".codex");
    read_selected_pet_asset(&codex_dir).map_err(|error| error.to_string())
}

fn read_selected_pet_asset(
    codex_dir: &Path,
) -> Result<Option<SelectedPetAsset>, Box<dyn std::error::Error>> {
    let config = fs::read_to_string(codex_dir.join("config.toml"))?;
    let Some(slug) = selected_pet_slug_from_config(&config) else {
        return Ok(None);
    };

    let pet_dir = codex_dir.join("pets").join(&slug);
    let pet_json = fs::read_to_string(pet_dir.join("pet.json"))?;
    let display_name = display_name_from_pet_json(&pet_json).unwrap_or_else(|| slug.clone());
    let sprite_path = pet_dir.join(sprite_path_from_pet_json(&pet_json));
    let sprite_bytes = fs::read(&sprite_path)?;
    let mime_type = match sprite_path.extension().and_then(|extension| extension.to_str()) {
        Some("png") => "image/png",
        _ => "image/webp",
    };

    Ok(Some(SelectedPetAsset {
        slug,
        display_name,
        sprite_data_url: format!(
            "data:{mime_type};base64,{}",
            STANDARD.encode(sprite_bytes)
        ),
    }))
}

fn selected_pet_slug_from_config(contents: &str) -> Option<String> {
    let config: toml::Table = toml::from_str(contents).ok()?;
    let selected = config.get("selected-avatar-id")?.as_str()?;
    selected
        .strip_prefix("custom:")
        .filter(|slug| !slug.is_empty())
        .map(ToOwned::to_owned)
}

fn display_name_from_pet_json(contents: &str) -> Option<String> {
    let pet: JsonValue = serde_json::from_str(contents).ok()?;
    pet.get("displayName")
        .or_else(|| pet.get("name"))
        .or_else(|| pet.get("id"))
        .and_then(JsonValue::as_str)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
}

fn sprite_path_from_pet_json(contents: &str) -> String {
    serde_json::from_str::<JsonValue>(contents)
        .ok()
        .and_then(|pet| {
            pet.get("spritesheetPath")
                .and_then(JsonValue::as_str)
                .map(ToOwned::to_owned)
        })
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| "spritesheet.webp".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_custom_selected_pet_slug_from_codex_config() {
        assert_eq!(
            selected_pet_slug_from_config(r#"selected-avatar-id = "custom:capy-ragdoll""#),
            Some("capy-ragdoll".to_string())
        );
    }

    #[test]
    fn ignores_non_custom_selected_pet_slug_from_codex_config() {
        assert_eq!(
            selected_pet_slug_from_config(r#"selected-avatar-id = "builtin:default""#),
            None
        );
    }

    #[test]
    fn extracts_display_name_from_pet_json() {
        assert_eq!(
            display_name_from_pet_json(r#"{"id":"q-capybara","displayName":"Q版卡皮巴拉"}"#),
            Some("Q版卡皮巴拉".to_string())
        );
    }
}
