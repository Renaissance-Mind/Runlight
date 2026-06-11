import SwiftUI

struct StatusConfig {
    let color: Color
    let label: String
    let pulse: Bool

    static func config(for status: String) -> StatusConfig {
        switch status {
        case "starting":
            return StatusConfig(color: .blue, label: "Starting", pulse: true)
        case "running":
            return StatusConfig(color: .green, label: "Running", pulse: true)
        case "finished":
            return StatusConfig(color: .blue, label: "Finished", pulse: false)
        case "tool_running":
            return StatusConfig(color: .green, label: "Tool", pulse: true)
        case "command_running":
            return StatusConfig(color: .green, label: "Cmd", pulse: true)
        case "waiting_user":
            return StatusConfig(color: .yellow, label: "Waiting", pulse: true)
        case "waiting_external":
            return StatusConfig(color: .orange, label: "External", pulse: true)
        case "stale":
            return StatusConfig(color: .yellow, label: "Stale", pulse: false)
        case "completed":
            return StatusConfig(color: .gray, label: "Done", pulse: false)
        case "failed":
            return StatusConfig(color: .red, label: "Failed", pulse: false)
        case "aborted":
            return StatusConfig(color: .red, label: "Aborted", pulse: false)
        default:
            return StatusConfig(color: .gray, label: status, pulse: false)
        }
    }
}

struct StatusBadgeView: View {
    let status: String

    var body: some View {
        let config = StatusConfig.config(for: status)

        HStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(config.color)
                    .frame(width: 7, height: 7)

                if config.pulse {
                    Circle()
                        .fill(config.color.opacity(0.4))
                        .frame(width: 7, height: 7)
                        .scaleEffect(1.8)
                        .opacity(0.6)
                        .animation(
                            .easeInOut(duration: 1.2).repeatForever(autoreverses: true),
                            value: config.pulse
                        )
                }
            }

            Text(config.label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
