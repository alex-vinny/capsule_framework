// Docs: docs/concepts/architecture.md
package dev.capsule

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import dev.capsule.activity.AndroidActivityResultBroker
import dev.capsule.activity.SuspendingActivityLauncher
import dev.capsule.ai.AiProvider
import dev.capsule.ai.AiTier
import dev.capsule.ai.AndroidGeminiNanoProvider
import dev.capsule.ai.TieredAiProvider
import dev.capsule.ai.UnavailableAiProvider
import dev.capsule.alerts.AndroidAlertsProvider
import dev.capsule.app.AndroidDeepLinkParser
import dev.capsule.app.AppLifecycleController
import dev.capsule.camera.AndroidCameraProvider
import dev.capsule.camera.CameraProvider
import dev.capsule.clipboard.AndroidClipboardProvider
import dev.capsule.db.AndroidDbProvider
import dev.capsule.db.DbProvider
import dev.capsule.device.AndroidDeviceInfoProvider
import dev.capsule.filesystem.AndroidFilesystemProvider
import dev.capsule.filesystem.FilesystemProvider
import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.ai.aiHandlers
import dev.capsule.handlers.alerts.AlertsShowHandler
import dev.capsule.handlers.app.appLifecycleHandlers
import dev.capsule.handlers.camera.cameraHandlers
import dev.capsule.handlers.capabilities.CapabilitiesHandler
import dev.capsule.handlers.db.dbHandlers
import dev.capsule.handlers.filesystem.filesystemHandlers
import dev.capsule.handlers.clipboard.ClipboardReadHandler
import dev.capsule.handlers.clipboard.ClipboardWriteHandler
import dev.capsule.handlers.device.DeviceInfoHandler
import dev.capsule.handlers.geolocation.GeolocationHandler
import dev.capsule.handlers.haptics.HapticsHandler
import dev.capsule.handlers.network.networkHandlers
import dev.capsule.handlers.storage.storageHandlers
import dev.capsule.codesync.CodeSyncManager
import dev.capsule.codesync.OkHttpCodeSyncTransport
import dev.capsule.codesync.PrefsCodeSyncStore
import dev.capsule.codesync.codeSyncHandlers
import dev.capsule.haptics.AndroidHapticsProvider
import dev.capsule.location.FusedLocationProvider
import dev.capsule.network.AndroidNetworkProvider
import dev.capsule.network.NetworkProvider
import dev.capsule.network.NetworkStatusController
import dev.capsule.permissions.AndroidPermissionManager
import dev.capsule.protocol.CapabilityRegistry
import dev.capsule.runtime.AssetManagerStaticAssets
import dev.capsule.runtime.CapsuleRuntime
import dev.capsule.runtime.CrashLoopGuard
import dev.capsule.runtime.FileBundleStore
import dev.capsule.runtime.CivetwebServer
import dev.capsule.runtime.PrefsCrashLog
import dev.capsule.runtime.QuickJSBridge
import dev.capsule.runtime.QuickJSBridgeImpl
import dev.capsule.runtime.QuickJSEngineImpl
import dev.capsule.runtime.WebViewNavigator
import dev.capsule.runtime.WebViewSplashController
import dev.capsule.runtime.portForAppId
import dev.capsule.storage.AndroidStorageProvider
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import java.io.File

private const val TAG = "CapsuleActivity"

open class CapsuleActivity : AppCompatActivity() {

    protected lateinit var webView: WebView
    protected lateinit var bridge: CapsuleBridge

    private lateinit var permissionManager: AndroidPermissionManager
    private lateinit var container: FrameLayout

    // null in dev mode — no embedded server needed when loading from host machine
    private var runtime: CapsuleRuntime? = null

    // App lifecycle + deep links. The emitter pushes native → JS notifications via
    // the bridge (assigned in onCreate before any lifecycle/intent event fires).
    private val appLifecycle = AppLifecycleController(
        emitter = { method, params -> bridge.sendNotification(method, params) },
    )

    // Network reachability + change feed. The provider needs a Context, so it is
    // built in onCreate; the controller (pure-JVM de-dup + emit) pushes
    // network.statusChange via the bridge, mirroring appLifecycle's emitter.
    private lateinit var networkProvider: NetworkProvider
    private val networkController = NetworkStatusController(
        emitter = { method, params -> bridge.sendNotification(method, params) },
    )

    // OTA (CodeSync) client. Built in onCreate when the shell config opts in; the bridge
    // surface gains the codesync.* handlers only then (no config → no methods).
    protected lateinit var codeSyncManager: CodeSyncManager
    protected val hasCodeSync: Boolean get() = this::codeSyncManager.isInitialized

