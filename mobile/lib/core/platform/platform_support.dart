import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// Per-platform capability flags for plugins that do not ship a Linux/desktop
/// implementation. Lets the UI degrade gracefully instead of throwing a
/// MissingPluginException on the desktop build.
class PlatformSupport {
  const PlatformSupport._();

  /// True on the Linux desktop build.
  static bool get isLinuxDesktop => !kIsWeb && Platform.isLinux;

  /// `google_sign_in` only implements Android, iOS, macOS and web - there is no
  /// Linux/Windows plugin, so the native sign-in button must be hidden there.
  static bool get googleSignInAvailable =>
      kIsWeb || Platform.isAndroid || Platform.isIOS || Platform.isMacOS;

  /// `flutter_pdfview` only implements Android and iOS. Everywhere else we fall
  /// back to opening the PDF in the system viewer / browser.
  static bool get inlinePdfViewAvailable =>
      !kIsWeb && (Platform.isAndroid || Platform.isIOS);
}
