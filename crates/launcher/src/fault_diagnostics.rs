//! Shared failure vocabulary. Suggestions are not diagnoses or permission to retry writes.
use serde_json::{Value, json};

pub(crate) fn is_failure(outcome: &str) -> bool {
    matches!(
        outcome,
        "failed"
            | "error"
            | "failure"
            | "rejected"
            | "timeout"
            | "stalled"
            | "interrupted"
            | "cancelled"
            | "aborted"
    )
}

pub(crate) fn enrich(source: &str, action: &str, outcome: &str, mut details: Value) -> Value {
    if !is_failure(outcome) {
        return details;
    }
    if !details.is_object() {
        details = json!({"observation":details});
    }
    // Inspect explicit metadata, not error-message keywords. Unknown errors stay unknown.
    let code = ["errorCode", "code", "ioKind"]
        .into_iter()
        .find_map(|key| details.get(key).and_then(Value::as_str))
        .unwrap_or("UNCLASSIFIED");
    let domain = if code.starts_with("CC-START-PROCESS") || source.contains("process") {
        "process"
    } else if source.contains("cdp") {
        "renderer-connection"
    } else if action.contains("settings") || source.contains("settings") {
        "settings"
    } else if action.contains("git") || source.contains("git") {
        "git"
    } else if source.contains("plugin") || action.contains("plugin") {
        "plugin"
    } else if source.contains("update") || action.contains("update") {
        "update"
    } else if source.contains("workspace") || action.contains("list") || action.contains("watch") {
        "workspace"
    } else if source.contains("preview") || action.contains("preview") {
        "preview"
    } else if source == "codex-observed" {
        "official-window-observation"
    } else if source.contains("bridge") {
        "bridge"
    } else {
        "other"
    };
    let (class, guidance) = match code {
        "ACCESS_DENIED" | "PermissionDenied" => (
            "access",
            "Inspect the recorded OS error and access policy; do not disable security software automatically.",
        ),
        "NOT_FOUND" | "NotFound" | "PLUGIN_NOT_INSTALLED" => (
            "missing",
            "Recheck availability and installation state; a missing file alone does not prove quarantine.",
        ),
        "PLUGIN_INTEGRITY" | "INTEGRITY" => (
            "integrity",
            "Keep the previous verified package. Download the trusted asset again; never execute the rejected bytes.",
        ),
        "PLUGIN_NETWORK" => (
            "transport",
            "Compare request error chain, proxy observations and independent probes. Probe success cannot prove the original route worked.",
        ),
        "PLUGIN_HTTP" => (
            "http",
            "Check HTTP status, asset/tag and Retry-After. 404 does not establish a local network fault.",
        ),
        "CONFLICT" | "EntryConflict" => (
            "conflict",
            "Reload state and reconcile the result before retrying a write; never overwrite blindly.",
        ),
        "UNAUTHORIZED" | "INVALID_REQUEST" | "RATE_LIMITED" | "REQUEST_CAPACITY" => (
            "security-boundary",
            "Inspect authorization, replay, payload-size and rate/capacity evidence. Preserve the security gate; do not echo attacker-selected IDs or weaken authentication.",
        ),
        "OUTSIDE_WORKSPACE" | "INVALID_PATH" => (
            "security-boundary",
            "Keep the active workspace boundary; reselect an authorized relative target.",
        ),
        "INVALID_SETTINGS" => (
            "settings-validation",
            "Inspect the validation stage. Preserve the previous settings; do not reset or delete them automatically.",
        ),
        "RESOURCE_LOAD" => (
            "resource",
            "Compare resource type, media error code and package integrity; HTTP status may be unavailable at the DOM boundary.",
        ),
        "GPU_CONTEXT_LOST" => (
            "gpu-context",
            "Check existing effect recovery and context-restored events. Driver metadata is supporting evidence, not proof of a driver crash.",
        ),
        "PLUGIN_ENCODING" | "PLUGIN_EXECUTION" | "PLUGIN_IMPORT" => (
            "module",
            "Compare verified-installed, loaded and enabled/applied states, module API/version and first-frame evidence.",
        ),
        "TIMEOUT" => (
            "timeout",
            "Check the last completed phase and cancellation state. For writes, reconcile disk state before retrying.",
        ),
        "PLUGIN_BUSY" | "PLUGIN_CANCELLED" | "CANCELLED" => (
            "lifecycle",
            "Inspect the active operation and its terminal event; cancellation is not proof of a crash.",
        ),
        "CONTENT_TOO_LARGE" | "TOO_MANY_ENTRIES" | "PLUGIN_TOO_LARGE" => (
            "limit",
            "Compare observed and allowed size/count. The safety limit is intentional.",
        ),
        "RUNTIME_LOG" => (
            "diagnostic-storage",
            "The current run may remain available in memory. Check storageError and export before closing.",
        ),
        _ if code.starts_with("CC-START-PROCESS") => (
            "process-verification",
            "Compare embedded-query errors, native process/listener evidence and pre-cleanup state; do not bypass identity checks.",
        ),
        _ if code.starts_with("CC-START-CDP") => (
            "renderer-qualification",
            "Compare endpoint availability, target filter, layout predicates and bootstrap phases; a support code alone does not prove a layout change.",
        ),
        _ if details["timeout"] == true => (
            "timeout",
            "Check timeout budget and the last completed phase; transport phase and root cause may remain unknown.",
        ),
        _ if details["connect"] == true => (
            "transport",
            "Inspect all causes and independent network checks; connect alone does not distinguish DNS, proxy, TCP or TLS.",
        ),
        _ if matches!(outcome, "cancelled" | "interrupted") => (
            "lifecycle",
            "Inspect dispose, navigation, cancellation and cleanup events. The cause may be unavailable.",
        ),
        _ => (
            "unclassified",
            "Use the correlated timeline and Run Checks. Preserve the original failure; collect external evidence if internal cause is unavailable.",
        ),
    };
    let mut missing = vec![];
    if code == "UNCLASSIFIED" {
        missing.push("specific error code");
    }
    if !["errorChain", "reason", "message", "ioKind", "observation"]
        .iter()
        .any(|key| details.get(key).is_some())
    {
        missing.push("underlying error evidence");
    }
    details["fault"] = json!({"schema":1,"domain":domain,"classification":class,"observedCode":code,"rootCause":"not established by classification","suggestedAction":guidance,"missingEvidence":missing,"automaticRepair":"not inferred; consult explicit recovery events","writeRetry":"requires reconciliation","observationOnly":true});
    details
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_integrity_conflicts_and_unknowns_without_message_guessing() {
        assert_eq!(
            enrich(
                "plugin",
                "install",
                "failed",
                json!({"code":"PLUGIN_INTEGRITY"})
            )["fault"]["classification"],
            "integrity"
        );
        let conflict = enrich(
            "native-bridge",
            "write",
            "failed",
            json!({"code":"CONFLICT"}),
        );
        assert_eq!(conflict["fault"]["classification"], "conflict");
        assert_eq!(conflict["fault"]["writeRetry"], "requires reconciliation");
        let unknown = enrich(
            "test",
            "request",
            "failed",
            json!({"reason":"firewall virus DNS permissions"}),
        );
        assert_eq!(unknown["fault"]["classification"], "unclassified");
        assert_eq!(unknown["reason"], "firewall virus DNS permissions");
        assert!(
            unknown["fault"]["missingEvidence"]
                .as_array()
                .unwrap()
                .contains(&json!("specific error code"))
        );
        assert_eq!(
            enrich("test", "request", "passed", json!({"n":1})),
            json!({"n":1})
        );
    }
}
