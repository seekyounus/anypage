//! AnyPage native shell.
//!
//! The viewers are plain web code in `../src`. This part only hands files from the
//! operating system to the page:
//! - Windows: files double-clicked in Explorer arrive as command-line arguments
//!   (a second double-click is forwarded to the running window).
//! - Android: `MainActivity.kt` copies opened or shared files into
//!   `<cache>/incoming/<batch>/` and writes a `.done` marker when finished.
//!
//! The page asks for waiting files with `take_pending_files`, then reads each one
//! with `read_file`. `read_file` only reads files that arrived this way.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

#[cfg(desktop)]
use tauri::Emitter;

#[derive(Default)]
struct Files {
    /// Files waiting to be picked up by the page.
    pending: Vec<String>,
    /// Files the page is allowed to read.
    allowed: HashSet<PathBuf>,
}

type Shared = Mutex<Files>;

/// Keep only arguments that are existing files (skips the program path and flags).
#[cfg(desktop)]
fn file_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter(|a| Path::new(a).is_file())
        .collect()
}

fn remember(state: &Shared, paths: Vec<String>) {
    let mut files = state.lock().unwrap_or_else(|e| e.into_inner());
    for path in paths {
        if let Ok(full) = Path::new(&path).canonicalize() {
            files.allowed.insert(full);
            files.pending.push(path);
        }
    }
}

#[tauri::command]
fn take_pending_files(app: AppHandle, state: State<'_, Shared>) -> Vec<String> {
    #[cfg(target_os = "android")]
    collect_incoming(&app, state.inner());
    #[cfg(not(target_os = "android"))]
    let _ = &app;

    let mut files = state.lock().unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut files.pending)
}

#[tauri::command]
fn read_file(path: String, state: State<'_, Shared>) -> Result<tauri::ipc::Response, String> {
    let full = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    let allowed = state
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .allowed
        .contains(&full);
    if !allowed {
        return Err("AnyPage only reads files you opened with it.".into());
    }
    std::fs::read(&full)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

/// Android: move finished batches from `incoming` to `opened` and queue their files.
#[cfg(target_os = "android")]
fn collect_incoming(app: &AppHandle, state: &Shared) {
    let Ok(cache) = app.path().app_cache_dir() else {
        return;
    };
    let incoming = cache.join("incoming");
    let opened = cache.join("opened");
    let Ok(entries) = std::fs::read_dir(&incoming) else {
        return;
    };

    let mut batches: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir() && p.join(".done").exists())
        .collect();
    batches.sort();

    let mut found = Vec::new();
    for batch in batches {
        let Some(name) = batch.file_name() else { continue };
        let _ = std::fs::create_dir_all(&opened);
        let target = opened.join(name);
        if std::fs::rename(&batch, &target).is_err() {
            continue;
        }
        let Ok(files) = std::fs::read_dir(&target) else { continue };
        let mut files: Vec<PathBuf> = files
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                // skip the marker and any copy that didn't finish
                p.is_file() && name != ".done" && !name.ends_with(".part")
            })
            .collect();
        files.sort();
        found.extend(files.into_iter().map(|p| p.to_string_lossy().into_owned()));
    }
    remember(state, found);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Must be the first plugin: a second launch forwards its files and exits.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = file_args(argv);
            if !files.is_empty() {
                remember(app.state::<Shared>().inner(), files);
                let _ = app.emit("files-waiting", ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .manage(Shared::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let args = std::env::args_os().map(|a| a.to_string_lossy().into_owned());
                remember(app.state::<Shared>().inner(), file_args(args));
            }
            #[cfg(target_os = "android")]
            {
                // copies of files opened in an earlier session
                if let Ok(cache) = app.path().app_cache_dir() {
                    let _ = std::fs::remove_dir_all(cache.join("opened"));
                }
            }
            #[cfg(not(any(desktop, target_os = "android")))]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_pending_files, read_file])
        .run(tauri::generate_context!())
        .expect("error while running AnyPage");
}
