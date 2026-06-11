import SwiftUI

struct HUDView: View {
    let counts: SessionCounts

    var body: some View {
        HStack(spacing: 0) {
            HUDCounter(label: "Running", count: counts.running, color: .green)
            HUDCounter(label: "Finished", count: counts.finished, color: .blue)
            HUDCounter(label: "Stale", count: counts.stale, color: .yellow)
            HUDCounter(label: "Failed", count: counts.failed, color: .red)
            HUDCounter(label: "Waiting", count: counts.waiting, color: .orange)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(.quaternary.opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct HUDCounter: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text("\(count)")
                .font(.title3.bold())
                .foregroundStyle(count > 0 ? color : .secondary)
                .monospacedDigit()

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
