//! One location contract for installed binaries, settings, plugins and diagnostics.
//! The registry stores only the locator; it never stores user resources.
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub const LAYOUT_FILE: &str = "storage-layout.json";

pub fn validate_directory_path(path: &Path) -> io::Result<()> {
    if !path.is_absolute() || path.parent().is_none() {
        return Err(io::Error::other(
            "Storage root must be an absolute application directory",
        ));
    }
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(meta) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x400 != 0 {
                        return Err(io::Error::other("Redirected storage directory refused"));
                    }
                }
                if !meta.is_dir() || meta.file_type().is_symlink() {
                    return Err(io::Error::other(
                        "Storage ancestor is not a regular directory",
                    ));
                }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

pub fn validate_install_root(root: &Path) -> io::Result<PathBuf> {
    validate_directory_path(root)?;
    let marker = root.join(LAYOUT_FILE);
    let meta = fs::symlink_metadata(&marker)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("Redirected storage marker refused"));
        }
    }
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 4096 {
        return Err(io::Error::other("Invalid storage layout marker"));
    }
    let value: serde_json::Value = serde_json::from_slice(&fs::read(marker)?)?;
    if value["schema"] != 1 || value["product"] != "Code-Codex" {
        return Err(io::Error::other("Unsupported storage layout"));
    }
    Ok(root.to_path_buf())
}

