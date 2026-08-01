package com.myapp

import org.json.JSONObject

internal data class MiraHostIdentity(
  val name: String,
  val displayName: String,
  val version: String,
)

internal object MiraHostIdentityParser {
  fun parse(body: String): MiraHostIdentity? {
    return try {
      val root = JSONObject(body)
      val data = root.optJSONObject("data") ?: root
      val name = data.optString("name").trim()
      val displayName = data.optString("displayName").trim()
      val version = data.optString("version").trim()
      if (name.isEmpty() || displayName.isEmpty() || version.isEmpty()) {
        return null
      }

      val marker = "$name $displayName".lowercase()
      if (!marker.contains("mira") && !marker.contains("uichat")) {
        return null
      }
      MiraHostIdentity(name, displayName, version)
    } catch (_: Exception) {
      null
    }
  }
}
