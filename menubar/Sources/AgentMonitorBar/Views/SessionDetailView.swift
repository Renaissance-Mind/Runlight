import SwiftUI

struct SessionDetailView: View {
    let session: Session
    let config: ServerConfig
    @State private var events: [SessionEvent] = []
    @State private var isLoading = true
    @State private var eventsError: String?
    @State private var deleteError: String?
    @State private var isDeleting = false
    let onBack: () -> Void

    private let client = APIClient()

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button(action: onBack) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.caption)
                        Text("Back")
                            .font(.caption)
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)

                Spacer()

                StatusBadgeView(status: session.currentStatus)

                Button {
                    Task {
                        await deleteCurrentSession()
                    }
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.red)
                .disabled(isDeleting)
                .help("Delete session")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            // Session info
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Title
                    Text(session.displayLabel)
                        .font(.headline)

                    if session.summaryInferred, session.summary != nil {
                        Text("(inferred)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    if let deleteError {
                        Label(deleteError, systemImage: "exclamationmark.triangle")
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .textSelection(.enabled)
                    }

                    // Metadata grid
                    LazyVGrid(columns: [
                        GridItem(.fixed(90), alignment: .topLeading),
                        GridItem(.flexible(), alignment: .topLeading),
                    ], alignment: .leading, spacing: 6) {
                        MetadataRow(label: "Agent", value: session.agentType)
                        MetadataRow(label: "Machine", value: session.machineHostname ?? "-")
                        MetadataRow(label: "Path", value: session.workspaceCwd ?? "-")
                        MetadataRow(label: "Branch", value: session.workspaceGitBranch ?? "-")
                        MetadataRow(label: "Project", value: session.projectName)
                        MetadataRow(label: "Events", value: "\(session.eventCount)")
                        MetadataRow(label: "Heartbeat", value: timeAgo(session.lastHeartbeatAt))
                        MetadataRow(label: "Duration", value: sessionDuration(startedAt: session.startedAt, lastEventAt: session.lastEventAt))
                        if let result = session.terminalResult {
                            MetadataRow(label: "Result", value: result)
                        }
                    }

                    Divider()

                    // Events
                    Text("Events")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    if isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                    } else if let eventsError {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Failed to load events", systemImage: "exclamationmark.triangle")
                                .font(.caption.bold())
                                .foregroundStyle(.red)
                            Text(eventsError)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                        }
                        .padding()
                    } else if events.isEmpty {
                        Text("No events")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .padding()
                    } else {
                        ForEach(events) { event in
                            EventRowView(event: event)
                        }
                    }
                }
                .padding(12)
            }
        }
        .task {
            do {
                events = try await client.fetchSessionEvents(id: session.sessionId, config: config)
                eventsError = nil
            } catch {
                eventsError = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func deleteCurrentSession() async {
        isDeleting = true
        deleteError = nil
        do {
            try await client.deleteSession(id: session.sessionId, config: config)
            onBack()
        } catch {
            deleteError = error.localizedDescription
        }
        isDeleting = false
    }
}

private struct MetadataRow: View {
    let label: String
    let value: String

    var body: some View {
        Text(label)
            .font(.caption2)
            .foregroundStyle(.secondary)
        Text(value)
            .font(.caption)
            .textSelection(.enabled)
    }
}

private struct EventRowView: View {
    let event: SessionEvent

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(severityColor)
                .frame(width: 5, height: 5)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(event.eventType)
                        .font(.caption.bold())

                    Spacer()

                    Text(timeAgo(event.eventTime))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .monospacedDigit()
                }

                if let summary = event.summary {
                    Text(summary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var severityColor: Color {
        switch event.severity {
        case "error": .red
        case "warning": .yellow
        case "info": .blue
        default: .gray
        }
    }
}
