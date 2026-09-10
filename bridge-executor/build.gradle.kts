plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "org.bridge.executor"
    compileSdk = libs.versions.compileSdk.get().toInt()

    val bridgeKeystorePath = providers.gradleProperty("bridgeKeystore")
        .orElse(providers.environmentVariable("BRIDGE_KEYSTORE"))
        .orNull
    val bridgeSigning = bridgeKeystorePath?.let { path ->
        signingConfigs.create("bridge") {
            storeFile = file(path)
            storePassword = providers.gradleProperty("bridgeStorePassword")
                .orElse(providers.environmentVariable("BRIDGE_KEYSTORE_PASSWORD"))
                .orNull
            keyAlias = providers.gradleProperty("bridgeKeyAlias")
                .orElse(providers.environmentVariable("BRIDGE_KEY_ALIAS"))
                .getOrElse("bridge")
            keyPassword = providers.gradleProperty("bridgeKeyPassword")
                .orElse(providers.environmentVariable("BRIDGE_KEY_PASSWORD"))
                .orNull
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    defaultConfig {
        applicationId = "org.bridge.executor"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            bridgeSigning?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        aidl = true
    }
    // Optional user-owned AIDL/Java contracts and manifest; no target application is bundled.
    providers.environmentVariable("BRIDGE_ADAPTER_DIR").orNull?.let { adapter ->
        sourceSets.getByName("main") {
            java.srcDir("$adapter/java")
            aidl.srcDir("$adapter/aidl")
            if (file("$adapter/AndroidManifest.xml").exists()) manifest.srcFile("$adapter/AndroidManifest.xml")
        }
    }
}
