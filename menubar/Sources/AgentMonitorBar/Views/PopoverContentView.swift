import SwiftUI

struct PopoverContentView: View {
    @Bindable var store: SessionStore
    @ObservedObject var configStore: ServerConfigStore
    let onOpenSettings: () -> Void
    let onQuit: () -> Void

    @State private var selectedSessionId: String?
    @State private var detailSession: Session?

    var body: some View {
        VStack(spacing: 0) {
            if let session = detailSession {
                SessionDetailView(
                    session: session,
                    config: configStore.config,
                    onBack: { detailSession = nil }
                )
            } else {
                mainView
            }
        }
        .frame(width: 520, height: 560)
        .background(.background)
        .onChange(of: selectedSessionId) { _, newValue in
            if let id = newValue {
                detailSession = store.sessions.first(where: { $0.sessionId == id })
                selectedSessionId = nil
            }
        }
    }

    private var mainView: some View {
        VStack(spacing: 0) {
            // Top bar
            HStack {
                Text("AgentMonitor")
                    .font(.headline)

                Spacer()

                connectionStatusPill

                Button(action: {
                    Task { @MainActor in
                        await store.refresh(config: configStore.config)
                    }
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Refresh")

                Button(action: onOpenSettings) {
                    Image(systemName: "gearshape")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Settings")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            // HUD
            HUDView(counts: store.counts)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

            // Latest event
            if let latest = store.sessions.first {
                HStack(spacing: 4) {
                    Text("Latest:")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Text(latest.latestEventType ?? "-")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("—")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Text(latest.displayLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.bottom, 4)
            }

            Divider()

            // Sessions list
            if store.isLoading && store.sessions.isEmpty {
                Spacer()
                ProgressView("Loading sessions...")
                    .font(.caption)
                Spacer()
            } else if let error = store.error, store.sessions.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.title2)
                        .foregroundStyle(.red)
                    Text("Server unreachable")
                        .font(.caption.bold())
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Spacer()
            } else {
                SessionsListView(
                    groups: store.projectGroups,
                    selectedSessionId: $selectedSessionId
                )
            }

            Divider()

            // Footer
            HStack {
                Text("\(store.sessions.count) session(s)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Spacer()

                if store.error != nil && !store.sessions.isEmpty {
                    HStack(spacing: 3) {
                        Circle()
                            .fill(.red)
                            .frame(width: 4, height: 4)
                        Text("Connection error")
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }
                }

                Text("AgentMonitor v0.1.0")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder
    private var connectionStatusPill: some View {
        if let error = store.error {
            HStack(spacing: 3) {
                Circle()
                    .fill(.red)
                    .frame(width: 5, height: 5)
                Text("Disconnected")
                    .font(.caption2)
                    .foregroundStyle(.red)
            }
            .help(error)
        } else {
            HStack(spacing: 3) {
                Circle()
                    .fill(.green)
                    .frame(width: 5, height: 5)
                Text("Connected")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
        }
    }
}
