# Generic Android executor

The executor package is `org.bridge.executor`. It reads a project-generated `registry.json` from its internal files directory. It contains no application interface sources or target package defaults.

## Build and integrate

Use JDK 17+ and the Android SDK versions in `gradle/libs.versions.toml`:

```bash
./gradlew assembleDebug
node ../e2e/analysis-to-registry.mjs /path/to/analysis.json /path/to/registry.json
```

For project-owned AIDL/Java/Kotlin sources, set `BRIDGE_ADAPTER_DIR` to an external directory containing `aidl/` and/or `java/`. An optional `AndroidManifest.xml` there **replaces** the main manifest: retain `org.bridge.executor.ExecutorActivity` and add the target package queries, permissions, or integration requirements. The build does not create vendor interfaces automatically.

Install and initialize the APK for the chosen Android user, then place the generated registry at `/data/user/<user>/org.bridge.executor/files/registry.json`. The visualization's deploy stage copies the registry to a selected device after installation. This privileged ADB mailbox path requires root shell access; use an HTTP adapter for other environments.

## Supported mechanisms

| Mechanism | Contract |
|---|---|
| `intent` | Explicit `component.pkg/cls`, optional `dataUri`, string extras. `fromArgs:true` sends the full arguments object as a JSON string. |
| `media` | `methodName: play/pause/next/prev`; optional `sessionPackage`. Requires media-control permission and exactly one matching session. |
| `aidl` | Project-supplied `interfaceClass`, explicit service package/class, optional bind action. Method accepts one JSON string, or no argument with `pattern:none`, and returns a JSON object string. |
| `execmd` | Configured Binder request `(String JSON, callback Binder)`; callback returns `String JSON`. Descriptor and both transaction codes come from the target's interface. |

For execmd set `binder.descriptor`, `transactionCode`, `callbackDescriptor`, and `callbackTransactionCode`. Optional `operationField` and `argumentsField` default to `command` and `params`; `stringifyArguments` defaults to true and `oneWay` to false. `methodName` supplies the operation value. Other AIDL signatures, parcelables, service-specific protocols, and SDKs belong in an external adapter, typically exposed through the generic HTTP transport.

Each request uses `files/bridge-rpc/<requestId>/`; the host passes the same ID to the Activity. Results are published atomically and correlated by ID. The registry is read for every request.

Intent and media success means the platform accepted the dispatch. Confirm the resulting application state using a read capability or UI observation when that matters.

## Preconditions

Capabilities may declare `preconditions`. Built-in safety labels add `park`, `confirmed`, or `network` requirements. A trusted integration writes `files/preconditions.json`:

```json
{"expiresAt":1893456000000,"values":{"park":true,"confirmed":true}}
```

Use a short expiry derived from current device state; the value above only illustrates the format. The host can read its own snapshot via `--preconditions-file`. Model arguments cannot satisfy these checks.

## Migration to 0.2

Rebuild and install the neutral package, regenerate the registry, and update MCP launch configuration. Application-specific interfaces and legacy custom mechanisms must move to the consuming project's adapter. HTTP integrations do not deploy this APK.
