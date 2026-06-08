import SwiftUI

@main
struct AgentMonitorBarApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            SettingsView(
                configStore: appDelegate.configStore,
                store: appDelegate.sessionStore,
                onConfigChanged: { [weak appDelegate] in
                    appDelegate?.restartPolling()
                }
            )
        }
    }
}
