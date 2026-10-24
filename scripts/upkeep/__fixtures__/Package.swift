// swift-tools-version:5.9
// A comment with a URL: https://example.com/not-a-dependency
import PackageDescription

let package = Package(
    name: "Capsule",
    platforms: [.iOS(.v13), .macOS(.v10_15)],
    dependencies: [
        // SHA-256 (Apple + Linux via swift-crypto).
        .package(url: "https://github.com/apple/swift-crypto.git", "2.0.0"..<"4.0.0"),
        .package(url: "https://github.com/weichsel/ZIPFoundation.git", .upToNextMajor(from: "0.9.19")),
        .package(url: "https://github.com/example/branchy", branch: "main"),
    ],
    targets: []
)
