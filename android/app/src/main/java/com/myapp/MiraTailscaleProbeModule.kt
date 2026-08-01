package com.myapp

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URL
import java.net.UnknownHostException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.net.ssl.SSLException

class MiraTailscaleProbeModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private val executor: ExecutorService = Executors.newCachedThreadPool()

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun probe(hostUrl: String, timeoutMs: Int, promise: Promise) {
    executor.execute {
      val startedAt = System.currentTimeMillis()
      try {
        val baseUri = URI(hostUrl)
        val host = baseUri.host
          ?: throw IllegalArgumentException("Mira Host URL has no hostname")

        // Resolve explicitly so UnknownHost is not collapsed into Android's
        // generic "Network request failed" message in the JavaScript layer.
        InetAddress.getAllByName(host)

        val health = request(buildEndpoint(baseUri, "/health"), timeoutMs)
        if (health.status !in 200..299) {
          promise.resolve(
            result(
              state = "host_unhealthy",
              hostUrl = hostUrl,
              startedAt = startedAt,
              detail = "Mira Host health probe returned HTTP ${health.status}",
            ),
          )
          return@execute
        }

        val meta = request(buildEndpoint(baseUri, "/app/meta"), timeoutMs)
        if (meta.status !in 200..299) {
          promise.resolve(
            result(
              state = "not_mira_host",
              hostUrl = hostUrl,
              startedAt = startedAt,
              detail = "Host identity probe returned HTTP ${meta.status}",
            ),
          )
          return@execute
        }

        val identity = MiraHostIdentityParser.parse(meta.body)
        if (identity == null) {
          promise.resolve(
            result(
              state = "not_mira_host",
              hostUrl = hostUrl,
              startedAt = startedAt,
              detail = "The reachable HTTPS service is not a recognized Mira Host",
            ),
          )
          return@execute
        }

        promise.resolve(
          result(
            state = "ready",
            hostUrl = hostUrl,
            startedAt = startedAt,
            identity = identity,
          ),
        )
      } catch (error: Exception) {
        val state = when (error) {
          is UnknownHostException -> "dns_unreachable"
          is SSLException -> "tls_failed"
          is SocketTimeoutException -> "timeout"
          is ConnectException,
          is NoRouteToHostException -> "host_unreachable"
          else -> "host_unreachable"
        }
        Log.d(MODULE_NAME, "Tailscale probe failed: $state", error)
        promise.resolve(
          result(
            state = state,
            hostUrl = hostUrl,
            startedAt = startedAt,
            detail = error.message ?: error.javaClass.simpleName,
          ),
        )
      }
    }
  }

  override fun invalidate() {
    executor.shutdownNow()
    super.invalidate()
  }

  private fun buildEndpoint(baseUri: URI, path: String): URL {
    return URL(baseUri.scheme, baseUri.host, baseUri.port, path)
  }

  private fun request(url: URL, timeoutMs: Int): HttpResponse {
    val connection = url.openConnection() as HttpURLConnection
    connection.requestMethod = "GET"
    connection.connectTimeout = timeoutMs
    connection.readTimeout = timeoutMs
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.setRequestProperty("Accept", "application/json")
    connection.setRequestProperty("Cache-Control", "no-cache")

    return try {
      val status = connection.responseCode
      val stream = if (status in 200..299) {
        connection.inputStream
      } else {
        connection.errorStream
      }
      HttpResponse(status, readLimited(stream))
    } finally {
      connection.disconnect()
    }
  }

  private fun readLimited(stream: InputStream?): String {
    if (stream == null) return ""
    val reader = BufferedReader(InputStreamReader(stream, Charsets.UTF_8))
    val output = StringBuilder()
    val buffer = CharArray(2048)

    while (output.length < MAX_RESPONSE_CHARS) {
      val remaining = MAX_RESPONSE_CHARS - output.length
      val read = reader.read(buffer, 0, minOf(buffer.size, remaining))
      if (read <= 0) break
      output.append(buffer, 0, read)
    }
    return output.toString()
  }

  private fun result(
    state: String,
    hostUrl: String,
    startedAt: Long,
    detail: String? = null,
    identity: MiraHostIdentity? = null,
  ): WritableMap = Arguments.createMap().apply {
    putString("state", state)
    putString("hostUrl", hostUrl)
    putDouble("latencyMs", (System.currentTimeMillis() - startedAt).toDouble())
    putString("checkedAt", isoTimestamp())
    if (detail != null) putString("detail", detail)
    if (identity != null) {
      putMap(
        "identity",
        Arguments.createMap().apply {
          putString("name", identity.name)
          putString("displayName", identity.displayName)
          putString("version", identity.version)
        },
      )
    } else {
      putNull("identity")
    }
  }

  private fun isoTimestamp(): String = SimpleDateFormat(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    Locale.US,
  ).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }.format(Date())

  private data class HttpResponse(val status: Int, val body: String)

  companion object {
    private const val MODULE_NAME = "MiraTailscaleProbe"
    private const val MAX_RESPONSE_CHARS = 131_072
  }
}
