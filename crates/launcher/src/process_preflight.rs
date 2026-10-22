//! Read-only startup conflict detection, independent of PowerShell/WMI.
use crate::process_guard::ProcessGuardError;
use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::Path,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
        Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
            QueryFullProcessImageNameW, WaitForSingleObject,
        },
    },
};

#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum: u16,
    buffer: *const u16,
}
#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryInformationProcess(
        process: HANDLE,
        class: u32,
        buffer: *mut std::ffi::c_void,
        size: u32,
        returned: *mut u32,
    ) -> i32;
}

fn failure(phase: &str) -> ProcessGuardError {
    ProcessGuardError::Detailed(format!(
        "existing process query failed: backend=native; phase={phase}; OS error {:?}",
        io::Error::last_os_error().raw_os_error()
    ))
}

fn snapshot() -> Result<OwnedHandle, ProcessGuardError> {
    let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if raw == INVALID_HANDLE_VALUE {
        return Err(failure("ToolHelp snapshot"));
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(raw.cast()) })
}

// Pointer arithmetic is validated as integers before dereferencing kernel output.
fn command_text(bytes: &[usize]) -> Option<String> {
    let start = bytes.as_ptr() as usize;
    let end = start.checked_add(std::mem::size_of_val(bytes))?;
    if std::mem::size_of_val(bytes) < std::mem::size_of::<UnicodeString>() {
        return None;
    }
    let text = unsafe { &*bytes.as_ptr().cast::<UnicodeString>() };
    let ptr = text.buffer as usize;
    if text.length == 0
        || text.length % 2 != 0
        || text.length > text.maximum
        || ptr % 2 != 0
        || ptr < start + std::mem::size_of::<UnicodeString>()
        || ptr.checked_add(text.length as usize)? > end
    {
        return None;
    }
    String::from_utf16(unsafe { std::slice::from_raw_parts(text.buffer, text.length as usize / 2) })
        .ok()
}

fn command_line(handle: HANDLE) -> Option<String> {
    // ProcessCommandLineInformation (60), optional on supported Windows versions.
    // Fixed maximum allocation; unsupported/access-denied/oversized queries stay unknown.
    let mut buffer = vec![0usize; 65536 / std::mem::size_of::<usize>()];
    let mut returned = 0;
    let status = unsafe {
        NtQueryInformationProcess(handle, 60, buffer.as_mut_ptr().cast(), 65536, &mut returned)
    };
    if status < 0 || returned > 65536 || returned < std::mem::size_of::<UnicodeString>() as u32 {
        return None;
    }
    buffer.truncate((returned as usize).div_ceil(std::mem::size_of::<usize>()));
    command_text(&buffer)
}

pub(crate) fn is_running(image: &Path) -> Result<bool, ProcessGuardError> {
    let started = Instant::now();
    let result = inspect(image, started);
    crate::process_diagnostics::observe(
        "existing process",
        "native conflict inspection",
        if result.is_ok() { "passed" } else { "failed" },
        serde_json::json!({"backend":"ToolHelp/retained process handle","wmiRequested":false,"durationMs":started.elapsed().as_millis(),"running":result.as_ref().ok(),"error":result.as_ref().err().map(ToString::to_string),"identityChecksBypassed":false}),
    );
    result
}

fn inspect(image: &Path, started: Instant) -> Result<bool, ProcessGuardError> {
    let expected =
        dunce::canonicalize(image).map_err(|_| failure("official image canonicalization"))?;
    if !expected.is_file() {
        return Err(failure("official image is not a regular file"));
    }
    let name = expected
        .file_name()
        .ok_or_else(|| failure("official file name"))?
        .to_string_lossy();
    let snapshot = snapshot()?;
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut more = unsafe { Process32FirstW(snapshot.as_raw_handle().cast(), &mut entry) };
    let mut scanned = 0;
    while more != 0 {
        scanned += 1;
        if scanned > 65536 || started.elapsed() > Duration::from_millis(1500) {
            return Err(failure(
                "snapshot budget exhausted; absence not established",
            ));
        }
        let length = entry
            .szExeFile
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(entry.szExeFile.len());
        if String::from_utf16_lossy(&entry.szExeFile[..length]).eq_ignore_ascii_case(&name) {
            let raw = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    entry.th32ProcessID,
                )
            };
            if raw.is_null() {
                return Err(failure("matching process handle unavailable"));
            }
            let handle = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
            let state = unsafe { WaitForSingleObject(raw, 0) };
            if state == WAIT_TIMEOUT {
                let mut path = vec![0u16; 32768];
                let mut size = path.len() as u32;
                if unsafe { QueryFullProcessImageNameW(raw, 0, path.as_mut_ptr(), &mut size) } == 0
                {
                    let error = failure("matching image query");
                    if unsafe { WaitForSingleObject(raw, 0) } != WAIT_OBJECT_0 {
                        return Err(error);
                    }
                } else {
                    use std::os::windows::ffi::OsStringExt;
                    let actual = std::path::PathBuf::from(std::ffi::OsString::from_wide(
                        &path[..size as usize],
                    ));
                    let actual = dunce::canonicalize(actual)
                        .map_err(|_| failure("matching image canonicalization"))?;
                    if actual
                        .as_os_str()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(&expected.as_os_str().to_string_lossy())
                    {
                        let command = command_line(raw);
                        match unsafe { WaitForSingleObject(handle.as_raw_handle().cast(), 0) } {
                            WAIT_OBJECT_0 => {}
                            WAIT_TIMEOUT => {
                                if crate::process_guard::should_count_running_process(
                                    command.as_deref(),
                                ) {
                                    return Ok(true);
                                }
                            }
                            _ => return Err(failure("matching process wait after command query")),
                        }
                    }
                }
            } else if state != WAIT_OBJECT_0 {
                return Err(failure("matching process wait state unknown"));
            }
        }
        more = unsafe { Process32NextW(snapshot.as_raw_handle().cast(), &mut entry) };
    }
    if io::Error::last_os_error().raw_os_error() != Some(18) {
        return Err(failure("process enumeration incomplete"));
    }
    if started.elapsed() > Duration::from_millis(1500) {
        return Err(failure(
            "snapshot budget exhausted; absence not established",
        ));
    }
    Ok(false)
}

