// Docs: docs/contributing/ios-bring-up.md
//
//  WebBridge.swift
//  Capsule iOS
//
//  Fallback bridge for development when running in a browser (without the native shell).
//  This allows testing JavaScript APIs in a standard web environment.
//
//  This file is a placeholder. Actual implementation will be done on a macOS machine.
//

import Foundation

/// WebBridge provides a mock implementation of the Capsule bridge for use in a standard web browser.
/// During development, when the app is served via `capsule dev` without the `--ios` flag,
/// this bridge allows the JavaScript to call native-like APIs that are implemented in JavaScript.
class WebBridge {
    
    // MARK: - Properties
    
    private var messageHandlers: [String: (Any?) -> Any?] = [:]
    
    // MARK: - Public Methods
    
    /// Registers a handler for a given method name.
    /// - Parameters:
    ///   - method: The method name that JavaScript will call
    ///   - handler: A closure that takes the arguments from JavaScript and returns a result (or nil)
    func registerHandler(for method: String, handler: @escaping (Any?) -> Any?) {
        messageHandlers[method] = handler
    }
    
    /// Sends a message to the JavaScript runtime (in this case, just logs it).
    /// - Parameters:
    ///   - method: The method name to call in JavaScript
    ///   - args: The arguments to pass to the JavaScript function
    func send(_ method: String, args: Any? = nil) {
        // In a real web environment, we might use `window.dispatchEvent` or similar to communicate back.
        // For now, we just log.
        print("WebBridge sending to JS: \(method) with args: \(args ?? "nil")")
    }
    
    /// Handles a message from JavaScript.
    /// - Parameter message: The message received from JavaScript (expected to be a dictionary with "method" and "args")
    func handle(_ message: [String: Any]) {
        guard let method = message["method"] as? String else {
            print("Invalid message received: missing method")
            return
        }
        let args = message["args"]
        
        if let handler = messageHandlers[method] {
            let result = handler(args)
            // TODO: Send the result back to JavaScript if needed
            print("Handled \(method) with result: \(result ?? "nil")")
        } else {
            print("No handler registered for method: \(method)")
        }
    }
}