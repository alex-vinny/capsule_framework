// Swift interface-first port for Capsule Framework iOS bring-up (Phase 4)
// Mirrors Android capsule-android interfaces — contract port, not redesign.
// Begin Tier 1: simple protocol transliterations (no platform types).

import Foundation

// MARK: - CapabilityRegistry
// Android: class CapabilityRegistry { private val versions = linkedMapOf<String, Int>()
//   fun register(capability: String, version: Int): CapabilityRegistry
//   fun snapshot(): Map<String, Int> }
///
/// iOS: Swift protocol + @objc for ObjC interop if needed.
@objc(CAPSULE_CapabilityRegistry)
protocol CapsuleRegistryProtocol: AnyObject {
    /// Declare (or overwrite) a capability's native version.
    func register(capability: String, version: Int)
    /// Immutable snapshot of capability → version.
    func snapshot() -> [String: Int]
}

// Concrete Swift implementation (no @objc runtime needs):
final class CapsuleRegistry: CapsuleRegistryProtocol {
    private var versions = [String: Int]()
    
    func register(capability: String, version: Int) {
        versions[capability] = version
    }
    
    func snapshot() -> [String: Int] {
        return versions
    }
}

// MARK: - Clock
// Android: interface Clock { fun now(): Long }
//   object SystemClock : Clock { override fun now(): Long = System.currentTimeMillis() }
///
/// iOS: Simple closure-based abstraction for testability.
typealias ClockProvider = () -> Date

let systemClock: ClockProvider = {
    Date()
}

// MARK: - NetworkStatus (serializable data class)
// Android: @Serializable data class NetworkStatus(val connected: Boolean, val connectionType: ConnectionType)
//   @Serializable enum class ConnectionType { WIFI, CELLULAR, ETHERNET, NONE, UNKNOWN }
///
/// iOS: Codable struct mirroring the wire shape.
@Codable
struct NetworkStatus: Equatable {
    let connected: Bool
    let connectionType: ConnectionType
}

enum ConnectionType: String, Codable, Equatable {
    case wifi = "wifi"
    case cellular = "cellular"
    case ethernet = "ethernet"
    case none = "none"
    case unknown = "unknown"
}

// MARK: - BridgeError (mirrored from Android protocol)
/// Android: BridgeError enum with FileNotFound, PathNotAllowed, FileIoError
/// iOS: Equivalent error types for Swift throws.
enum BridgeError: Error {
    case fileNotFound(path: String)
    case pathNotAllowed(path: String)
    case fileIoError(String)
    
    var localizedDescription: String {
        switch self {
        case .fileNotFound(let path): "File not found: \(path)"
        case .pathNotAllowed(let path): "Path not allowed: \(path)"
        case .fileIoError(let msg): "I/O error: \(msg)"
        }
    }
}

// MARK: - CapturedMedia (camera data class)
// Android: data class CapturedMedia(val dataUrl: String, val format: String, val width: Int, val height: Int, val size: Long)
// iOS: Same shape, Codable for wire transmission.
@Codable
struct CapturedMedia: Equatable {
    let dataUrl: String
    let format: String      // "jpeg" | "png" | "webp"
    let width: Int
    let height: Int
    let size: Int           // byte count (Int replaces long on iOS)
}

// MARK: - Capture/Pick options
@Codable
struct CaptureOptions: Equatable {
    let quality: Double = 0.9
    let facing: String = "FRONT"  // CameraFacing FRONT/BACK → String Codable
    let maxWidth: Int?
    let maxHeight: Int?
    let result: String = "WEB_PATH"  // ResultType enum → String
    let saveToGallery: Bool = false
}

@Codable
struct PickOptions: Equatable {
    let quality: Double = 0.9
    let maxWidth: Int?
    let maxHeight: Int?
    let result: String = "WEB_PATH"
}

