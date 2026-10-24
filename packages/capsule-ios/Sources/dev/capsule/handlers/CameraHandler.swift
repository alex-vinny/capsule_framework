// Docs: docs/reference/core-api.md
//
//  CameraHandler.swift
//  Capsule iOS
//
//  Native handler for the camera API.
//  Platform edge (UIKit) — guarded so the platform-neutral core compiles on Linux.
//
//  This file is a placeholder. Actual implementation lands with the iOS bring-up
//  (Phase 4); the seam structure mirrors dev.capsule.handlers.camera.CameraHandlers.
//

#if canImport(UIKit)
import Foundation
import UIKit

/// CameraHandler provides native implementations for camera-related methods.
/// These methods will be registered with the CapsuleBridge.
class CameraHandler {

    // MARK: - Dependencies

    private let bridge: CapsuleBridge

    // MARK: - Initialization

    init(bridge: CapsuleBridge) {
        self.bridge = bridge
        registerHandlers()
    }

    // MARK: - Handler Registration

    private func registerHandlers() {
        // TODO: Register each camera method with the bridge
        bridge.registerHandler(for: "camera.takePhoto") { [weak self] args in
            self?.takePhoto(args) ?? nil
        }

        bridge.registerHandler(for: "camera.pickImage") { [weak self] args in
            self?.pickImage(args) ?? nil
        }
    }

    // MARK: - Native Implementations

    private func takePhoto(_ args: Any?) -> Any? {
        // TODO: Implement taking a photo using UIImagePickerController or AVFoundation
        // and return the result (e.g., base64 encoded image or file path) to JavaScript.
        print("takePhoto called with args: \(args ?? "nil")")
        return nil
    }

    private func pickImage(_ args: Any?) -> Any? {
        // TODO: Implement picking an image from the photo library
        print("pickImage called with args: \(args ?? "nil")")
        return nil
    }
}
#endif
