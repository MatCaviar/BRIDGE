plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.immotors.bridge.executor"
    compileSdk = libs.versions.compileSdk.get().toInt()

    signingConfigs {
        create("bridgeDebug") {
            storeFile = file("${rootProject.projectDir}/keystore/8797_platform.jks")
            storePassword = "<KEYSTORE_PASSWORD>"
            keyAlias = "8797"
            keyPassword = "<KEYSTORE_PASSWORD>"
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
            signingConfig = signingConfigs.getByName("bridgeDebug")
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