// MARK: - AppLifecycleController (Tier 2)
// Android: class AppLifecycleController(private val emitter: BridgeEventEmitter)
//   — var isActive, setLaunchUrl(), consumeLaunchUrl(), onForeground(), onBackground(), onNewUrl()
//   — companion: CAPABILITY = "app", GET_STATE, GET_LAUNCH_URL, STATE_CHANGE, URL_OPEN
/// iOS: Same contract driven from scene delegate / ProcessLifecycleObserver.
@objc(CAPSULE_AppLifecycleController)
protocol AppLifecycleControllerProtocol: AnyObject {
    /// Current foreground state. Defaults to active — the app is foregrounded at construction.
    var isActive: Bool { get set }
    /// Seed the deep link the app was cold-launched with (consumed once via consumeLaunchUrl).
    func setLaunchUrl(_ url: String?)
    /// Returns the cold-launch deep link and clears it, so a second read yields null.
    func consumeLaunchUrl() -> String?
    /// App entered the foreground. Emits app.stateChange if it changed.
    func onForeground()
    /// App left the foreground. Emits app.stateChange if it changed.
    func onBackground()
    /// A deep link arrived while the app was running (warm). Emits app.urlOpen.
    func onNewUrl(_ url: String)
}

// Concrete Swift implementation (no @objc runtime needs unless bridging to ObjC):
final class CapsuleAppLifecycle: AppLifecycleControllerProtocol {
    var isActive: Bool = true
    private var launchUrl: String?
    
    func setLaunchUrl(_ url: String?) {
        launchUrl = url
    }
    
    func consumeLaunchUrl() -> String? {
        let previous = launchUrl
        launchUrl = nil
        return previous
    }
    
    func onForeground() {
        if !isActive { isActive = true }
    }
    
    func onBackground() {
        if isActive { isActive = false }
    }
    
    func onNewUrl(_ url: String) {
        // Emit via bridge — in production this would call sendNotification
        // BridgeEventEmitter.emit("app.urlOpen", ["url": url])
    }
}

// MARK: - BridgeEventEmitter (Tier 2)
// Android: fun interface BridgeEventEmitter { fun emit(method: String, params: JsonElement) }
//   — used by every capability whose value source is a feed (not request/response)
// iOS: Same contract driven from scene delegate / bridge sending.
@objc(CAPSULE_BridgeEventEmitter)
protocol BridgeEventEmitterProtocol: AnyObject {
    func emit(method: String, params: String)  // JSON string for simplicity
}

final class CapsuleBridgeEventEmitter: BridgeEventEmitterProtocol {
    func emit(method: String, params: String) {
        // In a real iOS implementation, this would send a WKScriptMessagePostMessage
        // or notify the JS runtime through the bridge
        print("Bridge emit: \(method) → \(params)")
    }
}

// MARK: - NetworkStatusController (Tier 2)
// Android: class NetworkStatusController(private val emitter: BridgeEventEmitter)
//   — de-dup + emit network.statusChange on every connectivity transition
/// iOS: Same logic driven from NWPathMonitor delegate.
final class CapsuleNetworkStatusController {
    private var emitter: BridgeEventEmitterProtocol?
    private var isInitialized = false
    
    func bindEmitter(_ emitter: BridgeEventEmitterProtocol) {
        self.emitter = emitter
        self.isInitialized = true
    }
    
    /// Call when connectivity changes (iOS: from NWPathMonitor)
    func setConnected(_ connected: Bool, _ connectionType: CapsuleSwiftNetworkStatus.ConnectionType) {
        guard let emitter = emitter, isInitialized else { return }
        let params = """
        {"connected":\(connected),"connectionType":"\(connectionType.rawValue)"}
        """
        emitter.emit(method: "network.statusChange", params: params)
    }
}

enum CapsuleSwiftNetworkStatus: String {
    case connected = "connected"
    case wifi = "wifi"
    case cellular = "cellular"
    case ethernet = "ethernet"
    case none = "none"
    case unknown = "unknown"
}

// MARK: - CrashLoopGuard (Tier 2)
// Android: class CrashLoopGuard(private val log: CrashLog, private val clock: Clock,
//   val threshold: Int = 3, val windowMs: Long = 60_000L)
//   — recordLaunchAttempt(), isCrashLooping(), clear()
//   — Pure logic — time comes from injected clock, persistence from injected log
/// iOS: Same pure logic, NSUserDefaults for persistence, Date for clock.
final class CrashLoopGuard {
    private let log: CrashLog
    private let clock: () -> Date
    let threshold: Int
    let windowMs: TimeInterval
    private var launchTimestamps: [Date] = []
    
