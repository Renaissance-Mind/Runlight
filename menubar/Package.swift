// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AgentMonitorBar",
    platforms: [
        .macOS(.v14),
    ],
    targets: [
        .executableTarget(
            name: "AgentMonitorBar",
            path: "Sources/AgentMonitorBar",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
    ]
)
