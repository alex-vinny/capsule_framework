// Docs: docs/reference/core-api.md
package dev.capsule.handlers.filesystem

import dev.capsule.filesystem.FileEncoding
import dev.capsule.filesystem.FileEntry
import dev.capsule.filesystem.FileStat
import dev.capsule.filesystem.FilesystemProvider
import dev.capsule.filesystem.FsDirectory
import dev.capsule.handlers.BridgeHandler
import dev.capsule.handlers.CapsuleException
import dev.capsule.handlers.optBool
import dev.capsule.handlers.optString
import dev.capsule.protocol.BridgeError
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

// ─── Wire result models (mirror @capsule/core) ───────────────────────────────

@Serializable data class ReadResult(val data: String)

@Serializable data class UriResult(val uri: String)

@Serializable
data class StatResult(val uri: String, val type: String, val size: Long, val mtime: Long)

@Serializable data class FileEntryDto(val name: String, val uri: String, val type: String, val size: Long)

@Serializable data class ReaddirResult(val files: List<FileEntryDto>)

// ─── Handlers ────────────────────────────────────────────────────────────────

class FsReadFileHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.readFile"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        val data = provider.readFile(o.directory(), o.path(), o.encoding())
        return Json.encodeToJsonElement(ReadResult(data))
    }
}

class FsWriteFileHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.writeFile"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        val uri = provider.writeFile(o.directory(), o.path(), o.data(), o.encoding(), o.recursive(true))
        return Json.encodeToJsonElement(UriResult(uri))
    }
}

class FsAppendFileHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.appendFile"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        provider.appendFile(o.directory(), o.path(), o.data(), o.encoding(), o.recursive(true))
        return JsonObject(emptyMap())
    }
}

class FsDeleteFileHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.deleteFile"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        provider.deleteFile(o.directory(), o.path())
        return JsonObject(emptyMap())
    }
}

class FsMkdirHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.mkdir"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        provider.mkdir(o.directory(), o.path(), o.recursive(true))
        return JsonObject(emptyMap())
    }
}

class FsRmdirHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.rmdir"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        provider.rmdir(o.directory(), o.path(), o.recursive(false))
        return JsonObject(emptyMap())
    }
}

class FsReaddirHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.readdir"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        val files = provider.readdir(o.directory(), o.path()).map { it.toDto() }
        return Json.encodeToJsonElement(ReaddirResult(files))
    }
}

class FsStatHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.stat"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        return provider.stat(o.directory(), o.path()).toJson()
    }
}

class FsGetUriHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.getUri"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        return Json.encodeToJsonElement(UriResult(provider.getUri(o.directory(), o.path())))
    }
}

class FsDownloadFileHandler(private val provider: FilesystemProvider) : BridgeHandler {
    override val method = "filesystem.downloadFile"
    override suspend fun handle(params: JsonElement): JsonElement {
        val o = params.jsonObject
        val url = o.optString("url") ?: throw CapsuleException(BridgeError.FileIoError, "url required")
        return provider.downloadFile(o.directory(), o.path(), url, o.recursive(true)).toJson()
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

fun filesystemHandlers(provider: FilesystemProvider): List<BridgeHandler> =
    listOf(
        FsReadFileHandler(provider),
        FsWriteFileHandler(provider),
        FsAppendFileHandler(provider),
        FsDeleteFileHandler(provider),
        FsMkdirHandler(provider),
        FsRmdirHandler(provider),
        FsReaddirHandler(provider),
        FsStatHandler(provider),
        FsGetUriHandler(provider),
        FsDownloadFileHandler(provider),
    )

// ─── Mapping / param helpers ──────────────────────────────────────────────────

private fun FileEntry.toDto() = FileEntryDto(name, uri, type, size)

private fun FileStat.toJson(): JsonElement =
    Json.encodeToJsonElement(StatResult(uri, type, size, mtime))

private fun JsonObject.path(): String = optString("path") ?: ""

private fun JsonObject.data(): String = optString("data") ?: ""

private fun JsonObject.directory(): FsDirectory =
    when (optString("directory")) {
        "cache" -> FsDirectory.CACHE
        "documents" -> FsDirectory.DOCUMENTS
        else -> FsDirectory.DATA
    }

private fun JsonObject.encoding(): FileEncoding =
    if (optString("encoding") == "base64") FileEncoding.BASE64 else FileEncoding.UTF8

private fun JsonObject.recursive(default: Boolean): Boolean = optBool("recursive") ?: default