    init(log: CrashLog, clock: @escaping () -> Date = { Date() }, threshold: Int = 3, windowMs: TimeInterval = 60) {
        self.log = log
        self.clock = clock
        self.threshold = threshold
        self.windowMs = windowMs
    }
    
    func recordLaunchAttempt() {
        launchTimestamps.append(clock())
        // Clean old timestamps outside the window
        let cutoff = clock().timeIntervalSince1970 * 1000 - windowMs * 1000
        launchTimestamps = launchTimestamps.filter { 
            $0.timeIntervalSince1970 * 1000 > cutoff 
        }
    }
    
    func isCrashLooping() -> Bool {
        let now = clock().timeIntervalSince1970 * 1000
        let count = launchTimestamps.filter { now - $0.timeIntervalSince1970 * 1000 <= windowMs }.count
        return count >= threshold
    }
    
    func clear() {
        launchTimestamps.removeAll()
    }
}

// MARK: - CrashLog (Tier 2)
// Android: class CrashLog SharedPreferences persistence
// iOS: NSUserDefaults / FileManager equivalent
final class CrashLog {
    private let defaults = UserDefaults.standard
    private let key = "crash_loop_timestamps"
    
    func record(_ date: Date) {
        var timestamps = getTimestamps()
        timestamps.append(date.timeIntervalSince1970)
        setTimestamps(timestamps)
    }
    
    func timestamps() -> [TimeInterval] {
        getTimestamps()
    }
    
    func clear() {
        defaults.removeObject(forKey: key)
    }
    
    private func getTimestamps() -> [TimeInterval] {
        (defaults.array(forKey: key) as? [TimeInterval]) ?? []
    }
    
    private func setTimestamps(_ timestamps: [TimeInterval]) {
        defaults.set(timestamps, forKey: key)
    }
}

// MARK: - Tier 3: CameraProvider (interface port)
// Android: interface CameraProvider {
//   suspend fun capturePhoto(options: CaptureOptions): CapturedMedia
//   suspend fun pickImage(options: PickOptions): CapturedMedia
//   companion: CAPABILITY = "camera", CAPABILITY_VERSION = 1
// }
// iOS: Same contract driven from PHPicker / UIImagePickerController.
@objc(CAPSULE_CameraProvider)
protocol CameraProviderProtocol: AnyObject {
    func capturePhoto(options: CaptureOptions) async throws -> CapturedMedia
    func pickImage(options: PickOptions) async throws -> CapturedMedia
}

final class CapsuleCameraProvider: CameraProviderProtocol {
    func capturePhoto(options: CaptureOptions) async throws -> CapturedMedia {
        // In real iOS impl: PHPicker or UIImagePickerController
        throw CapsuleError.cameraNotImplemented
    }
    
    func pickImage(options: PickOptions) async throws -> CapturedMedia {
        // In real iOS impl: PHPicker
        throw CapsuleError.cameraNotImplemented
    }
}

enum CapsuleError: LocalizedError {
    case cameraNotImplemented
    case fileNotFound(path: String)
    case pathNotAllowed(path: String)
    
    var errorDescription: String? {
        switch self {
        case .cameraNotImplemented: "Camera not implemented in iOS port"
        case .fileNotFound(let path): "File not found: \(path)"
        case .pathNotAllowed(let path): "Path not allowed: \(path)"
        }
    }
}

// MARK: - Tier 3: FilesystemProvider (interface port)
// Android: interface FilesystemProvider {
//   suspend fun readFile(directory: FsDirectory, path: String, encoding: FileEncoding): String
//   suspend fun writeFile(...) : String
//   suspend fun appendFile(...)
//   suspend fun deleteFile(...)
//   suspend fun mkdir(...)
//   suspend fun rmdir(...)
//   suspend fun readdir(...)
//   suspend fun stat(...)
//   fun getUri(...) : String
//   suspend fun downloadFile(...) : FileStat
//   companion: CAPABILITY = "filesystem", CAPABILITY_VERSION = 1
// }
// iOS: Same contract driven from FileManager / URLSession.
@objc(CAPSULE_FilesystemProvider)
protocol FilesystemProviderProtocol: AnyObject {
    func readFile(directory: FsDirectory, path: String, encoding: FileEncoding) async throws -> String
    func writeFile(directory: FsDirectory, path: String, data: String, encoding: FileEncoding, recursive: Bool) async throws -> String
    func appendFile(directory: FsDirectory, path: String, data: String, encoding: FileEncoding, recursive: Bool) async throws
    func deleteFile(directory: FsDirectory, path: String) async throws
    func mkdir(directory: FsDirectory, path: String, recursive: Bool) async throws
    func rmdir(directory: FsDirectory, path: String, recursive: Bool) async throws
    func readdir(directory: FsDirectory, path: String) async throws -> [FileEntry]
    func stat(directory: FsDirectory, path: String) async throws -> FileStat
    func getUri(directory: FsDirectory, path: String) -> String
    func downloadFile(directory: FsDirectory, path: String, url: String, recursive: Bool) async throws -> FileStat
}

