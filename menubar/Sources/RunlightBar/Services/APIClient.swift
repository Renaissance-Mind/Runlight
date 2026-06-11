import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case httpError(Int, String)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case let .httpError(code, message):
            return "API \(code): \(message)"
        case let .networkError(error):
            return error.localizedDescription
        case let .decodingError(error):
            return "Decode error: \(error.localizedDescription)"
        }
    }
}

struct SessionsResponse: Codable, Sendable {
    let sessions: [Session]
}

struct EventsResponse: Codable, Sendable {
    let events: [SessionEvent]
}

struct HealthResponse: Codable, Sendable {
    let status: String
    let service: String?
}

struct CurrentUserResponse: Codable, Sendable {
    let userId: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
    }
}

struct APIClient: Sendable {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    private func request(config: ServerConfig, path: String) throws -> URLRequest {
        guard let url = config.apiUrl(path: path) else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let trimmed = config.token.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            request.setValue("Bearer \(trimmed)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = 10
        return request
    }

    private func fetch<T: Decodable & Sendable>(config: ServerConfig, path: String) async throws -> T {
        let request = try request(config: config, path: path)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(httpResponse.statusCode, body)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    func fetchHealth(config: ServerConfig) async throws -> HealthResponse {
        try await fetch(config: config, path: "/health")
    }

    func fetchLiveSessions(config: ServerConfig) async throws -> [Session] {
        let response: SessionsResponse = try await fetch(config: config, path: "/sessions/live")
        return response.sessions
    }

    func fetchSession(id: String, config: ServerConfig) async throws -> Session {
        try await fetch(config: config, path: "/sessions/\(id)")
    }

    func fetchSessionEvents(id: String, config: ServerConfig) async throws -> [SessionEvent] {
        let response: EventsResponse = try await fetch(config: config, path: "/sessions/\(id)/events")
        return response.events
    }

    func deleteSession(id: String, config: ServerConfig) async throws {
        var request = try request(config: config, path: "/sessions/\(id)")
        request.httpMethod = "DELETE"
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(httpResponse.statusCode, body)
        }
    }

    func fetchCurrentUser(config: ServerConfig) async throws -> CurrentUserResponse {
        try await fetch(config: config, path: "/users/current")
    }

    func probeConnection(config: ServerConfig) async -> ConnectionProbe {
        let tokenConfigured = !config.token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        do {
            _ = try await fetchHealth(config: config)
            let user = try await fetchCurrentUser(config: config)
            return ConnectionProbe(
                ok: true,
                serverUrl: config.normalizedServerUrl,
                userId: user.userId,
                tokenConfigured: tokenConfigured,
                checkedAt: Date(),
                error: nil
            )
        } catch {
            return ConnectionProbe(
                ok: false,
                serverUrl: config.normalizedServerUrl,
                userId: nil,
                tokenConfigured: tokenConfigured,
                checkedAt: Date(),
                error: error.localizedDescription
            )
        }
    }
}
