// Docs: docs/contributing/ios-bring-up.md
//
//  CapsuleRuntime.swift
//  Capsule iOS
//
//  The CapsuleRuntime coordinates the initialization of the native shell,
//  including the embedded HTTP server, QuickJS engine, and native APIs.
//
//  Platform-neutral: depends only on the `Bridging` protocol (implemented by
//  CapsuleBridge — platform edge — and fakeable in tests), mirroring the Android
//  CapsuleRuntime which never names NanoHTTPD.
//

import Foundation

/// The bridge surface the runtime coordinates with. Platform edge implementations
/// (WKWebView-based CapsuleBridge) conform to this; tests use a fake.
public protocol Bridging: AnyObject {
    /// Sends a message to the JavaScript runtime.
    func send(_ method: String, args: Any?)
}

public final class CapsuleRuntime {
    private let bridge: Bridging

    public init(bridge: Bridging) {
        self.bridge = bridge
    }

    /// Starts the runtime. Called after the web view is ready.
    public func start() {
        // TODO: Start the embedded server (GCDWebServer-class, adr-004), prepare the
        // QuickJS context, register native API handlers with the bridge, and load the
        // initial JavaScript bundle.
        print("CapsuleRuntime starting...")
    }

    /// Stops the runtime and cleans up resources.
    public func stop() {
        // TODO: Stop the embedded server and clean up the QuickJS context.
        print("CapsuleRuntime stopping...")
    }
}