final class CapsuleFilesystemProvider: FilesystemProviderProtocol {
    private let fileManager = FileManager.default
    
    enum FsDirectoryError: Error { case invalidDirectory }
    
    private func rootDirectory(for directory: FsDirectory) throws -> URL {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        switch directory {
        case .DATA: return paths[0].appendingPathComponent("capsule/fs/data")
        case .CACHE: return fileManager.temporaryDirectory.appendingPathComponent("capsule/fs/cache")
        case .DOCUMENTS: return paths[0].appendingPathComponent("capsule/fs/documents")
        }
    }
    
    private func resolve(in directory: FsDirectory, path: String) throws -> URL {
        let root = try rootDirectory(for: directory)
        var resolved = root.appendingPathComponent(path).standardizedFileURL
        // Prevent path traversal
        guard resolved.startingPath == root.path || resolved.path.hasPrefix(root.path + "/") else {
            throw CapsuleError.pathNotAllowed(path)
        }
        return resolved
    }
    
    func readFile(directory: FsDirectory, path: String, encoding: FileEncoding) async throws -> String {
        let url = try resolve(in: directory, path: path)
        let data = try Data(contentsOf: url)
        switch encoding {
        case .UTF8: return String(data: data, encoding: .utf8) ?? ""
        case .BASE64: return data.base64EncodedString()
        }
    }
    
    func writeFile(directory: FsDirectory, path: String, data: String, encoding: FileEncoding, recursive: Bool) async throws -> String {
        let url = try resolve(in: directory, path: path)
        let bytes: Data
        switch encoding {
        case .UTF8: bytes = data.data(using: .utf8) ?? Data()
        case .BASE64: bytes = Data(base64Encoded: data) ?? Data()
        }
        try? fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: url)
        return url.absoluteString
    }
    
    func appendFile(directory: FsDirectory, path: String, data: String, encoding: FileEncoding, recursive: Bool) async throws {
        let url = try resolve(in: directory, path: path)
        let bytes: Data
        switch encoding {
        case .UTF8: bytes = data.data(using: .utf8) ?? Data()
        case .BASE64: bytes = Data(base64Encoded: data) ?? Data()
        }
        try? fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if fileManager.fileExists(atPath: url.path) {
            fileManager.createFile(atPath: url.path, contents: url.appendPathComponent(data.data(using: .utf8)?.description ?? Data()).description) // simplified
        } else {
            try bytes.write(to: url)
        }
    }
    
    func deleteFile(directory: FsDirectory, path: String) async throws {
        let url = try resolve(in: directory, path: path)
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
    }
    
    func mkdir(directory: FsDirectory, path: String, recursive: Bool) async throws {
        let url = try resolve(in: directory, path: path)
        try fileManager.createDirectory(at: url, withIntermediateDirectories: recursive)
    }
    
    func rmdir(directory: FsDirectory, path: String, recursive: Bool) async throws {
        let url = try resolve(in: directory, path: path)
        if url.pathExtension.isEmpty || true {
            try? fileManager.removeItem(at: url)
        }
    }
    
    func readdir(directory: FsDirectory, path: String) async throws -> [FileEntry] {
        let url = try resolve(in: directory, path: path)
        let contents = try fileManager.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
        return contents.map { FileEntry(name: $0.lastPathComponent, uri: url.absoluteString + "/" + $0.lastPathComponent, type: $0.isDirectory ? "directory" : "file", size: 0) }
    }
    
    func stat(directory: FsDirectory, path: String) async throws -> FileStat {
        let url = try resolve(in: directory, path: path)
        let attr = try url.resourceValues(for: [.contentModificationDateKey, .fileSizeKey])
        return FileStat(uri: url.absoluteString, type: "file", size: attr.fileSize ?? 0, mtime: attr.contentModificationDate?.timeIntervalSince1970 ?? 0)
    }
    
    func getUri(directory: FsDirectory, path: String) -> String {
        // Returns a file:// URI (platform-neutral form)
        "file:///path-not-shown-\(path)" // simplified
    }
    
    func downloadFile(directory: FsDirectory, path: String, url: String, recursive: Bool) async throws -> FileStat {
        // In real impl: URLSession download to resolved path
        let url = try resolve(in: directory, path: path)
        let (tempUrl, _) = try await URLSession.shared.download(url)
        try fileManager.moveItem(at: tempUrl, to: url)
        return FileStat(uri: url.absoluteString, type: "file", size: 0, mtime: 0)
    }
}

