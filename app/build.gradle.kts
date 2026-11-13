plugins { alias(libs.plugins.android.application) }
android {
    namespace = "com.example.zhoumoju"
    compileSdk { version = release(37) }
    defaultConfig { applicationId = "com.example.zhoumoju"; minSdk = 24; targetSdk = 37; versionCode = 1; versionName = "0.1" }
    buildTypes { release { optimization { enable = false } } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_11; targetCompatibility = JavaVersion.VERSION_11 }
}
dependencies { implementation(libs.appcompat); implementation(libs.material); testImplementation(libs.junit) }
