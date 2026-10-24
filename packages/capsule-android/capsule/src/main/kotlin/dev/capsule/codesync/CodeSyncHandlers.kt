// Docs: docs/contributing/codesync-internals.md
package dev.capsule.codesync

import dev.capsule.handlers.BridgeHandler
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.encodeToString

/**
 * Bridge surface for the CodeSync API — one [BridgeHandler] per method, exactly like
 * every other native API (camera, network, storage). Registered through the normal
 * `handlers` list, so [dev.capsule.CapsuleBridge] needs no CodeSync-specific coupling.
 *
 * Response shapes are owned by [CodeSyncModels] and must match `@capsule/core`'s
 * `CodeSyncModule` (note the status strings with spaces: "download ready").
 */
fun codeSyncHandlers(manager: CodeSyncManager): List<BridgeHandler> = listOf(
    CodeSyncCheckForUpdateHandler(manager),
    CodeSyncGetStatusHandler(manager),
    CodeSyncApplyUpdateHandler(manager),
)

class CodeSyncCheckForUpdateHandler(private val manager: CodeSyncManager) : BridgeHandler {
    override val method = "codesync.checkForUpdate"
    private val json = Json { encodeDefaults = true }

    override suspend fun handle(params: JsonElement): JsonElement {
        val result = manager.checkForUpdate()
        val dto = when (result) {
            is UpdateResult.UpdateReady -> CodeSyncCheckResultDTO(
                status = CodeSyncStatus.DOWNLOAD_READY,
                update = manager.pendingUpdate?.let {
                    CodeSyncUpdateDTO(
                        version = it.version,
                        buildNumber = it.buildNumber,
                        mandatory = it.mandatory,
                        rolloutPercent = it.rolloutPercent,
                    )
                },
            )
            is UpdateResult.UpToDate -> CodeSyncCheckResultDTO(status = CodeSyncStatus.IDLE)
            is UpdateResult.Error -> CodeSyncCheckResultDTO(status = CodeSyncStatus.ERROR)
        }
        return json.parseToJsonElement(json.encodeToString(dto))
    }
}

class CodeSyncGetStatusHandler(private val manager: CodeSyncManager) : BridgeHandler {
    override val method = "codesync.getStatus"
    private val json = Json { encodeDefaults = true }

    override suspend fun handle(params: JsonElement): JsonElement {
        val dto = CodeSyncCheckResultDTO(status = manager.lastStatus)
        return json.parseToJsonElement(json.encodeToString(dto))
    }
}

class CodeSyncApplyUpdateHandler(private val manager: CodeSyncManager) : BridgeHandler {
    override val method = "codesync.applyUpdate"
    private val json = Json { encodeDefaults = true }

    override suspend fun handle(params: JsonElement): JsonElement {
        // The bundle was installed atomically at check time; "apply" = reload on next
        // resume, which the shell drives via applyUpdateOnNextResume(). Acknowledge here.
        manager.pendingUpdate ?: return json.parseToJsonElement(
            json.encodeToString(CodeSyncApplyResultDTO(status = CodeSyncStatus.IDLE))
        )
        return json.parseToJsonElement(
            json.encodeToString(CodeSyncApplyResultDTO(status = CodeSyncStatus.UPDATE_APPLIED))
        )
    }
}
