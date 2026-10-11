//! Bounded installer/UI observations independent of the Codex renderer.
#![allow(dead_code)]
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    io::Read,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

const CAPTURE_BYTES: usize = 32 * 1024;
const EVENT_LIMIT: usize = 512;

#[derive(Clone)]
pub(crate) struct SetupJournal(Arc<Mutex<State>>);
struct State {
    started: Instant,
    run_id: String,
    events: VecDeque<Value>,
    dropped: usize,
    captures: Vec<Arc<Mutex<Captured>>>,
}
#[derive(Default)]
struct Captured {
    label: String,
    total: usize,
    tail: Vec<u8>,
    done: bool,
    error: Option<String>,
}

impl SetupJournal {
    pub(crate) fn new() -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        Self(Arc::new(Mutex::new(State {
            started: Instant::now(),
            run_id: format!("{now}-{}", std::process::id()),
            events: VecDeque::new(),
            dropped: 0,
            captures: Vec::new(),
        })))
    }
    pub(crate) fn event(&self, phase: &str, status: &str, detail: Value) {
        let raw = serde_json::to_string(&detail).unwrap_or_default();
        let detail = if raw.len() > 4096 {
            json!({"truncated":true,"prefix":raw.chars().take(1024).collect::<String>()})
        } else {
            detail
        };
        let mut s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let elapsed = s.started.elapsed().as_millis();
        if s.events.len() == EVENT_LIMIT {
            s.events.pop_front();
            s.dropped += 1;
        }
        s.events
            .push_back(json!({"elapsedMs":elapsed,"phase":phase,"status":status,"detail":detail}));
    }
    pub(crate) fn attach(&self, child: &mut Child, label: &str) {
        if let Some(out) = child.stdout.take() {
            self.drain(out, &format!("{label}.stdout"));
        }
        if let Some(err) = child.stderr.take() {
            self.drain(err, &format!("{label}.stderr"));
        }
    }
    fn drain(&self, mut reader: impl Read + Send + 'static, label: &str) {
        let capture = Arc::new(Mutex::new(Captured {
            label: label.into(),
            ..Default::default()
        }));
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .captures
            .push(capture.clone());
        let journal = self.clone();
        // Keep draining after the storage limit so a noisy helper cannot block.
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut line = Vec::new();
            let mut oversized = false;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        {
                            let mut c = capture.lock().unwrap_or_else(|e| e.into_inner());
                            c.total = c.total.saturating_add(n);
                            c.tail.extend_from_slice(&buf[..n]);
                            let remove = c.tail.len().saturating_sub(CAPTURE_BYTES);
                            c.tail.drain(..remove);
                        }
                        for &b in &buf[..n] {
                            if b == b'\n' {
                                if !oversized {
                                    let text = String::from_utf8_lossy(&line);
                                    for prefix in [
                                        "CC_SETUP_UI_EVENT:",
                                        "CC_SETUP_CHECK_STEP:",
                                        "CC_SUPPORT_STEP:",
                                    ] {
                                        if let Some(raw) = text.trim().strip_prefix(prefix)
                                            && let Ok(v) = serde_json::from_str::<Value>(raw)
                                        {
                                            journal.event("helper observation", "received", v);
                                        }
                                    }
                                }
                                line.clear();
                                oversized = false;
                            } else if line.len() < 8192 {
                                line.push(b);
                            } else {
                                oversized = true;
                            }
                        }
                    }
                    Err(e) => {
                        capture.lock().unwrap_or_else(|p| p.into_inner()).error =
                            Some(e.to_string());
                        break;
                    }
                }
            }
            capture.lock().unwrap_or_else(|e| e.into_inner()).done = true;
        });
    }
    pub(crate) fn settle(&self) {
        let until = Instant::now() + Duration::from_millis(500);
        while Instant::now() < until {
            if self
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .captures
                .iter()
                .all(|c| c.lock().unwrap_or_else(|e| e.into_inner()).done)
            {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    pub(crate) fn snapshot(&self) -> Value {
        let s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let captures: Vec<_> = s.captures.iter().map(|c| {
            let c=c.lock().unwrap_or_else(|e| e.into_inner());
            json!({"label":c.label,"totalBytes":c.total,"retainedBytes":c.tail.len(),"truncated":c.total>c.tail.len(),"complete":c.done,"readError":c.error,"tail":String::from_utf8_lossy(&c.tail)})
        }).collect();
        json!({"schema":1,"runId":s.run_id,"elapsedMs":s.started.elapsed().as_millis(),"droppedOlderEvents":s.dropped,"eventLimit":EVENT_LIMIT,"captureLimitBytes":CAPTURE_BYTES,"events":s.events,"captures":captures})
    }
    pub(crate) fn text(&self) -> String {
        {
            let snapshot = self.snapshot();
            let mut text = String::from("Process timeline:\n");
            if let Some(events) = snapshot["events"].as_array() {
                for event in events {
                    text.push_str(&format!(
                        "+{} ms | {} | {} | {}\n",
                        event["elapsedMs"],
                        event["phase"].as_str().unwrap_or("unknown"),
                        event["status"].as_str().unwrap_or("unknown"),
                        event["detail"]
                    ));
                }
            }
            text.push_str("\nBounded process outputs and structured observations:\n");
            text.push_str(&serde_json::to_string_pretty(&snapshot).unwrap_or_default());
            text
        }
    }
}

pub(crate) fn bounded_checks(
    mut command: Command,
    journal: &SetupJournal,
    limit: Duration,
) -> Value {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    journal.event(
        "automatic installation checks",
        "started",
        json!({"readOnly":true,"limitMs":limit.as_millis()}),
    );
    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            let v = json!({"status":"unavailable","phase":"spawn","reason":e.to_string(),"osCode":e.raw_os_error()});
            journal.event("automatic installation checks", "failed", v.clone());
            return v;
        }
    };
    journal.attach(&mut child, "automatic checks");
    let started = Instant::now();
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                break json!({"status":if status.success(){"completed"}else{"unavailable"},"exitCode":status.code(),"durationMs":started.elapsed().as_millis()});
            }
            Ok(None) if started.elapsed() < limit => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let kill = child.kill();
                if kill.is_ok() {
                    let _ = child.wait();
                }
                break json!({"status":"timeout","durationMs":started.elapsed().as_millis(),"killSucceeded":kill.is_ok(),"interpretation":"Partial observations; not proof of the original failure cause"});
            }
            Err(e) => {
                let _ = child.kill();
                break json!({"status":"unavailable","phase":"wait","reason":e.to_string()});
            }
        }
    };
    journal.settle();
    journal.event("automatic installation checks", "ended", result.clone());
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn automatic_checks_timeout_keeps_partial_observations() {
        let j = SetupJournal::new();
        let mut c = Command::new(super::super::trusted_system32_powershell().unwrap());
        c.args(["-NoProfile","-NonInteractive","-Command","[Console]::Out.WriteLine('CC_SETUP_CHECK_STEP:{\"phase\":\"partial fixture\",\"status\":\"started\"}'); [Console]::Error.WriteLine('fixture stderr'); Start-Sleep -Seconds 30"]);
        let began = Instant::now();
        let result = bounded_checks(c, &j, Duration::from_secs(2));
        assert_eq!(result["status"], "timeout");
        assert!(began.elapsed() < Duration::from_secs(5));
        let s = j.snapshot();
        assert!(
            s["events"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v["detail"]["phase"] == "partial fixture")
        );
        assert!(
            s["captures"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v["tail"].as_str().unwrap_or("").contains("fixture stderr"))
        );
    }
    #[test]
    fn events_are_bounded_and_recent_are_retained() {
        let j = SetupJournal::new();
        for i in 0..600 {
            j.event("test", "seen", json!({"i":i}));
        }
        let s = j.snapshot();
        assert_eq!(s["events"].as_array().unwrap().len(), 512);
        assert_eq!(s["droppedOlderEvents"], 88);
        assert_eq!(s["events"][511]["detail"]["i"], 599);
    }
    #[test]
    fn capture_drains_but_does_not_keep_unbounded_output() {
        let j = SetupJournal::new();
        j.drain(std::io::Cursor::new(vec![b'x'; 200_000]), "fixture");
        j.settle();
        let s = j.snapshot();
        assert_eq!(s["captures"][0]["totalBytes"], 200_000);
        assert_eq!(s["captures"][0]["retainedBytes"], 32768);
        assert_eq!(s["captures"][0]["truncated"], true);
    }
    #[test]
    fn structured_steps_survive_when_raw_output_is_truncated() {
        let j = SetupJournal::new();
        let mut b = b"CC_SETUP_UI_EVENT:{\"phase\":\"welcome\"}\n".to_vec();
        b.extend(vec![b'x'; 100_000]);
        j.drain(std::io::Cursor::new(b), "fixture");
        j.settle();
        assert_eq!(j.snapshot()["events"][0]["detail"]["phase"], "welcome");
    }
}
