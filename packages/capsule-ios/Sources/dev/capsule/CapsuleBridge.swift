// Docs: docs/contributing/ios-bring-up.md
//
//  CapsuleBridge.swift
//  Capsule iOS
//
//  JSON-RPC 2.0 dispatcher for communication between JavaScript and native code.
//  Platform edge (WKWebView) — wrapped in #if canImport(WebKit) so the platform-neutral
//  core of the package compiles and tests on Linux too.
//
//  This file is a placeholder. Actual implementation lands with the iOS bring-up
//  (Phase 4); the seams it will consume (CodeSyncManager, Bridging) are already in
//  place and unit-tested.
//

#if canImport(WebKit)
import Foundation
import WebKit

/// CapsuleBridge handles communication between the JavaScript runtime and native iOS code.
/// It registers native handlers for JavaScript to call and forwards JavaScript calls to
/// the appropriate native implementations.
/// An `NSObject` because WebKit only accepts Objective-C objects as script message handlers.
final class CapsuleBridge: NSObject, Bridging {

    // MARK: - Properties

    private let webView: WKWebView
    private var messageHandlers: [String: (Any?) -> Any?] = [:]
    private let codeSyncManager: CodeSyncManager

    // MARK: - Initialization

    init(webView: WKWebView, codeSyncManager: CodeSyncManager) {
        self.webView = webView
        self.codeSyncManager = codeSyncManager
        super.init()
        setupMessageHandler()
    }

    // MARK: - Public Methods

    /// Registers a native handler for a given method name.
    func registerHandler(for method: String, handler: @escaping (Any?) -> Any?) {
        messageHandlers[method] = handler
    }

    /// Sends a message to the JavaScript runtime.
    func send(_ method: String, args: Any? = nil) {
        // TODO: Implement sending a message to JavaScript via WKWebView's evaluateJavaScript
        print("Sending to JS: \(method) with args: \(args ?? "nil")")
    }

    // MARK: - CodeSync Methods

    /// Checks for an available OTA update (bridged to codesync.checkForUpdate in Phase 4).
    func checkForUpdate(completion: @escaping (UpdateResult) -> Void) {
        Task {
            completion(await codeSyncManager.checkForUpdate())
        }
    }

    // MARK: - Private Methods

    private func setupMessageHandler() {
        // TODO: Parse incoming messages (dictionary with "method" and "args") and route
        // them to the appropriate registered handler (mirrors the Android registry).
        let userContentController = webView.configuration.userContentController
        userContentController.add(self, name: "capsule")
    }
}

// MARK: - WKScriptMessageHandler

extension CapsuleBridge: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
        // TODO: Parse the message and dispatch to the registered handler.
        print("Received from JS: \(message.body)")
    }
}
#endif
