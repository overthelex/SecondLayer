import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTextStyles {
  static TextStyle headlineLarge = GoogleFonts.crimsonPro(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    height: 1.3,
  );

  static TextStyle headlineMedium = GoogleFonts.crimsonPro(
    fontSize: 22,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  static TextStyle headlineSmall = GoogleFonts.crimsonPro(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.4,
  );

  static TextStyle bodyLarge = GoogleFonts.inter(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static TextStyle bodyMedium = GoogleFonts.inter(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static TextStyle bodySmall = GoogleFonts.inter(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static TextStyle labelLarge = GoogleFonts.inter(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    height: 1.4,
  );

  static TextStyle labelSmall = GoogleFonts.inter(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    height: 1.4,
    letterSpacing: 0.5,
  );

  /// Builds a full Material [TextTheme]: Crimson Pro (serif) for display/headline
  /// titles, Inter for everything else. Wired into [ThemeData.textTheme] so all
  /// screens pick up the LEX type system without importing styles directly.
  static TextTheme textTheme({
    required Color textColor,
    required Color secondaryColor,
  }) {
    final inter = GoogleFonts.interTextTheme();
    final serif = GoogleFonts.crimsonPro();
    return inter
        .copyWith(
          displayLarge: serif.copyWith(
              fontSize: 38, fontWeight: FontWeight.w600, height: 1.05, letterSpacing: -0.4),
          displayMedium: serif.copyWith(
              fontSize: 30, fontWeight: FontWeight.w600, height: 1.1, letterSpacing: -0.3),
          displaySmall: serif.copyWith(
              fontSize: 25, fontWeight: FontWeight.w600, height: 1.12, letterSpacing: -0.2),
          headlineLarge: serif.copyWith(
              fontSize: 27, fontWeight: FontWeight.w600, height: 1.12, letterSpacing: -0.2),
          headlineMedium: serif.copyWith(
              fontSize: 22, fontWeight: FontWeight.w600, height: 1.2),
          headlineSmall: serif.copyWith(
              fontSize: 18, fontWeight: FontWeight.w600, height: 1.3),
        )
        .apply(bodyColor: textColor, displayColor: textColor);
  }
}
