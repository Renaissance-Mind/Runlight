import SwiftUI

struct SettingsView: View {
    @ObservedObject var configStore: ServerConfigStore
    @Bindable var store: SessionStore
    let onConfigChanged: () -> Void

    @State private var isTesting = false
    @State private var testResult: ConnectionProbe?

    var body: some View {
        TabView {
            connectionTab
                .tabItem {
                    Label("Connection", systemImage: "network")
                }

            aboutTab
                .tabItem {
                    Label("About", systemImage: "info.circle")
                }
        }
        .frame(width: 420, height: 300)
        .padding()
    }

    private var connectionTab: some View {
        Form {
            Section {
                TextField("Server URL", text: $configStore.serverUrl)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { applyConfig() }

                SecureField("Token", text: $configStore.token)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { applyConfig() }

                Picker("Refresh Interval", selection: $configStore.refreshInterval) {
                    Text("1 second").tag(1.0 as TimeInterval)
                    Text("3 seconds").tag(3.0 as TimeInterval)
                    Text("5 seconds").tag(5.0 as TimeInterval)
                    Text("10 seconds").tag(10.0 as TimeInterval)
                    Text("30 seconds").tag(30.0 as TimeInterval)
                }
                .onChange(of: configStore.refreshInterval) { _, _ in
                    applyConfig()
                }
            } header: {
                Text("Server Connection")
            }

            Section {
                HStack {
                    connectionStatusView

                    Spacer()

                    Button(action: testConnection) {
                        if isTesting {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Test Connection")
                        }
                    }
                    .disabled(isTesting)
                }
            } header: {
                Text("Status")
            }
        }
        .formStyle(.grouped)
    }

    private var aboutTab: some View {
        VStack(spacing: 12) {
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text("RunlightBar")
                .font(.title2.bold())

            Text("v0.1.0")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("macOS status bar client for Runlight.\nMonitor your agent sessions from the menu bar.")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var connectionStatusView: some View {
        if let probe = testResult ?? store.connectionProbe {
            HStack(spacing: 4) {
                Circle()
                    .fill(probe.ok ? Color.green : Color.red)
                    .frame(width: 6, height: 6)
                Text(probe.statusLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        } else {
            Text("Not tested")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    private func applyConfig() {
        onConfigChanged()
    }

    private func testConnection() {
        isTesting = true
        testResult = nil
        Task { @MainActor in
            await store.probeConnection(config: configStore.config)
            testResult = store.connectionProbe
            isTesting = false
        }
    }
}
