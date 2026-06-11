import SwiftUI

struct SessionRowView: View {
    let session: Session

    var body: some View {
        HStack(spacing: 8) {
            StatusBadgeView(status: session.currentStatus)
                .frame(width: 70, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if session.sessionPin {
                        Image(systemName: "pin.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                    }
                    Text(session.displayLabel)
                        .font(.caption)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }

                HStack(spacing: 6) {
                    Text(session.agentType)
                        .font(.caption2)
                        .foregroundStyle(.blue)

                    if let hostname = session.machineHostname {
                        Text(hostname)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    if let branch = session.workspaceGitBranch {
                        Text(branch)
                            .font(.caption2)
                            .foregroundStyle(.purple)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(timeAgo(session.lastHeartbeatAt))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()

                Text(sessionDuration(startedAt: session.startedAt, lastEventAt: session.lastEventAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 3)
        .padding(.horizontal, 4)
        .contentShape(Rectangle())
    }
}
