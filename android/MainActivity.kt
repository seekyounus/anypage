package __PACKAGE__

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File

/**
 * AnyPage's Android activity.
 *
 * When another app opens a file with AnyPage ("Open with") or shares one to it,
 * Android hands over a content:// link instead of a normal file. We copy each file
 * into <cache>/incoming/<batch>/ on a background thread, then write a ".done" marker.
 * The Rust side (src-tauri/src/lib.rs) picks up finished batches and the page opens them.
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) receive(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    receive(intent)
  }

  private fun receive(intent: Intent?) {
    if (intent == null) return
    val uris = mutableListOf<Uri>()
    when (intent.action) {
      Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
      Intent.ACTION_SEND -> streamExtra(intent)?.let { uris.add(it) }
      Intent.ACTION_SEND_MULTIPLE -> uris.addAll(streamListExtra(intent))
    }
    if (uris.isEmpty()) return

    val batch = File(cacheDir, "incoming/" + System.currentTimeMillis())
    Thread {
      try {
        batch.mkdirs()
        val used = mutableSetOf<String>()
        for (uri in uris) {
          try {
            val name = uniqueName(displayName(uri), used)
            val part = File(batch, "$name.part")
            contentResolver.openInputStream(uri)?.use { input ->
              part.outputStream().use { output -> input.copyTo(output) }
            }
            part.renameTo(File(batch, name))
          } catch (e: Exception) {
            Log.w("AnyPage", "Couldn't receive $uri", e)
          }
        }
      } finally {
        File(batch, ".done").writeText("ok")
      }
    }.start()
  }

  @Suppress("DEPRECATION")
  private fun streamExtra(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streamListExtra(intent: Intent): List<Uri> =
    (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
     else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()

  private fun displayName(uri: Uri): String {
    var name: String? = null
    if (uri.scheme == "content") {
      try {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
          if (c.moveToFirst() && !c.isNull(0)) name = c.getString(0)
        }
      } catch (e: Exception) {
        Log.w("AnyPage", "No name for $uri", e)
      }
    }
    if (name.isNullOrBlank()) name = uri.lastPathSegment
    if (name.isNullOrBlank()) name = "file"
    if (!name!!.contains('.')) {
      contentResolver.getType(uri)?.let { type -> extensionFor(type)?.let { name = "$name.$it" } }
    }
    return name!!.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").take(150)
  }

  private fun extensionFor(mime: String): String? = when {
    mime == "application/pdf" -> "pdf"
    mime.endsWith("wordprocessingml.document") -> "docx"
    mime.endsWith("spreadsheetml.sheet") -> "xlsx"
    mime == "text/csv" || mime == "text/comma-separated-values" -> "csv"
    mime == "application/json" -> "json"
    mime.endsWith("/xml") -> "xml"
    mime == "image/jpeg" -> "jpg"
    mime.startsWith("image/") -> mime.substringAfter('/').substringBefore('+')
    mime.startsWith("text/") -> "txt"
    else -> null
  }

  private fun uniqueName(name: String, used: MutableSet<String>): String {
    var candidate = if (name == ".done") "_done" else name
    var n = 2
    while (!used.add(candidate)) {
      val dot = name.lastIndexOf('.')
      candidate = if (dot > 0) "${name.substring(0, dot)} ($n)${name.substring(dot)}" else "$name ($n)"
      n++
    }
    return candidate
  }
}
