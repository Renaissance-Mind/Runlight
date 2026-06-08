import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class SessionStore {
    private(set) var sessions: [Session] = []
    private(set) var isLoading = false
    private(set) var error: String?
    private(set) var connectionProbe: ConnectionProbe?

    private let client = APIClient()
    private var pollTask: Task<Void, Never>?

    var counts: SessionCounts {
        summarizeSessions(sessions)
    }

    var projectGroups: [ProjectGroup] {
        groupSessionsByProject(sessions)
    }

    func startPolling(config: ServerConfig) {
        stopPolling()
        pollTask = Task { [weak self] in
            guard let self else { return }
            self.isLoading = true
            await self.refresh(config: config)
            self.isLoading = false

            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(config.refreshInterval))
                if Task.isCancelled { break }
                await self.refresh(config: config)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func refresh(config: ServerConfig) async {
        do {
            let data = try await client.fetchLiveSessions(config: config)
            self.sessions = data
            self.error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func probeConnection(config: ServerConfig) async {
        connectionProbe = await client.probeConnection(config: config)
    }

    func fetchEvents(sessionId: String, config: ServerConfig) async -> [SessionEvent] {
        do {
            return try await client.fetchSessionEvents(id: sessionId, config: config)
        } catch {
            return []
        }
    }
}
