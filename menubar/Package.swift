// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "RunlightBar",
    platforms: [
        .macOS(.v14),
    ],
    targets: [
        .executableTarget(
            name: "RunlightBar",
            path: "Sources/RunlightBar",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
    ]
)
