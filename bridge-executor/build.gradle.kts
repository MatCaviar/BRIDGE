plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.immotors.bridge.executor"
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
        applicationId = "com.immotors.bridge.executor"
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
}

dependencies {
    // car v1 IIMAudioService (executeCommand/onCallback) AIDL lives in this module's src/main/aidl.
    // 不依赖 :imaudio_service_client — 它的 AIDL 是 v50 specific-method 接口, 本车(gen5_gvm v1)不暴露。
}