    // Two-slot bundle store shared by the OTA client (install) and the runtime (rollback).
    private lateinit var bundleStore: FileBundleStore

    // Native-capability versions this shell provides, for OTA gating (Phase 5).
    protected open val capabilities: CapabilityRegistry = CapabilityRegistry()
        .register(AppLifecycleController.CAPABILITY, AppLifecycleController.CAPABILITY_VERSION)
        .register(CameraProvider.CAPABILITY, CameraProvider.CAPABILITY_VERSION)
        .register(FilesystemProvider.CAPABILITY, FilesystemProvider.CAPABILITY_VERSION)
        .register(NetworkProvider.CAPABILITY, NetworkProvider.CAPABILITY_VERSION)
        .register(AiProvider.CAPABILITY, AiProvider.CAPABILITY_VERSION)
        .register(DbProvider.CAPABILITY, DbProvider.CAPABILITY_VERSION)

    // On-device / hybrid AI (adr-003): Gemini Nano first; bundled + cloud tiers arrive in Phase 6.
    private val aiProvider: AiProvider = TieredAiProvider(
        listOf(
            AndroidGeminiNanoProvider(),
            UnavailableAiProvider(AiTier.BUNDLED, "Bundled on-device models arrive in Phase 6 (adr-003)"),
            UnavailableAiProvider(AiTier.CLOUD, "Cloud inference arrives in Phase 6 (adr-003)"),
        ),
    )

    // Observes true app-level foreground/background (ProcessLifecycleOwner), so
    // internal activity transitions — e.g. the camera/photo picker — don't fire
    // spurious background/foreground events the way Activity onPause/onResume would.
    private val processLifecycleObserver = LifecycleEventObserver { _: LifecycleOwner, event ->
        when (event) {
            Lifecycle.Event.ON_START -> appLifecycle.onForeground()
            Lifecycle.Event.ON_STOP -> appLifecycle.onBackground()
            else -> {}
        }
    }

    open val capsuleConfig: CapsuleShellConfig
        get() = CapsuleShellConfig()