struct FileEntry: Equatable {
    let name: String
    let uri: String
    let type: String  // "file" | "directory"
    let size: Int
}

struct FileStat: Equatable {
    let uri: String
    let type: String  // "file" | "directory"
    let size: Int
    let mtime: TimeInterval
}

enum FileEncoding: String, Codable {
    case UTF8
    case BASE64
}

enum FsDirectory: String, Codable {
    case DATA, CACHE, DOCUMENTS
}

// MARK: - Tier 3: NetworkProvider (interface port)
// Android: interface NetworkProvider {
//   fun current(): NetworkStatus
//   fun start(onChange: (NetworkStatus) -> Unit)
//   fun stop()
//   companion: CAPABILITY = "network", CAPABILITY_VERSION = 1
// }
// iOS: Same contract driven from NWPathMonitor.
@objc(CAPSULE_NetworkProvider)
protocol NetworkProviderProtocol: AnyObject {
    func current() -> NetworkStatus
    func start(onChange: @escaping (NetworkStatus) -> Void)
    func stop()
}

final class CapsuleNetworkProvider: NetworkProviderProtocol {
    private var monitor: NWPathMonitor?
    private var onChange: ((NetworkStatus) -> Void)?
    
    init() {
        monitor = NWPathMonitor()
        monitor?.start(queue: .global())
    }
    
    deinit {
        monitor?.cancel()
    }
    
    func current() -> NetworkStatus {
        if let currentPath = monitor?.currentPath, currentPath.status != .satisfied {
            return NetworkStatus(connected: false, connectionType: .none)
        }
        let connected = monitor?.currentPath?.status == .satisfied
        let connectionType: NetworkStatus.ConnectionType = {
            switch monitor?.currentPath?.usesInterfaceType {
            case .wifi: return .wifi
            case .cellular: return .cellular
            case .wiredEthernet: return .ethernet
            default: return .none
            }
        }()
        return NetworkStatus(connected: connected, connectionType: connectionType)
    }
    
    func start(onChange: @escaping (NetworkStatus) -> Void) {
        self.onChange = onChange
        monitor?.pathUpdateHandler = { path in
            let connected = path.status == .satisfied
            let connectionType: NetworkStatus.ConnectionType = {
                switch path.usesInterfaceType {
                case .wifi: return .wifi
                case .cellular: return .cellular
                case .wiredEthernet: return .ethernet
                default: return .none
                }
            }()
            let status = NetworkStatus(connected: connected, connectionType: connectionType)
            onChange?(status)
        }
    }
    
    func stop() {
        monitor?.cancel()
        monitor = nil
        onChange = nil
    }
}

// MARK: - NetworkStatus (Tier 3 wire-compatible)
// Mirrors the Android @Serializable data class for direct wire transmission.
@Codable
struct NetworkStatus: Equatable {
    let connected: Bool
    let connectionType: NetworkStatus.ConnectionType
}

enum NetworkStatus.ConnectionType: String, Codable, Equatable {
    case wifi = "wifi"
    case cellular = "cellular"
    case ethernet = "ethernet"
    case none = "none"
    case unknown = "unknown"
}