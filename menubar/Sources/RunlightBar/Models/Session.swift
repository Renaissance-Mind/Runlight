import Foundation

struct Session: Codable, Identifiable, Sendable {
    let sessionId: String
    let sessionName: String?
    let sessionPin: Bool
    let userId: String
    let agentType: String
    let adapterName: String
    let adapterVersion: String?
    let summary: String?
    let summaryInferred: Bool
    let machineHostname: String?
    let machineOs: String?
    let workspaceCwd: String?
    let workspaceGitBranch: String?
    let workspaceProjectName: String?
    let currentStatus: String
    let latestEventType: String?
    let startedAt: String?
    let lastEventAt: String?
    let lastHeartbeatAt: String?
    let eventCount: Int
    let terminalResult: String?

    var id: String { sessionId }

    var displayLabel: String {
        sessionName ?? summary ?? sessionId
    }

    var projectName: String {
        if let name = workspaceProjectName?.trimmingCharacters(in: .whitespaces),
           !name.isEmpty, name != ".", name != "/" {
            return name
        }
        guard let cwd = workspaceCwd?.trimmingCharacters(in: .whitespaces),
              !cwd.isEmpty else {
            return "Unknown project"
        }
        let parts = cwd.split(separator: "/").map(String.init)
        return parts.last ?? "Unknown project"
    }

    var shortPath: String {
        guard let cwd = workspaceCwd else { return "-" }
        let parts = cwd.split(separator: "/").map(String.init)
        return parts.count > 2 ? ".../\(parts.suffix(2).joined(separator: "/"))" : cwd
    }

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case sessionName = "session_name"
        case sessionPin = "session_pin"
        case userId = "user_id"
        case agentType = "agent_type"
        case adapterName = "adapter_name"
        case adapterVersion = "adapter_version"
        case summary
        case summaryInferred = "summary_inferred"
        case machineHostname = "machine_hostname"
        case machineOs = "machine_os"
        case workspaceCwd = "workspace_cwd"
        case workspaceGitBranch = "workspace_git_branch"
        case workspaceProjectName = "workspace_project_name"
        case currentStatus = "current_status"
        case latestEventType = "latest_event_type"
        case startedAt = "started_at"
        case lastEventAt = "last_event_at"
        case lastHeartbeatAt = "last_heartbeat_at"
        case eventCount = "event_count"
        case terminalResult = "terminal_result"
    }
}

struct SessionEvent: Codable, Identifiable, Sendable {
    let eventId: String
    let sessionId: String
    let sessionName: String?
    let sessionPin: Bool
    let eventType: String
    let eventTime: String?
    let receivedTime: String?
    let severity: String
    let summary: String?
    let machineHostname: String?
    let workspaceCwd: String?
    let payload: [String: AnyCodable]?

    var id: String { eventId }

    enum CodingKeys: String, CodingKey {
        case eventId = "event_id"
        case sessionId = "session_id"
        case sessionName = "session_name"
        case sessionPin = "session_pin"
        case eventType = "event_type"
        case eventTime = "event_time"
        case receivedTime = "received_time"
        case severity
        case summary
        case machineHostname = "machine_hostname"
        case workspaceCwd = "workspace_cwd"
        case payload
    }
}

struct AnyCodable: Codable, @unchecked Sendable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        default:
            try container.encodeNil()
        }
    }
}

enum SessionStatus: String, CaseIterable, Sendable {
    case starting
    case running
    case finished
    case toolRunning = "tool_running"
    case commandRunning = "command_running"
    case waitingUser = "waiting_user"
    case waitingExternal = "waiting_external"
    case stale
    case completed
    case failed
    case aborted
}

struct SessionCounts: Sendable {
    var running: Int = 0
    var finished: Int = 0
    var stale: Int = 0
    var failed: Int = 0
    var waiting: Int = 0

    var total: Int { running + finished + stale + failed + waiting }
}

struct ProjectGroup: Identifiable, Sendable {
    let projectName: String
    let sessions: [Session]
    var id: String { projectName }
}

func groupSessionsByProject(_ sessions: [Session]) -> [ProjectGroup] {
    var groups: [(String, [Session])] = []
    var indexMap: [String: Int] = [:]

    for session in sessions {
        let name = session.projectName
        if let idx = indexMap[name] {
            groups[idx].1.append(session)
        } else {
            indexMap[name] = groups.count
            groups.append((name, [session]))
        }
    }

    return groups.map { ProjectGroup(projectName: $0.0, sessions: $0.1) }
}

func summarizeSessions(_ sessions: [Session]) -> SessionCounts {
    var counts = SessionCounts()
    for session in sessions {
        switch session.currentStatus {
        case "running", "tool_running", "command_running", "starting":
            counts.running += 1
        case "finished":
            counts.finished += 1
        case "stale":
            counts.stale += 1
        case "failed", "aborted":
            counts.failed += 1
        case "waiting_user", "waiting_external":
            counts.waiting += 1
        default:
            break
        }
    }
    return counts
}

func timeAgo(_ isoString: String?) -> String {
    guard let isoString, !isoString.isEmpty else { return "-" }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: isoString) ?? ISO8601DateFormatter().date(from: isoString) else {
        return "-"
    }
    let seconds = Int(Date().timeIntervalSince(date))
    if seconds < 60 { return "\(seconds)s" }
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h" }
    return "\(hours / 24)d"
}

func sessionDuration(startedAt: String?, lastEventAt: String?) -> String {
    guard let startedAt else { return "-" }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let start = formatter.date(from: startedAt) ?? ISO8601DateFormatter().date(from: startedAt) else {
        return "-"
    }
    let end: Date
    if let lastEventAt,
       let endDate = formatter.date(from: lastEventAt) ?? ISO8601DateFormatter().date(from: lastEventAt) {
        end = endDate
    } else {
        end = Date()
    }
    let seconds = Int(end.timeIntervalSince(start))
    if seconds < 60 { return "\(seconds)s" }
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)m \(seconds % 60)s" }
    let hours = minutes / 60
    return "\(hours)h \(minutes % 60)m"
}