    // ── Activity-result launchers ────────────────────────────────────────────
    // Registered before STARTED (the androidx contract) and bridged into
    // suspending calls. The result-mapping for permissions lives in
    // AndroidPermissionManager, so this callback stays API-agnostic.
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            permissionManager.onResult(results)
        }

    private val takePictureLauncher = SuspendingActivityLauncher<Uri, Boolean>().apply {
        bind(
            registerForActivityResult(ActivityResultContracts.TakePicture()) { onResult(it) }
        )
    }

    private val pickMediaLauncher = SuspendingActivityLauncher<PickVisualMediaRequest, Uri?>().apply {
        bind(
            registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { onResult(it) }
        )
    }

    /** Override to add or replace handlers for your app. */
    open fun buildHandlers(): List<BridgeHandler> {
        val clipboard = AndroidClipboardProvider(this)
        val cameraProvider = AndroidCameraProvider(
            context = this,
            broker = AndroidActivityResultBroker(takePictureLauncher, pickMediaLauncher),
        )
        return listOf(
            AlertsShowHandler(AndroidAlertsProvider(this)),
            GeolocationHandler(FusedLocationProvider(this), permissionManager),
            DeviceInfoHandler(AndroidDeviceInfoProvider(this)),
            HapticsHandler(AndroidHapticsProvider(this)),
            ClipboardReadHandler(clipboard),
            ClipboardWriteHandler(clipboard),
            CapabilitiesHandler(capabilities),
        ) + cameraHandlers(cameraProvider, permissionManager) +
            storageHandlers(AndroidStorageProvider(this)) +
            filesystemHandlers(AndroidFilesystemProvider(this)) +
            dbHandlers(AndroidDbProvider(this)) +
            appLifecycleHandlers(appLifecycle) +
            networkHandlers(networkProvider) +
            aiHandlers(aiProvider) { method, params -> bridge.sendNotification(method, params) } +
            (if (hasCodeSync) codeSyncHandlers(codeSyncManager) else emptyList())
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        permissionManager = AndroidPermissionManager(this, permissionLauncher)
        networkProvider = AndroidNetworkProvider(this)
        bundleStore = FileBundleStore(filesDir.absolutePath + "/bundles")

        // OTA client — built before the bridge so the handlers list can include it.
        capsuleConfig.codeSync?.let { codeSyncConfig ->
            codeSyncManager = CodeSyncManager(
                config = codeSyncConfig,
                transport = OkHttpCodeSyncTransport(),
                store = PrefsCodeSyncStore(this),
                bundleStore = bundleStore,
                bundlesRoot = File(filesDir, "bundles"),
            )
        }

        bridge = CapsuleBridge(
            scope = lifecycleScope,
            config = capsuleConfig,
            handlers = buildHandlers(),
        )

        container = FrameLayout(this)
        // Apps targeting API 35+ are drawn edge-to-edge (no opt-out from API 36): keep the page
        // clear of the system bars and display cutout, as before, and above the keyboard — an
        // edge-to-edge window is no longer resized for it.
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        webView = WebView(this).also { wv ->
            wv.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
            wv.addJavascriptInterface(bridge, "__capsule_host")
            bridge.attachWebView(wv)
            wv.webViewClient = CapsuleWebViewClient(
                isDevMode = capsuleConfig.devServerUrl != null,
                onPageReady = { runtime?.notifyAppReady() },
            )
            wv.webChromeClient = CapsuleWebChromeClient()
            container.addView(wv)
        }

        setContentView(container)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack()
                else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        // Deep link the app was cold-launched with (read once via app.getLaunchUrl).
        appLifecycle.setLaunchUrl(AndroidDeepLinkParser.urlFrom(intent))

        // True app-level foreground/background (ignores in-app activity transitions).
        ProcessLifecycleOwner.get().lifecycle.addObserver(processLifecycleObserver)

        // Connectivity change feed → network.statusChange (controller de-dups).
        networkProvider.start { networkController.update(it) }

        loadApp()
    }

    /**
     * A deep link arrived while the app is already running. launchMode="singleTask"
     * (set by the CLI in the manifest) routes it here instead of a new Activity.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        AndroidDeepLinkParser.urlFrom(intent)?.let { appLifecycle.onNewUrl(it) }
    }

    override fun onDestroy() {
        super.onDestroy()
        ProcessLifecycleOwner.get().lifecycle.removeObserver(processLifecycleObserver)
        if (::networkProvider.isInitialized) networkProvider.stop()
        runtime?.stop()
    }

    private fun loadApp() {
        val devUrl = capsuleConfig.devServerUrl
        if (devUrl != null) {
            webView.loadUrl(devUrl)
            return
        }

        val port = portForAppId(capsuleConfig.appId ?: packageName)
        val engine = QuickJSEngineImpl()
        val quickJsBridge: QuickJSBridge = QuickJSBridgeImpl(engine, assets)
        bridge.attachQuickJsBridge(quickJsBridge)

        // Crash-loop protection: record this launch (SharedPreferences survive process death);
        // cleared by notifyAppReady() once the web layer reports healthy.
        val crashGuard = CrashLoopGuard(
            PrefsCrashLog(getSharedPreferences("codesync", MODE_PRIVATE)),
        )
        crashGuard.recordLaunchAttempt()

        runtime = CapsuleRuntime(
            server = CivetwebServer(
                staticAssets = AssetManagerStaticAssets(assets),
                port = port,
                apiHandler = { method, path, body, headers ->
                    quickJsBridge.handleHttpRequest(method, path, body, headers)
                },
            ),
            jsEngine = engine,
            splash = WebViewSplashController(this, container),
            navigator = WebViewNavigator(webView),
            quickJsBridge = quickJsBridge,
            bundleStore = bundleStore,
            crashGuard = crashGuard,
            timeoutMs = capsuleConfig.serverTimeoutMs,
        )
        lifecycleScope.launch {
            try {
                runtime!!.start()
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "App startup exceeded serverTimeoutMs (${capsuleConfig.serverTimeoutMs} ms)", e)
                showStartupError()
            } catch (e: Exception) {
                // ServerStartupException (bind conflict / readiness deadline) and any other
                // startup failure surface on the same error screen -- never a silent death
                // (docs/project/incidents/2026-10-embedded-server-startup.md, D5).
                Log.e(TAG, "App startup failed", e)
                showStartupError()
            }
        }
    }

    private fun showStartupError() {
        val dp = resources.displayMetrics.density

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.WHITE)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
        layout.addView(TextView(this).apply {
            text = "App failed to start"
            textSize = 18f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (16 * dp).toInt())
        })
        layout.addView(Button(this).apply {
            text = "Retry"
            setOnClickListener {
                container.removeView(layout)
                loadApp()
            }
        })

        container.addView(layout)
    }
}