#[cfg(windows)]
fn registered_root() -> io::Result<Option<PathBuf>> {
    let key = match winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Software\\CodeCodex")
    {
        Ok(key) => key,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    match key.get_value::<String, _>("InstallPath") {
        Ok(value) if !value.is_empty() && value.len() <= 4096 => Ok(Some(PathBuf::from(value))),
        Ok(_) => Err(io::Error::other("Invalid installation locator")),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn install_root() -> io::Result<Option<PathBuf>> {
    if let Some(root) = resolve_root(std::env::current_exe().ok().as_deref(), None)? {
        return Ok(Some(root));
    }
    #[cfg(windows)]
    {
        resolve_root(None, registered_root()?.as_deref())
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

fn resolve_root(exe: Option<&Path>, registered: Option<&Path>) -> io::Result<Option<PathBuf>> {
    // Executable-relative resolution survives a missing registry locator.
    if let Some(exe) = exe {
        for root in exe.ancestors().skip(1).take(3) {
            match fs::symlink_metadata(root.join(LAYOUT_FILE)) {
                Ok(_) => return validate_install_root(root).map(Some),
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
        }
    }
    if let Some(root) = registered {
        // Old MSI registrations do not have the new marker yet.
        match fs::symlink_metadata(root.join(LAYOUT_FILE)) {
            Ok(_) => return validate_install_root(root).map(Some),
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        if !root.exists() {
            return Err(io::Error::other(
                "Registered installation is unavailable; no fallback data directory was created",
            ));
        }
        validate_directory_path(root)?;
        // A missing marker must not silently fork an established central data store.
        if fs::symlink_metadata(root.join("data")).is_ok()
            && fs::symlink_metadata(root.join("logs")).is_ok()
        {
            return Err(io::Error::other(
                "Central storage directories exist but their product marker is missing; legacy fallback refused",
            ));
        }
    }
    Ok(None)
}

/// Bounded read-only location evidence; no paths, writes or permission claims.
pub fn diagnostic_status() -> serde_json::Value {
    use serde_json::json;
    match install_root() {
        Err(e) => {
            json!({"status":"failed","readOnly":true,"ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error(),"reason":e.to_string(),"fallbackDataCreated":false})
        }
        Ok(None) => {
            json!({"status":"legacy or development","centralized":false,"readOnly":true,"markerSchema":null,"writePermission":"not tested"})
        }
        Ok(Some(root)) => {
            let exe_relative = std::env::current_exe()
                .ok()
                .is_some_and(|exe| exe.ancestors().skip(1).take(3).any(|p| p == root));
            #[cfg(windows)]
            let locator = match registered_root() {
                Ok(Some(p)) => json!(if p == root {
                    "matches"
                } else {
                    "different installation"
                }),
                Ok(None) => json!("absent"),
                Err(e) => json!({"status":"unavailable","osErrorCode":e.raw_os_error()}),
            };
            #[cfg(not(windows))]
            let locator = json!("not applicable");
            let dirs: Vec<_> = ["data","plugins","logs/runtime","logs/diagnostics","logs/install","logs/update","temp","backups"].iter().map(|name| {
                let path = root.join(name);
                let status = match validate_directory_path(&path).and_then(|_|fs::symlink_metadata(&path)) {
                    Ok(m)=>json!({"status":"observed","directory":m.is_dir()}),
                    Err(e)=>json!({"status":if e.kind()==io::ErrorKind::NotFound{"missing"}else{"unavailable"},"ioKind":format!("{:?}",e.kind()),"osErrorCode":e.raw_os_error()}),
                };
                json!({"relativeDirectory":name,"observation":status})
            }).collect();
            json!({"status":"observed","centralized":true,"readOnly":true,"markerSchema":1,"resolutionSource":if exe_relative{"executable marker"}else{"registry marker"},"registryLocator":locator,"directories":dirs,"writePermission":"not tested","atomicReplacement":"not tested","protectedAppServerStage":"system temp exception"})
        }
    }
}

fn legacy_root() -> io::Result<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join("CodeCodex"))
            .ok_or_else(|| io::Error::other("Local application data unavailable"))
    }
    #[cfg(not(windows))]
    {
        directories::ProjectDirs::from("dev", "CodeCodex", "CodeCodex")
            .map(|d| d.data_local_dir().to_path_buf())
            .ok_or_else(|| io::Error::other("User data unavailable"))
    }
}

pub fn data_root() -> io::Result<PathBuf> {
    Ok(match install_root()? {
        Some(root) => root.join("data"),
        None => legacy_root()?,
    })
}
pub fn plugin_root() -> io::Result<PathBuf> {
    Ok(match install_root()? {
        Some(root) => root,
        None => legacy_root()?.join("plugin-cache"),
    })
}
pub fn log_root(family: &str) -> io::Result<PathBuf> {
    if !matches!(family, "runtime" | "diagnostics" | "install" | "update") {
        return Err(io::Error::other("Unknown log family"));
    }
    Ok(match install_root()? {
        Some(root) => root.join("logs").join(family),
        None => legacy_root()?.join(if family == "runtime" {
            "runtime-logs"
        } else {
            family
        }),
    })
}
pub fn temp_root() -> io::Result<PathBuf> {
    let path = match install_root()? {
        Some(root) => root.join("temp"),
        None => std::env::temp_dir().join("CodeCodex"),
    };
    validate_directory_path(&path)?;
    fs::create_dir_all(&path)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn layout_requires_product_schema_and_regular_marker() {
        let dir = tempfile::tempdir().expect("root");
        let root = dir.path().join("中文 application");
        fs::create_dir(&root).expect("directory");
        assert!(validate_install_root(&root).is_err());
        fs::write(
            root.join(LAYOUT_FILE),
            r#"{"schema":1,"product":"Code-Codex"}"#,
        )
        .expect("marker");
        assert_eq!(validate_install_root(&root).expect("valid"), root);
        fs::write(
            root.join(LAYOUT_FILE),
            r#"{"schema":2,"product":"Code-Codex"}"#,
        )
        .expect("marker");
        assert!(validate_install_root(&root).is_err());
    }
    #[test]
    fn rejects_relative_root_file_ancestor_and_unknown_log_family() {
        assert!(validate_directory_path(Path::new("relative")).is_err());
        let dir = tempfile::tempdir().expect("root");
        fs::write(dir.path().join("file"), b"x").expect("file");
        assert!(validate_directory_path(&dir.path().join("file/child")).is_err());
        assert!(log_root("../escape").is_err());
    }
    #[test]
    fn missing_central_marker_never_forks_data_and_executable_marker_wins() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("app");
        fs::create_dir_all(root.join("data")).unwrap();
        fs::create_dir(root.join("logs")).unwrap();
        assert!(
            resolve_root(None, Some(&root))
                .unwrap_err()
                .to_string()
                .contains("fallback refused")
        );
        fs::write(
            root.join(LAYOUT_FILE),
            r#"{"schema":1,"product":"Code-Codex"}"#,
        )
        .unwrap();
        let exe = root.join("versions/1.0.0/code-codex.exe");
        assert_eq!(
            resolve_root(Some(&exe), Some(&temp.path().join("missing"))).unwrap(),
            Some(root)
        );
    }
}