pub(crate) fn observe_origin(mode: &str) {
    let result = (|| {
        let start = Instant::now();
        let snapshot = snapshot()?;
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = unsafe { Process32FirstW(snapshot.as_raw_handle().cast(), &mut entry) };
        let mut scanned = 0;
        while more != 0 && scanned < 65536 && start.elapsed() < Duration::from_millis(100) {
            if entry.th32ProcessID == std::process::id() {
                return Ok(entry.th32ParentProcessID);
            }
            scanned += 1;
            more = unsafe { Process32NextW(snapshot.as_raw_handle().cast(), &mut entry) };
        }
        Err(failure("launch parent observation unavailable"))
    })();
    crate::process_diagnostics::observe(
        "startup",
        "invocation origin",
        "observed",
        serde_json::json!({"mode":mode,"launcherPid":std::process::id(),"parentPid":result.as_ref().ok(),"parentLookupError":result.err().map(|e|e.to_string()),"parentIdentityVerified":false,"triggerAction":"unknown; parent PID alone does not establish user action","rawCommandLineCollected":false}),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_preflight_current_and_other_image() {
        let exe = std::env::current_exe().expect("current image");
        assert!(is_running(&exe).expect("native current process"));
        let dir = tempfile::tempdir().expect("tempdir");
        let other = dir.path().join(exe.file_name().expect("file"));
        std::fs::write(&other, b"not executing").expect("fixture");
        assert!(!is_running(&other).expect("same basename different exact image"));
        assert!(is_running(&dir.path().join("missing.exe")).is_err());
    }
    #[test]
    fn native_preflight_command_query_same_handle() {
        let raw = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                0,
                std::process::id(),
            )
        };
        assert!(!raw.is_null());
        let h = unsafe { OwnedHandle::from_raw_handle(raw.cast()) };
        let command = command_line(h.as_raw_handle().cast()).expect("native command line");
        assert!(!command.is_empty());
    }
    #[test]
    fn native_preflight_rejects_invalid_kernel_text() {
        assert!(command_text(&[]).is_none());
        let mut bytes = vec![0usize; 16];
        assert!(command_text(&bytes).is_none());
        let base = bytes.as_ptr() as usize;
        let header = unsafe { &mut *bytes.as_mut_ptr().cast::<UnicodeString>() };
        header.length = 2;
        header.maximum = 2;
        header.buffer = (base + 4096) as *const u16;
        assert!(command_text(&bytes).is_none());
    }
    #[test]
    fn native_preflight_command_text_bounds_and_unknown_policy() {
        let mut bytes = vec![0usize; 16];
        let ptr = unsafe {
            bytes
                .as_mut_ptr()
                .cast::<u8>()
                .add(std::mem::size_of::<UnicodeString>())
                .cast::<u16>()
        };
        unsafe {
            *ptr = b'x' as u16;
        }
        let header = unsafe { &mut *bytes.as_mut_ptr().cast::<UnicodeString>() };
        header.length = 2;
        header.maximum = 2;
        header.buffer = ptr;
        assert_eq!(command_text(&bytes).as_deref(), Some("x"));
        unsafe {
            (*bytes.as_mut_ptr().cast::<UnicodeString>()).length = 1;
        }
        assert!(command_text(&bytes).is_none());
        unsafe {
            (*bytes.as_mut_ptr().cast::<UnicodeString>()).length = 4;
        }
        assert!(command_text(&bytes).is_none());
        assert!(crate::process_guard::should_count_running_process(None));
        assert!(crate::process_guard::should_count_running_process(Some("")));
        assert!(!crate::process_guard::should_count_running_process(Some(
            "Codex.exe --type=renderer"
        )));
    }
    #[test]
    fn native_preflight_failure_keeps_stable_support_code() {
        let error = failure("synthetic access denied");
        assert_eq!(
            crate::app_diagnostics::process_diagnostic(&error).0,
            "CC-START-PROCESS-011"
        );
    }
}
