package io.tomz.mira.mobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.max

class MiraNetworkMonitorModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private val connectivityManager = reactContext.getSystemService(
    Context.CONNECTIVITY_SERVICE,
  ) as ConnectivityManager

  private var listenerCount = 0
  private var callbackRegistered = false
  private var lastSignature: String? = null

  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) {
      emitCurrentState()
    }

    override fun onLost(network: Network) {
      emitCurrentState()
    }

    override fun onCapabilitiesChanged(
      network: Network,
      networkCapabilities: NetworkCapabilities,
    ) {
      emitCurrentState()
    }
  }

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
    ensureRegistered()
    if (eventName == EVENT_NAME) {
      emitCurrentState(force = true)
    }
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = max(0, listenerCount - count)
    if (listenerCount == 0) {
      unregisterCallback()
    }
  }

  @ReactMethod
  fun getCurrentState(promise: Promise) {
    try {
      promise.resolve(buildCurrentState())
    } catch (error: Exception) {
      promise.reject(
        "NETWORK_STATE_READ_FAILED",
        "Unable to read the current Android network state",
        error,
      )
    }
  }

  override fun onHostResume() {
    if (listenerCount > 0) {
      ensureRegistered()
      emitCurrentState(force = true)
    }
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() {
    unregisterCallback()
    reactContext.removeLifecycleEventListener(this)
  }

  private fun ensureRegistered() {
    if (callbackRegistered) return
    connectivityManager.registerDefaultNetworkCallback(networkCallback)
    callbackRegistered = true
  }

  private fun unregisterCallback() {
    if (!callbackRegistered) return
    try {
      connectivityManager.unregisterNetworkCallback(networkCallback)
    } catch (_: IllegalArgumentException) {
      // Callback may already be detached while the application is shutting down.
    }
    callbackRegistered = false
    lastSignature = null
  }

  private fun emitCurrentState(force: Boolean = false) {
    if (!reactContext.hasActiveReactInstance()) return

    val state = buildCurrentState()
    val signature = listOf(
      state.getBoolean("connected").toString(),
      state.getString("transport") ?: "none",
      state.getBoolean("validated").toString(),
      state.getBoolean("metered").toString(),
    ).joinToString(":")

    if (!force && signature == lastSignature) return
    lastSignature = signature

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, state)
  }

  private fun buildCurrentState(): WritableMap {
    val network = connectivityManager.activeNetwork
    val capabilities = network?.let(connectivityManager::getNetworkCapabilities)
    val connected = capabilities?.hasCapability(
      NetworkCapabilities.NET_CAPABILITY_INTERNET,
    ) == true

    val transport = when {
      capabilities == null -> "none"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      else -> "other"
    }

    return Arguments.createMap().apply {
      putBoolean("connected", connected)
      putString("transport", transport)
      putBoolean(
        "validated",
        capabilities?.hasCapability(
          NetworkCapabilities.NET_CAPABILITY_VALIDATED,
        ) == true,
      )
      putBoolean("metered", connectivityManager.isActiveNetworkMetered)
      putDouble("observedAt", System.currentTimeMillis().toDouble())
    }
  }

  companion object {
    private const val MODULE_NAME = "MiraNetworkMonitor"
    private const val EVENT_NAME = "MiraNetworkChanged"
  }
}
