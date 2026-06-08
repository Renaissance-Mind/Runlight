import Foundation

struct ServerConfig: Sendable {
    var serverUrl: String
    var token: String
    var refreshInterval: TimeInterval

    static let defaultServerUrl = "http://127.0.0.1:8766"
    static let defaultRefreshInterval: TimeInterval = 3

    static var `default`: ServerConfig {
        ServerConfig(
            serverUrl: defaultServerUrl,
            token: "",
            refreshInterval: defaultRefreshInterval
        )
    }

    var normalizedServerUrl: String {
        var url = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if url.isEmpty { url = Self.defaultServerUrl }
        while url.hasSuffix("/") { url.removeLast() }
        return url
    }

    func apiUrl(path: String) -> URL? {
        let cleanPath = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(normalizedServerUrl)/api\(cleanPath)")
    }
}

struct ConnectionProbe: Sendable {
    let ok: Bool
    let serverUrl: String
    let userId: String?
    let tokenConfigured: Bool
    let checkedAt: Date
    let error: String?

    var statusLabel: String {
        if !ok {
            return "Disconnected: \(error ?? "unknown error")"
        }
        let user = userId ?? "default"
        let auth = tokenConfigured ? "token" : "no token"
        return "\(user) / \(auth)"
    }
}

@MainActor
final class ServerConfigStore: ObservableObject {
    @Published var serverUrl: String {
        didSet { save() }
    }
    @Published var token: String {
        didSet { save() }
    }
    @Published var refreshInterval: TimeInterval {
        didSet { save() }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let serverUrl = "agentmonitor.serverUrl"
        static let token = "agentmonitor.token"
        static let refreshInterval = "agentmonitor.refreshInterval"
    }

    init() {
        serverUrl = defaults.string(forKey: Keys.serverUrl) ?? ServerConfig.defaultServerUrl
        token = defaults.string(forKey: Keys.token) ?? ""
        let stored = defaults.double(forKey: Keys.refreshInterval)
        refreshInterval = stored > 0 ? stored : ServerConfig.defaultRefreshInterval
    }

    var config: ServerConfig {
        ServerConfig(serverUrl: serverUrl, token: token, refreshInterval: refreshInterval)
    }

    private func save() {
        defaults.set(serverUrl, forKey: Keys.serverUrl)
        defaults.set(token, forKey: Keys.token)
        defaults.set(refreshInterval, forKey: Keys.refreshInterval)
    }
}
