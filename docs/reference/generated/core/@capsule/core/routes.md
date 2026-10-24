> Generated from `packages/core/src` by `pnpm gen` — do not edit.

# @capsule/core/routes

`@capsule/core/routes` — register the handlers of an app's on-device `/api` server.

The CLI bundles the app's route files with this module; on the device QuickJS runs the bundle
and the embedded server forwards each `/api/` request (and each bridge RPC routed to JS) to the
handler registered here.

## Interfaces

### CapsuleHttpRequest

Request passed to an HTTP route handler by the embedded server (CivetwebServer) via QuickJS.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-body"></a> `body` | `string` \| `null` |
| <a id="property-headers"></a> `headers` | `Record`\<`string`, `string`\> |
| <a id="property-method"></a> `method` | `string` |
| <a id="property-path"></a> `path` | `string` |

***

### CapsuleHttpResponse

Return value from an HTTP route handler.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-body-1"></a> `body?` | `string` \| `null` |
| <a id="property-mimetype"></a> `mimeType?` | `string` |
| <a id="property-status"></a> `status?` | `number` |

## Type Aliases

### HttpHandler

```ts
type HttpHandler = (req) => CapsuleHttpResponse;
```

An HTTP route handler for an `/api/...` path.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | [`CapsuleHttpRequest`](#capsulehttprequest) |

#### Returns

[`CapsuleHttpResponse`](#capsulehttpresponse)

***

### RpcHandler

```ts
type RpcHandler = (params) => unknown;
```

A JSON-RPC route handler: receives the request params, returns the result.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | `unknown` |

#### Returns

`unknown`

## Functions

### addHttpRoute()

```ts
function addHttpRoute(
   path, 
   httpMethod, 
   handler
): void;
```

Register an HTTP handler for a specific path + HTTP method.
Path must start with /api/ and use exact matching (no params in Step 6).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `httpMethod` | `string` |
| `handler` | [`HttpHandler`](#httphandler) |

#### Returns

`void`

***

### addRoute()

```ts
function addRoute(method, handler): void;
```

Register a synchronous JS handler for the given JSON-RPC method.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `handler` | [`RpcHandler`](#rpchandler) |

#### Returns

`void`

***

### dispatch()

```ts
function dispatch(requestJson): object | null;
```

Dispatch entry point called by QuickJSBridge for every incoming JSON-RPC request.

Returns a plain JS object (NOT a JSON string). The C call helper wraps every return
value in JSON.stringify(), so returning an object produces clean JSON on the Kotlin
side. Returning a pre-serialised string would cause double-encoding.

Returns null to signal the Kotlin bridge to fall through to native Android handlers.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `requestJson` | `string` |

#### Returns

`object` \| `null`

***

### handleHttpRequest()

```ts
function handleHttpRequest(
   method, 
   path, 
   body, 
   headers
): object | null;
```

HTTP dispatch entry point called by the native RequestRouter for every /api/* request.

Arguments are passed as a JSON array by QuickJSBridgeImpl.handleHttpRequest():
[method, path, body|null, headers-object].
The C call helper parses the array and passes values as native JS types — no JSON.parse needed.

Returns a plain object with { status, body, mimeType } or null if no handler matches.
Returning null makes the embedded server respond with 404.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `method` | `string` |
| `path` | `string` |
| `body` | `string` \| `null` |
| `headers` | `Record`\<`string`, `string`\> |

#### Returns

`object` \| `null`
