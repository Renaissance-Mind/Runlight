import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var eventMonitor: Any?
    let sessionStore = SessionStore()
    let configStore = ServerConfigStore()

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "antenna.radiowaves.left.and.right", accessibilityDescription: "Runlight")
            button.imagePosition = .imageLeading
            button.action = #selector(handleStatusItemClick(_:))
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        popover = NSPopover()
        popover.contentSize = NSSize(width: 520, height: 560)
        popover.behavior = .transient
        popover.animates = true
        popover.contentViewController = NSHostingController(
            rootView: PopoverContentView(
                store: sessionStore,
                configStore: configStore,
                onOpenSettings: { [weak self] in self?.openSettings() },
                onQuit: { NSApp.terminate(nil) }
            )
        )

        sessionStore.startPolling(config: configStore.config)

        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            if let self, self.popover.isShown {
                self.popover.performClose(nil)
            }
        }

        updateStatusItemTitle()

        // Observe session changes for icon updates
        Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self.updateStatusItemTitle()
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        sessionStore.stopPolling()
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    @objc private func handleStatusItemClick(_ sender: Any?) {
        guard let event = NSApp.currentEvent else {
            togglePopover()
            return
        }

        if event.type == .rightMouseUp {
            showContextMenu()
        } else {
            togglePopover()
        }
    }

    private func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }

    private func showContextMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: "Refresh", action: #selector(refreshSessions), keyEquivalent: "r")
        menu.addItem(withTitle: "Settings...", action: #selector(openSettingsAction), keyEquivalent: ",")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit RunlightBar", action: #selector(quitApp), keyEquivalent: "q")

        for item in menu.items {
            item.target = self
        }

        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    @objc private func refreshSessions() {
        Task { @MainActor in
            await sessionStore.refresh(config: configStore.config)
        }
    }

    @objc private func openSettingsAction() {
        openSettings()
    }

    private func openSettings() {
        if popover.isShown {
            popover.performClose(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
        _ = NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    func updateStatusItemTitle() {
        guard let button = statusItem.button else { return }
        let counts = sessionStore.counts
        let running = counts.running
        let waiting = counts.waiting

        if running > 0 || waiting > 0 {
            let total = running + waiting
            button.title = " \(total)"
            button.image = NSImage(
                systemSymbolName: "antenna.radiowaves.left.and.right",
                accessibilityDescription: "Runlight - \(total) active"
            )
        } else if let error = sessionStore.error {
            button.title = ""
            button.image = NSImage(
                systemSymbolName: "exclamationmark.triangle",
                accessibilityDescription: "Runlight - Error: \(error)"
            )
        } else {
            button.title = ""
            button.image = NSImage(
                systemSymbolName: "antenna.radiowaves.left.and.right",
                accessibilityDescription: "Runlight"
            )
        }
    }

    func restartPolling() {
        sessionStore.startPolling(config: configStore.config)
    }
}
