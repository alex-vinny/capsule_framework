// swift-tools-version:5.9
//
// The iOS shell (packages/capsule-ios). This manifest sits at the repo root for two reasons:
// SwiftPM only resolves a package from a git URL when Package.swift is at the root, and a target
// may only use sources under the package root — CCivetweb shares packages/native/civetweb with
// the Android build.
import PackageDescription

let package = Package(
    name: "Capsule",
    platforms: [.iOS(.v13), .macOS(.v10_15)],
    products: [
        .library(name: "Capsule", targets: ["Capsule"])
    ],
    dependencies: [
        // SHA-256 for bundle integrity (Apple + Linux via swift-crypto).
        .package(url: "https://github.com/apple/swift-crypto.git", "2.0.0"..<"6.0.0"),
        // ZIP extraction for OTA bundles (Apple + Linux).
        .package(url: "https://github.com/weichsel/ZIPFoundation.git", .upToNextMajor(from: "0.9.19")),
    ],
    targets: [
        // Embedded loopback HTTP server — same sources and defines as Android's CMake build
        // (packages/native/civetweb/README.md).
        .target(
            name: "CCivetweb",
            path: "packages/native/civetweb",
            exclude: ["README.md", "VERSION", "LICENSE.md"],
            sources: ["src/civetweb.c"],
            publicHeadersPath: "include",
            cSettings: [
                .define("NO_SSL"),
                .define("NO_CGI"),
                .define("NO_FILES"),
                .define("NO_CACHING"),
                // SwiftPM defines DEBUG in debug builds, which turns on CivetWeb's per-request
                // stdout tracing; an empty DEBUG_TRACE keeps it off in every configuration.
                .define("DEBUG_TRACE(...)", to: ""),
            ],
            linkerSettings: [.linkedLibrary("pthread", .when(platforms: [.linux]))]
        ),
        .target(
            name: "Capsule",
            dependencies: [
                "CCivetweb",
                .product(name: "Crypto", package: "swift-crypto"),
                "ZIPFoundation",
            ],
            path: "packages/capsule-ios/Sources"
        ),
        .testTarget(
            name: "CapsuleTests",
            dependencies: ["Capsule"],
            path: "packages/capsule-ios/Tests"
        ),
    ]
)
