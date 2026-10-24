// Docs: docs/contributing/ios-bring-up.md
//
//  CapsuleViewController.swift
//  Capsule iOS
//
//  Main view controller for the iOS native shell.
//  Equivalent to Android's CapsuleActivity (composition root).
//
//  Platform edge (UIKit) — guarded so the platform-neutral core compiles on Linux.
//
//  This file is a placeholder. Actual implementation lands with the iOS bring-up
//  (Phase 4); the wiring below already mirrors the Android composition root: config
//  -> CodeSyncManager (when opted in) -> bridge -> runtime.
//

#if canImport(UIKit)
import UIKit
import WebKit

class CapsuleViewController: UIViewController {

    // MARK: - Properties

    private var webView: WKWebView!
    private var bridge: CapsuleBridge?
    private var runtime: CapsuleRuntime?

    /// Override to opt the shell into OTA updates (mirrors Android's capsuleConfig).
    open var capsuleConfig: CapsuleShellConfig { CapsuleShellConfig() }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupBridge()
        loadInitialURL()
    }

    // MARK: - Setup

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        // TODO: Configure preferences, user content controller, etc.
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    private func setupBridge() {
        let codeSyncManager = capsuleConfig.codeSync.map { config in
            CodeSyncManager(
                config: config,
                httpClient: URLSessionCodeSyncHTTPClient(),
                preferences: UserDefaultsCodeSyncPreferences(),
                bundleStore: FileBundleStore(
                    root: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                        .appendingPathComponent("bundles", isDirectory: true)),
                bundlesRoot: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                    .appendingPathComponent("bundles", isDirectory: true)
            )
        }
        // TODO: Instantiate the bridge once the WKWebView wiring is real (Phase 4).
        bridge = nil
        // TODO: Initialize the CapsuleRuntime with the bridge + embedded server seams.
        runtime = nil
        _ = codeSyncManager  // wired in Phase 4 alongside the bridge
    }

    private func loadInitialURL() {
        // TODO: Load the initial URL from the bundle or from a deep link
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(url, allowingReadAccessTo: url)
        } else {
            // Fallback to a local HTML file or show an error
            let html = "<html><body><h1>Capsule iOS</h1><p>Loading...</p></body></html>"
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}
#endif
