import 'package:flutter/material.dart';

/// LEX design system — zinc/monochrome palette.
/// Mirrors the production legal.org.ua web app (Tailwind zinc scale),
/// adapted from the "LEX Mobile iOS" design.
class AppColors {
  // Primary — ink (near-black). Buttons, send action, active states.
  static const primary = Color(0xFF18181B); // zinc-900
  static const primaryLight = Color(0xFF27272A); // zinc-800
  static const primaryDark = Color(0xFF000000);

  // Zinc scale (light)
  static const zinc50 = Color(0xFFFAFAFA);
  static const zinc100 = Color(0xFFF4F4F5);
  static const zinc200 = Color(0xFFE4E4E7);
  static const zinc300 = Color(0xFFD4D4D8);
  static const zinc400 = Color(0xFFA1A1AA);
  static const zinc500 = Color(0xFF71717A);
  static const zinc600 = Color(0xFF52525B);
  static const zinc700 = Color(0xFF3F3F46);
  static const zinc800 = Color(0xFF27272A);
  static const zinc900 = Color(0xFF18181B);

  // Surface — clean light palette
  static const surface = Color(0xFFFFFFFF);
  static const surfaceVariant = Color(0xFFF4F4F5); // zinc-100
  static const background = Color(0xFFFAFAFA); // zinc-50

  // Dark mode (drawer / login / dark surfaces)
  static const darkSurface = Color(0xFF18181B);
  static const darkSurfaceVariant = Color(0xFF27272A);
  static const darkBackground = Color(0xFF111111);

  // Text
  static const textPrimary = Color(0xFF18181B); // zinc-900
  static const textSecondary = Color(0xFF71717A); // zinc-500
  static const textTertiary = Color(0xFFA1A1AA); // zinc-400
  static const textOnPrimary = Color(0xFFFFFFFF);
  static const darkTextPrimary = Color(0xFFFAFAFA);
  static const darkTextSecondary = Color(0xFFA1A1AA);

  // Borders
  static const border = Color(0xFFE4E4E7); // zinc-200
  static const darkBorder = Color(0xFF27272A);

  // Semantic
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFF59E0B);
  static const error = Color(0xFFDC2626);
  static const info = Color(0xFF2563EB);

  // Chat — user bubble is ink (white text); assistant has no bubble
  static const userBubble = Color(0xFF18181B);
  static const assistantBubble = Color(0xFFFFFFFF);
  static const darkUserBubble = Color(0xFF27272A);
  static const darkAssistantBubble = Color(0xFF18181B);

  // Evidence status
  static const statusActive = Color(0xFF16A34A);
  static const statusOverturned = Color(0xFFDC2626);
  static const statusModified = Color(0xFFF59E0B);
}
