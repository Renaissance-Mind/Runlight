import SwiftUI

struct SessionsListView: View {
    let groups: [ProjectGroup]
    @Binding var selectedSessionId: String?
    @State private var collapsedProjects: Set<String> = []

    var body: some View {
        if groups.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "tray")
                    .font(.title2)
                    .foregroundStyle(.tertiary)
                Text("No active sessions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Start an agent to see it here.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .padding()
        } else {
            List(selection: $selectedSessionId) {
                ForEach(groups) { group in
                    Section {
                        if !collapsedProjects.contains(group.projectName) {
                            ForEach(group.sessions) { session in
                                SessionRowView(session: session)
                                    .tag(session.sessionId)
                            }
                        }
                    } header: {
                        ProjectHeaderView(
                            projectName: group.projectName,
                            sessionCount: group.sessions.count,
                            isCollapsed: collapsedProjects.contains(group.projectName),
                            onToggle: {
                                if collapsedProjects.contains(group.projectName) {
                                    collapsedProjects.remove(group.projectName)
                                } else {
                                    collapsedProjects.insert(group.projectName)
                                }
                            }
                        )
                    }
                }
            }
            .listStyle(.sidebar)
        }
    }
}

private struct ProjectHeaderView: View {
    let projectName: String
    let sessionCount: Int
    let isCollapsed: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 4) {
                Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(width: 10)

                Text(projectName.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)

                Text("\(sessionCount)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Spacer()
            }
        }
        .buttonStyle(.plain)
    }
}
