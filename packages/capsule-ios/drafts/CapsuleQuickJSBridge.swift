// MARK: - Tier 4: QuickJSBridge Protocol + Implementation
// Android: QuickJSBridgeImpl (JNI + Kotlin)
// iOS: CapsuleQuickJSBridge (WKScriptMessageHandler + Swift bridge)

// MARK: - HttpRouteResponse (wire format, same on both platforms)

// Response returned by an HTTP route handler running in QuickJS.
// Mirrors the Android `data class HttpRouteResponse(status: Int, body: String, mimeType: String)`.
@objc(CAPSULE_HttpRouteResponse)
protocol HttpRouteResponseProtocol: AnyObject {
    var status: Int { get }
    var body: String { get }
    var mimeType: String { get }
}

struct HttpRouteResponse: Equatable {
    let status: Int
    let body: String
    let mimeType: String
}

// MARK: - QuickJSBridge Protocol

/// Loads a JS routing bundle and dispatches JSON-RPC and HTTP requests through it.
@objc(CAPSULE_QuickJSBridge)
protocol QuickJSBridgeProtocol: AnyObject {
    /**
     Evaluates the JS routing bundle into the engine.
     Must be called before `handleRequest` / `handleHttpRequest` will return non-null results.
     */
    func load() throws

    /**
     Tries to handle a JSON-RPC request by calling the JS global `dispatch()` function.

     Returns a JSON-RPC response string if a JS handler was registered for the method,
     or `null` to fall through to native bridge handlers (iOS: native C/Swift handlers).
     */
    func handleRequest(_ requestJson: String) -> String?

    /**
     Tries to handle an HTTP request by calling the JS global `handleHttpRequest()` function.

     Returns an `HttpRouteResponse` if a handler was registered for the given path + method,
     or `null` if no handler matches (caller should respond with 404).
     */
    func handleHttpRequest(
        method: String,
        path: String,
        body: String?,
        headers: [String: String]
    ) -> HttpRouteProtocol?
}

// MARK: - CapsuleQuickJSBridge — WKScriptMessageHandler + Swift Bridge

/// Bridges QuickJS evaluation + dispatch through a Swift wrapper.
/// In production this receives `WKScriptMessage` posts from a `WKWebView`.
/// In unit tests it uses a mock or in-memory QuickJSEngine.
@objc(CAPSULE_CapsuleQuickJSBridge)
final class CapsuleQuickJSBridge: QuickJSBridgeProtocol {

    /// The QuickJS engine instance (evaluated bundle + router).
    private var engine: QuickJSEngine?

    /// Whether the bundle has been loaded.
    private var isLoaded = false

    /// Called when a `WKWebView` sends a post message with JSON-RPC request.
    /// In production: `webView.evaluateJavaScript(`window.webkit.messageHandlers.bridgePost.postMessage(...)`)
    /// In tests: directly call `load()` then `handleRequest()`.
    var onMessage: ((String) -> String?)?

    func load() throws {
        let bundle = Bundle.main
        let jsPath = bundle.path(forResource: "server/bundle", ofType: "js")

        guard let jsPath else {
            throw NSError(domain: "CapsuleQuickJSBridge", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "server/bundle.js not found. Run `capsule build ios`."])
        }

        let jsContent = try String(contentsOfFile: jsPath, encoding: .utf8)

        // Evaluate via QuickJS C library (wrapped in Swift)
        // quickjs_eval(ctx, jsContent, jsContent.utf8Count)
        self.engine = QuickJSEngine(evaluate: jsContent)
        isLoaded = true
    }

    func handleRequest(_ requestJson: String) -> String? {
        guard isLoaded else { return nil }
        return onMessage?(requestJson)
    }

    func handleHttpRequest(method: String, path: String, body: String?, headers: [String: String]) -> HttpRouteResponse? {
        guard isLoaded else { return nil }

        // Build args array: [method, path, body|null, headersObject]
        // Headers are passed as an inline JSON object so JS receives them as Record<string,string>
        let bodyArg: String = body != nil ? "\"\(body!.replacingOccurrences(of: "\"", with: "\\\""))\"" : "null"
        let headersObj = "{\(headers.map { "\"\($0.key)\":\"\($0.value.replacingOccurrences(of: "\"", with: "\\\""))\"" }.joined(separator: ","))}"
        let argsJson = "\[\"\(method)\",\"\(path)\",\(bodyArg),\(headersObj)\]"

        return onMessage?(argsJson).map { response in
            // Parse the HttpRouteResponse from the JS response string.
            // Format example: {"status":200,"body":"...","mimeType":"application/json"}
            let statusMatch = response.range(of: "\"status\":(\\d+)", options: .regularExpression)
            let bodyMatch = response.range(of: "\"body\":\"([^\"]*)\"", options: .regularExpression)
            let mimeMatch = response.range(of: "\"mimeType\":\"([^\"]*)\"", options: .regularExpression)

            let status: Int = statusMatch != nil ? Int(response[statusMatch!.lowerBound..<statusMatch!.upperBound].components(separatedBy: ":")[1].replacingOccurrences(of: "}", with: "").trimmingCharacters(in: .whitespaces)) : 200
            let body: String = bodyMatch != nil ? response[bodyMatch!.lowerBound..<bodyMatch!.upperBound].components(separatedBy: "\"")[2] : ""
            let mimeType: String = mimeMatch != nil ? response[mimeMatch!.lowerBound..<mimeMatch!.upperBound].components(separatedBy: ":")[1].replacingOccurrences(of: "}", with: "").trimmingCharacters(in: .whitespaces) : "application/json"

            return HttpRouteResponse(status: status, body: body, mimeType: mimeType)
        }
    }
}

// MARK: - QuickJSEngine Swift Wrapper

/// Minimal Swift wrapper around the QuickJS C library.
// Replicates the Android `QuickJSEngine` interface (evaluate + call).
class QuickJSEngine {
    private var ctx: OpaquePointer?

    init(evaluate code: String) {
        // quickjs_eval(ctx, code, code.utf8Count)
        // For now: stub — real impl links against libquickjs.dylib
        self.ctx = nil
    }

    func call(_ function: String, _ args: [String]) throws -> String {
        // quickjs_call(ctx, function, args...)
        // Args format: [method, path, body|null, headersObject]
        // Same as Android: returns "null" for unregistered methods, JS object string otherwise
        return "null"
    }
}